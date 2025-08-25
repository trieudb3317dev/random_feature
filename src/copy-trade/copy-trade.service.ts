import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { CopyTrade } from './entities/copy-trade.entity';
import { CreateCopyTradeDto } from './dto/create-copy-trade.dto';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { CopyTradeDetail } from './entities/copy-trade-detail.entity';
import { HashExclude } from './entities/hash_exclude.entity';
import { SolanaService } from '../solana/solana.service';
import { PositionTracking } from './entities/position-tracking.entity';
import { Cron } from '@nestjs/schedule';
import { PublicKey } from '@solana/web3.js';
import { SmartRouteSolanaService } from '../solana/smart-route-solana.service';
import { UpdateCopyTradeDto } from './dto/update-copy-trade.dto';
import { SolanaWebSocketService } from '../solana/solana-websocket.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';

interface WalletTransactionData {
    address: string;
    signature: string;
    accountInfo?: any;
    serviceId?: string;
}

@Injectable()
export class CopyTradeService implements OnModuleInit {
    private readonly SERVICE_ID = 'COPY_TRADE';
    private activeSubscriptions: Map<string, number> = new Map(); // wallet -> subscriptionId

    constructor(
        @InjectRepository(CopyTrade)
        private readonly copyTradeRepository: Repository<CopyTrade>,

        @InjectRepository(CopyTradeDetail)
        private readonly copyTradeDetailRepository: Repository<CopyTradeDetail>,

        @InjectRepository(HashExclude)
        private readonly hashExcludeRepository: Repository<HashExclude>,

        @InjectRepository(ListWallet)
        private readonly listWalletRepository: Repository<ListWallet>,

        @Inject(forwardRef(() => SolanaService))
        private readonly solanaService: SolanaService,

        @InjectRepository(PositionTracking)
        private readonly positionTrackingRepository: Repository<PositionTracking>,

        private readonly smartRouteSolanaService: SmartRouteSolanaService,

        private readonly solanaWebSocketService: SolanaWebSocketService,

        private readonly eventEmitter: EventEmitter2,

        private readonly logger: Logger
    ) {
        this.eventEmitter.on('wallet.transaction', async (data) => {
            // Chỉ xử lý các sự kiện dành cho copy trade
            if (data.serviceId === this.SERVICE_ID) {
                await this.handleWalletTransaction(data);
            }
        });

        this.eventEmitter.on('transaction.confirmed', async (data) => {
            await this.handleTransactionConfirmed(data);
        });
    }

    async onModuleInit() {
        // Khởi tạo theo dõi các ví đang có copy trade
        const activeCopyTrades = await this.copyTradeRepository.find({
            where: { ct_status: 'running' }
        });

        console.log('Active copy trades:', activeCopyTrades.length);

        for (const copyTrade of activeCopyTrades) {
            await this.solanaWebSocketService.subscribeToWalletTransactions(
                copyTrade.ct_tracking_wallet,
                this.SERVICE_ID
            );
        }
    }

    private async startWalletTracking(walletAddress: string) {
        await this.solanaWebSocketService.subscribeToWalletTransactions(
            walletAddress,
            this.SERVICE_ID
        );
    }

    private async stopWalletTracking(walletAddress: string) {
        await this.solanaWebSocketService.unsubscribeFromWallet(
            walletAddress,
            this.SERVICE_ID
        );
    }

    private async handleWalletTransaction(data: WalletTransactionData) {
        try {
            this.logger.debug('Received wallet transaction:', {
                address: data.address,
                accountInfo: data.accountInfo,
                serviceId: data.serviceId
            });

            if (!this.validateTransactionData(data)) {
                this.logger.warn('Invalid transaction data received', data);
                return;
            }

            const copyTrades = await this.copyTradeRepository.find({
                where: {
                    ct_tracking_wallet: data.address,
                    ct_status: 'running'
                },
                relations: ['ct_wallet']
            });

            this.logger.debug('Found copy trades:', {
                address: data.address,
                count: copyTrades.length
            });

            await this.processTransaction(data);
        } catch (error) {
            this.logger.error('Failed to process transaction', error);
        }
    }

    private validateTransactionData(data: WalletTransactionData): boolean {
        if (!data.address || !data.signature) {
            return false;
        }
        return true;
    }

    private async processTransaction(data: WalletTransactionData) {
        try {
            // Kiểm tra hash đã xử lý chưa
            const existingHash = await this.hashExcludeRepository.findOne({
                where: { hash: data.signature }
            });

            if (existingHash) return;

            // Lấy các copy trade đang theo dõi ví này
            const copyTrades = await this.copyTradeRepository.find({
                where: {
                    ct_tracking_wallet: data.address,
                    ct_status: 'running'
                },
                relations: ['ct_wallet']
            });

            if (copyTrades.length === 0) return;

            // Lưu hash để tránh xử lý trùng lặp
            await this.hashExcludeRepository.save({
                hash: data.signature,
                created_at: new Date()
            });

            // Xử lý giao dịch cho từng copy trade
            for (const copyTrade of copyTrades) {
                if (!copyTrade.ct_wallet) {
                    this.logger.warn(`No wallet found for copy trade ${copyTrade.ct_id}`);
                    continue;
                }
                await this.processCopyTrade(copyTrade, data.signature);
            }
        } catch (error) {
            this.logger.error('Error processing transaction:', error);
        }
    }

    private async processCopyTrade(copyTrade: CopyTrade, originalTxHash: string) {
        try {
            // Lấy thông tin giao dịch gốc
            const txInfo = await this.solanaService.analyzeTransaction(originalTxHash);
            
            if (!txInfo.inputMint || !txInfo.outputMint) {
                throw new Error('Could not determine input/output tokens from transaction');
            }

            // Tính toán số lượng dựa trên tùy chọn
            let amount = 0;
            if (copyTrade.ct_buy_option === 'maxbuy') {
                amount = copyTrade.ct_amount;
            } else if (copyTrade.ct_buy_option === 'fixedbuy') {
                amount = copyTrade.ct_amount;
            } else if (copyTrade.ct_buy_option === 'fixedratio') {
                const balance = await this.solanaService.getBalance(copyTrade.ct_wallet.wallet_solana_address);
                amount = balance * (copyTrade.ct_fixed_ratio / 100);
            }

            // Thực hiện giao dịch copy
            const txHash = await this.smartRouteSolanaService.smartSwap(
                copyTrade.ct_wallet.wallet_private_key,
                txInfo.inputMint,
                txInfo.outputMint,
                amount,
                3,
                {}
            );

            // Lưu chi tiết giao dịch
            const detail = new CopyTradeDetail();
            detail.ct_trade = copyTrade;
            detail.ct_type = 'buy';
            detail.ct_detail_token_address = txInfo.outputMint;
            detail.ct_detail_amount = amount;
            detail.ct_detail_time = new Date();
            detail.ct_copytrade_hash = txHash.signature;
            detail.ct_traking_hash = originalTxHash;
            detail.ct_detail_status = 'wait';

            await this.copyTradeDetailRepository.save(detail);

            // Theo dõi trạng thái giao dịch
            this.solanaWebSocketService.trackTransaction(txHash.signature);

        } catch (error) {
            console.error('Error processing copy trade:', error);
        }
    }

    private async handleTransactionConfirmed(data: { signature: string, transaction: any }) {
        try {
            // Cập nhật trạng thái giao dịch
            const detail = await this.copyTradeDetailRepository.findOne({
                where: { ct_copytrade_hash: data.signature }
            });

            if (!detail) return;

            detail.ct_detail_status = 'success';
            await this.copyTradeDetailRepository.save(detail);

            // Nếu là giao dịch mua, tạo position tracking mới
            if (detail.ct_type === 'buy') {
                const position = new PositionTracking();
                position.ct_trade = detail.ct_trade;
                position.pt_token_address = detail.ct_detail_token_address;
                position.pt_amount = detail.ct_detail_amount;
                position.pt_entry_price = detail.ct_detail_price;
                position.pt_buy_tx_hash = data.signature;
                position.pt_entry_time = new Date();
                position.pt_status = 'open';

                await this.positionTrackingRepository.save(position);
            }

        } catch (error) {
            console.error('Error handling transaction confirmation:', error);
        }
    }

    async createCopyTrade(user: any, createCopyTradeDto: CreateCopyTradeDto, solPublicKey?: string) {
        try {
            // Lấy wallet_id từ payload JWT
            const { wallet_id } = user;
            
            // Lấy thông tin wallet từ database
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id }
            });

            if (!wallet) {
                return {
                    status: 404,
                    message: 'Wallet not found',
                    data: null
                };
            }

            // Sử dụng địa chỉ từ database thay vì từ JWT
            const walletAddress = wallet.wallet_solana_address;

            if (!walletAddress) {
                return {
                    status: 400,
                    message: 'Wallet address not found',
                    data: null
                };
            }

            // Kiểm tra balance
            try {
                const balance = await this.solanaService.getBalance(walletAddress);

                if (balance < createCopyTradeDto.amount) {
                    return {
                        status: 400,
                        message: 'Insufficient balance',
                        data: null
                    };
                }
            } catch (error) {
                return {
                    status: 400,
                    message: `Error checking balance: ${error.message}`,
                    data: null
                };
            }

            // 1. Kiểm tra copy trade đã tồn tại
            const existingTrade = await this.copyTradeRepository.findOne({
                where: {
                    ct_wallet_id: wallet_id,
                    ct_tracking_wallet: createCopyTradeDto.tracking_wallet,
                    ct_status: In(['running', 'pause'])
                },
            });

            if (existingTrade) {
                return {
                    status: 400,
                    message: 'You are already copying this wallet address',
                    data: null
                };
            }

            // 2. Kiểm tra địa chỉ ví Solana hợp lệ
            try {
                new PublicKey(createCopyTradeDto.tracking_wallet);
            } catch (error) {
                return {
                    status: 400,
                    message: 'Invalid Solana wallet address',
                    data: null
                };
            }

            // 3. Validate amount
            if (createCopyTradeDto.amount <= 0) {
                return {
                    status: 400,
                    message: 'Amount must be greater than 0',
                    data: null
                };
            }

            if (createCopyTradeDto.amount <= 0.01) {
                return {
                    status: 400,
                    message: 'Amount must be greater than 0.01',
                    data: null
                };
            }

            // 4. Validate buy option và fixed ratio
            if (['maxbuy', 'fixedbuy'].includes(createCopyTradeDto.buy_option)) {
                createCopyTradeDto.fixed_ratio = 0;
            } else if (createCopyTradeDto.buy_option === 'fixedratio') {
                if (!createCopyTradeDto.fixed_ratio ||
                    createCopyTradeDto.fixed_ratio <= 0 ||
                    createCopyTradeDto.fixed_ratio > 100) {
                    return {
                        status: 400,
                        message: 'Fixed ratio must be between 1 and 100 for fixedratio option',
                        data: null
                    };
                }
                // Làm tròn fixed_ratio thành số nguyên
                const fraction = createCopyTradeDto.fixed_ratio % 1;
                if (fraction < 0.5) {
                    createCopyTradeDto.fixed_ratio = Math.floor(createCopyTradeDto.fixed_ratio);
                } else {
                    createCopyTradeDto.fixed_ratio = Math.ceil(createCopyTradeDto.fixed_ratio);
                }
            }

            // 5. Validate sell method và TP/SL
            if (['auto', 'notsell'].includes(createCopyTradeDto.sell_method)) {
                createCopyTradeDto.tp = 0;
                createCopyTradeDto.sl_value = 0;
            } else if (createCopyTradeDto.sell_method === 'manual') {
                if (!createCopyTradeDto.tp || createCopyTradeDto.tp <= 0) {
                    return {
                        status: 400,
                        message: 'Take profit must be greater than 0 for manual sell method',
                        data: null
                    };
                }

                if (!createCopyTradeDto.sl_value ||
                    createCopyTradeDto.sl_value <= 0 ||
                    createCopyTradeDto.sl_value > 100) {
                    return {
                        status: 400,
                        message: 'Stop loss must be between 0.01 and 100 for manual sell method',
                        data: null
                    };
                }
            }

            // 6. Tạo copy trade mới
            const copyTrade = new CopyTrade();
            copyTrade.ct_wallet_id = wallet_id;
            copyTrade.ct_tracking_wallet = createCopyTradeDto.tracking_wallet;
            copyTrade.ct_tracking_name = "";
            copyTrade.ct_amount = createCopyTradeDto.amount;
            copyTrade.ct_buy_option = createCopyTradeDto.buy_option;
            copyTrade.ct_fixed_ratio = createCopyTradeDto.fixed_ratio;
            copyTrade.ct_sell_method = createCopyTradeDto.sell_method;
            copyTrade.ct_tp = createCopyTradeDto.tp;
            copyTrade.ct_sl = createCopyTradeDto.sl_value;
            copyTrade.ct_status = 'running';

            const savedTrade = await this.copyTradeRepository.save(copyTrade);

            // Bắt đầu theo dõi ví
            await this.startWalletTracking(savedTrade.ct_tracking_wallet);

            return {
                status: 201, // Created
                message: 'Copy trade created successfully',
                data: savedTrade
            };

        } catch (error) {
            console.error('Error creating copy trade:', error);
            return {
                status: 500,
                message: 'Internal server error',
                data: null
            };
        }
    }

    async getCopyTrades(user: any) {
        try {
            // Lấy wallet_id từ payload JWT
            const { wallet_id } = user;
            
            const copyTrades = await this.copyTradeRepository.find({
                where: { ct_wallet_id: wallet_id },
                relations: ['ct_wallet'],
                order: { ct_id: 'DESC' }
            });

            // Format lại response, loại bỏ sensitive data
            const formattedTrades = copyTrades.map(trade => ({
                ct_id: trade.ct_id,
                ct_tracking_wallet: trade.ct_tracking_wallet,
                ct_tracking_name: trade.ct_tracking_name,
                ct_amount: trade.ct_amount,
                ct_buy_option: trade.ct_buy_option,
                ct_fixed_ratio: trade.ct_fixed_ratio,
                ct_sell_method: trade.ct_sell_method,
                ct_tp: trade.ct_tp,
                ct_sl: trade.ct_sl,
                ct_status: trade.ct_status,
                ct_wallet: {
                    wallet_id: trade.ct_wallet.wallet_id,
                    wallet_solana_address: trade.ct_wallet.wallet_solana_address,
                    wallet_status: trade.ct_wallet.wallet_status,
                    wallet_auth: trade.ct_wallet.wallet_auth
                }
            }));

            return {
                status: 200,
                message: "Copy trades retrieved successfully",
                data: formattedTrades
            };
        } catch (error) {
            return {
                status: 500,
                message: "Error retrieving copy trades",
                data: null
            };
        }
    }

    async getRunningCopyTrades() {
        return await this.copyTradeRepository.find({
            where: { ct_status: 'running' },
            select: ['ct_tracking_wallet'],
        });
    }

    async getCopyTradeDetails(user: any, walletTracking: string, status?: 'failed' | 'success', id?: number) {
        try {
            // Lấy wallet_id từ payload JWT
            const { wallet_id } = user;
            
            let copyTrade;

            if (id) {
                // Tìm theo id và wallet_tracking
                copyTrade = await this.copyTradeRepository.findOne({
                    where: {
                        ct_id: id,
                        ct_tracking_wallet: walletTracking,
                        ct_wallet_id: wallet_id
                    }
                });
            }

            // Nếu không có id hoặc không tìm thấy, lấy copy trade đang active
            if (!copyTrade) {
                copyTrade = await this.copyTradeRepository.findOne({
                    where: {
                        ct_wallet_id: wallet_id,
                        ct_tracking_wallet: walletTracking,
                        ct_status: Not('stop')
                    }
                });
            }

            if (!copyTrade) {
                return {
                    status: 404,
                    message: 'Copy trade not found',
                    data: null
                };
            }

            // Map status từ request sang database status
            let dbStatus: string | undefined;
            if (status === 'failed') {
                dbStatus = 'error';
            } else if (status === 'success') {
                dbStatus = 'success';
            }

            // Query details với điều kiện status nếu có
            const query = this.copyTradeDetailRepository.createQueryBuilder('detail')
                .where('detail.ct_trade_id = :ct_id', { ct_id: copyTrade.ct_id });

            if (dbStatus) {
                query.andWhere('detail.ct_detail_status = :status', { status: dbStatus });
            }

            const details = await query.orderBy('detail.ct_detail_time', 'DESC').getMany();

            return {
                status: 200,
                message: 'Copy trade details retrieved successfully',
                data: {
                    copy_trade: {
                        ct_id: copyTrade.ct_id,
                        ct_tracking_wallet: copyTrade.ct_tracking_wallet,
                        ct_tracking_name: copyTrade.ct_tracking_name,
                        ct_amount: copyTrade.ct_amount,
                        ct_buy_option: copyTrade.ct_buy_option,
                        ct_sell_method: copyTrade.ct_sell_method,
                        ct_status: copyTrade.ct_status
                    },
                    details: details.map(detail => ({
                        detail_id: detail.ct_detail_id,
                        type: detail.ct_type,
                        status: detail.ct_detail_status,
                        time: detail.ct_detail_time,
                        transaction_hash: detail.ct_traking_hash,
                        token: detail.ct_detail_token_name,
                        amount: detail.ct_detail_amount,
                        price: detail.ct_detail_price
                    }))
                }
            };
        } catch (error) {
            console.error('Error in getCopyTradeDetails:', error);
            return {
                status: 500,
                message: 'Internal server error',
                data: null
            };
        }
    }

    async isTransactionProcessed(trackingHash: string): Promise<boolean> {
        // Kiểm tra trong bảng copy_trade_detail (loại trừ trạng thái "wait")
        const existingDetail = await this.copyTradeDetailRepository.findOne({
            where: {
                ct_traking_hash: trackingHash,
                ct_detail_status: Not('wait'),
            },
        });

        // Kiểm tra trong bảng hash_exclude
        const excludedHash = await this.hashExcludeRepository.findOne({
            where: { hash: trackingHash },
        });

        return !!existingDetail || !!excludedHash;
    }

    async processSwapTransaction(
        privateKey: string,
        inputMint: string,
        outputMint: string,
        trade: CopyTrade,
        existingDetail: CopyTradeDetail
    ): Promise<void> {
        try {
            console.log(`🚀 Initiating swap for ${inputMint} to ${outputMint}...`);

            const txid = await this.smartRouteSolanaService.smartSwap(
                privateKey,
                inputMint,
                outputMint,
                trade.ct_amount,
                3,
                {}
            );

            // Update success status
            await this.copyTradeDetailRepository.update(existingDetail.ct_detail_id, {
                ct_detail_status: 'success',
                ct_copytrade_hash: txid.signature,
                ct_detail_message: 'Transaction successful'
            });

        } catch (error) {
            let errorMessage = 'Unknown error';

            // Handle specific errors
            if (error.message?.includes('Insufficient balance') || error.message?.includes('insufficient funds')) {
                errorMessage = 'Insufficient balance for swap';
            } else if (error.message?.includes('No routes available')) {
                errorMessage = 'No liquidity route found';
            } else if (error.message?.includes('Failed to compute routes')) {
                errorMessage = 'Failed to compute swap route';
            } else if (error.message?.includes('Transaction failed')) {
                errorMessage = error.message;
            } else if (error.message?.includes('INSUFFICIENT_LIQUIDITY')) {
                errorMessage = 'Insufficient liquidity in pool';
            }

            console.error('❌ Error in processSwapTransaction:', error);

            // Update error status
            await this.copyTradeDetailRepository.update(existingDetail.ct_detail_id, {
                ct_detail_status: 'error',
                ct_detail_message: errorMessage
            });

            throw error;
        }
    }

    async executeCopyTrade({
        telegramWallet,
        trackingWallet,
        privateKey,
        transaction,
        detail,
        inputMint,
        outputMint
    }): Promise<void> {
        try {
            console.log('🚀 Initiating swap for', inputMint, 'to', outputMint, '...');

            const txid = await this.smartRouteSolanaService.smartSwap(
                privateKey,
                inputMint,
                outputMint,
                detail.ct_detail_amount,
                3,
                {}
            );

            // Update success status
            await this.copyTradeDetailRepository.update(detail.ct_detail_id, {
                ct_detail_status: 'success',
                ct_copytrade_hash: txid.signature,
                ct_detail_message: 'Transaction successful'
            });

        } catch (error) {
            let errorMessage = 'Unknown error';

            // Handle specific errors
            if (error.message?.includes('Insufficient balance') || error.message?.includes('insufficient funds')) {
                errorMessage = 'Insufficient balance for swap';
            } else if (error.message?.includes('No routes available')) {
                errorMessage = 'No liquidity route found';
            } else if (error.message?.includes('Failed to compute routes')) {
                errorMessage = 'Failed to compute swap route';
            } else if (error.message?.includes('Transaction failed')) {
                errorMessage = error.message;
            } else if (error.message?.includes('INSUFFICIENT_LIQUIDITY')) {
                errorMessage = 'Insufficient liquidity in pool';
            }

            console.error('❌ Error in processSwapTransaction:', error);

            // Update error status
            await this.copyTradeDetailRepository.update(detail.ct_detail_id, {
                ct_detail_status: 'error',
                ct_detail_message: errorMessage
            });

            throw error;
        }
    }

    async getCopyTradesByTrackingWallet(trackingWallet: string): Promise<CopyTrade[]> {
        return await this.copyTradeRepository.find({
            where: {
                ct_tracking_wallet: trackingWallet,
                ct_status: 'running'
            },
            relations: ['ct_wallet']
        });
    }

    async getActiveTrackingWallets() {
        return await this.copyTradeRepository.find({
            where: {
                ct_status: 'running'
            },
            relations: ['ct_wallet']
        });
    }

    // Xử lý logic copy lệnh mua
    private async processBuyOrder(
        copyTrade: CopyTrade,
        trackingAmount: number,
        transaction: any
    ): Promise<number> {
        let buyAmount = 0;

        switch (copyTrade.ct_buy_option) {
            case 'maxbuy':
                buyAmount = Math.min(copyTrade.ct_amount, trackingAmount);
                break;

            case 'fixedbuy':
                buyAmount = copyTrade.ct_amount;
                break;

            case 'fixedratio':
                buyAmount = Math.min(
                    copyTrade.ct_amount,
                    trackingAmount * copyTrade.ct_fixed_ratio
                );
                break;
        }

        // Lưu chi tiết lệnh mua
        const detail = new CopyTradeDetail();
        detail.ct_trade = copyTrade;
        detail.ct_type = 'buy';
        detail.ct_detail_amount = buyAmount;
        detail.ct_detail_time = new Date();
        detail.ct_detail_status = 'wait';
        await this.copyTradeDetailRepository.save(detail);

        return buyAmount;
    }

    // Theo dõi vị thế sau khi mua thành công
    private async trackPosition(
        copyTrade: CopyTrade,
        buyDetail: CopyTradeDetail,
        transaction: any
    ) {
        const { outputMint } = await this.solanaService.analyzeTransaction(transaction);

        const position = new PositionTracking();
        position.ct_trade = copyTrade;
        position.pt_token_address = outputMint;
        position.pt_entry_price = buyDetail.ct_detail_price;
        position.pt_amount = buyDetail.ct_detail_amount;
        position.pt_buy_tx_hash = buyDetail.ct_copytrade_hash;
        position.pt_entry_time = buyDetail.ct_detail_time;
        position.pt_status = 'open';

        await this.positionTrackingRepository.save(position);
    }

    // Job định kỳ kiểm tra giá cho manual sell
    @Cron('*/1 * * * *')
    async checkManualSellPositions() {
        const openPositions = await this.positionTrackingRepository.find({
            where: { pt_status: 'open' },
            relations: ['ct_trade']
        });

        for (const position of openPositions) {
            if (position.ct_trade.ct_sell_method !== 'manual') continue;

            try {
                const currentPrice = await this.solanaService.getTokenPrice(position.pt_token_address);
                const priceChange = ((currentPrice - position.pt_entry_price) / position.pt_entry_price) * 100;

                if (priceChange >= position.ct_trade.ct_tp ||
                    priceChange <= -position.ct_trade.ct_sl) {

                    // Tạo lệnh bán
                    const sellDetail = new CopyTradeDetail();
                    sellDetail.ct_trade = position.ct_trade;
                    sellDetail.ct_type = 'sell';
                    sellDetail.ct_detail_amount = position.pt_amount;
                    sellDetail.ct_detail_price = currentPrice;
                    sellDetail.ct_detail_time = new Date();
                    sellDetail.ct_detail_status = 'wait';
                    await this.copyTradeDetailRepository.save(sellDetail);

                    // Cập nhật trạng thái vị thế
                    position.pt_status = 'closed';
                    await this.positionTrackingRepository.save(position);
                }
            } catch (error) {
                console.error(`Error checking position ${position.pt_id}:`, error);
            }
        }
    }

    // Xử lý auto sell
    private async processAutoSell(copyTrade: CopyTrade, trackingTxHash: string) {
        const openPositions = await this.positionTrackingRepository.find({
            where: {
                ct_trade: { ct_id: copyTrade.ct_id },
                pt_status: 'open'
            }
        });

        for (const position of openPositions) {
            const sellDetail = new CopyTradeDetail();
            sellDetail.ct_trade = copyTrade;
            sellDetail.ct_type = 'sell';
            sellDetail.ct_detail_amount = position.pt_amount;
            sellDetail.ct_detail_time = new Date();
            sellDetail.ct_detail_status = 'wait';
            sellDetail.ct_traking_hash = trackingTxHash;
            await this.copyTradeDetailRepository.save(sellDetail);

            position.pt_status = 'closed';
            await this.positionTrackingRepository.save(position);
        }
    }

    async changeCopyTradeStatus(
        user: any,
        ctId: number,
        newStatus: 'running' | 'pause' | 'stop'
    ) {
        try {
            // Lấy wallet_id từ payload JWT
            const { wallet_id } = user;
            
            // Tìm copy trade hiện tại
            const copyTrade = await this.copyTradeRepository.findOne({
                where: {
                    ct_id: ctId,
                    ct_wallet_id: wallet_id
                }
            });

            if (!copyTrade) {
                return {
                    status: 404,
                    message: 'Copy trade not found'
                };
            }

            // Kiểm tra logic status
            if (copyTrade.ct_status === 'stop') {
                return {
                    status: 400,
                    message: 'Cannot change status of stopped copy trade'
                };
            }

            if (['running', 'pause'].includes(copyTrade.ct_status)) {
                if (['running', 'pause', 'stop'].includes(newStatus)) {
                    copyTrade.ct_status = newStatus;
                    await this.copyTradeRepository.save(copyTrade);

                    if (newStatus === 'stop') {
                        await this.stopWalletTracking(copyTrade.ct_tracking_wallet);
                    } else if (newStatus === 'running') {
                        await this.startWalletTracking(copyTrade.ct_tracking_wallet);
                    }

                    return {
                        status: 200,
                        message: `Copy trade status changed to ${newStatus}`,
                        data: copyTrade
                    };
                }
            }

            return {
                status: 400,
                message: 'Invalid status change request'
            };

        } catch (error) {
            console.error('Error changing copy trade status:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async changeCopyTradeName(
        user: any,
        ctId: number,
        trackingName: string
    ) {
        try {
            // Lấy wallet_id từ payload JWT
            const { wallet_id } = user;
            
            // Kiểm tra copy trade tồn tại và thuộc về wallet
            const copyTrade = await this.copyTradeRepository.findOne({
                where: {
                    ct_id: ctId,
                    ct_wallet_id: wallet_id
                }
            });

            if (!copyTrade) {
                return {
                    status: 200,
                    message: 'Copy trade not found'
                };
            }

            // Cập nhật tên mới
            copyTrade.ct_tracking_name = trackingName.trim();
            await this.copyTradeRepository.save(copyTrade);

            return {
                status: 200,
                message: 'Copy trade name updated successfully',
                data: copyTrade
            };

        } catch (error) {
            console.error('Error changing copy trade name:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async getExcludedHashes(): Promise<string[]> {
        const excludedHashes = await this.hashExcludeRepository.find();
        return excludedHashes.map(hash => hash.hash);
    }

    async createCopyTradeDetail(data: {
        ct_traking_hash: string;
        ct_detail_status: 'wait' | 'success' | 'error';
        ct_detail_time: Date;
        ct_type: 'buy' | 'sell';
    }) {
        const detail = this.copyTradeDetailRepository.create(data);
        return await this.copyTradeDetailRepository.save(detail);
    }

    // 1. Thêm method lấy thông tin copy trade
    async getCopyTrade(trackingWallet: string): Promise<CopyTrade | null> {
        const copyTrade = await this.copyTradeRepository.findOne({
            where: {
                ct_tracking_wallet: trackingWallet,
                ct_status: 'running'
            }
        });
        return copyTrade || null;
    }

    // 2. Thêm method tạo position tracking
    async createPositionTracking(data: {
        ct_trade: CopyTrade;
        pt_token_address: string;
        pt_entry_price: number;
        pt_amount: number;
        pt_status: 'open' | 'closed';
    }): Promise<PositionTracking> {
        const position = this.positionTrackingRepository.create(data);
        return await this.positionTrackingRepository.save(position);
    }

    // 3. Thêm method lấy open positions
    async getOpenPositions(trackingWallet: string, tokenAddress: string): Promise<PositionTracking[]> {
        return await this.positionTrackingRepository.find({
            where: {
                pt_status: 'open',
                pt_token_address: tokenAddress,
                ct_trade: {
                    ct_tracking_wallet: trackingWallet
                }
            },
            relations: ['ct_trade']
        });
    }

    // 4. Thêm method check TP/SL
    checkTPSL(
        position: PositionTracking,
        currentPrice: number,
        tp: number,
        sl: number
    ): boolean {
        const priceChange = ((currentPrice - position.pt_entry_price) / position.pt_entry_price) * 100;
        return priceChange >= tp || priceChange <= -sl;
    }

    // 5. Thêm method thực hiện lệnh bán
    async executeSellOrder(
        position: PositionTracking,
        type: 'proportional' | 'full'
    ): Promise<void> {
        try {
            const amount = type === 'full'
                ? position.pt_amount
                : position.pt_amount * (position.ct_trade.ct_fixed_ratio / 100);

            // Thực hiện swap bán token
            const txid = await this.smartRouteSolanaService.smartSwap(
                position.ct_trade.ct_wallet.wallet_private_key,
                position.pt_token_address,
                'So11111111111111111111111111111111111111112', // SOL
                amount,
                3,
                {}
            );

            // Cập nhật trạng thái position
            await this.positionTrackingRepository.update(position.pt_id, {
                pt_status: type === 'full' ? 'closed' : 'open',
                pt_amount: type === 'full' ? 0 : position.pt_amount - amount,
                pt_sell_tx_hash: txid.signature,
                pt_exit_time: new Date()
            });

        } catch (error) {
            console.error('Error executing sell order:', error);
            throw error;
        }
    }

    async getPositions(user: any) {
        try {
            // Lấy wallet_id từ payload JWT
            const { wallet_id } = user;
            
            // Kiểm tra wallet tồn tại
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id }
            });

            if (!wallet) {
                return {
                    status: 404,
                    message: 'Wallet not found',
                    data: null
                };
            }

            // Lấy danh sách vị thế của wallet
            const positions = await this.positionTrackingRepository.find({
                where: {
                    ct_trade: {
                        ct_wallet_id: wallet_id
                    }
                },
                relations: ['ct_trade'],
                order: {
                    pt_entry_time: 'DESC'
                }
            });

            // Format lại dữ liệu trả về
            const formattedPositions = positions.map(position => ({
                position_id: position.pt_id,
                token_address: position.pt_token_address,
                entry_price: position.pt_entry_price,
                current_price: null as number | null,
                amount: position.pt_amount,
                pnl: null as number | null,
                pnl_percent: null as number | null,
                status: position.pt_status,
                entry_time: position.pt_entry_time,
                exit_time: position.pt_exit_time,
                buy_tx: position.pt_buy_tx_hash,
                sell_tx: position.pt_sell_tx_hash,
                copy_trade: {
                    ct_id: position.ct_trade.ct_id,
                    ct_tracking_wallet: position.ct_trade.ct_tracking_wallet,
                    ct_tracking_name: position.ct_trade.ct_tracking_name,
                    ct_sell_method: position.ct_trade.ct_sell_method,
                    ct_tp: position.ct_trade.ct_tp,
                    ct_sl: position.ct_trade.ct_sl
                }
            }));

            // Cập nhật giá hiện tại và tính PnL cho các vị thế đang mở
            for (const position of formattedPositions) {
                if (position.status === 'open') {
                    try {
                        const currentPrice = await this.solanaService.getTokenPrice(position.token_address);
                        position.current_price = currentPrice;

                        // Tính PnL
                        const pnl = (currentPrice - position.entry_price) * position.amount;
                        const pnlPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100;

                        position.pnl = Math.round(pnl * 100) / 100; // Round to 2 decimal places
                        position.pnl_percent = Math.round(pnlPercent * 100) / 100;
                    } catch (error) {
                        console.error(`Error getting current price for token ${position.token_address}:`, error);
                    }
                }
            }

            return {
                status: 200,
                message: 'Positions retrieved successfully',
                data: {
                    total_positions: formattedPositions.length,
                    open_positions: formattedPositions.filter(p => p.status === 'open').length,
                    positions: formattedPositions
                }
            };

        } catch (error) {
            console.error('Error getting positions:', error);
            return {
                status: 500,
                message: 'Internal server error',
                data: null
            };
        }
    }

    async updateCopyTrade(user: any, ctId: number, updateCopyTradeDto: UpdateCopyTradeDto) {
        try {
            // Lấy wallet_id từ payload JWT
            const { wallet_id } = user;
            
            // Tìm copy trade hiện tại
            const copyTrade = await this.copyTradeRepository.findOne({
                where: {
                    ct_id: ctId,
                    ct_wallet_id: wallet_id
                }
            });

            if (!copyTrade) {
                return {
                    status: 404,
                    message: 'Copy trade not found'
                };
            }

            // Kiểm tra trạng thái
            if (copyTrade.ct_status === 'stop') {
                return {
                    status: 400,
                    message: 'Cannot update stopped copy trade'
                };
            }

            // Validate buy option và fixed ratio
            if (updateCopyTradeDto.buy_option) {
                if (['maxbuy', 'fixedbuy'].includes(updateCopyTradeDto.buy_option)) {
                    updateCopyTradeDto.fixed_ratio = 0;
                } else if (updateCopyTradeDto.buy_option === 'fixedratio') {
                    if (!updateCopyTradeDto.fixed_ratio ||
                        updateCopyTradeDto.fixed_ratio <= 0 ||
                        updateCopyTradeDto.fixed_ratio > 100) {
                        return {
                            status: 400,
                            message: 'Fixed ratio must be between 1 and 100 for fixedratio option'
                        };
                    }
                    // Làm tròn fixed_ratio thành số nguyên
                    const fraction = updateCopyTradeDto.fixed_ratio % 1;
                    if (fraction < 0.5) {
                        updateCopyTradeDto.fixed_ratio = Math.floor(updateCopyTradeDto.fixed_ratio);
                    } else {
                        updateCopyTradeDto.fixed_ratio = Math.ceil(updateCopyTradeDto.fixed_ratio);
                    }
                }
            }

            // Validate sell method và TP/SL
            if (updateCopyTradeDto.sell_method) {
                if (['auto', 'notsell'].includes(updateCopyTradeDto.sell_method)) {
                    updateCopyTradeDto.tp = 0;
                    updateCopyTradeDto.sl_value = 0;
                } else if (updateCopyTradeDto.sell_method === 'manual') {
                    if (updateCopyTradeDto.tp === undefined) {
                        updateCopyTradeDto.tp = copyTrade.ct_tp;
                    }
                    if (updateCopyTradeDto.sl_value === undefined) {
                        updateCopyTradeDto.sl_value = copyTrade.ct_sl;
                    }

                    if (updateCopyTradeDto.tp <= 0) {
                        return {
                            status: 400,
                            message: 'Take profit must be greater than 0 for manual sell method'
                        };
                    }

                    if (updateCopyTradeDto.sl_value <= 0 || updateCopyTradeDto.sl_value > 100) {
                        return {
                            status: 400,
                            message: 'Stop loss must be between 0.01 and 100 for manual sell method'
                        };
                    }
                }
            }

            // Cập nhật thông tin
            if (updateCopyTradeDto.amount !== undefined) {
                copyTrade.ct_amount = updateCopyTradeDto.amount;
            }

            if (updateCopyTradeDto.buy_option) {
                copyTrade.ct_buy_option = updateCopyTradeDto.buy_option;
            }

            if (updateCopyTradeDto.fixed_ratio !== undefined) {
                copyTrade.ct_fixed_ratio = updateCopyTradeDto.fixed_ratio;
            }

            if (updateCopyTradeDto.sell_method) {
                copyTrade.ct_sell_method = updateCopyTradeDto.sell_method;
            }

            if (updateCopyTradeDto.tp !== undefined) {
                copyTrade.ct_tp = updateCopyTradeDto.tp;
            }

            if (updateCopyTradeDto.sl_value !== undefined) {
                copyTrade.ct_sl = updateCopyTradeDto.sl_value;
            }

            // Lưu thay đổi
            const updatedTrade = await this.copyTradeRepository.save(copyTrade);

            return {
                status: 200,
                message: 'Copy trade updated successfully',
                data: {
                    ct_id: updatedTrade.ct_id,
                    ct_tracking_wallet: updatedTrade.ct_tracking_wallet,
                    ct_tracking_name: updatedTrade.ct_tracking_name,
                    ct_amount: updatedTrade.ct_amount,
                    ct_buy_option: updatedTrade.ct_buy_option,
                    ct_fixed_ratio: updatedTrade.ct_fixed_ratio,
                    ct_sell_method: updatedTrade.ct_sell_method,
                    ct_tp: updatedTrade.ct_tp,
                    ct_sl: updatedTrade.ct_sl,
                    ct_status: updatedTrade.ct_status
                }
            };

        } catch (error) {
            console.error('Error updating copy trade:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async getCopyTradeById(user: any, id: number) {
        try {
            // Lấy wallet_id từ payload JWT
            const { wallet_id } = user;
            
            const copyTrade = await this.copyTradeRepository.findOne({
                where: {
                    ct_id: id,
                    ct_wallet_id: wallet_id
                }
            });

            if (!copyTrade) {
                return {
                    status: 404,
                    message: 'Copy trade not found',
                    data: null
                };
            }

            return {
                status: 200,
                message: 'Copy trade retrieved successfully',
                data: {
                    ct_id: copyTrade.ct_id,
                    ct_tracking_wallet: copyTrade.ct_tracking_wallet,
                    ct_tracking_name: copyTrade.ct_tracking_name,
                    ct_amount: copyTrade.ct_amount,
                    ct_buy_option: copyTrade.ct_buy_option,
                    ct_fixed_ratio: copyTrade.ct_fixed_ratio,
                    ct_sell_method: copyTrade.ct_sell_method,
                    ct_tp: copyTrade.ct_tp,
                    ct_sl: copyTrade.ct_sl,
                    ct_status: copyTrade.ct_status
                }
            };

        } catch (error) {
            console.error('Error getting copy trade:', error);
            return {
                status: 500,
                message: 'Internal server error',
                data: null
            };
        }
    }

    private shouldRetry(error: any): boolean {
        // Retry nếu là lỗi network hoặc RPC
        return error.code === 'NETWORK_ERROR' ||
            error.message?.includes('429') ||  // Rate limit
            error.message?.includes('timeout');
    }

    private async retryTransaction(data: WalletTransactionData, retryCount = 0) {
        const maxRetries = 3;
        const delay = 1000 * Math.pow(2, retryCount); // Exponential backoff

        if (retryCount >= maxRetries) {
            this.logger.error('Max retries reached for transaction', data);
            return;
        }

        try {
            await new Promise(resolve => setTimeout(resolve, delay));
            await this.processTransaction(data);
        } catch (error) {
            await this.retryTransaction(data, retryCount + 1);
        }
    }
}