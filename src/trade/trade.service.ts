import { Injectable, BadRequestException, HttpStatus, forwardRef, Inject, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { TradingOrder } from './entities/trading-order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { SolanaService } from '../solana/solana.service';
import { NotificationService } from '../notifications/notification.service';
import { GetOrdersDto } from './dto/get-orders.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { TelegramWalletRepository } from '../telegram-wallets/telegram-wallet.repository';
import { OrderStatus } from './enums/order-status.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PriceFeedService } from '../price-feed/price-feed.service';
import { OrderBookService } from './order-book.service';
import { Connection } from 'typeorm';
import { MasterTradingService } from '../master-trading/master-trading.service';
import { CreateTransactionDto } from '../master-trading/dto/create-transaction.dto';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { GetAmountResponseDto } from './dto/get-amount.dto';
import { MasterGroupRepository } from '../master-groups/master-group.repository';
import { In } from 'typeorm';
import bs58 from 'bs58';
import { MasterGroup } from '../master-trading/entities/master-group.entity';
import { extractSolanaPrivateKey, isValidPrivateKey } from '../utils/key-utils';
import { SolanaListToken } from '../solana/entities/solana-list-token.entity';
import { PublicKey } from '@solana/web3.js';
import { CacheService } from '../cache/cache.service';
import { WalletAuth } from '../telegram-wallets/entities/wallet-auth.entity';
import { Logger } from '@nestjs/common';
import { TradeGateway } from '../websocket/trade.gateway';
import { SwapResult } from '../solana/interfaces/swap-result.interface';
import { Connection as Web3Connection, VersionedTransactionResponse } from '@solana/web3.js';
import { StandardResponse } from './interfaces/standard-response.interface';
import { WalletReferentService } from '../referral/services/wallet-referent.service';
import { BgRefService } from '../referral/bg-ref.service';
import { BittworldsService } from '../bittworlds/services/bittworlds.service';

@Injectable()
export class TradeService {
    private readonly logger = new Logger(TradeService.name);

    constructor(
        @InjectRepository(TradingOrder)
        private tradingOrderRepository: Repository<TradingOrder>,
        private solanaService: SolanaService,
        private notificationService: NotificationService,
        @InjectRepository(ListWallet)
        private listWalletRepository: Repository<ListWallet>,
        @InjectRepository(SolanaListToken)
        private solanaTokenRepository: Repository<SolanaListToken>,
        private eventEmitter: EventEmitter2,
        @Inject(forwardRef(() => PriceFeedService))
        private priceFeedService: PriceFeedService,
        private orderBookService: OrderBookService,
        @Inject(Connection) private connection: Connection,
        @Inject(forwardRef(() => MasterTradingService))
        private readonly masterTradingService: MasterTradingService,
        @InjectRepository(MasterGroup)
        private masterGroupRepository: Repository<MasterGroup>,
        private cacheService: CacheService,
        @InjectRepository(WalletAuth)
        private walletAuthRepository: Repository<WalletAuth>,
        @Inject(forwardRef(() => TradeGateway))
        private readonly tradeGateway: TradeGateway,
        private readonly walletReferentService: WalletReferentService,
        private readonly bgRefService: BgRefService,
        private readonly bittworldsService: BittworldsService
    ) {
        // Lắng nghe price updates từ WebSocket
        this.eventEmitter.on('price.update', async (priceData) => {
            await this.processOrderBook(priceData.tokenMint, priceData.price);
        });
    }

    public async processOrderBook(tokenMint: string, currentPrice: number) {
        // Thêm cache để tránh xử lý quá nhiều khi có nhiều cập nhật giá liên tiếp
        const cacheKey = `processing:${tokenMint}`;
        const isProcessing = await this.cacheService.get(cacheKey);

        if (isProcessing) {
            return; // Tránh xử lý trùng lặp
        }

        await this.cacheService.set(cacheKey, 'true', 1); // Cache 1 giây

        try {
            await this.connection.transaction(async manager => {
                const matchingOrders = await this.orderBookService.findMatchingOrders(
                    tokenMint,
                    currentPrice
                );

                for (const orderBook of matchingOrders) {
                    const order = await this.tradingOrderRepository.findOne({
                        where: { order_id: orderBook.order_id }
                    });

                    if (order && order.order_status === OrderStatus.PENDING) {
                        await this.executeLimitOrder(order, currentPrice);
                        await this.orderBookService.removeFromOrderBook(order.order_id);
                    }
                }
            });
        } finally {
            await this.cacheService.del(cacheKey);
        }
    }

    private async validateWalletOwnership(walletId: number, telegramId: string) {
        const wallet = await this.listWalletRepository.findOne({
            where: {
                wallet_id: walletId,
            }
        });

        if (!wallet) {
            throw new BadRequestException('Invalid wallet access');
        }
        return wallet;
    }

    private async validateTransactionSuccess(signature: string, dex: string): Promise<boolean> {
        try {
            // Đợi tối đa 30 giây cho transaction được xác nhận
            const maxWaitTime = 30000; // 30 seconds
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWaitTime) {
                const status = await this.solanaService.checkTransactionStatus(signature);
                
                if (status === 'confirmed' || status === 'finalized') {
                    // Kiểm tra logs của transaction
                    const tx = await this.solanaService.getTransaction(signature);

                    if (!tx) {
                        throw new Error('Transaction not found after confirmation');
                    }

                    // Kiểm tra logs dựa trên DEX
                    const logs = tx.meta?.logMessages || [];
                    let hasCompletion = false;

                    if (dex === 'jupiter') {
                        hasCompletion = logs.some(log => 
                            log.includes('=== JUPITER SWAP COMPLETED ===')
                        );
                        if (!hasCompletion) {
                            throw new Error('Jupiter swap completion log not found');
                        }
                    } else if (dex === 'raydium') {
                        hasCompletion = logs.some(log => 
                            log.includes('=== RAYDIUM SWAP COMPLETED ===')
                        );
                        if (!hasCompletion) {
                            throw new Error('Raydium swap completion log not found');
                        }
                    } else if (dex === 'pumpfun') {
                        hasCompletion = logs.some(log => 
                            log.includes('=== PUMP FUN SWAP COMPLETED ===')
                        );
                        if (!hasCompletion) {
                            throw new Error('PumpFun swap completion log not found');
                        }
                    }

                    return true;
                } else if (status === 'failed') {
                    throw new Error('Transaction failed on blockchain');
                }

                // Đợi 1 giây trước khi kiểm tra lại
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            throw new Error('Transaction confirmation timeout');
        } catch (error) {
            console.error(`Transaction validation failed for ${signature}:`, error);
            throw error;
        }
    }

    async createOrder(user: any, createOrderDto: CreateOrderDto): Promise<StandardResponse<any>> {
        try {
            const { wallet_id } = user;
            const hasMemberList = createOrderDto.member_list && Array.isArray(createOrderDto.member_list) && createOrderDto.member_list.length > 0;

            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id }
            });

            if (!wallet) {
                return { status: 404, message: 'Wallet not found' };
            }

            // Tìm token trong database
            const token = await this.solanaTokenRepository.findOne({
                where: { slt_address: createOrderDto.order_token_address }
            });

            let tokenBalanceBefore: number | null = null;
            if (createOrderDto.order_trade_type === 'sell') {
                tokenBalanceBefore = await this.solanaService.getTokenBalance(
                    wallet.wallet_solana_address,
                    createOrderDto.order_token_address
                );
            }

            const newOrder = new TradingOrder();
            Object.assign(newOrder, {
                ...createOrderDto,
                // Sử dụng tên token từ database nếu có, nếu không thì dùng tên từ request
                order_token_name: token ? token.slt_name : createOrderDto.order_token_name,
                order_wallet_id: wallet_id,
                order_balance_before: tokenBalanceBefore || undefined
            });

            const savedOrder = await this.tradingOrderRepository.save(newOrder);

            try {
                const order = Array.isArray(savedOrder) ? savedOrder[0] : savedOrder;
                order.wallet = wallet;

                // Thực hiện giao dịch master trước
                await this.executeLimitOrder({
                    ...order,
                    wallet: wallet
                }, order.order_price);

                // Kiểm tra trạng thái giao dịch master
                const updatedOrder = await this.tradingOrderRepository.findOne({
                    where: { order_id: order.order_id }
                });

                if (!updatedOrder) {
                    return {
                        status: 400,
                        message: 'Order not found',
                        error: 'Order was deleted during execution',
                        data: this.formatOrderResponse(order).data
                    };
                }

                // Nếu giao dịch master thành công và có member_list
                if (updatedOrder.order_status === 'executed' && hasMemberList && createOrderDto.member_list) {
                    // Xử lý copy trade ngầm (không đợi kết quả)
                    this.masterTradingService.createMasterTransaction(
                        wallet_id,
                        {
                            mt_group_list: createOrderDto.group_list || [],
                            mt_member_list: createOrderDto.member_list,
                            mt_token_name: token ? token.slt_name : createOrderDto.order_token_name,
                            mt_token_address: createOrderDto.order_token_address,
                            mt_trade_type: createOrderDto.order_trade_type,
                            mt_type: createOrderDto.order_type,
                            mt_price: createOrderDto.order_price,
                            mt_transaction_folow: order.order_id
                        }
                    ).catch(error => {
                        this.logger.error(`Error creating master transaction: ${error.message}`);
                    });
                }

                // Trả về kết quả dựa trên trạng thái giao dịch master
                if (updatedOrder.order_status === 'executed') {
                    return this.formatOrderResponse(updatedOrder);
                } else {
                    return {
                        status: 400,
                        message: 'Order execution failed',
                        error: updatedOrder.order_error_message || 'Unknown error',
                        data: this.formatOrderResponse(updatedOrder).data
                    };
                }

            } catch (error) {
                this.logger.error(`Error executing order: ${error.message}`);
                
                // Cập nhật trạng thái order thành failed
                const updatedOrder = await this.tradingOrderRepository.findOne({
                    where: { order_id: savedOrder.order_id }
                });
                
                if (updatedOrder) {
                    updatedOrder.order_status = 'failed';
                    updatedOrder.order_error_message = error.message;
                    await this.tradingOrderRepository.save(updatedOrder);
                }

                // Emit status update event when order fails
                this.eventEmitter.emit('order.status.updated', {
                    order_id: savedOrder.order_id,
                    wallet_id: wallet_id,
                    token_address: createOrderDto.order_token_address,
                    trade_type: createOrderDto.order_trade_type,
                    status: 'failed',
                    error_message: error.message
                });

                return {
                    status: 400,
                    message: 'Order execution failed',
                    error: error.message,
                    data: this.formatOrderResponse(savedOrder).data
                };
            }
        } catch (error) {
            this.logger.error(`Error in createOrder: ${error.message}`);
            return { status: 500, message: error.message };
        }
    }

    private async startLimitOrderMonitoring(order: TradingOrder) {
        // Subscribe to price updates for this token
        this.priceFeedService.subscribeToToken(order.order_token_address);

        // Thêm theo dõi qua WebSocket
        try {
            // Lấy các pool chứa token này
            const pools = await this.solanaService.getPoolsForToken(order.order_token_address);

            // Theo dõi các pool qua WebSocket để cập nhật giá nhanh hơn
            for (const pool of pools) {
                await this.solanaService.trackAccountChanges(
                    new PublicKey(pool.slp_pool_id)
                );
            }
        } catch (error) {
            console.error(`Error setting up WebSocket tracking for token ${order.order_token_address}:`, error);
        }
    }

    private checkOrderMatching(order: TradingOrder, currentPrice: number): boolean {
        // Thuật toán khớp lệnh
        if (order.order_trade_type === 'buy') {
            // Lệnh mua: giá hiện tại <= giá đặt mua
            return currentPrice <= order.order_price;
        } else {
            // Lệnh bán: giá hiện tại >= giá đặt bán
            return currentPrice >= order.order_price;
        }
    }

    public async executeLimitOrder(order: TradingOrder, matchingPrice: number) {
        try {
            // Đảm bảo order có thông tin wallet
            if (!order.wallet) {
                // Load wallet từ database với đầy đủ thông tin
                const wallet = await this.listWalletRepository.findOne({
                    where: { wallet_id: order.order_wallet_id }
                });

                if (!wallet) {
                    throw new Error(`Wallet not found for ID: ${order.order_wallet_id}`);
                }

                order.wallet = wallet;
            }

            // Kiểm tra private key
            if (!order.wallet.wallet_private_key) {
                throw new Error(`Private key is missing for wallet ID: ${order.order_wallet_id}`);
            }

            let privateKey: string;

            try {
                // Parse JSON string để lấy private key của Solana
                const privateKeyObj = JSON.parse(order.wallet.wallet_private_key);
                if (!privateKeyObj.solana) {
                    throw new Error(`Solana private key not found in wallet data`);
                }
                privateKey = privateKeyObj.solana;

                // Sử dụng utility function để trích xuất private key
                privateKey = extractSolanaPrivateKey(privateKey);

                // Kiểm tra xem private key có hợp lệ không
                if (!isValidPrivateKey(privateKey)) {
                    throw new Error(`Invalid private key format for wallet ID: ${order.order_wallet_id}`);
                }

                console.log('Private key is valid, length:', bs58.decode(privateKey).length);
            } catch (error) {
                console.error('Error processing private key:', error);
                throw new Error(`Invalid private key format: ${error.message}`);
            }

            // Sử dụng toàn bộ số lượng ban đầu cho giao dịch
            const actualAmount = order.order_qlty; // 100% số lượng ban đầu
            const feeAmount = order.order_qlty * 0.01; // 1% phí giao dịch

            // Lấy giá token theo USD và SOL
            const tokenPriceInfo = await this.solanaService.getTokenPriceInRealTime(order.order_token_address);
            const solPriceInfo = await this.solanaService.getTokenPriceInRealTime('So11111111111111111111111111111111111111112');
            
            const tokenPriceUSD = tokenPriceInfo.priceUSD;
            const solPriceUSD = solPriceInfo.priceUSD;

            // Cập nhật giá token theo USD
            order.order_price = tokenPriceUSD;

            // Tính toán total_value dựa vào loại giao dịch và số lượng thực tế sau khi trừ phí
            if (order.order_trade_type === 'buy') {
                // Khi mua: quantity là số SOL, total_value = quantity * solPriceUSD
                order.order_total_value = actualAmount * solPriceUSD;
            } else {
                // Khi bán: quantity là số token, total_value = quantity * tokenPriceUSD
                order.order_total_value = actualAmount * tokenPriceUSD;
            }

            // Thực hiện giao dịch với số lượng đã trừ phí
            const txHash = await this.solanaService.swapTokenOnSolana(
                privateKey,
                order.order_trade_type === 'buy' ? 'So11111111111111111111111111111111111111112' : order.order_token_address,
                order.order_trade_type === 'buy' ? order.order_token_address : 'So11111111111111111111111111111111111111112',
                actualAmount, // Sử dụng số lượng đã trừ phí
                3, // slippage
                {} // options (tùy chọn)
            );

            // Nếu giao dịch thành công, thu phí cho cả lệnh mua và bán
            if (txHash && txHash.signature) {
                try {
                    const feeSuccess = await this.solanaService.handleTransactionFee(
                        privateKey,
                        order.order_trade_type === 'buy' ? 'So11111111111111111111111111111111111111112' : order.order_token_address,
                        feeAmount, // ✅ SỬA: Truyền feeAmount thay vì order_qlty
                        order.order_trade_type === 'buy', // isSOL = true cho lệnh mua
                        order.order_trade_type === 'sell' // isSell = true cho lệnh bán
                    );

                    if (!feeSuccess) {
                        this.logger.warn(`Failed to collect transaction fee for order ${order.order_id}, but main trade was successful`);
                    }
                } catch (feeError) {
                    // Log lỗi thu phí nhưng không ảnh hưởng đến trạng thái giao dịch chính
                    this.logger.error(`Error collecting transaction fee for order ${order.order_id}: ${feeError.message}`);
                }
            }

            // Cập nhật order
            order.order_status = 'executed';
            order.order_price_matching = matchingPrice;
            if (txHash) {
                order.order_tx_hash = txHash.signature;
            }
            order.order_executed_at = new Date();
            await this.tradingOrderRepository.save(order);

            // Tính toán referral rewards nếu giao dịch thành công
            try {
                // Kiểm tra xem wallet có thuộc BG affiliate không
                const isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(order.order_wallet_id);
                
                if (isBgAffiliate) {
                    // Tính toán BG affiliate rewards
                    const bgAffiliateInfo = await this.bgRefService.getWalletBgAffiliateInfo(order.order_wallet_id);
                    if (bgAffiliateInfo) {
                        await this.bgRefService.calculateAndDistributeCommission(
                            bgAffiliateInfo.treeId,
                            order.order_id,
                            order.order_total_value,
                            0.01, // Commission rate mặc định (sẽ được điều chỉnh dựa trên isBittworld)
                            order.order_wallet_id // ID của wallet thực hiện giao dịch
                        );
                        this.logger.debug(`Calculated BG affiliate rewards for wallet ${order.order_wallet_id}, tree ${bgAffiliateInfo.treeId}`);
                    }
                } else {
                    // Tính toán traditional referral rewards
                await this.walletReferentService.calculateReferralRewards(
                    order.order_wallet_id,
                    order.order_total_value,
                    order.order_tx_hash
                );
                    this.logger.debug(`Calculated traditional referral rewards for wallet ${order.order_wallet_id}`);
                }
            } catch (error) {
                this.logger.error(`Error calculating referral rewards: ${error.message}`);
                // Không throw error vì đây là tính năng phụ, không ảnh hưởng đến giao dịch chính
            }

            // Tính toán Bittworld rewards nếu giao dịch thành công
            try {
                const bittworldRewardResult = await this.bittworldsService.rewardBittworld(
                    order.order_wallet_id,
                    order.order_total_value,
                    order.order_id
                );

                if (bittworldRewardResult.success) {
                    this.logger.debug(`Calculated Bittworld reward for wallet ${order.order_wallet_id}: $${bittworldRewardResult.calculatedAmount}`);
                } else {
                    this.logger.debug(`No Bittworld reward for wallet ${order.order_wallet_id}: ${bittworldRewardResult.message}`);
                }
            } catch (error) {
                this.logger.error(`Error calculating Bittworld reward: ${error.message}`);
                // Không throw error vì đây là tính năng phụ, không ảnh hưởng đến giao dịch chính
            }

            // Gửi thông báo đến clients
            try {
                // Thêm delay nhỏ để đảm bảo database đã được cập nhật
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Lấy danh sách orders mới nhất
                const orders = await this.getAllOrders({
                    token_address: order.order_token_address,
                    limit: 30
                });

                // Lấy tất cả các client đã kết nối
                const clients = this.tradeGateway.getClientsByToken(order.order_token_address);

                for (const client of clients) {
                    // Gửi thông báo cập nhật trạng thái
                    this.tradeGateway.sendMessage(client, {
                        event: 'order.status.updated',
                        data: {
                            order_id: order.order_id,
                            status: 'executed',
                            timestamp: new Date()
                        }
                    });

                    // Gửi danh sách orders mới nhất
                    this.tradeGateway.sendMessage(client, {
                        event: 'getOrders',
                        data: orders
                    });
                }
            } catch (error) {
                this.logger.error(`Error sending order update to clients: ${error.message}`);
            }

            // Theo dõi trạng thái giao dịch qua WebSocket
            await this.trackTransactionStatus(order.order_tx_hash, order.order_id);

        } catch (error) {
            console.error('Execute order error:', error);
            order.order_status = 'failed';

            // Xử lý và phân loại lỗi để hiển thị thông báo ngắn gọn
            let userFriendlyMessage = 'Unknown error';

            const errorMsg = error.message.toLowerCase();

            if (errorMsg.includes('insufficient')) {
                userFriendlyMessage = order.order_trade_type === 'buy'
                    ? 'Insufficient SOL balance'
                    : 'Insufficient token balance';
            }
            else if (errorMsg.includes('slippage')) {
                userFriendlyMessage = 'Price slippage too high';
            }
            else if (errorMsg.includes('liquidity') || errorMsg.includes('no route') || errorMsg.includes('no indirect route')) {
                userFriendlyMessage = 'No liquidity';
            }
            else if (errorMsg.includes('timeout')) {
                userFriendlyMessage = 'Transaction timeout';
            }
            else if (errorMsg.includes('rejected')) {
                userFriendlyMessage = 'Transaction rejected';
            }
            else if (errorMsg.includes('signature')) {
                userFriendlyMessage = 'Invalid wallet';
            }

            order.order_error_message = userFriendlyMessage;
            await this.tradingOrderRepository.save(order);

            // Gửi thông báo thất bại đến clients
            try {
                // Thêm delay nhỏ để đảm bảo database đã được cập nhật
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Lấy tất cả các client đã kết nối
                const clients = this.tradeGateway.getClientsByToken(order.order_token_address);

                for (const client of clients) {
                    // Gửi thông báo thất bại
                    this.tradeGateway.sendMessage(client, {
                        event: 'order.status.updated',
                        data: {
                            order_id: order.order_id,
                            status: 'failed',
                            error_message: userFriendlyMessage,
                            timestamp: new Date()
                        }
                    });

                    // Gửi danh sách orders mới nhất
                    const orders = await this.getAllOrders({
                        token_address: order.order_token_address,
                        limit: 30
                    });

                    this.tradeGateway.sendMessage(client, {
                        event: 'getOrders',
                        data: orders
                    });
                }
            } catch (error) {
                this.logger.error(`Error sending failure update to clients: ${error.message}`);
            }

            throw error;
        }
    }

    private formatOrderResponse(order: TradingOrder) {
        return {
            status: HttpStatus.CREATED,
            message: "Order created successfully",
            data: {
                order_id: order.order_id,
                wallet_id: order.order_wallet_id,
                trade_type: order.order_trade_type,
                token: {
                    address: order.order_token_address,
                    name: order.order_token_name
                },
                quantity: order.order_qlty,
                price: order.order_price,
                total_value: order.order_total_value,
                order_type: order.order_type,
                status: order.order_status,
                created_at: order.order_created_at
            }
        };
    }

    async getOrders(user: any, query: GetOrdersDto) {
        try {
            // Lấy wallet_id từ payload JWT đã được xác thực bởi JwtAuthGuard
            const { wallet_id } = user;
            // Xây dựng query cho trading_orders
            let ordersQuery = this.tradingOrderRepository.createQueryBuilder('order')
                .leftJoinAndSelect('order.wallet', 'wallet')
                .where('order.order_wallet_id = :walletId', { walletId: wallet_id });

            // Áp dụng các bộ lọc
            if (query.trade_type) {
                ordersQuery.andWhere('order.order_trade_type = :tradeType', { tradeType: query.trade_type });
            }

            // Thêm lọc theo token mint nếu có
            if (query.token && query.token !== 'all') {
                ordersQuery.andWhere('order.order_token_address = :tokenMint', { tokenMint: query.token });
            }

            if (query.status) {
                ordersQuery.andWhere('order.order_status = :status', { status: query.status });
            }

            if (query.order_type) {
                ordersQuery.andWhere('order.order_type = :orderType', { orderType: query.order_type });
            }

            if (query.token_name) {
                ordersQuery.andWhere('order.order_token_name LIKE :tokenName', { tokenName: `%${query.token_name}%` });
            }

            if (query.from_date) {
                ordersQuery.andWhere('order.order_created_at >= :fromDate', { fromDate: query.from_date });
            }

            if (query.to_date) {
                ordersQuery.andWhere('order.order_created_at <= :toDate', { toDate: query.to_date });
            }

            // Lấy địa chỉ ví Solana từ walletId
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: wallet_id }
            });

            const walletAddress = wallet?.wallet_solana_address;

            if (!walletAddress) {
                console.log('Wallet address not found for wallet_id:', wallet_id);
                return {
                    status: 400,
                    message: 'Wallet address not found',
                    data: {
                        orders: [],
                        total: 0,
                        limit: query.limit || 10,
                        offset: query.offset || 0
                    }
                };
            }

            // Lấy dữ liệu từ master_transaction_detail
            let masterDetailQuery = this.connection
                .createQueryBuilder()
                .select([
                    'mtd.mt_detail_id as order_id',
                    'mtd.mt_detail_type as order_trade_type',
                    'mtd.mt_detail_token_address as order_token_address',
                    'mtd.mt_detail_token_name as order_token_name',
                    'mtd.mt_detail_amount as order_qlty',
                    'mtd.mt_detail_price as order_price',
                    'mtd.mt_detail_total_usd as order_total_value',
                    `'market' as order_type`,
                    `CASE 
                        WHEN mtd.mt_detail_status = 'success' THEN 'executed'
                        WHEN mtd.mt_detail_status = 'error' THEN 'failed'
                        ELSE 'pending'
                    END as order_status`,
                    'null as order_stop_loss',
                    'null as order_take_profit',
                    'mtd.mt_detail_hash as order_tx_hash',
                    'mtd.mt_detail_message as order_error_message',
                    'mtd.mt_wallet_member as wallet_address',
                    '"mtd"."mt_detail_time" as order_created_at',
                    '"mtd"."mt_detail_time" as order_updated_at',
                    '"mtd"."mt_detail_time" as order_executed_at',
                    'null as order_price_matching',
                    `'master-trading' as source`
                ])
                .from('master_transaction_detail', 'mtd')
                .where('mtd.mt_wallet_member = :walletId', { walletId: wallet_id });

            // Thêm lọc theo token mint cho master_transaction_detail
            if (query.token && query.token !== 'all') {
                masterDetailQuery.andWhere('mtd.mt_detail_token_address = :tokenMint', { tokenMint: query.token });
            }

            // Áp dụng các bộ lọc cho master_transaction_detail
            if (query.trade_type) {
                masterDetailQuery.andWhere('mtd.mt_detail_type = :tradeType', { tradeType: query.trade_type });
            }

            if (query.status) {
                const statusMap = {
                    'executed': 'success',
                    'failed': 'error',
                    'pending': 'wait'
                };
                masterDetailQuery.andWhere('mtd.mt_detail_status = :status', { status: statusMap[query.status] || query.status });
            }

            if (query.token_name) {
                masterDetailQuery.andWhere('mtd.mt_detail_token_name LIKE :tokenName', { tokenName: `%${query.token_name}%` });
            }

            if (query.from_date) {
                const fromTimestamp = new Date(query.from_date).getTime();
                masterDetailQuery.andWhere('mtd.mt_detail_time >= :fromTimestamp', { fromTimestamp });
            }

            if (query.to_date) {
                const toTimestamp = new Date(query.to_date).getTime();
                masterDetailQuery.andWhere('mtd.mt_detail_time <= :toTimestamp', { toTimestamp });
            }

            // Thực hiện truy vấn
            const tradingOrders = await ordersQuery
                .orderBy('order.order_created_at', 'DESC')
                .getMany();


            const masterDetails = await masterDetailQuery.getRawMany();

            // Kiểm tra nếu token không hợp lệ
            if (query.token && query.token !== 'all' && tradingOrders.length === 0 && masterDetails.length === 0) {
                // Kiểm tra xem token có tồn tại không
                const tokenExists = await this.solanaTokenRepository.findOne({
                    where: { slt_address: query.token }
                });

                console.log('Token exists check:', tokenExists);

                if (!tokenExists) {
                    return {
                        status: 200,
                        message: 'Orders retrieved successfully',
                        data: {
                            orders: [],
                            total: 0,
                            limit: query.limit || 10,
                            offset: query.offset || 0
                        }
                    };
                }
            }

            // Thêm source cho trading orders
            const tradingOrdersWithSource = tradingOrders.map(order => {
                // Tạo một bản sao của order thay vì sửa trực tiếp
                const { wallet, ...orderData } = order;

                return {
                    ...orderData,
                    wallet_address: wallet?.wallet_solana_address || null,
                    source: 'trading'
                };
            });

            // Kết hợp kết quả
            let combinedOrders = [...tradingOrdersWithSource, ...masterDetails];

            // Sắp xếp theo thời gian tạo
            combinedOrders.sort((a, b) => {
                const aTime = new Date(a.order_created_at).getTime();
                const bTime = new Date(b.order_created_at).getTime();
                return bTime - aTime; // Sắp xếp giảm dần (mới nhất trước)
            });

            // Áp dụng phân trang
            const limit = query.limit || 10;
            const offset = query.offset || 0;
            const paginatedOrders = combinedOrders.slice(offset, offset + limit);

            // Format response
            const formattedOrders = paginatedOrders.map(order => {
                if (order.source === 'master-trading') {
                    return {
                        mt_order_id: order.order_id,
                        trade_type: order.order_trade_type,
                        token: {
                            address: order.order_token_address,
                            name: order.order_token_name
                        },
                        quantity: parseFloat(order.order_qlty),
                        price: parseFloat(order.order_price),
                        total_value: parseFloat(order.order_total_value),
                        order_type: order.order_type,
                        status: order.order_status,
                        tx_hash: order.order_tx_hash,
                        error_message: order.order_error_message,
                        created_at: order.order_created_at,
                        executed_at: order.order_executed_at,
                        source: order.source
                    };
                } else {
                    return {
                        order_id: order.order_id,
                        trade_type: order.order_trade_type,
                        token: {
                            address: order.order_token_address,
                            name: order.order_token_name
                        },
                        quantity: parseFloat(order.order_qlty),
                        price: parseFloat(order.order_price),
                        total_value: parseFloat(order.order_total_value),
                        order_type: order.order_type,
                        status: order.order_status,
                        tx_hash: order.order_tx_hash,
                        error_message: order.order_error_message,
                        created_at: order.order_created_at,
                        executed_at: order.order_executed_at,
                        source: order.source
                    };
                }
            });

            const result = {
                status: 200,
                message: 'Orders retrieved successfully',
                data: {
                    orders: formattedOrders,
                    total: combinedOrders.length,
                    limit,
                    offset
                }
            };
            return result;
        } catch (error) {
            console.error('Error getting orders:', error);
            return {
                status: 500,
                message: 'Error retrieving orders',
                error: error.message
            };
        }
    }

    async cancelOrder(user: any, orderId: number, cancelOrderDto: CancelOrderDto) {
        try {
            // Lấy wallet_id từ payload JWT đã được xác thực bởi JwtAuthGuard
            const { wallet_id } = user;

            // Tìm order cần hủy
            const order = await this.tradingOrderRepository.findOne({
                where: {
                    order_id: orderId,
                    order_wallet_id: wallet_id
                }
            });

            // Kiểm tra order tồn tại
            if (!order) {
                return {
                    status: HttpStatus.NOT_FOUND,
                    message: 'Order not found'
                };
            }

            // Kiểm tra quyền sở hữu (đã được đảm bảo bởi where condition, nhưng vẫn double-check)
            if (order.order_wallet_id !== wallet_id) {
                return {
                    status: HttpStatus.FORBIDDEN,
                    message: 'You do not have permission to cancel this order'
                };
            }

            // Chỉ cho phép hủy order đang pending
            if (order.order_status !== 'pending') {
                return {
                    status: HttpStatus.BAD_REQUEST,
                    message: `Cannot cancel order with status: ${order.order_status}`
                };
            }

            // Cập nhật trạng thái
            order.order_status = cancelOrderDto.status;
            const updatedOrder = await this.tradingOrderRepository.save(order);

            // Gửi thông báo
            await this.notificationService.notifyNewOrder(updatedOrder);

            return {
                status: HttpStatus.OK,
                data: {
                    order_id: updatedOrder.order_id,
                    trade_type: updatedOrder.order_trade_type,
                    token: {
                        address: updatedOrder.order_token_address,
                        name: updatedOrder.order_token_name
                    },
                    quantity: updatedOrder.order_qlty,
                    price: updatedOrder.order_price,
                    total_value: updatedOrder.order_total_value,
                    order_type: updatedOrder.order_type,
                    status: updatedOrder.order_status,
                    created_at: updatedOrder.order_created_at,
                    executed_at: updatedOrder.order_executed_at
                }
            };

        } catch (error) {
            return {
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Error canceling order',
                error: error.message
            };
        }
    }

    public async handlePriceUpdate(tokenMint: string, price: number) {
        return this.processOrderBook(tokenMint, price);
    }

    async getAmount(user: any, tokenAddress: string) {
        try {
            const { wallet_id } = user;

            // Check cache for complete amount data
            const amountCacheKey = `amount:${wallet_id}:${tokenAddress}`;
            const cachedAmount = await this.cacheService.get(amountCacheKey);
            if (cachedAmount) {
                return JSON.parse(cachedAmount as string);
            }

            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id }
            });

            if (!wallet || !wallet.wallet_solana_address) {
                return {
                    status: 404,
                    message: 'Wallet not found or invalid address'
                };
            }

            // Get SOL balance with caching
            const solBalanceCacheKey = `sol_balance:${wallet.wallet_solana_address}`;
            let solBalance = await this.cacheService.get(solBalanceCacheKey);

            if (!solBalance) {
                solBalance = await this.solanaService.getBalance(wallet.wallet_solana_address);
                await this.cacheService.set(solBalanceCacheKey, Number(solBalance).toString(), 5); // Cache 5 seconds
            } else {
                solBalance = parseFloat(solBalance as string);
            }

            // Get token balance
            const tokenBalance = await this.solanaService.getTokenBalance(
                wallet.wallet_solana_address,
                tokenAddress
            );

            // Get prices with caching
            const tokenPriceInfo = await this.solanaService.getTokenPriceInRealTime(tokenAddress);
            const solPriceInfo = await this.solanaService.getTokenPriceInRealTime('So11111111111111111111111111111111111111112');

            // Calculate USD values
            const tokenBalanceUSD = tokenBalance * tokenPriceInfo.priceUSD;
            const solBalanceUSD = (solBalance as number) * solPriceInfo.priceUSD;

            const result = {
                status: 200,
                message: 'Get balances successfully',
                data: {
                    token_address: tokenAddress,
                    token_balance: tokenBalance,
                    token_balance_usd: tokenBalanceUSD,
                    sol_balance: solBalance,
                    sol_balance_usd: solBalanceUSD
                }
            };

            // Cache the complete result
            await this.cacheService.set(amountCacheKey, JSON.stringify(result), 5); // Cache 5 seconds

            return result;
        } catch (error) {
            this.logger.error('Error in getAmount:', error);
            return {
                status: 500,
                message: `Failed to get balances: ${error.message}`
            };
        }
    }

    async getAllOrders(query: GetOrdersDto) {
        try {
            // Xây dựng query cho trading_orders
            let ordersQuery = this.tradingOrderRepository.createQueryBuilder('order')
                .leftJoinAndSelect('order.wallet', 'wallet');

            // Áp dụng các bộ lọc
            if (query.trade_type) {
                ordersQuery.andWhere('order.order_trade_type = :tradeType', { tradeType: query.trade_type });
            }

            // Thêm lọc theo token mint nếu có
            if (query.token && query.token !== 'all') {
                ordersQuery.andWhere('order.order_token_address = :tokenMint', { tokenMint: query.token });
            }

            if (query.status) {
                ordersQuery.andWhere('order.order_status = :status', { status: query.status });
            }

            if (query.order_type) {
                ordersQuery.andWhere('order.order_type = :orderType', { orderType: query.order_type });
            }

            if (query.token_name) {
                ordersQuery.andWhere('order.order_token_name LIKE :tokenName', { tokenName: `%${query.token_name}%` });
            }

            if (query.from_date) {
                ordersQuery.andWhere('order.order_created_at >= :fromDate', { fromDate: query.from_date });
            }

            if (query.to_date) {
                ordersQuery.andWhere('order.order_created_at <= :toDate', { toDate: query.to_date });
            }

            // Lấy dữ liệu từ master_transaction_detail
            let masterDetailQuery = this.connection
                .createQueryBuilder()
                .select([
                    'mtd.mt_detail_id as order_id',
                    'mtd.mt_detail_type as order_trade_type',
                    'mtd.mt_detail_token_address as order_token_address',
                    'mtd.mt_detail_token_name as order_token_name',
                    'mtd.mt_detail_amount as order_qlty',
                    'mtd.mt_detail_price as order_price',
                    'mtd.mt_detail_total_usd as order_total_value',
                    `'market' as order_type`,
                    `CASE 
                        WHEN mtd.mt_detail_status = 'success' THEN 'executed'
                        WHEN mtd.mt_detail_status = 'error' THEN 'failed'
                        ELSE 'pending'
                    END as order_status`,
                    'null as order_stop_loss',
                    'null as order_take_profit',
                    'mtd.mt_detail_hash as order_tx_hash',
                    'mtd.mt_detail_message as order_error_message',
                    'mtd.mt_wallet_member as wallet_address',
                    '"mtd"."mt_detail_time" as order_created_at',
                    '"mtd"."mt_detail_time" as order_updated_at',
                    '"mtd"."mt_detail_time" as order_executed_at',
                    'null as order_price_matching',
                    `'master-trading' as source`
                ])
                .from('master_transaction_detail', 'mtd');

            // Thêm lọc theo token mint cho master_transaction_detail
            if (query.token && query.token !== 'all') {
                masterDetailQuery.andWhere('mtd.mt_detail_token_address = :tokenMint', { tokenMint: query.token });
            }

            // Áp dụng các bộ lọc cho master_transaction_detail
            if (query.trade_type) {
                masterDetailQuery.andWhere('mtd.mt_detail_type = :tradeType', { tradeType: query.trade_type });
            }

            if (query.status) {
                const statusMap = {
                    'executed': 'success',
                    'failed': 'error',
                    'pending': 'wait'
                };
                masterDetailQuery.andWhere('mtd.mt_detail_status = :status', { status: statusMap[query.status] || query.status });
            }

            if (query.token_name) {
                masterDetailQuery.andWhere('mtd.mt_detail_token_name LIKE :tokenName', { tokenName: `%${query.token_name}%` });
            }

            if (query.from_date) {
                const fromTimestamp = new Date(query.from_date).getTime();
                masterDetailQuery.andWhere('mtd.mt_detail_time >= :fromTimestamp', { fromTimestamp });
            }

            if (query.to_date) {
                const toTimestamp = new Date(query.to_date).getTime();
                masterDetailQuery.andWhere('mtd.mt_detail_time <= :toTimestamp', { toTimestamp });
            }

            // Thực hiện truy vấn
            const tradingOrders = await ordersQuery
                .orderBy('order.order_created_at', 'DESC')
                .getMany();

            const masterDetails = await masterDetailQuery.getRawMany();

            // Kiểm tra nếu token không hợp lệ
            if (query.token && query.token !== 'all' && tradingOrders.length === 0 && masterDetails.length === 0) {
                // Kiểm tra xem token có tồn tại không
                const tokenExists = await this.solanaTokenRepository.findOne({
                    where: { slt_address: query.token }
                });

                if (!tokenExists) {
                    return {
                        status: 200,
                        message: 'Orders retrieved successfully',
                        data: {
                            orders: [],
                            total: 0,
                            limit: query.limit || 10,
                            offset: query.offset || 0
                        }
                    };
                }
            }

            // Thêm source cho trading orders
            const tradingOrdersWithSource = tradingOrders.map(order => {
                // Tạo một bản sao của order thay vì sửa trực tiếp
                const { wallet, ...orderData } = order;

                return {
                    ...orderData,
                    wallet_address: wallet?.wallet_solana_address || null,
                    source: 'trading'
                };
            });

            // Kết hợp kết quả
            let combinedOrders = [...tradingOrdersWithSource, ...masterDetails];

            // Sắp xếp theo thời gian tạo
            combinedOrders.sort((a, b) => {
                const aTime = new Date(a.order_created_at).getTime();
                const bTime = new Date(b.order_created_at).getTime();
                return bTime - aTime; // Sắp xếp giảm dần (mới nhất trước)
            });

            // Áp dụng phân trang
            const limit = query.limit || 10;
            const offset = query.offset || 0;
            const paginatedOrders = combinedOrders.slice(offset, offset + limit);

            // Format response
            const formattedOrders = paginatedOrders.map(order => {
                if (order.source === 'master-trading') {
                    return {
                        mt_order_id: order.order_id,
                        trade_type: order.order_trade_type,
                        token: {
                            address: order.order_token_address,
                            name: order.order_token_name
                        },
                        quantity: parseFloat(order.order_qlty),
                        price: parseFloat(order.order_price),
                        total_value: parseFloat(order.order_total_value),
                        order_type: order.order_type,
                        status: order.order_status,
                        tx_hash: order.order_tx_hash,
                        error_message: order.order_error_message,
                        created_at: order.order_created_at,
                        executed_at: order.order_executed_at,
                        source: order.source
                    };
                } else {
                    return {
                        order_id: order.order_id,
                        trade_type: order.order_trade_type,
                        token: {
                            address: order.order_token_address,
                            name: order.order_token_name
                        },
                        quantity: parseFloat(order.order_qlty),
                        price: parseFloat(order.order_price),
                        total_value: parseFloat(order.order_total_value),
                        order_type: order.order_type,
                        status: order.order_status,
                        tx_hash: order.order_tx_hash,
                        error_message: order.order_error_message,
                        created_at: order.order_created_at,
                        executed_at: order.order_executed_at,
                        source: order.source
                    };
                }
            });

            const result = {
                status: 200,
                message: 'Orders retrieved successfully',
                data: {
                    orders: formattedOrders,
                    total: combinedOrders.length,
                    limit,
                    offset
                }
            };

            return result;
        } catch (error) {
            console.error('Error getting all orders:', error);
            return {
                status: 500,
                message: 'Error retrieving all orders',
                error: error.message
            };
        }
    }

    // Thêm phương thức mới để theo dõi trạng thái giao dịch qua WebSocket
    private async trackTransactionStatus(txHash: string, orderId: number) {
        try {
            // Đăng ký theo dõi trạng thái giao dịch qua WebSocket
            await this.solanaService.getWebSocketService().trackTransactionStatus(txHash);

            // Lắng nghe sự kiện cập nhật trạng thái
            this.eventEmitter.on('transaction.status', async (data) => {
                if (data.signature === txHash) {
                    // Cập nhật trạng thái đơn hàng khi có thông báo từ WebSocket
                    if (data.status === 'finalized' || data.status === 'confirmed') {
                        await this.updateOrderStatus(orderId, OrderStatus.EXECUTED, null, data.status);
                    } else if (data.status === 'failed') {
                        await this.updateOrderStatus(orderId, OrderStatus.FAILED, 'Transaction failed', null);
                    }
                }
            });
        } catch (error) {
            console.error(`Error tracking transaction ${txHash}:`, error);
        }
    }

    // Thêm phương thức để theo dõi số dư ví
    private async trackWalletBalance(walletAddress: string) {
        try {
            const publicKey = new PublicKey(walletAddress);
            await this.solanaService.getWebSocketService().trackAccountBalance(publicKey);

            // Lắng nghe sự kiện thay đổi số dư
            this.eventEmitter.on('account.balance.changed', async (data) => {
                if (data.account === walletAddress) {
                    // Cập nhật cache hoặc thực hiện các hành động khi số dư thay đổi
                    console.log(`Balance updated for wallet ${walletAddress}: ${data.balance}`);
                }
            });
        } catch (error) {
            console.error(`Error tracking wallet balance for ${walletAddress}:`, error);
        }
    }

    // Thêm phương thức updateOrderStatus
    private async updateOrderStatus(orderId: number, status: OrderStatus, errorMessage: string | null, txStatus: string | null) {
        try {
            const order = await this.tradingOrderRepository.findOne({
                where: { order_id: orderId }
            });

            if (order) {
                // Chuyển đổi từ enum sang string
                order.order_status = status as unknown as "pending" | "executed" | "canceled" | "failed";

                if (errorMessage) {
                    order.order_error_message = errorMessage;
                }
                if (txStatus) {
                    console.log(`Transaction ${order.order_tx_hash} status updated to ${txStatus}`);
                }
                await this.tradingOrderRepository.save(order);

                this.eventEmitter.emit('order.status.updated', {
                    orderId,
                    status,
                    errorMessage,
                    txStatus
                });
            }
        } catch (error) {
            console.error(`Error updating order status for order ${orderId}:`, error);
        }
    }
} 