import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, IsNull, Not, Raw, Brackets } from 'typeorm';
import { SolanaListToken } from './entities/solana-list-token.entity';
import { SolanaWishlistToken } from './entities/solana-wishlist-token.entity';
import { SolanaTokenDto, SolanaTokensResponseDto, SolanaTokenQueryDto } from './dto/solana-token.dto';
import { SolanaService } from './solana.service';
import { WishlistStatus } from './entities/solana-wishlist-token.entity';
import { TokenProgram } from './entities/solana-list-token.entity';
import { BirdeyeService } from '../on-chain/birdeye.service';
import { DeepPartial } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { ChatsService } from '../chats/chats.service';
import { SolanaTrackerService, TokenData } from '../on-chain/solana-tracker.service';
import { SolanaCacheService } from './solana-cache.service';
import { PublicKey } from '@solana/web3.js';
import { SolanaListPool } from './entities/solana-list-pool.entity';
import { SolanaListCategoriesToken, CategoryStatus } from './entities/solana-list-categories-token.entity';
import { GetCategoriesResponseDto } from './dto/get-categories-response.dto';
import { ListTokenByCategoryResponseDto } from './dto/list-token-by-category.dto';
import { SolanaTokenJoinCategory, JoinCategoryStatus } from './entities/solana-token-join-category.entity';

@Injectable()
export class SolanaTokensService {
    private readonly logger = new Logger(SolanaTokensService.name);

    constructor(
        @InjectRepository(SolanaListToken)
        private readonly solanaTokenRepository: Repository<SolanaListToken>,
        private readonly solanaTrackerService: SolanaTrackerService,
        private readonly solanaService: SolanaService,
        @InjectRepository(SolanaWishlistToken)
        private wishlistTokenRepository: Repository<SolanaWishlistToken>,
        @InjectRepository(SolanaListPool)
        private readonly solanaListPoolRepository: Repository<SolanaListPool>,
        private birdeyeService: BirdeyeService,
        private cacheService: CacheService,
        private chatsService: ChatsService,
        private readonly solanaCacheService: SolanaCacheService,
        @InjectRepository(SolanaListCategoriesToken)
        private readonly solanaListCategoriesTokenRepository: Repository<SolanaListCategoriesToken>
    ) { }

    async findAll(query: SolanaTokenQueryDto): Promise<{ status: number; data?: any; message?: string }> {
        try {
            const page = query.page || 1;
            const limit = query.limit || 10;
            const skip = (page - 1) * limit;

            // Chuyển đổi tham số random từ chuỗi sang boolean
            const random = query.random === true || String(query.random) === 'true';

            // Điều kiện cơ bản: có đầy đủ name, symbol và logo_url
            let whereCondition: any = {
                slt_name: Raw(alias => `${alias} IS NOT NULL AND TRIM(${alias}) != ''`),
                slt_symbol: Raw(alias => `${alias} IS NOT NULL AND TRIM(${alias}) != ''`),
                slt_logo_url: Raw(alias => `${alias} IS NOT NULL AND TRIM(${alias}) != ''`),
            };

            // Thêm điều kiện tìm kiếm nếu có
            if (query.search) {
                whereCondition = [
                    { ...whereCondition, slt_name: Like(`%${query.search}%`) },
                    { ...whereCondition, slt_symbol: Like(`%${query.search}%`) },
                    { ...whereCondition, slt_address: Like(`%${query.search}%`) },
                ];
            }

            // Thêm điều kiện lọc theo verified nếu có
            if (query.verified !== undefined) {
                if (Array.isArray(whereCondition)) {
                    whereCondition = whereCondition.map(condition => ({
                        ...condition,
                        slt_is_verified: query.verified,
                    }));
                } else {
                    whereCondition.slt_is_verified = query.verified;
                }
            }

            // Xác định cách sắp xếp
            let queryBuilder = this.solanaTokenRepository.createQueryBuilder('token');

            // Áp dụng các điều kiện lọc
            if (Array.isArray(whereCondition)) {
                // Xử lý điều kiện OR
                queryBuilder.where(new Brackets(qb => {
                    whereCondition.forEach((condition, index) => {
                        if (index === 0) {
                            qb.where(condition);
                        } else {
                            qb.orWhere(condition);
                        }
                    });
                }));
            } else {
                // Xử lý điều kiện AND
                queryBuilder.where(whereCondition);
            }

            // Áp dụng sắp xếp
            if (random) {
                // Đếm tổng số token thỏa mãn điều kiện
                const total = await queryBuilder.getCount();

                // Sử dụng timestamp hiện tại làm seed cho random
                const timestamp = Date.now();
                const randomSeed = timestamp % 1000000;

                // Tính toán offset ngẫu nhiên dựa trên timestamp
                const maxOffset = Math.max(0, total - limit);
                const randomOffset = Math.floor((randomSeed / 1000000) * maxOffset);

                // Áp dụng offset ngẫu nhiên và limit
                queryBuilder.skip(randomOffset).take(limit);

                // Thực hiện truy vấn
                const tokens = await queryBuilder.getMany();

                return {
                    status: 200,
                    data: {
                        tokens: tokens.map(this.mapToDto),
                        total,
                        page: 1,
                        limit,
                    }
                };
            } else {
                queryBuilder.orderBy('token.slt_market_cap', 'DESC')
                    .addOrderBy('token.slt_name', 'ASC');

                // Áp dụng phân trang cho trường hợp không random
                queryBuilder.skip(skip).take(limit);

                // Thực hiện truy vấn
                const [tokens, total] = await queryBuilder.getManyAndCount();

                return {
                    status: 200,
                    data: {
                        tokens: tokens.map(this.mapToDto),
                        total,
                        page,
                        limit,
                    }
                };
            }
        } catch (error) {
            return {
                status: 500,
                message: `Error fetching tokens: ${error.message}`
            };
        }
    }

    async findOne(id: number): Promise<{ status: number; data?: SolanaTokenDto; message?: string }> {
        try {
            const token = await this.solanaTokenRepository.findOne({
                where: { slt_id: id },
            });

            if (!token) {
                return {
                    status: 404,
                    message: `Token with ID ${id} not found`
                };
            }

            return {
                status: 200,
                data: this.mapToDto(token)
            };
        } catch (error) {
            return {
                status: 500,
                message: `Error fetching token: ${error.message}`
            };
        }
    }

    async findByAddress(address: string): Promise<{ status: number; data?: SolanaTokenDto; message?: string }> {
        try {
            this.logger.log(`Finding token by address: ${address}`);

            // Validate address format
            try {
                new PublicKey(address);
            } catch (error) {
                this.logger.warn(`Invalid token address format: ${address}`);
                return {
                    status: 400,
                    message: 'Invalid token address format'
                };
            }

            // Try to get token info
            try {
                const tokenInfo = await this.getTokenInfo(address);
                let tokenDataSolanaTracker;
                try {
                    // Set a shorter timeout for the first attempt
                    tokenDataSolanaTracker = await Promise.race([
                        this.solanaTrackerService.getTokenDetails(address),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Timeout')), 5000)
                        )
                    ]);
                } catch (error) {
                    this.logger.warn(`Failed to get token details from Solana Tracker for ${address} on first attempt, using basic token info`);
                    return {
                        status: 200,
                        data: tokenInfo
                    };
                }


                // if (tokenDataSolanaTracker?.pools && Array.isArray(tokenDataSolanaTracker.pools)) {
                //     try {
                //         const poolResult = await this.savePoolsFromApi(tokenDataSolanaTracker.pools);
                //         this.logger.log(`Successfully saved pools for token ${address}:`, {
                //             saved: poolResult.saved,
                //             updated: poolResult.updated,
                //             skipped: poolResult.skipped
                //         });
                //     } catch (poolError) {
                //         this.logger.error(`Error saving pools for token ${address}:`, {
                //             error: poolError.message,
                //             stack: poolError.stack
                //         });

                //     }
                // }

                // Get existing token from database
                const existingToken = await this.solanaTokenRepository.findOne({
                    where: { slt_address: address }
                });

                if (existingToken) {
                    return {
                        status: 200,
                        data: this.mapToDto(existingToken, tokenDataSolanaTracker)
                    };
                }

                return {
                    status: 200,
                    data: tokenInfo
                };
            } catch (error) {
                this.logger.error(`Error getting token info for ${address}:`, {
                    error: error.message,
                    stack: error.stack,
                    response: error.response?.data
                });

                if (error.message === 'Token not found') {
                    return {
                        status: 404,
                        message: 'Token not found'
                    };
                }

                return {
                    status: 500,
                    message: error.message || 'Failed to fetch token'
                };
            }
        } catch (error) {
            this.logger.error(`Unexpected error in findByAddress for ${address}:`, {
                error: error.message,
                stack: error.stack
            });
            return {
                status: 500,
                message: error.message || 'An unexpected error occurred'
            };
        }
    }

    async updateTradingviewSymbol(address: string, tradingviewSymbol: string): Promise<{ status: number; message: string; data?: any }> {
        try {
            // Tìm token theo address
            const token = await this.solanaTokenRepository.findOne({
                where: { slt_address: address }
            });

            if (!token) {
                return {
                    status: 404,
                    message: `Token with address ${address} not found`
                };
            }

            // Cập nhật tradingview symbol
            await this.solanaTokenRepository.update(
                { slt_id: token.slt_id },
                { slt_tradingview_symbol: tradingviewSymbol }
            );

            return {
                status: 200,
                message: 'TradingView symbol updated successfully',
                data: {
                    address: token.slt_address,
                    name: token.slt_name,
                    symbol: token.slt_symbol,
                    tradingviewSymbol
                }
            };
        } catch (error) {
            return {
                status: 500,
                message: `Error updating TradingView symbol: ${error.message}`
            };
        }
    }

    private getPoolData(pools: any[], holders: number = 0): { marketCap: number; price: number; liquidity: number; holders: number; program: string } {
        // Try to find raydium-clmm pool first
        const raydiumPool = pools.find(pool => pool.market === 'raydium-clmm');

        // If raydium-clmm pool exists, use its data
        if (raydiumPool) {
            return {
                marketCap: raydiumPool.marketCap?.usd || 0,
                price: raydiumPool.price?.usd || 0,
                liquidity: raydiumPool.liquidity?.usd || 0,
                holders: holders,
                program: raydiumPool.market
            };
        }

        // If no raydium-clmm pool, use the first pool's data
        const firstPool = pools[0];
        if (firstPool) {
            return {
                marketCap: firstPool.marketCap?.usd || 0,
                price: firstPool.price?.usd || 0,
                liquidity: firstPool.liquidity?.usd || 0,
                holders: holders,
                program: firstPool.market
            };
        }

        // Default values if no pools found
        return {
            marketCap: 0,
            price: 0,
            liquidity: 0,
            holders: holders,
            program: ""
        };
    }

    private mapToDto(token: SolanaListToken, poolData?: any): SolanaTokenDto {
        const poolInfo = poolData ? this.getPoolData(poolData.pools, poolData.holders) : {
            marketCap: token.slt_market_cap || 0,
            price: token.slt_price || 0,
            liquidity: 0,
            holders: 0,
            program: ""
        };

        const poolDataToken = poolData ? poolData.token : null;
        return {
            id: token.slt_id,
            name: token.slt_name || poolDataToken?.name,
            symbol: token.slt_symbol || poolDataToken?.symbol,
            address: token.slt_address,
            decimals: token.slt_decimals,
            logoUrl: token.slt_logo_url || poolDataToken?.image || '',
            coingeckoId: token.slt_coingecko_id,
            tradingviewSymbol: token.slt_tradingview_symbol,
            isVerified: token.slt_is_verified,
            marketCap: poolInfo.marketCap,
            volume24h: poolInfo.marketCap * (poolData?.events?.['24h']?.priceChangePercentage || 0) / 100,
            liquidity: poolInfo.liquidity,
            holders: poolInfo.holders,
            twitter: token.slt_twitter,
            telegram: token.slt_telegram,
            website: token.slt_website,
            price: poolInfo.price,
            transactionHash: token.slt_transaction_hash,
            program: poolInfo?.program || "",
            events: poolData?.events || null
        };
    }

    private shuffleArray<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    private shuffleArrayThoroughly<T>(array: T[]): T[] {
        // Trộn ngẫu nhiên nhiều lần để đảm bảo tính ngẫu nhiên
        for (let round = 0; round < 3; round++) {
            // Fisher-Yates shuffle algorithm
            for (let i = array.length - 1; i > 0; i--) {
                // Tạo số ngẫu nhiên mới mỗi lần
                const j = Math.floor(Math.random() * (i + 1));
                // Swap
                [array[i], array[j]] = [array[j], array[i]];
            }
        }
        return array;
    }

    async searchTokens(params: {
        search: string;
        page?: number;
        limit?: number;
        verified?: boolean;
    }): Promise<{ status: number; data?: any; message?: string }> {
        const startTime = Date.now();
        try {
            const { search, page = 1, limit = 10, verified } = params;
            const skip = (page - 1) * limit;

            if (!search || search.trim() === '') {
                return {
                    status: 400,
                    message: 'Search query is required'
                };
            }

            // Tạo query builder
            let queryBuilder = this.solanaTokenRepository.createQueryBuilder('token');

            // Thêm điều kiện tìm kiếm
            queryBuilder.where(new Brackets(qb => {
                qb.where('token.slt_name ILIKE :search', { search: `%${search}%` })
                    .orWhere('token.slt_symbol ILIKE :search', { search: `%${search}%` })
                    .orWhere('token.slt_address ILIKE :search', { search: `%${search}%` });
            }));

            // Thêm điều kiện lọc theo verified nếu có
            if (verified !== undefined) {
                queryBuilder.andWhere('token.slt_is_verified = :verified', { verified });
            }

            // Thêm điều kiện lọc cơ bản
            queryBuilder.andWhere('token.slt_name IS NOT NULL AND TRIM(token.slt_name) != \'\'');
            queryBuilder.andWhere('token.slt_symbol IS NOT NULL AND TRIM(token.slt_symbol) != \'\'');
            queryBuilder.andWhere('token.slt_logo_url IS NOT NULL AND TRIM(token.slt_logo_url) != \'\'');

            // Sắp xếp kết quả
            queryBuilder.orderBy('token.slt_market_cap', 'DESC')
                .addOrderBy('token.slt_name', 'ASC');

            // Áp dụng phân trang
            queryBuilder.skip(skip).take(limit);

            const [tokens, total] = await queryBuilder.getManyAndCount();

            return {
                status: 200,
                data: {
                    tokens: tokens.map(this.mapToDto),
                    total,
                    page,
                    limit,
                    query: search,
                    executionTime: Date.now() - startTime
                }
            };
        } catch (error) {
            return {
                status: 500,
                message: `Error searching tokens: ${error.message}`
            };
        }
    }

    async getMyWishlist(walletId: number): Promise<{ status: number; data?: any; message?: string }> {
        try {
            const wishlistTokens = await this.wishlistTokenRepository.find({
                where: {
                    swt_wallet_id: walletId,
                    swt_status: WishlistStatus.ON
                },
                relations: ['token'],
                order: {
                    swt_updated_at: 'DESC'
                }
            });

            // Lấy danh sách địa chỉ token
            const tokenAddresses = wishlistTokens.map(item => item.token.slt_address);

            // Lấy thêm dữ liệu từ getMultiTokensData
            const multiTokensData = await this.solanaTrackerService.getMultiTokensData(tokenAddresses);

            // Kết hợp dữ liệu
            const tokens = wishlistTokens.map(item => {
                const tokenData = multiTokensData.data.find(t => t.address === item.token.slt_address);
                const baseToken = this.mapToDto(item.token);
                
                return {
                    ...baseToken,
                    name: tokenData?.name || "",
                    symbol: tokenData?.symbol || "",
                    logo_uri: tokenData?.logo_uri || "",
                    holder: tokenData?.holders || 0,
                    volume_1h_usd: tokenData?.volume_1h_usd || 0,
                    volume_24h_usd: tokenData?.volume_24h_usd || 0,
                    volume_4h_change_percent: tokenData?.volume_4h_change_percent || 0,
                    volume_1h_change_percent: tokenData?.volume_1h_change_percent || 0,
                    volume_24h_change_percent: tokenData?.volume_24h_change_percent || 0,
                    market_cap: tokenData?.market_cap || 0,
                    liquidity: tokenData?.liquidity || 0,
                    price: tokenData?.price || 0,
                    program: tokenData?.program || ""
                };
            });

            return {
                status: 200,
                data: {
                    tokens,
                    total: tokens.length
                }
            };
        } catch (error) {
            return {
                status: 500,
                message: `Error fetching wishlist tokens: ${error.message}`
            };
        }
    }

    async toggleWishlist(walletId: number, tokenAddress: string, status: string): Promise<{ status: number; message: string; data?: any }> {
        try {
            // Kiểm tra và lưu token nếu chưa tồn tại
            const checkResult = await this.checkAndSaveToken(tokenAddress);
            if (checkResult.status !== 200 || !checkResult.data) {
                return {
                    status: checkResult.status,
                    message: checkResult.message || 'Token not found'
                };
            }

            const tokenId = checkResult.data.id;

            // Kiểm tra xem đã tồn tại trong wishlist chưa
            const existing = await this.wishlistTokenRepository.findOne({
                where: {
                    swt_wallet_id: walletId,
                    swt_token_id: tokenId
                }
            });

            if (status === 'on') {
                if (!existing) {
                    // Thêm token mới vào wishlist mà không cần kiểm tra giới hạn
                    const newWishlist = this.wishlistTokenRepository.create({
                        swt_wallet_id: walletId,
                        swt_token_id: tokenId,
                        swt_status: WishlistStatus.ON
                    });
                    await this.wishlistTokenRepository.save(newWishlist);
                    return {
                        status: 200,
                        message: 'Token added to wishlist',
                        data: { status: WishlistStatus.ON }
                    };
                } else if (existing.swt_status === WishlistStatus.OFF) {
                    // Chuyển token hiện tại sang ON mà không cần kiểm tra giới hạn
                    existing.swt_status = WishlistStatus.ON;
                    await this.wishlistTokenRepository.save(existing);
                    return {
                        status: 200,
                        message: 'Token status updated to ON',
                        data: { status: WishlistStatus.ON }
                    };
                } else {
                    // Nếu token đã ON, không làm gì
                    return {
                        status: 200,
                        message: 'Token is already in wishlist',
                        data: { status: WishlistStatus.ON }
                    };
                }
            } else if (status === 'off') {
                if (existing && existing.swt_status === WishlistStatus.ON) {
                    // Chuyển token sang OFF
                    existing.swt_status = WishlistStatus.OFF;
                    await this.wishlistTokenRepository.save(existing);
                    return {
                        status: 200,
                        message: 'Token status updated to OFF',
                        data: { status: WishlistStatus.OFF }
                    };
                } else if (existing && existing.swt_status === WishlistStatus.OFF) {
                    // Nếu token đã OFF, không làm gì
                    return {
                        status: 200,
                        message: 'Token is already OFF in wishlist',
                        data: { status: WishlistStatus.OFF }
                    };
                } else {
                    // Nếu token không tồn tại trong wishlist
                    return {
                        status: 400,
                        message: 'Token not found in wishlist',
                        data: { status: WishlistStatus.OFF }
                    };
                }
            } else {
                return {
                    status: 400,
                    message: 'Invalid status. Must be "on" or "off"'
                };
            }
        } catch (error) {
            console.error('Error in toggleWishlist:', error);
            return {
                status: 500,
                message: `Error updating wishlist: ${error.message}`
            };
        }
    }

    public async determineTokenProgram(txHash: string): Promise<TokenProgram> {
        try {
            // Lấy thông tin transaction từ Solana RPC
            const transaction = await this.solanaService.getTransaction(txHash);

            if (!transaction) {
                return TokenProgram.OTHER;
            }

            // Kiểm tra program ID trong transaction
            const programId = transaction.transaction.message.getAccountKeys()[0].pubkey;

            // Danh sách program ID của các nguồn
            const programIds = {
                [TokenProgram.PUMPFUN]: ['pumpfun_program_id'],
                [TokenProgram.KCM]: ['kcm_program_id'],
                [TokenProgram.RAYDIUM]: ['raydium_program_id'],
                [TokenProgram.JUPITER]: ['jupiter_program_id'],
                [TokenProgram.GMGN]: ['gmgn_program_id']
            };

            // Tìm nguồn gốc token dựa vào program ID
            for (const [program, ids] of Object.entries(programIds)) {
                if (ids.includes(programId)) {
                    return program as TokenProgram;
                }
            }

            return TokenProgram.OTHER;
        } catch (error) {
            this.logger.error(`Error determining token program: ${error.message}`);
            return TokenProgram.OTHER;
        }
    }

    async create(tokenData: Partial<SolanaListToken>) {
        // Nếu có transaction hash, xác định nguồn gốc token
        if (tokenData.slt_transaction_hash) {
            const program = await this.determineTokenProgram(tokenData.slt_transaction_hash);
            tokenData.slt_program = program;
        }

        const token = this.solanaTokenRepository.create(tokenData);
        return this.solanaTokenRepository.save(token);
    }

    async getTokenInfo(tokenAddress: string): Promise<SolanaTokenDto> {
        try {
            this.logger.debug(`Getting token info for address: ${tokenAddress}`);


            // First check database
            const existingToken = await this.solanaTokenRepository.findOne({
                where: { slt_address: tokenAddress }
            });

            if (existingToken) {
                this.logger.debug(`Found token in database: ${tokenAddress}`);
                return this.mapToDto(existingToken);
            }

            this.logger.debug(`Token not found in database, trying Solana Tracker: ${tokenAddress}`);

            // If not in database, try to get from Solana Tracker
            try {
                const tokenDetails = await this.solanaTrackerService.getTokenDetails(tokenAddress);
                this.logger.debug(`Got token details from Solana Tracker: ${JSON.stringify(tokenDetails)}`);

                if (!tokenDetails) {
                    this.logger.error(`No token details returned from Solana Tracker for ${tokenAddress}`);
                    throw new Error('Token not found');
                }

                // Get price data
                this.logger.debug(`Getting price data for ${tokenAddress}`);
                const priceData = await this.solanaTrackerService.getCurrentPrice(tokenAddress);
                this.logger.debug(`Got price data: ${JSON.stringify(priceData)}`);

                // Create new token entity
                const newToken = this.solanaTokenRepository.create({
                    slt_address: tokenAddress,
                    slt_name: tokenDetails.name || '',
                    slt_symbol: tokenDetails.symbol || '',
                    slt_decimals: tokenDetails.decimals || 9,
                    slt_logo_url: tokenDetails.uri || '',
                    slt_is_verified: tokenDetails.isMutable || false,
                    slt_price: priceData?.priceUSD || 0,
                    slt_market_cap: priceData?.priceUSD * (tokenDetails.metadata?.totalSupply || 0),
                    slt_twitter: tokenDetails.twitter || tokenDetails.strictSocials?.twitter || '',
                    slt_telegram: tokenDetails.telegram || tokenDetails.strictSocials?.telegram || '',
                    slt_website: tokenDetails.website || tokenDetails.strictSocials?.website || '',
                    slt_coingecko_id: tokenDetails.coingeckoId || '',
                    slt_tradingview_symbol: tokenDetails.tradingviewSymbol || '',
                    slt_transaction_hash: tokenDetails.transactionHash || ''
                });

                this.logger.debug(`Saving new token to database: ${JSON.stringify(newToken)}`);
                // Save to database
                await this.solanaTokenRepository.save(newToken);

                // Return mapped DTO
                return this.mapToDto(newToken);
            } catch (error) {
                this.logger.error(`Error getting token info from Solana Tracker for ${tokenAddress}:`, {
                    error: error.message,
                    stack: error.stack,
                    response: error.response?.data
                });
                throw new Error('Token not found');
            }
        } catch (error) {
            this.logger.error(`Error in getTokenInfo for ${tokenAddress}:`, {
                error: error.message,
                stack: error.stack,
                response: error.response?.data
            });
            throw error;
        }
    }

    private async checkAndSaveToken(address: string): Promise<{ status: number; data?: SolanaTokenDto; message?: string }> {
        try {
            // Kiểm tra token đã tồn tại trong database chưa
            const existingToken = await this.solanaTokenRepository.findOne({
                where: { slt_address: address }
            });

            if (existingToken) {
                return {
                    status: 200,
                    data: this.mapToDto(existingToken)
                };
            }

            // Nếu không tồn tại, lấy thông tin từ Solana Tracker
            const tokenDetails = await this.solanaTrackerService.getTokenDetails(address);

            if (!tokenDetails || !tokenDetails.data) {
                return {
                    status: 404,
                    message: 'Token not found in Solana Tracker'
                };
            }

            const tokenData = tokenDetails.data;
            const poolData = tokenData.pools && tokenData.pools.length > 0 ? tokenData.pools[0] : null;

            // Lấy giá hiện tại của token
            let priceData;
            try {
                priceData = await this.solanaTrackerService.getCurrentPrice(address);
            } catch (error) {
                this.logger.warn(`Failed to get current price for token ${address}: ${error.message}`);
                priceData = { priceUSD: 0, priceSOL: 0 };
            }

            // Tạo token mới từ thông tin Solana Tracker
            const newToken = await this.create({
                slt_address: address,
                slt_name: tokenData.token?.name || '',
                slt_symbol: tokenData.token?.symbol || '',
                slt_decimals: tokenData.token?.decimals || 9,
                slt_logo_url: tokenData.token?.image || tokenData.token?.uri || undefined,
                slt_coingecko_id: tokenData.token?.coingeckoId || undefined,
                slt_tradingview_symbol: tokenData.token?.tradingviewSymbol || undefined,
                slt_is_verified: tokenData.token?.isMutable || false,
                slt_market_cap: poolData?.marketCap?.usd || 0,
                slt_price: priceData.priceUSD || 0,
                slt_metadata_uri: tokenData.token?.uri || undefined,
                slt_description: tokenData.token?.description || '',
                slt_twitter: tokenData.token?.twitter || tokenData.token?.strictSocials?.twitter || '',
                slt_telegram: tokenData.token?.telegram || tokenData.token?.strictSocials?.telegram || '',
                slt_website: tokenData.token?.website || tokenData.token?.strictSocials?.website || '',
                slt_transaction_hash: tokenData.token?.transactionHash || undefined,
                slt_wallet_id: undefined,
                slt_program: tokenData.token?.program || TokenProgram.OTHER,
                slt_initial_liquidity: poolData?.liquidity?.usd || 0,
                slt_create_check: false,
                slt_category: undefined
            });

            return {
                status: 200,
                data: this.mapToDto(newToken)
            };
        } catch (error) {
            this.logger.error(`Error checking and saving token: ${error.message}`);
            return {
                status: 500,
                message: `Error checking and saving token: ${error.message}`
            };
        }
    }

    async savePoolsFromApi(pools: any[]): Promise<{ saved: number; updated: number; skipped: number }> {
        try {
            let saved = 0;
            let updated = 0;
            let skipped = 0;

            for (const pool of pools) {
                // Check if pool already exists
                const existingPool = await this.solanaListPoolRepository.findOne({
                    where: { slp_pool_id: pool.poolId }
                });

                // Prepare pool data
                const poolData = {
                    slp_pool_id: pool.poolId,
                    slp_mint_a: pool.tokenAddress,
                    slp_mint_b: pool.quoteToken,
                    slp_mint_decimals_a: pool.decimals,
                    slp_mint_decimals_b: 9, // Default for SOL/USDC
                    slp_source: pool.market,
                    slp_reserve_a: pool.liquidity?.quote || 0,
                    slp_reserve_b: pool.liquidity?.usd || 0,
                    // Set default values for required fields
                    slp_mint_program_id_a: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
                    slp_mint_program_id_b: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
                    slp_vault_a: '', // These fields are not provided in the API response
                    slp_vault_b: '', // These fields are not provided in the API response
                    slp_config_id: '', // These fields are not provided in the API response
                    slp_config_index: 0,
                    slp_config_protocol_fee_rate: 0,
                    slp_config_trade_fee_rate: 0,
                    slp_config_tick_spacing: 0,
                    slp_config_fund_fee_rate: 0
                };

                if (existingPool) {
                    // Update existing pool
                    await this.solanaListPoolRepository.update(
                        { slp_id: existingPool.slp_id },
                        {
                            ...poolData,
                            updated_at: new Date()
                        }
                    );
                    updated++;
                } else {
                    // Save new pool
                    await this.solanaListPoolRepository.save({
                        ...poolData,
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                    saved++;
                }
            }

            return { saved, updated, skipped };
        } catch (error) {
            this.logger.error(`Error saving pools: ${error.message}`);
            throw error;
        }
    }

    async getCategories(): Promise<GetCategoriesResponseDto> {
        try {
            const categories = await this.solanaListCategoriesTokenRepository.find({
                where: {
                    sltc_status: CategoryStatus.ACTIVE
                },
                order: {
                    slct_prioritize: 'DESC',
                    slct_name: 'ASC'
                }
            });

            return {
                status: 200,
                message: 'Categories retrieved successfully',
                data: categories.map(category => ({
                    id: category.slct_id,
                    name: category.slct_name,
                    slug: category.slct_slug,
                    prioritize: category.slct_prioritize,
                    status: category.sltc_status
                }))
            };
        } catch (error) {
            throw new Error(`Failed to get categories: ${error.message}`);
        }
    }

    async getTokensByCategory(category: string): Promise<ListTokenByCategoryResponseDto> {
        try {
            // Tìm category theo name hoặc slug
            const categoryEntity = await this.solanaListCategoriesTokenRepository.findOne({
                where: [
                    { slct_name: category },
                    { slct_slug: category }
                ]
            });

            if (!categoryEntity) {
                return {
                    status: 404,
                    message: 'Category not found',
                    data: []
                };
            }

            // Lấy danh sách token trong category với status = ON
            const tokens = await this.solanaTokenRepository
                .createQueryBuilder('token')
                .innerJoin('token.token_join_categories', 'join')
                .innerJoin('join.category', 'category')
                .where('category.slct_id = :categoryId', { categoryId: categoryEntity.slct_id })
                .andWhere('join.stjc_status = :status', { status: JoinCategoryStatus.ON })
                .orderBy('token.slt_market_cap', 'DESC')
                .getMany();

            // Lấy danh sách địa chỉ token
            const tokenAddresses = tokens.map(token => token.slt_address);

            // Lấy thêm dữ liệu từ getMultiTokensData
            const multiTokensData = await this.solanaTrackerService.getMultiTokensData(tokenAddresses);

            return {
                status: 200,
                message: 'Tokens retrieved successfully',
                data: tokens.map(token => {
                    // Lấy thông tin từ multiTokensData
                    const tokenData = multiTokensData.data.find(t => t.address === token.slt_address);
                    
                    return {
                        id: token.slt_id,
                        name: token.slt_name || tokenData?.name || '',
                        symbol: token.slt_symbol || tokenData?.symbol || '',
                        address: token.slt_address,
                        decimals: token.slt_decimals,
                        logoUrl: token.slt_logo_url || tokenData?.logo_uri || undefined,
                        price: token.slt_price || tokenData?.price,
                        market_cap: token.slt_market_cap ,
                        volume24h: tokenData?.volume_24h_usd || 0,
                        liquidity: token.slt_initial_liquidity || tokenData?.liquidity,
                        holder: tokenData?.holders || 0,
                        twitter: token.slt_twitter || undefined,
                        telegram: token.slt_telegram || undefined,
                        website: token.slt_website || undefined,
                        program: token.slt_program || tokenData?.program,
                        isVerified: token.slt_is_verified,
                        volume_1h_usd: tokenData?.volume_1h_usd || 0,
                        volume_24h_usd: tokenData?.volume_24h_usd || 0,
                        volume_4h_change_percent: tokenData?.volume_4h_change_percent || 0,
                        volume_1h_change_percent: tokenData?.volume_1h_change_percent || 0,
                        volume_24h_change_percent: tokenData?.volume_24h_change_percent || 0
                    };
                })
            };
        } catch (error) {
            this.logger.error(`Error getting tokens by category: ${error.message}`);
            throw new Error(`Failed to get tokens by category: ${error.message}`);
        }
    }

    async checkMyWishlist(walletId: number, tokenAddress: string): Promise<{ status: number; data?: any; message?: string }> {
        try {
            // Kiểm tra token đã tồn tại trong database chưa
            const existingToken = await this.solanaTokenRepository.findOne({
                where: { slt_address: tokenAddress }
            });

            if (!existingToken) {
                return {
                    status: 404,
                    message: 'Token not found'
                };
            }

            // Kiểm tra token có trong wishlist không
            const wishlistToken = await this.wishlistTokenRepository.findOne({
                where: {
                    swt_wallet_id: walletId,
                    swt_token_id: existingToken.slt_id,
                    swt_status: WishlistStatus.ON
                }
            });

            return {
                status: 200,
                data: {
                    isInWishlist: !!wishlistToken,
                    token: this.mapToDto(existingToken)
                }
            };
        } catch (error) {
            this.logger.error(`Error checking wishlist status: ${error.message}`);
            return {
                status: 500,
                message: `Error checking wishlist status: ${error.message}`
            };
        }
    }

    async getTokensWithCategories(): Promise<ListTokenByCategoryResponseDto> {
        try {
            // Lấy danh sách token có category với status = ON
            const tokens = await this.solanaTokenRepository
                .createQueryBuilder('token')
                .leftJoinAndSelect('token.token_join_categories', 'join')
                .leftJoinAndSelect('join.category', 'category')
                .where('join.stjc_status = :status', { status: JoinCategoryStatus.ON })
                .orderBy('token.slt_market_cap', 'DESC')
                .take(50)
                .getMany();

            // Lấy danh sách địa chỉ token
            const tokenAddresses = tokens.map(token => token.slt_address);

            // Lấy thêm dữ liệu từ getMultiTokensData
            const multiTokensData = await this.solanaTrackerService.getMultiTokensData(tokenAddresses);

            return {
                status: 200,
                message: 'Tokens retrieved successfully',
                data: tokens.map(token => {
                    // Lấy category đầu tiên của token
                    const category = token.token_join_categories?.[0]?.category;
                    
                    // Lấy thông tin từ multiTokensData
                    const tokenData = multiTokensData.data.find(t => t.address === token.slt_address);
                    
                    return {
                        id: token.slt_id,
                        name: token.slt_name || tokenData?.name || '',
                        symbol: token.slt_symbol || tokenData?.symbol || '',
                        address: token.slt_address,
                        decimals: token.slt_decimals,
                        logoUrl: token.slt_logo_url || tokenData?.logo_uri || undefined,
                        price: token.slt_price || tokenData?.price,
                        market_cap: token.slt_market_cap ,
                        volume24h: tokenData?.volume_24h_usd || 0,
                        liquidity: token.slt_initial_liquidity || tokenData?.liquidity,
                        holder: tokenData?.holders || 0,
                        twitter: token.slt_twitter || undefined,
                        telegram: token.slt_telegram || undefined,
                        website: token.slt_website || undefined,
                        program: token.slt_program || tokenData?.program,
                        isVerified: token.slt_is_verified,
                        category: category ? {
                            id: category.slct_id,
                            name: category.slct_name,
                            slug: category.slct_slug
                        } : undefined,
                        volume_1h_usd: tokenData?.volume_1h_usd || 0,
                        volume_24h_usd: tokenData?.volume_24h_usd || 0,
                        volume_4h_change_percent: tokenData?.volume_4h_change_percent || 0,
                        volume_1h_change_percent: tokenData?.volume_1h_change_percent || 0,
                        volume_24h_change_percent: tokenData?.volume_24h_change_percent || 0
                    };
                })
            };
        } catch (error) {
            this.logger.error(`Error getting tokens with categories: ${error.message}`);
            throw new Error(`Failed to get tokens with categories: ${error.message}`);
        }
    }
}