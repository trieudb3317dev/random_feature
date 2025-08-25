import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BittworldRewards } from '../entities/bittworld-rewards.entity';
import { BittworldWithdraw } from '../entities/bittworld-withdraws.entity';
import { BittworldToken } from '../entities/bittworld-token.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { BgAffiliateTree } from '../../referral/entities/bg-affiliate-tree.entity';
import { ConfigService } from '@nestjs/config';
import { SolanaService } from '../../solana/solana.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from '@nestjs/common';
import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { BittworldTokenDto, TokenListResponseDto } from '../dto/token-list.dto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class BittworldsService {
    private readonly logger = new Logger(BittworldsService.name);

    constructor(
        @InjectRepository(BittworldRewards)
        private bittworldRewardsRepository: Repository<BittworldRewards>,
        @InjectRepository(BittworldWithdraw)
        private bittworldWithdrawRepository: Repository<BittworldWithdraw>,
        @InjectRepository(BittworldToken)
        private bittworldTokenRepository: Repository<BittworldToken>,
        @InjectRepository(ListWallet)
        private listWalletRepository: Repository<ListWallet>,
        @InjectRepository(BgAffiliateTree)
        private bgAffiliateTreeRepository: Repository<BgAffiliateTree>,
        private configService: ConfigService,
        private solanaService: SolanaService,
        private dataSource: DataSource,
        private httpService: HttpService
    ) {}

    /**
     * Lấy danh sách token từ bảng bittworld_token và bổ sung dữ liệu từ Solana Tracker
     * @param page Số trang
     * @param limit Số lượng token mỗi trang
     * @returns Danh sách token với dữ liệu đầy đủ
     */
    async getTokenList(page: number = 1, limit: number = 20): Promise<TokenListResponseDto> {
        try {
            this.logger.log(`Getting token list - Page: ${page}, Limit: ${limit}`);

            // Tính toán offset
            const skip = (page - 1) * limit;

            // Lấy danh sách token từ database
            const [tokens, total] = await this.bittworldTokenRepository.findAndCount({
                where: { bt_status: true }, // Chỉ lấy token có status = true
                skip,
                take: limit,
                order: { created_at: 'DESC' }
            });

            if (tokens.length === 0) {
                return {
                    status: 200,
                    message: 'No tokens found',
                    data: {
                        tokens: [],
                        total: 0,
                        page,
                        limit
                    }
                };
            }

            // Lấy địa chỉ của tất cả token để gọi Solana Tracker
            const tokenAddresses = tokens.map(token => token.bt_address);

            // Gọi Solana Tracker để lấy dữ liệu bổ sung
            let solanaTrackerData: any[] = [];
            try {
                // Sử dụng method getMultiTokensData từ SolanaTrackerService nếu có
                // Hoặc gọi trực tiếp API Solana Tracker
                solanaTrackerData = await this.getSolanaTrackerData(tokenAddresses);
                this.logger.log(`Successfully fetched data from Solana Tracker for ${solanaTrackerData.length} tokens`);
            } catch (error) {
                this.logger.warn(`Failed to fetch data from Solana Tracker: ${error.message}`);
                solanaTrackerData = [];
            }

            // Kết hợp dữ liệu từ database và Solana Tracker
            const enrichedTokens: BittworldTokenDto[] = tokens.map(token => {
                // Tìm dữ liệu tương ứng từ Solana Tracker
                const solanaData = solanaTrackerData.find(data => data.address === token.bt_address);

                return {
                    id: token.bt_id,
                    // Ưu tiên dữ liệu từ Solana Tracker, nếu không có thì lấy từ database
                    name: solanaData?.name || token.bt_name,
                    symbol: solanaData?.symbol || token.bt_symbol,
                    address: token.bt_address,
                    logo_url: solanaData?.logo_uri || token.bt_logo_url || '',
                    status: token.bt_status, // Luôn lấy từ database
                    // Các trường bổ sung từ Solana Tracker
                    market_cap: solanaData?.market_cap || 0,
                    fdv: solanaData?.fdv || 0,
                    liquidity: solanaData?.liquidity || 0,
                    last_trade_unix_time: solanaData?.last_trade_unix_time || 0,
                    volume_1h_usd: solanaData?.volume_1h_usd || 0,
                    volume_1h_change_percent: solanaData?.volume_1h_change_percent || 0,
                    volume_24h_usd: solanaData?.volume_24h_usd || 0,
                    volume_24h_change_percent: solanaData?.volume_24h_change_percent || 0,
                    trade_24h_count: solanaData?.txns || 0,
                    price: solanaData?.price || 0,
                    price_change_24h_percent: solanaData?.volume_24h_change_percent || 0,
                    holder: solanaData?.holders || 0,
                    recent_listing_time: solanaData?.recent_listing_time || 0,
                    buys: solanaData?.buys || 0,
                    sells: solanaData?.sells || 0,
                    txns: solanaData?.txns || 0,
                    volume_5m_change_percent: solanaData?.volume_5m_change_percent || 0,
                    volume_4h_change_percent: solanaData?.volume_4h_change_percent || 0
                };
            });

            return {
                status: 200,
                message: 'Token list retrieved successfully',
                data: {
                    tokens: enrichedTokens,
                    total,
                    page,
                    limit
                }
            };

        } catch (error) {
            this.logger.error(`Error getting token list: ${error.message}`);
            // Sử dụng HttpException để trả về HTTP status code 500
            throw new HttpException({
                statusCode: 500,
                message: `Error getting token list: ${error.message}`
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Gọi Solana Tracker API để lấy dữ liệu của nhiều token
     * @param tokenAddresses Mảng địa chỉ token
     * @returns Dữ liệu từ Solana Tracker
     */
    private async getSolanaTrackerData(tokenAddresses: string[]): Promise<any[]> {
        try {
            // Kiểm tra xem có SOLANA_TRACKER_API_KEY không
            const apiKey = this.configService.get<string>('SOLANA_TRACKER_API_KEY');
            const apiUrl = this.configService.get<string>('SOLANA_TRACKER_API_URL', 'https://api.solanatracker.io/v1');

            if (!apiKey) {
                throw new Error('SOLANA_TRACKER_API_KEY not configured');
            }

            // Chia mảng token thành các nhóm nhỏ, mỗi nhóm tối đa 20 token
            const chunkSize = 20;
            const tokenChunks: string[][] = [];
            for (let i = 0; i < tokenAddresses.length; i += chunkSize) {
                tokenChunks.push(tokenAddresses.slice(i, i + chunkSize));
            }

            this.logger.debug(`Processing ${tokenAddresses.length} tokens in ${tokenChunks.length} chunks`);

            // Xử lý từng nhóm token
            const allResults = await Promise.all(
                tokenChunks.map(async (chunk) => {
                    try {
                        // Gọi API Solana Tracker để lấy dữ liệu của nhiều token
                        const response = await firstValueFrom(
                            this.httpService.post(`${apiUrl}/tokens/multi`, 
                                { tokens: chunk },
                                {
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'x-api-key': apiKey
                                    }
                                }
                            )
                        );

                        const data = response.data;

                        if (!data.tokens) {
                            throw new Error('Invalid response format from Solana Tracker');
                        }

                        // Xử lý dữ liệu trả về
                        return Object.entries(data.tokens).map(([address, tokenData]: [string, any]) => {
                            const bestPool = tokenData.pools?.length > 0 ? tokenData.pools[0] : null;

                            return {
                                address,
                                name: tokenData.token?.name || null,
                                symbol: tokenData.token?.symbol || null,
                                logo_uri: tokenData.token?.image || null,
                                holders: tokenData.holders || 0,
                                buys: tokenData.buys || 0,
                                sells: tokenData.sells || 0,
                                txns: tokenData.txns || 0,
                                volume_1h_usd: (tokenData.txns || 0) * (bestPool?.price?.usd || 0),
                                volume_24h_usd: bestPool?.txns?.volume || 0,
                                volume_5m_change_percent: tokenData.events?.['5m']?.priceChangePercentage || 0,
                                volume_4h_change_percent: tokenData.events?.['4h']?.priceChangePercentage || 0,
                                volume_1h_change_percent: tokenData.events?.['1h']?.priceChangePercentage || 0,
                                volume_24h_change_percent: tokenData.events?.['24h']?.priceChangePercentage || 0,
                                market_cap: bestPool?.marketCap?.usd || 0,
                                fdv: bestPool?.tokenSupply ? (bestPool.price.usd * bestPool.tokenSupply) : 0,
                                liquidity: bestPool?.liquidity?.usd || 0,
                                last_trade_unix_time: bestPool?.lastUpdated || 0,
                                price: bestPool?.price?.usd || 0,
                                recent_listing_time: bestPool?.createdAt || 0,
                                program: bestPool?.market || ""
                            };
                        });

                    } catch (error) {
                        this.logger.error(`Error processing chunk: ${error.message}`);
                        
                        // Trả về dữ liệu cơ bản cho chunk này
                        return chunk.map(address => ({
                            address,
                            name: null,
                            symbol: null,
                            logo_uri: null,
                            holders: 0,
                            buys: 0,
                            sells: 0,
                            txns: 0,
                            volume_1h_usd: 0,
                            volume_24h_usd: 0,
                            volume_5m_change_percent: 0,
                            volume_4h_change_percent: 0,
                            volume_1h_change_percent: 0,
                            volume_24h_change_percent: 0,
                            market_cap: 0,
                            fdv: 0,
                            liquidity: 0,
                            last_trade_unix_time: 0,
                            price: 0,
                            recent_listing_time: 0,
                            program: ""
                        }));
                    }
                })
            );

            // Gộp kết quả từ tất cả các chunk
            return allResults.flat();

        } catch (error) {
            this.logger.error(`Error getting Solana Tracker data: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tính toán phí giao dịch cho đối tác Bittworld
     * @param traderWalletId ID của ví giao dịch
     * @param volume Khối lượng giao dịch (USD)
     * @param orderId ID của order (tùy chọn)
     * @returns Thông tin reward đã tạo
     */
    async rewardBittworld(
        traderWalletId: number,
        volume: number,
        orderId?: number
    ): Promise<{
        success: boolean;
        message: string;
        reward?: BittworldRewards;
        calculatedAmount?: number;
        treeCommissionPercent?: number;
    }> {
        try {
            // Bước 1: Kiểm tra ví giao dịch có phải từ Bittworld không
            const traderWallet = await this.listWalletRepository.findOne({
                where: { wallet_id: traderWalletId },
                select: ['wallet_id', 'isBittworld', 'wallet_solana_address', 'wallet_nick_name']
            });

            if (!traderWallet) {
                return {
                    success: false,
                    message: 'Trader wallet not found'
                };
            }

            // Nếu ví không phải từ Bittworld thì không tính reward
            if (!traderWallet.isBittworld) {
                return {
                    success: false,
                    message: 'Trader wallet is not from Bittworld'
                };
            }

            // Bước 2: Kiểm tra ví có thuộc luồng BG nào không
            const bgTree = await this.bgAffiliateTreeRepository.findOne({
                where: { bat_root_wallet_id: traderWalletId }
            });

            let calculatedAmount: number;
            let treeCommissionPercent: number | null = null;

            if (!bgTree) {
                // Trường hợp 1: Ví không thuộc luồng BG nào
                // PT = volume x 0.7%
                calculatedAmount = volume * 0.007;
            } else {
                // Trường hợp 2: Ví thuộc luồng BG
                // PT = (volume x 0.7%) - (volume x 0.7% x bat_total_commission_percent%)
                const baseCommission = volume * 0.007;
                treeCommissionPercent = bgTree.bat_total_commission_percent;
                const treeCommission = baseCommission * (treeCommissionPercent / 100);
                calculatedAmount = baseCommission - treeCommission;
            }

            // Chỉ tạo reward nếu số tiền > 0
            if (calculatedAmount <= 0) {
                return {
                    success: false,
                    message: 'Calculated reward amount is zero or negative',
                    calculatedAmount: 0,
                    treeCommissionPercent: treeCommissionPercent || 0
                };
            }

            // Bước 3: Tạo reward record
            // Tính toán SOL amount từ USD amount
            let solAmount: number | undefined;
            try {
                const solPriceInfo = await this.solanaService.getTokenPriceInRealTime('So11111111111111111111111111111111111111112');
                solAmount = calculatedAmount / solPriceInfo.priceUSD;
            } catch (error) {
                this.logger.warn(`Failed to get SOL price for reward calculation: ${error.message}`);
                solAmount = undefined;
            }

            const reward = this.bittworldRewardsRepository.create({
                br_amount_sol: solAmount,
                br_amount_usd: calculatedAmount,
                br_status: 'can_withdraw' // Giao dịch thành công nên có thể rút tiền ngay
            });

            const savedReward = await this.bittworldRewardsRepository.save(reward);

            return {
                success: true,
                message: 'Bittworld reward calculated and saved successfully',
                reward: savedReward,
                calculatedAmount,
                treeCommissionPercent: treeCommissionPercent || 0
            };

        } catch (error) {
            return {
                success: false,
                message: `Error calculating Bittworld reward: ${error.message}`
            };
        }
    }

    /**
     * Hàm tự động trả hoa hồng cho đối tác Bittworlds
     * Chạy tự động mỗi 24h (UTC) một lần
     */
    @Cron(process.env.BITTWORLD_REWARD_CRON || '0 0 * * *', {
        name: 'autoRewardBittworld',
        timeZone: process.env.BITTWORLD_REWARD_TIMEZONE || 'UTC'
    })
    async autoRewardBittworld(): Promise<void> {
        this.logger.log('Starting auto reward Bittworld process...');
        this.logger.log(`Cron schedule: ${process.env.BITTWORLD_REWARD_CRON || '0 0 * * *'}`);
        this.logger.log(`Timezone: ${process.env.BITTWORLD_REWARD_TIMEZONE || 'UTC'}`);
        
        try {
            await this.dataSource.transaction(async manager => {
                // Bước 1: Tìm tất cả rewards có thể rút tiền
                const rewardsToWithdraw = await manager.find(BittworldRewards, {
                    where: { br_status: 'can_withdraw' }
                });

                if (rewardsToWithdraw.length === 0) {
                    this.logger.log('No rewards to withdraw');
                    return;
                }

                this.logger.log(`Found ${rewardsToWithdraw.length} rewards to withdraw`);

                // Bước 2: Tính tổng USD và SOL cần rút
                const totalUsdAmount = rewardsToWithdraw.reduce((sum, reward) => {
                    return sum + (reward.br_amount_usd || 0);
                }, 0);

                if (totalUsdAmount <= 0) {
                    this.logger.log('Total USD amount is zero or negative');
                    return;
                }

                // Bước 3: Lấy tỷ giá SOL hiện tại và tính SOL amount
                const solPriceInfo = await this.solanaService.getTokenPriceInRealTime('So11111111111111111111111111111111111111112');
                const totalSolAmount = totalUsdAmount / solPriceInfo.priceUSD;

                // Bước 4: Cập nhật tất cả rewards thành pending
                const rewardIds = rewardsToWithdraw.map(reward => reward.br_id);
                await manager.update(BittworldRewards, 
                    { br_id: rewardIds }, 
                    { br_status: 'pending' }
                );

                // Bước 5: Tạo withdraw record
                const withdraw = manager.create(BittworldWithdraw, {
                    bw_amount_sol: totalSolAmount,
                    bw_amount_usd: totalUsdAmount,
                    bw_address: this.configService.get<string>('WALLET__BITTWORLD_REWARD'),
                    bw_status: 'pending'
                });

                const savedWithdraw = await manager.save(BittworldWithdraw, withdraw);

                this.logger.log(`Created withdraw record: ${savedWithdraw.bw_id}, Amount: ${totalSolAmount} SOL ($${totalUsdAmount})`);

                // Bước 6: Thực hiện chuyển SOL
                const privateKey = this.configService.get<string>('WALLET_SUP_FREE_PRIVATE_KEY');
                const targetAddress = this.configService.get<string>('WALLET__BITTWORLD_REWARD');

                if (!privateKey || !targetAddress) {
                    throw new Error('Missing required environment variables: WALLET_SUP_FREE_PRIVATE_KEY or WALLET__BITTWORLD_REWARD');
                }

                try {
                    // Thực hiện chuyển SOL
                    const transferResult = await this.transferSol(
                        privateKey,
                        targetAddress,
                        totalSolAmount
                    );

                    if (transferResult?.signature) {
                        // Chuyển tiền thành công
                        await manager.update(BittworldWithdraw, 
                            { bw_id: savedWithdraw.bw_id }, 
                            { 
                                bw_status: 'success',
                                bw_tx_hash: transferResult.signature
                            }
                        );

                        // Cập nhật tất cả rewards thành withdrawn
                        await manager.update(BittworldRewards, 
                            { br_id: rewardIds }, 
                            { br_status: 'withdrawn' }
                        );

                        this.logger.log(`Transfer successful: ${transferResult.signature}`);
                        this.logger.log(`Updated ${rewardIds.length} rewards to withdrawn status`);
                    } else {
                        throw new Error('Transfer failed: No signature returned');
                    }

                } catch (transferError) {
                    this.logger.error(`Transfer failed: ${transferError.message}`);

                    // Chuyển tiền thất bại
                    await manager.update(BittworldWithdraw, 
                        { bw_id: savedWithdraw.bw_id }, 
                        { bw_status: 'error' }
                    );

                    // Cập nhật tất cả rewards về can_withdraw
                    await manager.update(BittworldRewards, 
                        { br_id: rewardIds }, 
                        { br_status: 'can_withdraw' }
                    );

                    this.logger.log(`Updated ${rewardIds.length} rewards back to can_withdraw status`);
                }
            });

        } catch (error) {
            this.logger.error(`Auto reward Bittworld process failed: ${error.message}`);
        }
    }

    /**
     * Hàm thủ công để chạy auto reward (có thể gọi từ API)
     */
    async manualAutoRewardBittworld(): Promise<{
        success: boolean;
        message: string;
        processedRewards?: number;
        totalAmount?: number;
    }> {
        try {
            this.logger.log('Starting manual auto reward Bittworld process...');
            
            // Tìm số lượng rewards có thể rút
            const rewardsCount = await this.bittworldRewardsRepository.count({
                where: { br_status: 'can_withdraw' }
            });

            if (rewardsCount === 0) {
                return {
                    success: true,
                    message: 'No rewards to withdraw',
                    processedRewards: 0,
                    totalAmount: 0
                };
            }

            // Chạy quy trình tự động
            await this.autoRewardBittworld();

            return {
                success: true,
                message: `Auto reward process completed. Processed ${rewardsCount} rewards.`,
                processedRewards: rewardsCount
            };

        } catch (error) {
            this.logger.error(`Manual auto reward failed: ${error.message}`);
            return {
                success: false,
                message: `Auto reward process failed: ${error.message}`
            };
        }
    }

    /**
     * Phương thức chuyển SOL
     */
    private async transferSol(
        privateKey: string,
        toAddress: string,
        amount: number
    ): Promise<{ signature: string } | null> {
        try {
            // Tạo keypair từ private key
            const decodedKey = bs58.decode(privateKey);
            const keypair = require('@solana/web3.js').Keypair.fromSecretKey(decodedKey);

            // Tạo transaction chuyển SOL
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: keypair.publicKey,
                    toPubkey: new PublicKey(toAddress),
                    lamports: Math.floor(amount * LAMPORTS_PER_SOL)
                })
            );

            // Gửi transaction
            const signature = await this.solanaService.getConnection().sendTransaction(transaction, [keypair]);
            await this.solanaService.getConnection().confirmTransaction(signature);

            this.logger.log(`SOL transfer successful: ${signature}. Amount: ${amount} SOL`);
            return { signature };

        } catch (error) {
            this.logger.error(`SOL transfer failed: ${error.message}`);
            return null;
        }
    }
} 