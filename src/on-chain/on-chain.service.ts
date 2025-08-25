import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Connection, PublicKey, ConfirmedSignatureInfo } from '@solana/web3.js';
import { SolanaService } from '../solana/solana.service';
import { SolanaWebSocketService } from '../solana/solana-websocket.service';
import { Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { BirdeyeService, OHLCVData, Timeframe } from './birdeye.service';
import { ConfigService } from '@nestjs/config';
import { GetHistoriesTransactionDto } from './dto/get-histories-transaction.dto';
import { SolanaTrackerService, ChartType } from './solana-tracker.service';

type ChartUpdateCallback = (data: any) => void;

@Injectable()
export class OnChainService implements OnModuleInit, OnModuleDestroy {
    private readonly CACHE_TTL = {
        HISTORICAL_TX: 3600,    // 1 hour
        PRICE: 300,            // 5 minutes
        OHLCV: 900            // 15 minutes
    };

    private readonly VIRTUAL_CANDLE_CACHE_TTL = 60; // 1 minute

    private ohlcvData: Map<string, OHLCVData[]> = new Map();
    private currentCandle: Map<string, OHLCVData> = new Map();
    private tokenPrices: Map<string, number> = new Map();
    private trackedTokens: Set<string> = new Set();
    private updateCallbacks: Map<string, Set<ChartUpdateCallback>> = new Map();
    private readonly logger = new Logger(OnChainService.name);

    constructor(
        private readonly eventEmitter: EventEmitter2,
        private readonly solanaService: SolanaService,
        private readonly solanaWebSocketService: SolanaWebSocketService,
        private readonly cacheService: CacheService,
        private readonly birdeyeService: BirdeyeService,
        private readonly configService: ConfigService,
        private readonly solanaTrackerService: SolanaTrackerService
    ) { }

    async onModuleInit() {
        this.solanaWebSocketService.registerEventListener('account.changed', 'on-chain', (data) => {
            this.handleAccountChange('on-chain', data);
        });
    }

    onModuleDestroy() {
        this.trackedTokens.forEach(token => {
            this.solanaWebSocketService.unsubscribeFromWallet(token, 'on-chain');
        });
    }

    async subscribeToToken(tokenAddress: string, callback: (data: any) => void) {
        try {
            // Add callback to token callbacks
            if (!this.updateCallbacks.has(tokenAddress)) {
                this.updateCallbacks.set(tokenAddress, new Set());
            }
            this.updateCallbacks.get(tokenAddress)?.add(callback);

            // Add token to tracked tokens
            this.trackedTokens.add(tokenAddress);

            // Subscribe to Solana account changes
            await this.solanaService.trackAccountChanges(new PublicKey(tokenAddress));

            // Register event listener for account changes
            this.solanaService.getWebSocketService().registerEventListener('account.changed', tokenAddress, (data) => {
                this.handleAccountChange(tokenAddress, data);
            });

            this.logger.log(`Subscribed to token ${tokenAddress} for real-time updates`);
        } catch (error) {
            this.logger.error(`Error subscribing to token ${tokenAddress}:`, error);
            throw error;
        }
    }

    unsubscribeFromToken(tokenAddress: string) {
        this.updateCallbacks.delete(tokenAddress);
        if (this.trackedTokens.has(tokenAddress)) {
            this.solanaWebSocketService.unsubscribeFromWallet(tokenAddress, 'on-chain');
            this.trackedTokens.delete(tokenAddress);
        }
    }

    private async handleAccountChange(tokenAddress: string, data: any) {
        try {
            if (!this.trackedTokens.has(tokenAddress)) {
                return;
            }

            // Get current price from transaction data
            const priceData = await this.solanaService.getTokenPriceInRealTime(tokenAddress);
            const price = priceData.priceSOL;
            const volume = this.extractVolumeFromAccountData(data);

            // Update OHLCV data
            await this.updateOHLCVData(tokenAddress, price, volume);

            // Get current candle
            const currentCandle = this.getCurrentCandle(tokenAddress);

            // Notify all callbacks
            const callbacks = this.updateCallbacks.get(tokenAddress);
            if (callbacks) {
                callbacks.forEach(callback => callback(currentCandle));
            }

            this.logger.debug(`Updated OHLCV data for ${tokenAddress}:`, currentCandle);
        } catch (error) {
            this.logger.error(`Error handling account change for ${tokenAddress}:`, error);
        }
    }

    private async updateOHLCVData(tokenAddress: string, price: number, volume: number) {
        try {
            const currentTime = this.getCandleStartTime(Date.now());
            let currentCandle = this.currentCandle.get(tokenAddress);

            // Validate price and volume
            if (price <= 0) {
                this.logger.warn(`Invalid price ${price} for token ${tokenAddress}`);
                return;
            }

            if (!currentCandle || currentTime > currentCandle.time) {
                // Save old candle to history if exists
                if (currentCandle) {
                    const historicalData = this.ohlcvData.get(tokenAddress) || [];
                    historicalData.push({ ...currentCandle });

                    // Keep last 100 candles
                    if (historicalData.length > 100) {
                        historicalData.shift();
                    }
                    this.ohlcvData.set(tokenAddress, historicalData);
                }

                // Create new candle
                currentCandle = {
                    time: currentTime,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    volume: volume || 0
                };
                this.currentCandle.set(tokenAddress, currentCandle);
            } else {
                // Update current candle
                currentCandle.high = Math.max(currentCandle.high, price);
                currentCandle.low = Math.min(currentCandle.low, price);
                currentCandle.close = price;
                currentCandle.volume += volume || 0;
            }

            // Update token price
            this.tokenPrices.set(tokenAddress, price);

            // Emit update event
            const historicalData = this.ohlcvData.get(tokenAddress) || [];
            this.eventEmitter.emit('tradingview.update', {
                tokenAddress,
                data: historicalData,
                current: currentCandle
            });

            this.logger.debug(`Updated OHLCV data for ${tokenAddress}:`, {
                time: new Date(currentCandle.time).toISOString(),
                open: currentCandle.open,
                high: currentCandle.high,
                low: currentCandle.low,
                close: currentCandle.close,
                volume: currentCandle.volume
            });
        } catch (error) {
            this.logger.error(`Error updating OHLCV data for ${tokenAddress}:`, error);
        }
    }

    private getCandleStartTime(timestamp: number): number {
        // Round down to the nearest minute
        return Math.floor(timestamp / 60000) * 60000;
    }

    async getChart(
        tokenAddress: string,
        timeframe: Timeframe = '5m',
        timeFrom?: number,
        timeTo?: number
    ): Promise<{
        oclhv: OHLCVData[];
        current: OHLCVData;
    }> {
        try {
            this.logger.log(`[Chart] Fetching chart data for ${tokenAddress} (${timeframe})`);

            // Validate token address
            if (!tokenAddress) {
                throw new Error('Token address is required');
            }

            // Get OHLCV data
            const oclhvData = await this.birdeyeService.getOHLCVData(tokenAddress, timeframe);

            // Get current price data
            const priceData = await this.solanaService.getTokenPriceInRealTime(tokenAddress);

            // Create current candle
            const currentTime = Math.floor(Date.now() / 1000);
            const currentCandle = {
                time: currentTime,
                open: priceData.priceUSD,
                high: priceData.priceUSD,
                low: priceData.priceUSD,
                close: priceData.priceUSD,
                volume: 0 // Volume will be updated in real-time
            };

            // Filter data by time range if provided
            let filteredData = oclhvData;
            if (timeFrom && timeTo) {
                filteredData = oclhvData.filter(item =>
                    item.time >= timeFrom && item.time <= timeTo
                );
            }

            return {
                oclhv: filteredData,
                current: currentCandle
            };
        } catch (error) {
            this.logger.error(`[Chart] Error fetching chart data: ${error.message}`);
            throw error;
        }
    }

    private extractVolumeFromAccountData(data: any): number {
        try {
            if (!data) return 0;

            // Handle different data formats
            if (Array.isArray(data)) {
                return data.reduce((sum, item) => sum + (item.amount || 0), 0);
            } else if (typeof data === 'object') {
                return data.amount || 0;
            }

            return 0;
        } catch (error) {
            this.logger.error('Error extracting volume from account data:', error);
            return 0;
        }
    }

    private convertTransactionsToOHLCV(transactions: any[]): OHLCVData[] {
        const oclhvMap = new Map<number, OHLCVData>();

        transactions.forEach(tx => {
            if (!tx || !tx.blockTime) return;

            const candleTime = Math.floor(tx.blockTime / 60) * 60 * 1000;
            const price = this.extractPriceFromTransaction(tx);
            const volume = this.extractVolumeFromTransaction(tx);

            if (!price || !volume) return;

            if (!oclhvMap.has(candleTime)) {
                oclhvMap.set(candleTime, {
                    time: candleTime,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    volume: volume
                });
            } else {
                const candle = oclhvMap.get(candleTime);
                if (!candle) return;

                candle.high = Math.max(candle.high, price);
                candle.low = Math.min(candle.low, price);
                candle.close = price;
                candle.volume += volume;
            }
        });

        const sortedData = Array.from(oclhvMap.values())
            .sort((a, b) => a.time - b.time)
            .slice(-100);

        return sortedData;
    }

    private extractPriceFromTransaction(tx: any): number | null {
        try {
            if (!tx.meta) return null;

            const preBalances = tx.meta.preTokenBalances || [];
            const postBalances = tx.meta.postTokenBalances || [];

            if (preBalances.length > 0 && postBalances.length > 0) {
                const preAmount = Number(preBalances[0].uiTokenAmount.uiAmount);
                const postAmount = Number(postBalances[0].uiTokenAmount.uiAmount);

                if (preAmount !== postAmount) {
                    return postAmount / preAmount;
                }
            }
            return null;
        } catch (error) {
            console.error('Error extracting price from transaction:', error);
            return null;
        }
    }

    private extractVolumeFromTransaction(tx: any): number | null {
        try {
            if (!tx.meta) return null;

            const preBalances = tx.meta.preTokenBalances || [];
            const postBalances = tx.meta.postTokenBalances || [];

            if (preBalances.length > 0 && postBalances.length > 0) {
                const preAmount = Number(preBalances[0].uiTokenAmount.uiAmount);
                const postAmount = Number(postBalances[0].uiTokenAmount.uiAmount);

                return Math.abs(postAmount - preAmount);
            }
            return null;
        } catch (error) {
            console.error('Error extracting volume from transaction:', error);
            return null;
        }
    }

    async getHistoricalTransactions(dto: GetHistoriesTransactionDto) {
        try {
            this.logger.debug(`Getting historical transactions with params: ${JSON.stringify(dto)}`);

            const result = await this.birdeyeService.getTransactionHistory(dto);

            this.logger.debug(`Successfully fetched ${result.data.items.length} transactions`);
            return result;
        } catch (error) {
            this.logger.error(`Error getting historical transactions: ${error.message}`, error.stack);
            throw error;
        }
    }

    getCurrentCandle(tokenAddress: string): OHLCVData {
        return this.currentCandle.get(tokenAddress) || {
            time: Math.floor(Date.now() / 1000) * 1000,
            open: 0,
            high: 0,
            low: 0,
            close: 0,
            volume: 0
        };
    }

    isTokenTracked(tokenAddress: string): boolean {
        return this.trackedTokens.has(tokenAddress);
    }

    // Hàm tạo giá ngẫu nhiên trong khoảng
    private getRandomPrice(min: number, max: number): number {
        return Number((Math.random() * (max - min) + min).toFixed(9));
    }

    // Hàm tạo nến ảo với tổng cung
    private generateVirtualCandle() {
        const currentTime = Math.floor(Date.now() / 1000);
        const price1 = this.getRandomPrice(3.5e-6, 4.2e-6);
        const price2 = this.getRandomPrice(5.5e-6, 5.9e-6);
        const [open, close] = Math.random() > 0.5 ? [price1, price2] : [price2, price1];

        return {
            oclhv: [{
                time: currentTime - 3600,
                open: open,
                high: Math.max(open, close) * 1.0001,
                low: Math.min(open, close) * 0.9999,
                close: close,
                volume: 1000000
            }],
            current: {
                time: currentTime,
                open: close,
                high: close * 1.0001,
                low: close * 0.9999,
                close: this.getRandomPrice(3.5e-6, 5.9e-6),
                volume: 1500000
            }
        };
    }

    async getChartData(
        tokenAddress: string,
        type: ChartType = '1m',
        timeFrom?: number,
        timeTo?: number,
        marketCap?: string,
        removeOutliers: boolean = true
    ): Promise<any> {
        try {
            // Tạo cache key chung cho cả price và marketCap
            const cacheKey = `virtual_candle:${tokenAddress}`;

            // Kiểm tra cache trước
            const cachedData = await this.cacheService.get(cacheKey);
            if (cachedData) {
                this.logger.log(`Returning cached virtual candle data for ${tokenAddress}`);
                // Tự động tính toán giá trị trả về dựa trên marketCap
                return this.calculateReturnValue(cachedData, marketCap === 'marketcap');
            }

            // Gọi đến Solana Tracker API
            const chartData = await this.solanaTrackerService.getChartData(
                tokenAddress,
                type,
                timeFrom,
                timeTo,
                marketCap,
                removeOutliers
            );

            // Nếu không có dữ liệu từ Solana Tracker
            if (!chartData || !chartData.oclhv || chartData.oclhv.length === 0) {
                this.logger.log(`No data from Solana Tracker for ${tokenAddress}, generating virtual candle`);
                const virtualCandle = this.generateVirtualCandle();

                // Lưu vào cache với TTL 1 phút
                await this.cacheService.set(cacheKey, virtualCandle, this.VIRTUAL_CANDLE_CACHE_TTL);

                // Tự động tính toán giá trị trả về
                return this.calculateReturnValue(virtualCandle, marketCap === 'marketcap');
            }

            return chartData;
        } catch (error) {
            this.logger.error(`Error getting chart data: ${error.message}`);

            // Nếu có lỗi, tạo nến ảo
            this.logger.log(`Error from Solana Tracker for ${tokenAddress}, generating virtual candle`);

            // Kiểm tra cache trước khi tạo nến ảo mới
            const cacheKey = `virtual_candle:${tokenAddress}`;
            const cachedData = await this.cacheService.get(cacheKey);
            if (cachedData) {
                this.logger.log(`Returning cached virtual candle data for ${tokenAddress}`);
                return this.calculateReturnValue(cachedData, marketCap === 'marketcap');
            }

            const virtualCandle = this.generateVirtualCandle();

            // Lưu vào cache với TTL 1 phút
            await this.cacheService.set(cacheKey, virtualCandle, this.VIRTUAL_CANDLE_CACHE_TTL);

            return this.calculateReturnValue(virtualCandle, marketCap === 'marketcap');
        }
    }

    // Hàm tính toán giá trị trả về dựa trên loại dữ liệu
    private calculateReturnValue(data: any, isMarketCap: boolean): any {
        if (!data) return data;

        const multiplier = isMarketCap ? 1e9 : 1;

        // Tính toán cho oclhv
        const oclhv = data.oclhv.map(candle => ({
            ...candle,
            open: candle.open * multiplier,
            high: candle.high * multiplier,
            low: candle.low * multiplier,
            close: candle.close * multiplier,
            volume: candle.volume * multiplier
        }));

        // Tính toán cho current
        const current = {
            ...data.current,
            open: data.current.open * multiplier,
            high: data.current.high * multiplier,
            low: data.current.low * multiplier,
            close: data.current.close * multiplier,
            volume: data.current.volume * multiplier
        };

        return {
            oclhv,
            current
        };
    }
}