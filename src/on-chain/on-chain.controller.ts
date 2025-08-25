import { Controller, Get, UseGuards, Query, Param, Post, Body, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnChainService } from './on-chain.service';
import { BirdeyeService, Timeframe } from './birdeye.service';
import { PublicKey } from '@solana/web3.js';
import { SolanaService } from '../solana/solana.service';
import { GetHistoriesTransactionDto } from './dto/get-histories-transaction.dto';
import { GetTopCoinsDto, TimeFrameEnum } from '../trade/dto/get-top-coins.dto';
import { TopCoinsResponse } from './birdeye.service';
import { ChartType, SolanaTrackerService, TimeFrameType } from './solana-tracker.service';
import { GetChartDto } from './dto/get-chart.dto';
import { SolanaTrackerTradeService } from './services/solana-tracker-trade.service';
import { CacheService } from '../cache/cache.service';

interface TradingViewResponse {
    success: boolean;
    data?: {
        historical: Array<{
            time: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
        }>;
        current: {
            time: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
        } | null;
    };
    error?: string;
}

@Controller('on-chain')
export class OnChainController {
    private readonly logger = new Logger(OnChainController.name);

    constructor(
        private readonly onChainService: OnChainService,
        private readonly birdeyeService: BirdeyeService,
        private readonly solanaService: SolanaService,
        private readonly solanaTrackerService: SolanaTrackerService,
        private readonly solanaTrackerTradeService: SolanaTrackerTradeService,
        private readonly cacheService: CacheService
    ) { }

    @Get('chart/:tokenAddress')
    async getTradingViewChart(
        @Param('tokenAddress') tokenAddress: string,
        @Query() query: GetChartDto
    ) {
        try {
            this.logger.log(`Getting chart data for token ${tokenAddress} with params:`, query);

            const chartData = await this.onChainService.getChartData(
                tokenAddress,
                query.type as ChartType || '1m',
                query.time_from,
                query.time_to,
                query.market_cap,
                query.remove_outliers
            );

            return {
                success: true,
                data: chartData
            };
        } catch (error) {
            this.logger.error(`Error getting chart data: ${error.message}`);
            throw error;
        }
    }

    @Get('clear-cache')
    @UseGuards(JwtAuthGuard)
    async clearCache(@Query('tokenAddress') tokenAddress: string) {
        await this.birdeyeService.clearOHLCVCache(tokenAddress);
        return { success: true, message: 'Cache cleared successfully' };
    }

    @Post('test-chart')
    @UseGuards(JwtAuthGuard)
    async testChart(@Body() data: { tokenAddress: string }) {
        try {
            const { tokenAddress } = data;
            this.logger.log(`Testing chart data for token: ${tokenAddress}`);

            // Validate token address
            if (!tokenAddress) {
                throw new Error('Token address is required');
            }

            // Get initial price data
            const priceData = await this.solanaService.getTokenPriceInRealTime(tokenAddress);
            if (!priceData || priceData.priceUSD <= 0) {
                throw new Error('Unable to get initial price data for token');
            }

            // Subscribe to token for real-time updates
            await this.onChainService.subscribeToToken(tokenAddress, (updateData) => {
                this.logger.debug('Received real-time update:', {
                    tokenAddress,
                    time: new Date(updateData.time).toISOString(),
                    price: updateData.close,
                    volume: updateData.volume
                });
            });

            // Get current candle data
            const currentCandle = this.onChainService.getCurrentCandle(tokenAddress);

            // Validate candle data
            if (!currentCandle || currentCandle.close <= 0) {
                throw new Error('Invalid candle data received');
            }

            // Log detailed information
            this.logger.debug('Current candle data:', {
                tokenAddress,
                time: new Date(currentCandle.time).toISOString(),
                open: currentCandle.open,
                high: currentCandle.high,
                low: currentCandle.low,
                close: currentCandle.close,
                volume: currentCandle.volume
            });

            return {
                success: true,
                data: {
                    ...currentCandle,
                    priceUSD: priceData.priceUSD,
                    priceSOL: priceData.priceSOL
                }
            };
        } catch (error) {
            this.logger.error('Error in test-chart:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    @Get('histories')
    async getHistories(@Query() query: GetHistoriesTransactionDto) {
        try {
            return await this.solanaTrackerTradeService.getTransactionHistory(query);
        } catch (error) {
            this.logger.error(`Error getting transaction history: ${error.message}`);
            throw error;
        }
    }

    @Get('my-histories/:tokenAddress')
    @UseGuards(JwtAuthGuard)
    async getMyHistories(
        @Param('tokenAddress') tokenAddress: string,
        @Query('walletAddress') walletAddress: string
    ) {
        try {
            if (!walletAddress) {
                throw new Error('Wallet address is required');
            }
            return await this.solanaTrackerTradeService.getTransactionHistoryByWallet(tokenAddress, walletAddress);
        } catch (error) {
            this.logger.error(`Error getting transaction history by wallet: ${error.message}`);
            throw error;
        }
    }

    @Get('top-coins')
    async getTopCoins(@Query() query: GetTopCoinsDto): Promise<TopCoinsResponse> {
        try {
            // Chuyển đổi timeframe từ TimeFrameEnum sang TimeFrameType
            let timeframe: TimeFrameType = '24h'; // Mặc định

            if (query.timeframe) {
                // TimeFrameEnum và TimeFrameType có giá trị giống nhau nên có thể chuyển đổi trực tiếp
                timeframe = query.timeframe as TimeFrameType;
            }

            this.logger.log(`Getting top coins using SolanaTracker API with timeframe: ${timeframe}`);

            // Gọi đến Solana Tracker API
            const trendingTokensResponse = await this.solanaTrackerService.getTrendingTokens(
                timeframe,
                query.limit || 100
            );

            // Chuyển đổi dữ liệu sang định dạng TopCoins
            return this.solanaTrackerService.convertToTopCoinsFormat(
                trendingTokensResponse.data,
                query.limit || 100,
                query.sort_by || 'market_cap',
                query.sort_type || 'desc'
            );
        } catch (error) {
            this.logger.error(`Error getting top coins from SolanaTracker: ${error.message}`);
            throw error;
        }
    }

    @Get('latest-coins')
    async getLatestCoins(@Query('limit') limit?: number): Promise<TopCoinsResponse> {
        try {
            this.logger.log(`Getting latest coins using SolanaTracker API`);

            // Gọi đến Solana Tracker API
            const latestTokensResponse = await this.solanaTrackerService.getLatestTokens(limit || 100);

            // Chuyển đổi dữ liệu sang định dạng TopCoins
            return this.solanaTrackerService.convertToTopCoinsFormat(
                latestTokensResponse.data,
                limit || 100,
                'createdAt', // Sắp xếp theo thời gian tạo
                'desc' // Sắp xếp giảm dần (mới nhất lên đầu)
            );
        } catch (error) {
            this.logger.error(`Error getting latest coins from SolanaTracker: ${error.message}`);
            throw error;
        }
    }

    @Get('stats-token/:tokenAddress')
    async getTokenStats(@Param('tokenAddress') tokenAddress: string) {
        try {
            this.logger.log(`Getting stats for token ${tokenAddress}`);

            const stats = await this.solanaTrackerService.getTokenStats(tokenAddress);

            return {
                success: true,
                data: stats
            };
        } catch (error) {
            this.logger.error(`Error getting token stats: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    @Get('search')
    async searchTokens(
        @Query('query') query: string,
        @Query('limit') limit?: number
    ) {
        try {
            if (!query) {
                throw new Error('Search query is required');
            }

            this.logger.log(`Searching tokens with query: ${query}`);

            const searchResults = await this.solanaTrackerService.searchTokens(
                query,
                limit || 20
            );

            return searchResults;
        } catch (error) {
            this.logger.error(`Error searching tokens: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    @Get('pnl/:walletAddress')
    @UseGuards(JwtAuthGuard)
    async getWalletPnl(@Param('walletAddress') walletAddress: string) {
        try {
            if (!walletAddress) {
                throw new Error('Wallet address is required');
            }

            this.logger.log(`Getting PNL data for wallet ${walletAddress}`);

            const pnlData = await this.solanaTrackerService.getWalletPnl(walletAddress);

            return {
                success: true,
                data: pnlData
            };
        } catch (error) {
            this.logger.error(`Error getting PNL data: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    @Get('wallet/:walletAddress/trades')
    @UseGuards(JwtAuthGuard)
    async getWalletTrades(
        @Param('walletAddress') walletAddress: string,
        @Query('cursor') cursor?: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 50
    ) {
        try {
            if (!walletAddress) {
                throw new Error('Wallet address is required');
            }

            this.logger.log(`Getting trades for wallet ${walletAddress}`);

            const data = await this.solanaTrackerService.getWalletTrades(walletAddress, cursor);

            // Add type property to each trade based on SOL address position
            const tradesWithType = data.trades.map(trade => ({
                ...trade,
                type: trade.from.address === 'So11111111111111111111111111111111111111112' ? 'buy' : 'sell'
            }));

            // Implement pagination after getting the data
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const totalItems = tradesWithType.length;
            const totalPages = Math.ceil(totalItems / limit);
            const paginatedTrades = tradesWithType.slice(startIndex, endIndex);

            return {
                success: true,
                data: {
                    trades: paginatedTrades,
                    pagination: {
                        currentPage: page,
                        totalPages,
                        totalItems,
                        itemsPerPage: limit,
                        hasNextPage: page < totalPages,
                        hasPreviousPage: page > 1
                    }
                }
            };
        } catch (error) {
            this.logger.error(`Error getting wallet trades: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    @Get('holders/:tokenAddress')
    async getTokenHolders(
        @Param('tokenAddress') tokenAddress: string,
        @Query('limit') limit: number = 50,
        @Query('offset') offset: number = 0
    ) {
        try {
            this.logger.log(`Getting holders for token ${tokenAddress}`);

            const holders = await this.solanaTrackerService.getTopTokenHolders(
                tokenAddress,
                limit,
                offset
            );

            return {
                success: true,
                data: holders
            };
        } catch (error) {
            this.logger.error(`Error getting token holders: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
}
