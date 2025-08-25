import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { CacheService } from '../cache/cache.service';
import { BirdeyeTokenOrigin, BirdeyeTokenMetadata, BirdeyeTokenMetadataResponse, BirdeyeTokenOriginResponse } from './interfaces/birdeye-token.interface';
import { GetTopCoinsDto, SortBy, SortType } from '../trade/dto/get-top-coins.dto';
import { GetHistoriesTransactionDto } from './dto/get-histories-transaction.dto';

export interface OHLCVData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface SwapData {
    time: number;
    price: number;
    volume: number;
    type: 'buy' | 'sell';
}

export type Timeframe = '1s' | '5s' | '30s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface BirdeyeSwapItem {
    blockUnixTime: number;
    pricePair: number;
    base: {
        uiChangeAmount: number;
    };
    quote: {
        uiChangeAmount: number;
    };
}

interface BirdeyeResponse {
    success: boolean;
    data?: {
        items: BirdeyeSwapItem[];
    };
}

interface BirdeyeTradeData {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
    extensions: {
        coingeckoId?: string;
        serumV3Usdc?: string;
        serumV3Usdt?: string;
        website?: string;
        telegram?: string | null;
        twitter?: string;
        description?: string;
        discord?: string;
        medium?: string;
    };
    logoURI: string;
    liquidity: number;
    lastTradeUnixTime: number;
    lastTradeHumanTime: string;
    price: number;
    history30sPrice: number;
    priceChange30sPercent: number;
    history1hPrice: number;
    priceChange1hPercent: number;
    history2hPrice: number;
    priceChange2hPercent: number;
    history4hPrice: number;
    priceChange4hPercent: number;
    history6hPrice: number;
    priceChange6hPercent: number;
    history8hPrice: number;
    priceChange8hPercent: number;
    history12hPrice: number;
    priceChange12hPercent: number;
    history24hPrice: number;
    priceChange24hPercent: number;
    uniqueWallet30s: number;
    uniqueWalletHistory30s: number;
    uniqueWallet30sChangePercent: number;
    uniqueWallet1h: number;
    uniqueWalletHistory1h: number;
    uniqueWallet1hChangePercent: number;
    uniqueWallet2h: number;
    uniqueWalletHistory2h: number;
    uniqueWallet2hChangePercent: number;
    uniqueWallet4h: number;
    uniqueWalletHistory4h: number;
    uniqueWallet4hChangePercent: number;
    uniqueWallet8h: number;
    uniqueWalletHistory8h: number;
    uniqueWallet8hChangePercent: number;
    uniqueWallet24h: number;
    uniqueWalletHistory24h: number;
    uniqueWallet24hChangePercent: number;
    totalSupply: number;
    fdv: number;
    circulatingSupply: number;
    marketCap: number;
    holder: number;
    trade30s: number;
    tradeHistory30s: number;
    trade30sChangePercent: number;
    sell30s: number;
    sellHistory30s: number;
    sell30sChangePercent: number;
    buy30s: number;
    buyHistory30s: number;
    buy30sChangePercent: number;
    v30s: number;
    v30sUSD: number;
    vHistory30s: number;
    vHistory30sUSD: number;
    v30sChangePercent: number;
    vBuy30s: number;
    vBuy30sUSD: number;
    vBuyHistory30s: number;
    vBuyHistory30sUSD: number;
    vBuy30sChangePercent: number;
    vSell30s: number;
    vSell30sUSD: number;
    vSellHistory30s: number;
    vSellHistory30sUSD: number;
    vSell30sChangePercent: number;
    trade1h: number;
    tradeHistory1h: number;
    trade1hChangePercent: number;
    sell1h: number;
    sellHistory1h: number;
    sell1hChangePercent: number;
    buy1h: number;
    buyHistory1h: number;
    buy1hChangePercent: number;
    v1h: number;
    v1hUSD: number;
    vHistory1h: number;
    vHistory1hUSD: number;
    v1hChangePercent: number;
    vBuy1h: number;
    vBuy1hUSD: number;
    vBuyHistory1h: number;
    vBuyHistory1hUSD: number;
    vBuy1hChangePercent: number;
    vSell1h: number;
    vSell1hUSD: number;
    vSellHistory1h: number;
    vSellHistory1hUSD: number;
    vSell1hChangePercent: number;
    trade2h: number;
    tradeHistory2h: number;
    trade2hChangePercent: number;
    sell2h: number;
    sellHistory2h: number;
    sell2hChangePercent: number;
    buy2h: number;
    buyHistory2h: number;
    buy2hChangePercent: number;
    v2h: number;
    v2hUSD: number;
    vHistory2h: number;
    vHistory2hUSD: number;
    v2hChangePercent: number;
    vBuy2h: number;
    vBuy2hUSD: number;
    vBuyHistory2h: number;
    vBuyHistory2hUSD: number;
    vBuy2hChangePercent: number;
    vSell2h: number;
    vSell2hUSD: number;
    vSellHistory2h: number;
    vSellHistory2hUSD: number;
    vSell2hChangePercent: number;
    trade4h: number;
    tradeHistory4h: number;
    trade4hChangePercent: number;
    sell4h: number;
    sellHistory4h: number;
    sell4hChangePercent: number;
    buy4h: number;
    buyHistory4h: number;
    buy4hChangePercent: number;
    v4h: number;
    v4hUSD: number;
    vHistory4h: number;
    vHistory4hUSD: number;
    v4hChangePercent: number;
    vBuy4h: number;
    vBuy4hUSD: number;
    vBuyHistory4h: number;
    vBuyHistory4hUSD: number;
    vBuy4hChangePercent: number;
    vSell4h: number;
    vSell4hUSD: number;
    vSellHistory4h: number;
    vSellHistory4hUSD: number;
    vSell4hChangePercent: number;
    trade8h: number;
    tradeHistory8h: number;
    trade8hChangePercent: number;
    sell8h: number;
    sellHistory8h: number;
    sell8hChangePercent: number;
    buy8h: number;
    buyHistory8h: number;
    buy8hChangePercent: number;
    v8h: number;
    v8hUSD: number;
    vHistory8h: number;
    vHistory8hUSD: number;
    v8hChangePercent: number;
    vBuy8h: number;
    vBuy8hUSD: number;
    vBuyHistory8h: number;
    vBuyHistory8hUSD: number;
    vBuy8hChangePercent: number;
    vSell8h: number;
    vSell8hUSD: number;
    vSellHistory8h: number;
    vSellHistory8hUSD: number;
    vSell8hChangePercent: number;
    trade24h: number;
    tradeHistory24h: number;
    trade24hChangePercent: number;
    sell24h: number;
    sellHistory24h: number;
    sell24hChangePercent: number;
    buy24h: number;
    buyHistory24h: number;
    buy24hChangePercent: number;
    v24h: number;
    v24hUSD: number;
    vHistory24h: number;
    vHistory24hUSD: number;
    v24hChangePercent: number;
    vBuy24h: number;
    vBuy24hUSD: number;
    vBuyHistory24h: number;
    vBuyHistory24hUSD: number;
    vBuy24hChangePercent: number;
    vSell24h: number;
    vSell24hUSD: number;
    vSellHistory24h: number;
    vSellHistory24hUSD: number;
    vSell24hChangePercent: number;
    watch: any;
    numberMarkets: number;
}

interface BirdeyeTradeDataResponse {
    success: boolean;
    data?: BirdeyeTradeData;
}

interface BirdeyeOHLCVResponse {
    success: boolean;
    data: {
        items: {
            o: number;
            h: number;
            l: number;
            c: number;
            v: number;
            unixTime: number;
            address: string;
            type: string;
            currency: string;
        }[];
    };
}

export interface TopCoinItem {
    address: string;
    logo_uri: string | null;
    name: string | null;
    symbol: string | null;
    decimals: number;
    extensions: {
        description?: string;
    } | null;
    market_cap: number;
    fdv: number;
    liquidity: number;
    last_trade_unix_time: number;
    volume_1h_usd: number;
    volume_1h_change_percent: number | null;
    volume_24h_usd: number;
    volume_24h_change_percent: number | null;
    trade_24h_count: number;
    price: number;
    price_change_24h_percent: number | null;
    holder: number | null;
    recent_listing_time: number | null;
}

export interface TopCoinsResponse {
    data: {
        items: TopCoinItem[];
        has_next: boolean;
    };
    success: boolean;
}

export interface TransactionHistoryResponse {
    success: boolean;
    data: {
        items: Array<{
            tx_type: string;
            tx_hash: string;
            volume_usd: number;
            price: number;
            timestamp: number;
            from: string;
            to: string;
            token_address: string;
            token_symbol: string;
            token_name: string;
            token_decimal: number;
        }>;
        total: number;
    };
}

interface BirdeyePriceResponse {
    priceUSD: number;
    priceSOL: number;
    timestamp: number;
}

@Injectable()
export class BirdeyeService {
    private readonly logger = new Logger(BirdeyeService.name);
    private readonly baseUrl = 'https://public-api.birdeye.so';
    
    // Cache TTL constants
    private readonly CACHE_TTL = {
        TRADE_DATA: 5, // 5 seconds for real-time trading data
        METADATA: 1800, // 30 minutes for metadata
        TOKEN_INFO: 1800, // 30 minutes for token info
        ORIGIN: 1800, // 30 minutes for origin info
        TOP_COINS: 1800, // 30 minutes for top coins data
    };
    
    private readonly rateLimitWindow = 60000; // 1 minute in milliseconds
    private readonly maxRequestsPerMinute = 30;
    private readonly retryDelays = [1000, 2000, 4000, 8000, 16000];
    private requestTimestamps: number[] = [];
    private readonly maxBatchSize = 10;
    private readonly concurrentRequestLimit = 3;
    private activeRequests = 0;
    private requestQueue: { resolve: Function; reject: Function; request: () => Promise<any> }[] = [];

    private readonly MEME_KEYWORDS = [
        'pepe', 'doge', 'shib', 'inu', 'moon', 'elon', 'safe', 'baby', 
        'rocket', 'chad', 'wojak', 'cat', 'dog', 'pump', 'meme', 'frog', 'monkey', 'ape', 'diamond', 'hands', 'hodl',
        'mars', 'lambo', 'rich', 'poor', 'paper', 'fomo', 'fud', 'hype'
    ];

    private readonly IPFS_PATTERNS = [
        'ipfs.io/ipfs',
        'ipfs://',
        'ipfs/',
        'ipfs.io',
        'ipfs.infura.io',
        'ipfs.pinata.cloud'
    ];

    private readonly MEME_URI_PATTERNS = [
        'pumplify.eu',           // Pumplify metadata service - thường được dùng bởi meme coins
        'raw.githubusercontent.com/memecoin', // GitHub raw content của meme coins
        'raw.githubusercontent.com/pepe',     // GitHub raw content của Pepe tokens
        'raw.githubusercontent.com/doge',     // GitHub raw content của Doge tokens
        'raw.githubusercontent.com/shib',     // GitHub raw content của Shib tokens
        'raw.githubusercontent.com/inu',      // GitHub raw content của Inu tokens
        'raw.githubusercontent.com/moon',     // GitHub raw content của Moon tokens
        'raw.githubusercontent.com/elon',     // GitHub raw content của Elon tokens
        'raw.githubusercontent.com/safe',     // GitHub raw content của Safe tokens
        'raw.githubusercontent.com/baby',     // GitHub raw content của Baby tokens
        'raw.githubusercontent.com/rocket',   // GitHub raw content của Rocket tokens
        'raw.githubusercontent.com/chad',     // GitHub raw content của Chad tokens
        'raw.githubusercontent.com/wojak',    // GitHub raw content của Wojak tokens
        'raw.githubusercontent.com/frog',     // GitHub raw content của Frog tokens
        'raw.githubusercontent.com/monkey',   // GitHub raw content của Monkey tokens
        'raw.githubusercontent.com/ape',      // GitHub raw content của Ape tokens
        'raw.githubusercontent.com/diamond',  // GitHub raw content của Diamond tokens
        'raw.githubusercontent.com/hands',    // GitHub raw content của Hands tokens
        'raw.githubusercontent.com/hodl',     // GitHub raw content của Hodl tokens
        'raw.githubusercontent.com/mars',     // GitHub raw content của Mars tokens
        'raw.githubusercontent.com/lambo',    // GitHub raw content của Lambo tokens
        'raw.githubusercontent.com/rich',     // GitHub raw content của Rich tokens
        'raw.githubusercontent.com/poor',     // GitHub raw content của Poor tokens
        'raw.githubusercontent.com/paper',    // GitHub raw content của Paper tokens
        'raw.githubusercontent.com/fomo',     // GitHub raw content của Fomo tokens
        'raw.githubusercontent.com/fud',      // GitHub raw content của Fud tokens
        'raw.githubusercontent.com/hype'      // GitHub raw content của Hype tokens
    ];

    constructor(
        private readonly configService: ConfigService,
        private readonly cacheService: CacheService
    ) {
        // Clean up old timestamps periodically
        setInterval(() => {
            const now = Date.now();
            this.requestTimestamps = this.requestTimestamps.filter(
                timestamp => now - timestamp < this.rateLimitWindow
            );
        }, this.rateLimitWindow);
    }

    private async processQueue() {
        while (this.requestQueue.length > 0 && this.activeRequests < this.concurrentRequestLimit) {
            const { resolve, reject, request } = this.requestQueue.shift()!;
            this.activeRequests++;
            
            try {
                const result = await request();
                resolve(result);
            } catch (error) {
                reject(error);
            } finally {
                this.activeRequests--;
                this.processQueue();
            }
        }
    }

    private async enqueueRequest<T>(request: () => Promise<T>): Promise<T> {
        if (this.activeRequests < this.concurrentRequestLimit) {
            this.activeRequests++;
            try {
                return await request();
            } finally {
                this.activeRequests--;
                this.processQueue();
            }
        }

        return new Promise((resolve, reject) => {
            this.requestQueue.push({ resolve, reject, request });
        });
    }

    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        this.requestTimestamps = this.requestTimestamps.filter(
            timestamp => now - timestamp < this.rateLimitWindow
        );

        if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
            const oldestTimestamp = this.requestTimestamps[0];
            const waitTime = this.rateLimitWindow - (now - oldestTimestamp);
            if (waitTime > 0) {
                this.logger.warn(`Rate limit reached, waiting ${waitTime}ms before next request`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        this.requestTimestamps.push(now);
    }

    private async makeRequestWithRetry<T>(
        requestFn: () => Promise<T>,
        retryCount = 0,
        lastError?: any
    ): Promise<T> {
        try {
            await this.waitForRateLimit();
            return await this.enqueueRequest(requestFn);
        } catch (error) {
            const isRateLimit = error.response?.status === 429;
            const shouldRetry = retryCount < this.retryDelays.length && 
                              (isRateLimit || error.response?.status >= 500);

            if (shouldRetry) {
                const delay = this.retryDelays[retryCount];
                this.logger.warn(
                    `Request failed (${error.response?.status}), retrying in ${delay}ms (attempt ${retryCount + 1})`
                );
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.makeRequestWithRetry(requestFn, retryCount + 1, error);
            }

            throw lastError || error;
        }
    }

    public getIntervalSeconds(timeframe: Timeframe): number {
        switch (timeframe) {
            case '1s': return 1;
            case '5s': return 5;
            case '30s': return 30;
            case '1m': return 60;
            case '5m': return 300;
            case '15m': return 900;
            case '1h': return 3600;
            case '4h': return 14400;
            case '1d': return 86400;
            default: return 300; // Default to 5m
        }
    }

    private getCandleTime(time: number, timeframe: Timeframe): number {
        const date = new Date(time);
        switch (timeframe) {
            case '1s':
                return Math.floor(time / 1000) * 1000;
            case '5s':
                return Math.floor(time / 5000) * 5000;
            case '30s':
                return Math.floor(time / 30000) * 30000;
            case '1m':
                date.setSeconds(0, 0);
                return date.getTime();
            case '5m':
                date.setMinutes(Math.floor(date.getMinutes() / 5) * 5, 0, 0);
                return date.getTime();
            case '15m':
                date.setMinutes(Math.floor(date.getMinutes() / 15) * 15, 0, 0);
                return date.getTime();
            case '1h':
                date.setMinutes(0, 0, 0);
                return date.getTime();
            case '4h':
                date.setHours(Math.floor(date.getHours() / 4) * 4, 0, 0, 0);
                return date.getTime();
            case '1d':
                date.setHours(0, 0, 0, 0);
                return date.getTime();
            default:
                return time;
        }
    }

    async getOHLCVData(tokenAddress: string, timeframe: Timeframe = '1h'): Promise<OHLCVData[]> {
        try {
            this.logger.debug(`Fetching OHLCV data for ${tokenAddress} (${timeframe})`);

            // Calculate time range based on timeframe to get 999 candles
            const now = Math.floor(Date.now() / 1000);
            let timeFrom: number;
            let timeTo: number;

            switch (timeframe) {
                case '1s':
                    timeFrom = now - 999; // 999 seconds
                    timeTo = now;
                    break;
                case '1m':
                    timeFrom = now - 59940; // 999 minutes
                    timeTo = now;
                    break;
                case '5m':
                    timeFrom = now - 299700; // 999 * 5 minutes
                    timeTo = now;
                    break;
                case '15m':
                    timeFrom = now - 899100; // 999 * 15 minutes
                    timeTo = now;
                    break;
                case '30s':
                    timeFrom = now - 1798200; // 999 * 30 minutes
                    timeTo = now;
                    break;
                case '1h':
                    timeFrom = now - 3596400; // 999 hours
                    timeTo = now;
                    break;
                case '4h':
                    timeFrom = now - 14385600; // 999 * 4 hours
                    timeTo = now;
                    break;
                case '1d':
                    timeFrom = now - 86313600; // 999 days
                    timeTo = now;
                    break;
                default:
                    timeFrom = now - 3596400; // Default to 999 hours
                    timeTo = now;
            }

            const response = await this.makeRequestWithRetry<BirdeyeOHLCVResponse>(async () => {
                const url = `${this.baseUrl}/defi/ohlcv`;
                const params = {
                    address: tokenAddress,
                    type: timeframe,
                    currency: 'usd',
                    time_from: timeFrom,
                    time_to: timeTo
                };

                const headers = {
                    'X-API-KEY': this.configService.get<string>('BIRDEYE_API_KEY'),
                    'accept': 'application/json',
                    'x-chain': 'solana'
                };

                const { data } = await axios.get<BirdeyeOHLCVResponse>(url, { params, headers });
                return data;
            });

            if (response.success && response.data?.items) {
                const ohlcvData: OHLCVData[] = response.data.items.map(item => ({
                    time: item.unixTime,
                    open: item.o,
                    high: item.h,
                    low: item.l,
                    close: item.c,
                    volume: item.v
                }));

                ohlcvData.sort((a, b) => a.time - b.time);

                this.logger.debug(`Successfully fetched ${ohlcvData.length} OHLCV candles for ${tokenAddress} (${timeframe})`);
                return ohlcvData;
            }

            throw new Error('Invalid response from Birdeye OHLCV API');
        } catch (error) {
            this.logger.error(`Error fetching OHLCV data for ${tokenAddress} (${timeframe}):`, error);
            throw error;
        }
    }

    async getSwapData(tokenAddress: string): Promise<SwapData[]> {
        try {
            const cacheKey = `birdeye_swap_${tokenAddress}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return JSON.parse(cachedData as string);
            }

            const response = await axios.get(`${this.baseUrl}/defi/txs/token`, {
                params: {
                    address: tokenAddress,
                    offset: 0,
                    limit: 50,
                    tx_type: 'swap',
                    sort_type: 'desc'
                },
                headers: {
                    'X-API-KEY': this.configService.get('BIRDEYE_API_KEY'),
                    'accept': 'application/json',
                    'x-chain': 'solana'
                }
            });

            if (response.data.success && response.data.data?.items) {
                const swapData = response.data.data.items.map(item => ({
                    time: item.blockUnixTime * 1000,
                    price: item.pricePair,
                    volume: Math.abs(item.base.uiChangeAmount),
                    type: item.side
                }));

                this.logger.log(`Processed ${swapData.length} swap data points`);

                await this.cacheService.set(cacheKey, JSON.stringify(swapData), this.CACHE_TTL.TRADE_DATA);
                return swapData;
            } else {
                this.logger.warn(`No swap data found in response for ${tokenAddress}`);
                return [];
            }
        } catch (error) {
            this.logger.error(`Error fetching swap data for ${tokenAddress}:`, error);
            return [];
        }
    }

    async getCurrentPrice(tokenAddress: string): Promise<BirdeyePriceResponse> {
        try {
            const cacheKey = `token_price:${tokenAddress}`;
            const cachedPrice = await this.cacheService.get(cacheKey);

            if (cachedPrice) {
                return JSON.parse(cachedPrice as string);
            }

            // Lấy giá của token và SOL cùng lúc từ Solana Tracker
            const response = await axios.get(`${this.configService.get('SOLANA_TRACKER_API_URL')}/price/multi`, {
                params: {
                    tokens: `${tokenAddress},So11111111111111111111111111111111111111112`,
                    priceChanges: true
                },
                headers: {
                    'x-api-key': this.configService.get('SOLANA_TRACKER_API_KEY')
                }
            });

            if (response.data) {
                const tokenData = response.data[tokenAddress];
                const solData = response.data['So11111111111111111111111111111111111111112'];

                if (tokenData && solData) {
                    // Tính giá SOL của token
                    const priceUSD = tokenData.price;
                    const priceSOL = tokenData.priceQuote; // priceQuote là giá theo SOL

                    const result = {
                        priceUSD,
                        priceSOL,
                        timestamp: Date.now()
                    };

                    await this.cacheService.set(cacheKey, JSON.stringify(result), 30); // Cache 30 giây
                    return result;
                }
            }

            return { priceUSD: 0, priceSOL: 0, timestamp: Date.now() };
        } catch (error) {
            this.logger.error(`Error fetching current price for ${tokenAddress}:`, error);
            return { priceUSD: 0, priceSOL: 0, timestamp: Date.now() };
        }
    }

    async clearOHLCVCache(tokenAddress: string): Promise<void> {
        const cacheKey = `birdeye_ohlcv_${tokenAddress}`;
        await this.cacheService.del(cacheKey);
    }

    async getTokenMetadata(address: string): Promise<BirdeyeTokenMetadata | null> {
        try {
            const cacheKey = `birdeye_metadata_${address}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return JSON.parse(cachedData as string);
            }

            const response = await this.makeRequestWithRetry(() => 
                axios.get<BirdeyeTokenMetadataResponse>(
                    `${this.baseUrl}/defi/v3/token/meta-data/single`,
                    {
                        params: { address },
                        headers: {
                            'X-API-KEY': this.configService.get('BIRDEYE_API_KEY'),
                            'accept': 'application/json',
                            'x-chain': 'solana'
                        }
                    }
                )
            );

            if (response.data.success && response.data.data) {
                const metadata = response.data.data;
                await this.cacheService.set(cacheKey, JSON.stringify(metadata), this.CACHE_TTL.METADATA);
                return metadata;
            }

            this.logger.warn(`No metadata found for token ${address}`);
            return null;
        } catch (error) {
            this.logger.error(`Error fetching token metadata for ${address}:`, error);
            return null;
        }
    }

    async getTokenOrigin(address: string): Promise<BirdeyeTokenOrigin | null> {
        try {
            const cacheKey = `birdeye_origin_${address}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return JSON.parse(cachedData as string);
            }

            const response = await this.makeRequestWithRetry(() =>
                axios.get<BirdeyeTokenOriginResponse>(
                    `${this.baseUrl}/defi/token_creation_info`,
                    {
                        params: { address },
                        headers: {
                            'X-API-KEY': this.configService.get('BIRDEYE_API_KEY'),
                            'accept': 'application/json',
                            'x-chain': 'solana'
                        }
                    }
                )
            );

            if (response.data.success && response.data.data) {
                const origin = response.data.data;
                await this.cacheService.set(cacheKey, JSON.stringify(origin), this.CACHE_TTL.ORIGIN);
                return origin;
            }

            this.logger.warn(`No origin information found for token ${address}`);
            return null;
        } catch (error) {
            this.logger.error(`Error fetching token origin for ${address}:`, error);
            return null;
        }
    }

    async getTokenTradeData(address: string): Promise<BirdeyeTradeData | null> {
        try {
            const cacheKey = `birdeye_trade_${address}`;
            const cachedData = await this.cacheService.get(cacheKey);

            // Nếu có cache và chưa hết hạn 10s, trả về cache
            if (cachedData) {
                const parsedData = JSON.parse(cachedData as string);
                const cacheTimestamp = parsedData.timestamp;
                const now = Date.now();
                
                // Nếu cache còn hiệu lực (dưới 10s), trả về cache
                if (now - cacheTimestamp < 10000) {
                    return parsedData.data;
                }
            }

            // Nếu không có cache hoặc cache đã hết hạn, gọi API mới
            const response = await this.makeRequestWithRetry(() =>
                axios.get<{ success: boolean; data: BirdeyeTradeData }>(
                    `${this.baseUrl}/defi/token_overview`,
                    {
                        params: { address },
                        headers: {
                            'X-API-KEY': this.configService.get('BIRDEYE_API_KEY'),
                            'accept': 'application/json',
                            'x-chain': 'solana'
                        }
                    }
                )
            );

            if (response.data.success && response.data.data) {
                const tradeData = response.data.data;
                // Lưu cache với timestamp
                await this.cacheService.set(cacheKey, JSON.stringify({
                    data: tradeData,
                    timestamp: Date.now()
                }), 10); // Cache 10 giây
                return tradeData;
            }

            this.logger.warn(`No trade data found for token ${address}`);
            return null;
        } catch (error) {
            this.logger.error(`Error fetching token trade data for ${address}:`, error);
            return null;
        }
    }

    async getMultipleTokensTradeData(tokenAddresses: string[], forceRefresh = false): Promise<{ [key: string]: any }> {
        try {
            // Tính toán số lượng batch cần thiết
            const totalTokens = tokenAddresses.length;
            const maxTokensPerBatch = 20;
            const numFullBatches = Math.floor(totalTokens / maxTokensPerBatch);
            const remainingTokens = totalTokens % maxTokensPerBatch;

            // Tạo mảng các batch
            const batches: string[][] = [];
            
            // Thêm các batch đầy đủ (20 tokens)
            for (let i = 0; i < numFullBatches; i++) {
                const start = i * maxTokensPerBatch;
                batches.push(tokenAddresses.slice(start, start + maxTokensPerBatch));
            }

            // Thêm batch còn lại nếu có
            if (remainingTokens > 0) {
                const start = numFullBatches * maxTokensPerBatch;
                batches.push(tokenAddresses.slice(start, start + remainingTokens));
            }

            this.logger.debug(`Processing ${batches.length} batches for ${totalTokens} tokens: ${numFullBatches} full batches + ${remainingTokens} remaining tokens`);

            // Process each batch with rate limiting
            const results = await Promise.all(
                batches.map(async (batch) => {
                    const batchKey = batch.join('_');
                    const cacheKey = `birdeye_multiple_trade_${batchKey}`;
                    
                    // Nếu forceRefresh = true, bỏ qua cache
                    if (!forceRefresh) {
                        const cachedData = await this.cacheService.get(cacheKey);
                        if (cachedData) {
                            const parsedData = JSON.parse(cachedData as string);
                            const cacheTimestamp = parsedData.timestamp;
                            const now = Date.now();
                            
                            if (now - cacheTimestamp < 5000) { // 5 seconds
                                return parsedData.data;
                            }
                        }
                    }

                    // Format list_address correctly - join with comma and no encoding
                    const listAddress = batch.join(',');

                    // Gọi API mới
                    const response = await this.makeRequestWithRetry(() =>
                        axios.get(`${this.baseUrl}/defi/v3/token/trade-data/multiple`, {
                            params: {
                                list_address: listAddress
                            },
                            headers: {
                                'X-API-KEY': this.configService.get('BIRDEYE_API_KEY'),
                                'accept': 'application/json',
                                'x-chain': 'solana'
                            }
                        })
                    );

                    if (response.data.success && response.data.data) {
                        // Lưu cache mới với timestamp
                        await this.cacheService.set(cacheKey, JSON.stringify({
                            data: response.data.data,
                            timestamp: Date.now()
                        }), 5); // Cache 5 giây
                        return response.data.data;
                    }

                    return {};
                })
            );

            return results.reduce((acc, result) => ({ ...acc, ...result }), {});
        } catch (error) {
            this.logger.error(`Error fetching multiple tokens trade data:`, error);
            return {};
        }
    }

    private isMemeCoin(token: TopCoinItem): boolean {
        const name = token.name?.toLowerCase() || '';
        const symbol = token.symbol?.toLowerCase() || '';
        const logoUri = token.logo_uri?.toLowerCase() || '';

        // Check name and symbol
        const hasMemeKeyword = this.MEME_KEYWORDS.some(keyword => 
            name.includes(keyword) || 
            symbol.includes(keyword)
        );

        // Check logo URI for meme keywords
        const hasMemeLogo = this.MEME_KEYWORDS.some(keyword => 
            logoUri.includes(keyword)
        );

        // Check if logo is hosted on IPFS
        const isIPFSLogo = this.IPFS_PATTERNS.some(pattern => 
            logoUri.includes(pattern)
        );

        // Check if logo is hosted on common meme coin hosting services
        const isMemeHosting = this.MEME_URI_PATTERNS.some(pattern => 
            logoUri.includes(pattern)
        );

        // Log detailed information for debugging
        this.logger.debug(`Meme coin detection for ${symbol}:`, {
            name,
            symbol,
            hasMemeKeyword,
            hasMemeLogo,
            isIPFSLogo,
            isMemeHosting,
            logoUri
        });

        // Return true if any of the checks pass
        return hasMemeKeyword || hasMemeLogo || isIPFSLogo || isMemeHosting;
    }

    async getTopCoins(params: GetTopCoinsDto): Promise<TopCoinsResponse> {
        try {
            const limit = params.limit || 100;
            const cacheKey = `birdeye_top_meme_coins_${limit}_${JSON.stringify(params)}`;

            const basicInfoCached = await this.cacheService.get(cacheKey);

            let basicInfo;
            let isBasicInfoFromCache = true;
            let totalSupplyMap: { [key: string]: number } = {};
            
            if (basicInfoCached) {
                const parsedCache = JSON.parse(basicInfoCached as string);
                const cacheTimestamp = parsedCache.timestamp;
                const now = Date.now();
                
                // Kiểm tra nếu cache đã hết hạn (30 phút)
                if (now - cacheTimestamp < 1800000) { // 30 phút
                    basicInfo = parsedCache.data;
                    totalSupplyMap = parsedCache.totalSupplyMap || {};
                } else {
                    isBasicInfoFromCache = false;
                }
            } else {
                isBasicInfoFromCache = false;
            }

            // Nếu không có cache hoặc cache đã hết hạn, lấy dữ liệu mới
            if (!isBasicInfoFromCache) {
                const { data: responseData } = await this.makeRequestWithRetry(() =>
                    axios.get<TopCoinsResponse>(
                        `${this.baseUrl}/defi/v3/token/list/scroll`,
                        {
                            params: {
                                sort_by: params.sort_by || 'market_cap',
                                sort_type: params.sort_type || 'desc',
                                limit: 300, // Lấy 300 token từ Birdeye
                                min_market_cap: 1,
                                min_trade_1h_count: 1,
                                min_trade_24h_count: 1
                            },
                            headers: {
                                'X-API-KEY': this.configService.get('BIRDEYE_API_KEY'),
                                'accept': 'application/json',
                                'x-chain': 'solana'
                            }
                        }
                    )
                );

                if (!responseData.success) {
                    throw new Error('Failed to fetch basic token info');
                }

                basicInfo = responseData;
                
                // Tính toán và lưu total supply cho mỗi token
                basicInfo.data.items.forEach(item => {
                    if (item.price > 0) {
                        totalSupplyMap[item.address] = item.market_cap / item.price;
                    }
                });

                // Lọc meme coins và giữ nguyên thứ tự sắp xếp
                const memeCoins = basicInfo.data.items.filter(item => this.isMemeCoin(item));
                
                // Sắp xếp lại theo sort_by và sort_type
                const sortBy = params.sort_by || 'market_cap';
                const sortType = params.sort_type || 'desc';
                
                memeCoins.sort((a, b) => {
                    let valueA = a[sortBy];
                    let valueB = b[sortBy];
                    
                    // Xử lý các trường hợp đặc biệt
                    if (sortBy.includes('percent')) {
                        valueA = valueA || 0;
                        valueB = valueB || 0;
                    }
                    
                    if (sortType === 'desc') {
                        return valueB - valueA;
                    }
                    return valueA - valueB;
                });

                basicInfo.data.items = memeCoins.slice(0, limit);
                basicInfo.data.has_next = memeCoins.length > limit;
                
                this.logger.debug(`Found ${memeCoins.length} meme coins, limiting to first ${limit} sorted by ${sortBy} ${sortType}`);

                // Cache basic info với timestamp và total supply map
                await this.cacheService.set(cacheKey, JSON.stringify({
                    data: basicInfo,
                    totalSupplyMap,
                    timestamp: Date.now()
                }), 1800);
            }

            // Get trade data - chỉ lấy dữ liệu cho các token đã lọc
            const addresses = basicInfo.data.items.map(item => item.address);
            
            // Chia nhỏ danh sách token để lấy trade data
            const maxTokensPerBatch = 20;
            const batches: string[][] = [];
            
            for (let i = 0; i < addresses.length; i += maxTokensPerBatch) {
                batches.push(addresses.slice(i, i + maxTokensPerBatch));
            }

            // Lấy trade data cho từng batch
            const tradeDataPromises = batches.map(batch => 
                this.getMultipleTokensTradeData(batch, !isBasicInfoFromCache)
            );
            
            const tradeDataResults = await Promise.all(tradeDataPromises);
            const tradeData = tradeDataResults.reduce((acc, curr) => ({ ...acc, ...curr }), {});

            // Merge basic info with trade data và giữ nguyên thứ tự sắp xếp
            const mergedItems = basicInfo.data.items.map(item => {
                const tradeDataForItem = tradeData[item.address] || {};
                const currentPrice = tradeDataForItem.price || item.price;
                
                const marketCap = totalSupplyMap[item.address] ? 
                    totalSupplyMap[item.address] * currentPrice : 
                    (item.market_cap / item.price) * currentPrice;

                return {
                    ...item,
                    fdv: item.fdv,
                    liquidity: item.liquidity,
                    market_cap: marketCap,
                    last_trade_unix_time: tradeDataForItem.last_trade_unix_time,
                    volume_1h_usd: tradeDataForItem.volume_1h_usd,
                    volume_1h_change_percent: tradeDataForItem.volume_1h_change_percent,
                    volume_24h_usd: tradeDataForItem.volume_24h_usd,
                    volume_24h_change_percent: tradeDataForItem.volume_24h_change_percent,
                    trade_24h_count: tradeDataForItem.trade_24h_count,
                    price: currentPrice,
                    price_change_24h_percent: tradeDataForItem.price_change_24h_change_percent,
                    holder: tradeDataForItem.holder,
                    recent_listing_time: tradeDataForItem.recent_listing_time
                };
            });

            return {
                success: true,
                data: {
                    items: mergedItems,
                    has_next: basicInfo.data.has_next
                }
            };
        } catch (error) {
            this.logger.error(`Error fetching top coins: ${error.message}`);
            throw error;
        }
    }

    async getTransactionHistory(params: GetHistoriesTransactionDto): Promise<TransactionHistoryResponse> {
        try {
            const cacheKey = `birdeye_tx_history_${JSON.stringify(params)}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                this.logger.debug(`Using cached transaction history for ${params.address}`);
                return JSON.parse(cachedData as string);
            }

            this.logger.debug(`Fetching transaction history with params:`, params);

            const response = await this.makeRequestWithRetry(() =>
                axios.get<TransactionHistoryResponse>(
                    `${this.baseUrl}/defi/v3/token/txs`,
                    {
                        params: {
                            address: params.address,
                            offset: params.offset,
                            limit: params.limit,
                            sort_by: params.sort_by,
                            sort_type: params.sort_type,
                            tx_type: params.tx_type,
                            owner: params.owner
                        },
                        headers: {
                            'X-API-KEY': this.configService.get('BIRDEYE_API_KEY'),
                            'accept': 'application/json',
                            'x-chain': 'solana'
                        }
                    }
                )
            );

            if (response.data.success) {
                await this.cacheService.set(cacheKey, JSON.stringify(response.data), this.CACHE_TTL.TRADE_DATA);
                return response.data;
            }

            throw new Error('Failed to fetch transaction history');
        } catch (error) {
            this.logger.error(`Error fetching transaction history: ${error.message}`);
            throw error;
        }
    }

    async getTop100CoinsRealTimeData(): Promise<{ [key: string]: any }> {
        try {
            // First get the top 100 coins list
            const topCoinsResponse = await this.getTopCoins({
                sort_by: SortBy.MARKET_CAP,
                sort_type: SortType.DESC,
                limit: 100
            });

            if (!topCoinsResponse.success || !topCoinsResponse.data.items) {
                throw new Error('Failed to fetch top coins list');
            }

            // Extract addresses from top coins
            const addresses = topCoinsResponse.data.items.map(coin => coin.address);

            // Get real-time trade data for all addresses
            return await this.getMultipleTokensTradeData(addresses);
        } catch (error) {
            this.logger.error(`Error fetching top 100 coins real-time data:`, error);
            throw error;
        }
    }
}
