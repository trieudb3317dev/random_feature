import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from "@nestjs/common";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { CopyTradeService } from "../copy-trade/copy-trade.service";
import { ConfigService } from "@nestjs/config";
import { CacheService } from '../cache/cache.service';
import { SolanaService } from "../solana/solana.service";
import { SolanaTrackingService } from "../solana/services/tracking.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { SolanaWebSocketService } from "../solana/solana-websocket.service";
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom } from 'rxjs';
import WebSocket from 'ws';
import axios from 'axios';
import { TokenProgram } from '../solana/entities/solana-list-token.entity';

// Interface cho dữ liệu trending token
export interface TokenData {
    name: string;
    symbol: string;
    mint: string;
    uri: string;
    decimals: number;
    isMutable: boolean;
    description?: string;
    image?: string;
    showName?: boolean;
    createdOn?: string;
    metadata?: any;
    twitter?: string;
    telegram?: string;
    website?: string;
    hasFileMetaData?: boolean;
    strictSocials?: {
        twitter?: string;
        telegram?: string;
        website?: string;
    };
}

export interface PoolLiquidity {
    quote: number;
    usd: number;
}

export interface PoolPrice {
    quote: number;
    usd: number;
}

export interface PoolMarketCap {
    quote: number;
    usd: number;
}

export interface PoolTxns {
    sells: number;
    total: number;
    volume: number;
    buys: number;
}

export interface PoolData {
    poolId: string;
    liquidity: PoolLiquidity;
    price: PoolPrice;
    tokenSupply: number;
    lpBurn: number;
    tokenAddress: string;
    marketCap: PoolMarketCap;
    market: string;
    quoteToken: string;
    decimals: number;
    security?: {
        freezeAuthority: string | null;
        mintAuthority: string | null;
    };
    deployer?: string;
    openTime?: number;
    createdAt?: number;
    lastUpdated?: number;
    txns?: any;
    meteoraCurve?: any;
    curve?: string;
    curvePercentage?: number;
}

export interface TokenEvents {
    [key: string]: {
        priceChangePercentage: number;
    };
}

export interface TokenRisk {
    rugged: boolean;
    risks: Array<{
        name: string;
        description: string;
        level: string;
        score: number;
        value?: string;
    }>;
    score: number;
}

export interface TrendingToken {
    token: TokenData;
    pools: PoolData[];
    events: TokenEvents;
    risk: TokenRisk;
    holders: number;
    volume_5m_change_percent: number;
    volume_4h_change_percent: number;
    program: string;
    buys: number;
    buysCount: number;
    sells: number;
    sellsCount: number;
    txns: {
        total: number;
    };

}

export interface TrendingTokensResponse {
    data: TrendingToken[];
    success: boolean;
}

export type TimeFrameType = '5m' | '15m' | '30m' | '1h' | '6h' | '12h' | '24h';


export interface TopCoinsResponse {
    data: {
        items: any[];
        has_next: boolean;
    };
    success: boolean;
}

// Thêm type definition cho chart type
export type ChartType = '1s' | '5s' | '15s' | '30s' | '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '8h' | '12h' | '1d' | '3d' | '1w' | '1mn';

// Thêm type definition cho market cap type
export type MarketCapType = 'marketcap' | 'pricing';

// Thêm interface cho price response
interface TokenPriceResponse {
    priceUSD: number;
    priceSOL: number;
    timestamp: number;
}

interface SolanaTrackerPriceData {
    price: number;
    priceQuote: number;
    liquidity: number;
    marketCap: number;
    lastUpdated: number;
}

export interface LatestTokenResponse {
    data: TrendingToken[];
    success: boolean;
}

export interface SearchTokenResponse {
    data: TrendingToken[];
    success: boolean;
}

export interface MultiTokenData {
    name: string | null;
    symbol: string | null;
    address: string;
    logo_uri: string | null;
    holders: number;
    buys: number;
    sells: number;
    txns: number;
    volume_1h_usd: number;
    volume_24h_usd: number;
    volume_5m_change_percent: number;
    volume_4h_change_percent: number;
    volume_1h_change_percent: number;
    volume_24h_change_percent: number;
    market_cap: number;
    liquidity: number;
    price: number;
    program: string;
}

export interface MultiTokensResponse {
    data: MultiTokenData[];
    success: boolean;
}

@Injectable()
export class SolanaTrackerService implements OnModuleInit {
    private readonly logger = new Logger(SolanaTrackerService.name);
    private lastProcessedTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    private trackingWallets = new Set<string>();
    private readonly apiKey: string;
    private readonly apiUrl: string;
    private readonly wsUrl: string;
    private ws: WebSocket | null = null;
    private isWsConnected = false;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 10;
    private subscriptions: Map<string, any> = new Map();
    private readonly retryDelays = [1000, 2000, 4000, 8000, 16000]; // Thêm mảng delay cho retry
    private readonly TOKEN_INFO_PREFIX = 'token:info:';

    constructor(
        private readonly copyTradeService: CopyTradeService,
        private readonly configService: ConfigService,
        private readonly cacheService: CacheService,
        @Inject(forwardRef(() => SolanaService))
        private readonly solanaService: SolanaService,
        private readonly solanaTrackingService: SolanaTrackingService,
        private readonly eventEmitter: EventEmitter2,
        @Inject('SOLANA_CONNECTION')
        private readonly connection: Connection,
        private readonly solanaWebSocketService: SolanaWebSocketService,
        private readonly httpService: HttpService
    ) {
        this.apiKey = this.configService.get<string>('SOLANA_TRACKER_API_KEY', '');
        this.apiUrl = this.configService.get<string>('SOLANA_TRACKER_API_URL', 'https://api.solanatracker.io/v1');
        this.wsUrl = this.configService.get<string>('SOLANA_TRACKER_WS_URL', '');
        this.logger.log(`Initialized Solana Tracker with API: ${this.apiUrl}`);

        this.eventEmitter.on('wallet.transaction', async (data) => {
            await this.handleTransaction(data);
        });
    }

    async onModuleInit() {
        console.log("🚀 Solana Copy Trade Tracker is running...");

        // Kiểm tra cấu hình
        if (!this.apiKey) {
            this.logger.warn('SOLANA_TRACKER_API_KEY is not configured. Solana Tracker API features will be disabled.');
        } else {
            // Kiểm tra kết nối đến Solana Tracker API
            try {
                await this.checkApiConnection();
                this.logger.log('Successfully connected to Solana Tracker API');

                // Thiết lập kết nối WebSocket nếu URL được cấu hình
                if (this.wsUrl) {
                    this.connectWebSocket();
                } else {
                    this.logger.warn('SOLANA_TRACKER_WS_URL is not configured. WebSocket features will be disabled.');
                }
            } catch (error) {
                this.logger.error('Failed to connect to Solana Tracker API:', error.message);
            }
        }

        // Khởi động theo dõi
        this.startTracking();
    }

    // Khởi động theo dõi qua WebSocket
    private async startTracking() {
        try {
            const walletMap = await this.getTrackingWalletsByTelegram();

            // Đăng ký theo dõi tất cả các ví
            for (const telegramWallet in walletMap) {
                const walletData = walletMap[telegramWallet];

                for (const { trackingWallet, privateKey } of walletData) {
                    try {
                        // Thêm vào danh sách theo dõi
                        this.trackingWallets.add(trackingWallet);

                        // Đăng ký theo dõi qua WebSocket
                        await this.solanaTrackingService.trackTransactions(
                            trackingWallet,
                            'copy-trade'
                        );

                        console.log(`🔔 Started tracking wallet: ${trackingWallet}`);
                    } catch (error) {
                        console.error(`⚠️ Error tracking wallet ${trackingWallet}:`, error.message);
                    }
                }
            }
        } catch (error) {
            console.error("❌ Error starting tracking:", error.message);
        }
    }

    // Xử lý giao dịch từ hash
    private async processCopyTradeByHash(trackingWallet: string, txHash: string) {
        try {
            // Check if already processed
            const isProcessed = await this.copyTradeService.isTransactionProcessed(txHash);
            if (isProcessed) {
                console.log(`⚠️ Transaction already processed: ${txHash}`);
                return;
            }

            // Tìm thông tin telegram wallet và private key
            const walletMap = await this.getTrackingWalletsByTelegram();
            let telegramWallet = '';
            let privateKey = '';

            for (const tgWallet in walletMap) {
                const walletData = walletMap[tgWallet];
                const found = walletData.find(w => w.trackingWallet === trackingWallet);

                if (found) {
                    telegramWallet = tgWallet;
                    privateKey = found.privateKey;
                    break;
                }
            }

            if (!telegramWallet || !privateKey) {
                console.log(`⚠️ Could not find telegram wallet for tracking wallet: ${trackingWallet}`);
                return;
            }

            // Lấy transaction details từ hash
            const txDetails = await this.connection.getParsedTransaction(txHash, {
                maxSupportedTransactionVersion: 0
            });

            // Phân tích giao dịch để lấy token addresses
            const { inputMint, outputMint } = await this.solanaService.analyzeTransaction(txHash);

            // Xác định loại giao dịch (buy/sell)
            const transactionType = inputMint === "So11111111111111111111111111111111111111112"
                ? 'buy' : 'sell';

            if (transactionType === 'buy') {
                // Copy lệnh mua như bình thường
                const detail = await this.copyTradeService.createCopyTradeDetail({
                    ct_traking_hash: txHash,
                    ct_detail_status: 'wait',
                    ct_detail_time: new Date(),
                    ct_type: 'buy'
                });
                await this.copyTradeService.executeCopyTrade({
                    telegramWallet,
                    trackingWallet,
                    privateKey,
                    transaction: txDetails,
                    detail,
                    inputMint,
                    outputMint
                });

                // Lưu vào position_tracking nếu ct_sell_method là auto hoặc manual
                const copyTrade = await this.copyTradeService.getCopyTrade(trackingWallet);
                if (copyTrade && ['auto', 'manual'].includes(copyTrade.ct_sell_method)) {
                    // Lấy giá và số lượng từ detail
                    const currentPrice = detail.ct_detail_price;
                    const tradeAmount = detail.ct_detail_amount;

                    await this.copyTradeService.createPositionTracking({
                        ct_trade: copyTrade,
                        pt_token_address: outputMint,
                        pt_entry_price: currentPrice,
                        pt_amount: tradeAmount,
                        pt_status: 'open'
                    });
                }
            } else {
                // Khi là lệnh bán, kiểm tra position_tracking
                const positions = await this.copyTradeService.getOpenPositions(trackingWallet, outputMint);

                for (const position of positions) {
                    if (position.ct_trade.ct_sell_method === 'auto') {
                        // Tự động bán với tỉ lệ tương ứng
                        await this.copyTradeService.executeSellOrder(position, 'proportional');
                    } else if (position.ct_trade.ct_sell_method === 'manual') {
                        // Check điều kiện TP/SL
                        const currentPrice = await this.solanaService.getTokenPrice(outputMint);
                        const shouldSell = this.copyTradeService.checkTPSL(
                            position,
                            currentPrice,
                            position.ct_trade.ct_tp,
                            position.ct_trade.ct_sl
                        );

                        if (shouldSell) {
                            // Bán toàn bộ vị thế
                            await this.copyTradeService.executeSellOrder(position, 'full');
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Error processing copy trade:', error);
        }
    }

    // Giữ lại các phương thức cũ để đảm bảo tính tương thích
    async getTrackingWalletsByTelegram(): Promise<Record<string, { trackingWallet: string, privateKey: string }[]>> {
        const activeTrades = await this.copyTradeService.getActiveTrackingWallets();

        const walletMap: Record<string, { trackingWallet: string, privateKey: string }[]> = {};

        activeTrades.forEach(trade => {
            // Thêm điều kiện kiểm tra ct_amount
            if (trade.ct_amount <= 0.001) {
                console.log(`⚠️ Skipping wallet ${trade.ct_tracking_wallet} due to insufficient ct_amount: ${trade.ct_amount}`);
                return; // Skip this iteration
            }

            const telegramWallet = trade.ct_wallet.wallet_id.toString();
            const trackingWallet = trade.ct_tracking_wallet;
            const privateKeyObject = JSON.parse(trade.ct_wallet.wallet_private_key);
            const privateKey = privateKeyObject?.solana; // 🌟 Lấy private key của Solana

            if (!walletMap[telegramWallet]) {
                walletMap[telegramWallet] = [];
            }

            // ✅ Thêm object chứa cả trackingWallet và privateKey
            if (!walletMap[telegramWallet].some(item => item.trackingWallet === trackingWallet)) {
                walletMap[telegramWallet].push({ trackingWallet, privateKey });
            }
        });

        console.log("🔍 Telegram Wallets with Tracking Wallets and Private Keys:", walletMap);
        return walletMap;
    }

    private async handleTransaction(data: any) {
        try {
            const { address, signature } = data;

            this.logger.debug('Received transaction:', { address, signature });

            // Kiểm tra xem có phải ví đang theo dõi không
            if (this.trackingWallets.has(address)) {
                await this.processCopyTradeByHash(address, signature);
            }
        } catch (error) {
            this.logger.error('Error processing transaction:', error);
        }
    }

    /**
     * Kiểm tra kết nối đến Solana Tracker API
     */
    private async checkApiConnection(): Promise<boolean> {
        try {
            const { data } = await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/status`, {
                    headers: {
                        'x-api-key': this.apiKey
                    }
                }).pipe(
                    catchError((error) => {
                        this.logger.error(`Failed to connect to Solana Tracker API: ${error.message}`);
                        throw error;
                    })
                )
            );

            return data?.status === 'ok' || data?.success === true;
        } catch (error) {
            this.logger.error(`Error checking API connection: ${error.message}`);
            return false;
        }
    }

    /**
     * Thiết lập kết nối WebSocket
     */
    private connectWebSocket() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            this.isWsConnected = true;
            this.reconnectAttempts = 0;
            this.logger.log('Connected to Solana Tracker WebSocket');

            // Đăng ký lại các subscription trước đó nếu có
            this.resubscribeAll();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleWebSocketMessage(message);
            } catch (error) {
                this.logger.error(`Error parsing WebSocket message: ${error.message}`);
            }
        });

        this.ws.on('error', (error) => {
            this.logger.error(`WebSocket error: ${error.message}`);
        });

        this.ws.on('close', () => {
            this.isWsConnected = false;
            this.logger.warn('Disconnected from Solana Tracker WebSocket');

            // Thử kết nối lại
            this.attemptReconnect();
        });
    }

    /**
     * Thử kết nối lại WebSocket khi bị ngắt kết nối
     */
    private attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error(`Failed to reconnect WebSocket after ${this.maxReconnectAttempts} attempts`);
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;

        this.logger.log(`Attempting to reconnect WebSocket in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }

    /**
     * Xử lý tin nhắn từ WebSocket
     */
    private handleWebSocketMessage(message: any) {
        if (message.type === 'price') {
            // Xử lý cập nhật giá
            this.eventEmitter.emit('solanatracker.price', message);
            this.updateTokenPriceCache(message.token, message.price);
        } else if (message.type === 'transaction') {
            // Xử lý giao dịch mới
            this.eventEmitter.emit('solanatracker.transaction', message);
        } else if (message.type === 'subscription_success') {
            this.logger.log(`Successfully subscribed to ${message.channel}`);
        } else if (message.type === 'error') {
            this.logger.error(`WebSocket error: ${message.message}`);
        }
    }

    /**
     * Cập nhật cache giá token
     */
    private async updateTokenPriceCache(tokenAddress: string, price: number) {
        await this.cacheService.set(`token_price:${tokenAddress}`, price.toString(), 60);
    }

    /**
     * Đăng ký lại tất cả các subscription
     */
    private resubscribeAll() {
        for (const [key, data] of this.subscriptions.entries()) {
            const [type, address] = key.split(':');

            if (type === 'price') {
                this.subscribeToTokenPrice(address);
            } else if (type === 'transactions') {
                this.subscribeToTransactions(address);
            }
        }
    }

    /**
     * Đăng ký nhận cập nhật giá token
     */
    async subscribeToTokenPrice(tokenAddress: string) {
        if (!this.isWsConnected) {
            this.connectWebSocket();
            // Lưu subscription để đăng ký lại sau khi kết nối
            this.subscriptions.set(`price:${tokenAddress}`, { type: 'price' });
            return;
        }

        const message = {
            action: 'subscribe',
            channel: 'price',
            token: tokenAddress
        };

        if (this.ws) {
            this.ws.send(JSON.stringify(message));
            this.subscriptions.set(`price:${tokenAddress}`, { type: 'price' });
        }
    }

    /**
     * Hủy đăng ký cập nhật giá token
     */
    async unsubscribeFromTokenPrice(tokenAddress: string) {
        if (!this.isWsConnected || !this.ws) {
            return;
        }

        const message = {
            action: 'unsubscribe',
            channel: 'price',
            token: tokenAddress
        };

        this.ws.send(JSON.stringify(message));
        this.subscriptions.delete(`price:${tokenAddress}`);
    }

    /**
     * Đăng ký nhận thông báo giao dịch mới cho một địa chỉ
     */
    async subscribeToTransactions(address: string) {
        if (!this.isWsConnected) {
            this.connectWebSocket();
            // Lưu subscription để đăng ký lại sau khi kết nối
            this.subscriptions.set(`transactions:${address}`, { type: 'transactions' });
            return;
        }

        const message = {
            action: 'subscribe',
            channel: 'transactions',
            address: address
        };

        if (this.ws) {
            this.ws.send(JSON.stringify(message));
            this.subscriptions.set(`transactions:${address}`, { type: 'transactions' });
        }
    }

    /**
     * Hủy đăng ký thông báo giao dịch
     */
    async unsubscribeFromTransactions(address: string) {
        if (!this.isWsConnected || !this.ws) {
            return;
        }

        const message = {
            action: 'unsubscribe',
            channel: 'transactions',
            address: address
        };

        this.ws.send(JSON.stringify(message));
        this.subscriptions.delete(`transactions:${address}`);
    }

    /**
     * Lấy danh sách token trending từ Solana Tracker
     * @param timeframe Time interval (5m, 15m, 30m, 1h, 6h, 12h, 24h)
     * @param limit Số lượng token cần lấy
     */
    async getTrendingTokens(timeframe: TimeFrameType = '24h', limit: number = 100): Promise<TrendingTokensResponse> {
        try {
            // Kiểm tra cache trước
            const cacheKey = `solana_tracker_trending:${timeframe}:${limit}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                this.logger.debug(`Returning cached trending tokens for timeframe ${timeframe}`);
                return JSON.parse(cachedData as string);
            }

            // Nếu không có trong cache, gọi API
            const { data } = await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/tokens/trending/${timeframe}`, {
                    params: { limit },
                    headers: {
                        'x-api-key': this.apiKey
                    }
                }).pipe(
                    catchError((error) => {
                        this.logger.error(`Failed to get trending tokens for timeframe ${timeframe}: ${error.message}`);
                        throw error;
                    })
                )
            );

            // Cache kết quả trong 10 phút
            await this.cacheService.set(cacheKey, JSON.stringify({ data, success: true }), 600);

            return { data, success: true };
        } catch (error) {
            this.logger.error(`Error getting trending tokens: ${error.message}`);
            return { data: [], success: false };
        }
    }

    /**
     * Chuyển đổi dữ liệu từ dạng Solana Tracker sang dạng TopCoins tương thích
     * @param tokens Danh sách token từ Solana Tracker
     * @param maxLimit Số lượng token tối đa
     * @param sortBy Tiêu chí sắp xếp
     * @param sortType Kiểu sắp xếp (asc/desc)
     */
    async convertToTopCoinsFormat(
        tokens: TrendingToken[],
        maxLimit: number = 100,
        sortBy: string = 'market_cap',
        sortType: string = 'desc'
    ): Promise<TopCoinsResponse> {
        try {
            // Get all token addresses
            const tokenAddresses = tokens.map(token => token.token.mint);

            // Get multi tokens data in one call
            const multiTokensData = await this.getMultiTokensData(tokenAddresses);
            const tokensDataMap = new Map(
                multiTokensData.data.map(data => [data.address, data])
            );

            const items: any[] = await Promise.all(tokens.map(async token => {
                // Lấy pool đầu tiên
                const bestPool = token.pools.length > 0 ? token.pools[0] : null;

                // Lấy price change 24h
                const priceChange24h = token.events['24h']?.priceChangePercentage || null;

                // Get token data from multi tokens response
                const tokenData = tokensDataMap.get(token.token.mint);

                return {
                    address: token.token.mint,
                    logo_uri: tokenData?.logo_uri || token.token.image || null,
                    name: token.token.name || null,
                    symbol: token.token.symbol || null,
                    decimals: token.token.decimals,
                    extensions: token.token.description ? { description: token.token.description } : null,
                    market_cap: bestPool?.marketCap?.usd || 0,
                    fdv: bestPool?.tokenSupply ? (bestPool.price.usd * bestPool.tokenSupply) : 0,
                    liquidity: bestPool?.liquidity?.usd || 0,
                    last_trade_unix_time: bestPool?.lastUpdated || 0,
                    volume_1h_usd: tokenData?.volume_1h_usd || 0,
                    volume_1h_change_percent: tokenData?.volume_1h_change_percent || null,
                    volume_24h_usd: tokenData?.volume_24h_usd || 0,
                    volume_24h_change_percent: tokenData?.volume_24h_change_percent || null,
                    trade_24h_count: tokenData?.txns || 0,
                    price: bestPool?.price?.usd || 0,
                    price_change_24h_percent: priceChange24h,
                    holder: tokenData?.holders || null,
                    recent_listing_time: bestPool?.createdAt || null,
                    program: bestPool?.market || "",
                    buys: tokenData?.buys || 0,
                    sells: tokenData?.sells || 0,
                    txns: tokenData?.txns || 0,
                    volume_5m_change_percent: tokenData?.volume_5m_change_percent || 0,
                    volume_4h_change_percent: tokenData?.volume_4h_change_percent || 0
                };
            }));

            // Lọc bỏ các token có program bắt đầu từ "pumpfun"
            const filteredItems = items.filter(item => {
                const program = item.program?.toLowerCase() || '';
                return !program.startsWith('pumpfun');
            });

            // Sắp xếp danh sách token theo tiêu chí
            filteredItems.sort((a, b) => {
                let valueA = a[sortBy];
                let valueB = b[sortBy];

                // Xử lý các trường hợp giá trị null hoặc undefined
                if (valueA === null || valueA === undefined) valueA = 0;
                if (valueB === null || valueB === undefined) valueB = 0;

                if (sortType === 'desc') {
                    return valueB - valueA;
                }
                return valueA - valueB;
            });

            // Giới hạn số lượng kết quả
            const limitedItems = filteredItems.slice(0, maxLimit);

            return {
                success: true,
                data: {
                    items: limitedItems,
                    has_next: filteredItems.length > limitedItems.length
                }
            };
        } catch (error) {
            this.logger.error(`Error converting to TopCoins format: ${error.message}`);
            return {
                success: false,
                data: {
                    items: [],
                    has_next: false
                }
            };
        }
    }

    /**
     * Đóng kết nối WebSocket khi service bị hủy
     */
    onModuleDestroy() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Lấy dữ liệu chart từ Solana Tracker API
     * @param tokenAddress - Địa chỉ token
     * @param type - Time interval (1s, 5s, 15s, 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1mn)
     * @param timeFrom - Start time (Unix timestamp in seconds)
     * @param timeTo - End time (Unix timestamp in seconds)
     * @param marketCap - Nếu truyền 'marketcap' sẽ lấy dữ liệu market cap, ngược lại sẽ lấy dữ liệu price
     * @param removeOutliers - Set to false to disable outlier removal, true by default
     */
    async getChartData(
        tokenAddress: string,
        type?: ChartType,  // Optional time interval
        timeFrom?: number, // Optional start time (Unix timestamp in seconds)
        timeTo?: number,   // Optional end time (Unix timestamp in seconds)
        marketCap?: string, // Optional: 'marketcap' để lấy dữ liệu market cap, ngược lại lấy price
        removeOutliers: boolean = true // Optional: Remove outliers, default true
    ) {
        try {
            const params = new URLSearchParams();

            // Add optional parameters only if they are provided
            if (type) params.append('type', type);

            // Set default timeFrom to 7 days ago if not provided
            const defaultTimeFrom = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60); // 7 days ago in seconds
            params.append('time_from', (timeFrom || defaultTimeFrom).toString());

            // Set default timeTo to current time if not provided
            const defaultTimeTo = Math.floor(Date.now() / 1000); // current time in seconds
            params.append('time_to', (timeTo || defaultTimeTo).toString());

            if (marketCap === 'marketcap') params.append('marketCap', 'marketcap');
            if (!removeOutliers) params.append('removeOutliers', 'false');

            const url = `${this.apiUrl}/chart/${tokenAddress}?${params.toString()}`;

            const response = await this.httpService.axiosRef.get(url, {
                headers: {
                    'x-api-key': this.apiKey
                }
            });

            if (!response.data) {
                throw new Error('No data received from Solana Tracker API');
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Error getting chart data from Solana Tracker: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy giá hiện tại của token từ Solana Tracker API
     * @param tokenAddress Địa chỉ token cần lấy giá
     * @returns Thông tin giá token bao gồm giá USD và SOL
     */
    async getCurrentPrice(tokenAddress: string): Promise<TokenPriceResponse> {
        try {
            if (!this.apiKey) {
                this.logger.error('SOLANA_TRACKER_API_KEY is not configured');
                throw new Error('API key is not configured');
            }

            const cacheKey = `token_price:${tokenAddress}`;
            const cachedPrice = await this.cacheService.get(cacheKey);

            if (cachedPrice) {
                return JSON.parse(cachedPrice as string);
            }

            this.logger.debug(`Fetching current price for ${tokenAddress} from Solana Tracker API`);

            // Lấy giá của token và SOL cùng lúc
            const response = await this.makeRequestWithRetry(() =>
                axios.get<Record<string, SolanaTrackerPriceData>>(
                    `${this.apiUrl}/price/multi`,
                    {
                        params: {
                            tokens: `${tokenAddress},So11111111111111111111111111111111111111112`,
                            priceChanges: true
                        },
                        headers: {
                            'x-api-key': this.apiKey
                        }
                    }
                )
            );

            if (!response.data) {
                this.logger.error(`No data received from Solana Tracker API for token ${tokenAddress}`);
                throw new Error('No data received from API');
            }

            const tokenData = response.data[tokenAddress];
            const solData = response.data['So11111111111111111111111111111111111111112'];

            if (!tokenData || !solData) {
                this.logger.error(`Missing price data for token ${tokenAddress} or SOL`);
                throw new Error('Price data not available');
            }

            const result = {
                priceUSD: tokenData.price,
                priceSOL: tokenData.priceQuote,
                timestamp: Date.now()
            };

            // Cache kết quả trong 30 giây
            await this.cacheService.set(cacheKey, JSON.stringify(result), 30);
            return result;
        } catch (error) {
            this.logger.error(`Error fetching current price for ${tokenAddress}: ${error.message}`);
            if (error.response) {
                this.logger.error(`API Response status: ${error.response.status}`);
                this.logger.error(`API Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Thực hiện request với cơ chế retry
     * @param requestFn Hàm thực hiện request
     * @param retryCount Số lần đã retry
     * @param lastError Lỗi cuối cùng nếu có
     */
    private async makeRequestWithRetry<T>(
        requestFn: () => Promise<T>,
        retryCount = 0,
        lastError?: any
    ): Promise<T> {
        try {
            return await requestFn();
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

    /**
     * Lấy thông tin token từ Solana Tracker API
     * @param tokenAddress Địa chỉ token cần lấy thông tin
     * @returns Thông tin token bao gồm program type
     */
    async getTokenInfo(tokenAddress: string): Promise<{ program: TokenProgram }> {
        try {
            // Check cache first
            const cacheKey = `${this.TOKEN_INFO_PREFIX}${tokenAddress}`;
            const cachedInfo = await this.cacheService.get(cacheKey);
            if (cachedInfo) {
                return JSON.parse(cachedInfo as string);
            }

            // Fetch from API
            const response = await this.makeRequestWithRetry(() =>
                axios.get(`${this.apiUrl}/tokens/${tokenAddress}`, {
                    headers: {
                        'x-api-key': this.apiKey
                    }
                })
            );

            if (!response.data || !response.data.data) {
                throw new Error('Invalid response from Solana Tracker API');
            }

            const tokenData = response.data.data;
            let program: TokenProgram = TokenProgram.OTHER;

            // Map deployer to TokenProgram
            if (tokenData.deployer) {
                const deployerLower = tokenData.deployer.toLowerCase();
                if (deployerLower.includes('pumpfun')) {
                    program = TokenProgram.PUMPFUN;
                } else if (deployerLower.includes('kcm')) {
                    program = TokenProgram.KCM;
                } else if (deployerLower.includes('raydium')) {
                    program = TokenProgram.RAYDIUM;
                } else if (deployerLower.includes('jupiter')) {
                    program = TokenProgram.JUPITER;
                } else if (deployerLower.includes('gmgn')) {
                    program = TokenProgram.GMGN;
                }
            }

            const result = { program };

            // Cache the result
            await this.cacheService.set(cacheKey, JSON.stringify(result), 1800); // Cache for 30 minutes

            return result;
        } catch (error) {
            this.logger.error(`Error getting token info from Solana Tracker: ${error.message}`);
            return { program: TokenProgram.OTHER };
        }
    }

    /**
     * Lấy thông tin chi tiết của token bao gồm metadata và thông tin thị trường
     * @param tokenAddress Địa chỉ token
     */
    async getTokenDetails(tokenAddress: string): Promise<any> {
        try {
            if (!this.apiKey) {
                this.logger.error('SOLANA_TRACKER_API_KEY is not configured');
                throw new Error('API key is not configured');
            }

            const cacheKey = `token:details:${tokenAddress}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return JSON.parse(cachedData as string);
            }

            const response = await this.makeRequestWithRetry(() =>
                axios.get(`${this.apiUrl}/tokens/${tokenAddress}`, {
                    headers: {
                        'x-api-key': this.apiKey
                    }
                })
            );

            const result = response.data;
            await this.cacheService.set(cacheKey, JSON.stringify(result), 300); // Cache for 5 minutes

            return result;
        } catch (error) {
            this.logger.error(`Error getting token details for ${tokenAddress}: ${error.message}`);
            if (error.response) {
                this.logger.error(`API Response status: ${error.response.status}`);
                this.logger.error(`API Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Lấy thông tin pools của token
     * @param tokenAddress Địa chỉ token
     */
    async getTokenPools(tokenAddress: string): Promise<any[]> {
        try {
            const cacheKey = `token:pools:${tokenAddress}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return JSON.parse(cachedData as string);
            }

            const response = await this.makeRequestWithRetry(() =>
                axios.get(`${this.apiUrl}/tokens/${tokenAddress}/pools`, {
                    headers: {
                        'x-api-key': this.apiKey
                    }
                })
            );

            if (!response.data || !response.data.data) {
                throw new Error('Invalid response from Solana Tracker API');
            }

            const result = response.data.data;
            await this.cacheService.set(cacheKey, JSON.stringify(result), 300); // Cache for 5 minutes

            return result;
        } catch (error) {
            this.logger.error(`Error getting token pools: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy lịch sử giao dịch của token
     * @param tokenAddress Địa chỉ token
     * @param limit Số lượng giao dịch cần lấy
     * @param offset Vị trí bắt đầu
     */
    async getTokenTransactions(tokenAddress: string, limit: number = 50, offset: number = 0): Promise<any> {
        try {
            const cacheKey = `token:txs:${tokenAddress}:${limit}:${offset}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return JSON.parse(cachedData as string);
            }

            const response = await this.makeRequestWithRetry(() =>
                axios.get(`${this.apiUrl}/tokens/${tokenAddress}/transactions`, {
                    params: { limit, offset },
                    headers: {
                        'x-api-key': this.apiKey
                    }
                })
            );

            if (!response.data || !response.data.data) {
                throw new Error('Invalid response from Solana Tracker API');
            }

            const result = response.data.data;
            await this.cacheService.set(cacheKey, JSON.stringify(result), 60); // Cache for 1 minute

            return result;
        } catch (error) {
            this.logger.error(`Error getting token transactions: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy thông tin holders của token
     * @param tokenAddress Địa chỉ token
     * @param limit Số lượng holders cần lấy
     * @param offset Vị trí bắt đầu
     */
    async getTokenHolders(tokenAddress: string, limit: number = 50, offset: number = 0): Promise<any> {
        try {
            const cacheKey = `token:holders:${tokenAddress}:${limit}:${offset}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return JSON.parse(cachedData as string);
            }

            const response = await this.makeRequestWithRetry(() =>
                axios.get(`${this.apiUrl}/tokens/${tokenAddress}/holders`, {
                    params: { limit, offset },
                    headers: {
                        'x-api-key': this.apiKey
                    }
                })
            );

            if (!response.data || !response.data.data) {
                throw new Error('Invalid response from Solana Tracker API');
            }

            const result = response.data.data;
            await this.cacheService.set(cacheKey, JSON.stringify(result), 300); // Cache for 5 minutes

            return result;
        } catch (error) {
            this.logger.error(`Error getting token holders: ${error.message}`);
            throw error;
        }
    }


    /**
     * Lấy thông tin holders của token
     * @param tokenAddress Địa chỉ token
     * @param limit Số lượng holders cần lấy
     * @param offset Vị trí bắt đầu
     */
    async getTopTokenHolders(tokenAddress: string, limit: number = 100, offset: number = 0): Promise<any> {
        try {
            const cacheKey = `token:top-holders:${tokenAddress}:${limit}:${offset}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return JSON.parse(cachedData as string);
            }

            const response = await this.makeRequestWithRetry(() =>
                axios.get(`${this.apiUrl}/tokens/${tokenAddress}/holders`, {
                    params: { limit, offset },
                    headers: {
                        'x-api-key': this.apiKey
                    }
                })
            );

            if (!response.data) {
                throw new Error('Invalid response from Solana Tracker API');
            }

            const result = response.data;
            await this.cacheService.set(cacheKey, JSON.stringify(result), 180); // Cache for 3 minutes

            return result;
        } catch (error) {
            this.logger.error(`Error getting token holders: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy danh sách token mới nhất từ Solana Tracker
     * @param limit Số lượng token cần lấy
     */
    async getLatestTokens(limit: number = 100): Promise<LatestTokenResponse> {
        try {
            // Kiểm tra cache trước
            const cacheKey = `solana_tracker_latest:${limit}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                this.logger.debug(`Returning cached latest tokens`);
                return JSON.parse(cachedData as string);
            }

            // Nếu không có trong cache, gọi API
            const { data } = await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/tokens/latest`, {
                    params: { limit },
                    headers: {
                        'x-api-key': this.apiKey
                    }
                }).pipe(
                    catchError((error) => {
                        this.logger.error(`Failed to get latest tokens: ${error.message}`);
                        throw error;
                    })
                )
            );

            // Cache kết quả trong 5 phút
            await this.cacheService.set(cacheKey, JSON.stringify({ data, success: true }), 300);

            return { data, success: true };
        } catch (error) {
            this.logger.error(`Error getting latest tokens: ${error.message}`);
            return { data: [], success: false };
        }
    }

    /**
     * Lấy thống kê của token từ Solana Tracker API
     * @param tokenAddress Địa chỉ token
     */
    async getTokenStats(tokenAddress: string): Promise<any> {
        try {
            const cacheKey = `token:stats:${tokenAddress}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return JSON.parse(cachedData as string);
            }

            const response = await this.makeRequestWithRetry(() =>
                axios.get(`${this.apiUrl}/stats/${tokenAddress}`, {
                    headers: {
                        'x-api-key': this.apiKey
                    }
                })
            );

            if (!response.data) {
                throw new Error('Invalid response from Solana Tracker API');
            }

            const result = response.data;
            await this.cacheService.set(cacheKey, JSON.stringify(result), 300); // Cache for 5 minutes

            return result;
        } catch (error) {
            this.logger.error(`Error getting token stats for ${tokenAddress}: ${error.message}`);
            if (error.response) {
                this.logger.error(`API Response status: ${error.response.status}`);
                this.logger.error(`API Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Tìm kiếm token theo query string
     * @param query Query string để tìm kiếm
     * @param limit Số lượng kết quả tối đa
     */
    async searchTokens(query: string, limit: number = 20): Promise<SearchTokenResponse> {
        try {
            // Kiểm tra cache trước
            const cacheKey = `solana_tracker_search:${query}:${limit}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                this.logger.debug(`Returning cached search results for query: ${query}`);
                return JSON.parse(cachedData as string);
            }

            // Nếu không có trong cache, gọi API
            const { data } = await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/search`, {
                    params: { 
                        query,
                        limit 
                    },
                    headers: {
                        'x-api-key': this.apiKey
                    }
                }).pipe(
                    catchError((error) => {
                        this.logger.error(`Failed to search tokens: ${error.message}`);
                        throw error;
                    })
                )
            );

            // // Cache kết quả trong 5 phút
            await this.cacheService.set(cacheKey, JSON.stringify({ data, success: true }), 300);

            return data;
        } catch (error) {
            this.logger.error(`Error searching tokens: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy dữ liệu PNL của một ví
     * @param walletAddress Địa chỉ ví cần lấy PNL
     * @returns Dữ liệu PNL bao gồm summary và historic.summary
     */
    async getWalletPnl(walletAddress: string): Promise<any> {
        try {
            if (!this.apiKey) {
                this.logger.error('SOLANA_TRACKER_API_KEY is not configured');
                throw new Error('API key is not configured');
            }

            const cacheKey = `wallet:pnl:${walletAddress}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                const parsedData = JSON.parse(cachedData as string);
                return {
                    summary: parsedData.summary,
                    pnl_since: parsedData.pnl_since,
                    historic: {
                        summary: parsedData.historic.summary
                    }
                };
            }

            this.logger.debug(`Fetching PNL data for wallet ${walletAddress} from Solana Tracker API`);

            const response = await this.makeRequestWithRetry(() =>
                axios.get(`${this.apiUrl}/pnl/${walletAddress}?showHistoricPnL=true&hideDetails=true`, {
                    headers: {
                        'x-api-key': this.apiKey
                    }
                })
            );


            if (!response.data) {
                throw new Error('No data received from Solana Tracker API');
            }

            const result = {
                summary: response.data.summary,
                pnl_since: response.data.pnl_since,
                historic: {
                    summary: response.data.historic.summary
                }
            };
            this.logger.debug(`Result: ${JSON.stringify(result)}`);

            // Cache kết quả trong 5 phút
            await this.cacheService.set(cacheKey, JSON.stringify(response.data), 300);

            return result;
        } catch (error) {
            this.logger.error(`Error fetching PNL data for wallet ${walletAddress}: ${error.message}`);
            if (error.response) {
                this.logger.error(`API Response status: ${error.response.status}`);
                this.logger.error(`API Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Lấy danh sách giao dịch token của một ví
     * @param walletAddress Địa chỉ ví cần lấy giao dịch
     * @param cursor Cursor để phân trang
     * @returns Danh sách giao dịch token
     */
    async getWalletTrades(walletAddress: string, cursor?: string): Promise<any> {
        try {
            if (!this.apiKey) {
                this.logger.error('SOLANA_TRACKER_API_KEY is not configured');
                throw new Error('API key is not configured');
            }

            const cacheKey = `wallet:trades:${walletAddress}:${cursor || 'initial'}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return JSON.parse(cachedData as string);
            }

            this.logger.debug(`Fetching trades for wallet ${walletAddress} from Solana Tracker API`);

            const response = await this.makeRequestWithRetry(() =>
                axios.get(`${this.apiUrl}/wallet/${walletAddress}/trades`, {
                    params: { cursor },
                    headers: {
                        'x-api-key': this.apiKey
                    }
                })
            );

            if (!response.data) {
                throw new Error('No data received from Solana Tracker API');
            }

            // Cache kết quả trong 5 phút
            await this.cacheService.set(cacheKey, JSON.stringify(response.data), 300);

            return response.data;
        } catch (error) {
            this.logger.error(`Error fetching trades for wallet ${walletAddress}: ${error.message}`);
            if (error.response) {
                this.logger.error(`API Response status: ${error.response.status}`);
                this.logger.error(`API Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Lấy dữ liệu của nhiều token cùng lúc
     * @param tokenAddresses Mảng địa chỉ token cần lấy dữ liệu
     * @returns Dữ liệu của các token bao gồm: address, holders, buys, sells, txns, events
     */
    async getMultiTokensData(tokenAddresses: string[]): Promise<MultiTokensResponse> {
        try {
            if (!this.apiKey) {
                this.logger.error('SOLANA_TRACKER_API_KEY is not configured');
                throw new Error('API key is not configured');
            }

            // Chia mảng token thành các nhóm nhỏ, mỗi nhóm tối đa 20 token
            const chunkSize = 20;
            const tokenChunks: string[][] = [];
            for (let i = 0; i < tokenAddresses.length; i += chunkSize) {
                tokenChunks.push(tokenAddresses.slice(i, i + 20));
            }

            this.logger.debug(`Processing ${tokenAddresses.length} tokens in ${tokenChunks.length} chunks`);

            // Xử lý từng nhóm token
            const allResults = await Promise.all(
                tokenChunks.map(async (chunk) => {
                    // Tạo cache key từ các địa chỉ token trong chunk
                    const cacheKey = `tokens:multi:${chunk.sort().join(',')}`;
                    const cachedData = await this.cacheService.get(cacheKey);

                    if (cachedData) {
                        return JSON.parse(cachedData as string).data;
                    }

                    this.logger.debug(`Fetching data for chunk: ${chunk.join(', ')}`);

                    try {
                        const response = await this.makeRequestWithRetry(() =>
                            axios.post(
                                `${this.apiUrl}/tokens/multi`,
                                { tokens: chunk },
                                {
                                    headers: {
                                        'x-api-key': this.apiKey,
                                        'Content-Type': 'application/json'
                                    },
                                    timeout: 8000 // 8 giây timeout cho API call chính
                                }
                            )
                        );

                        if (!response.data || !response.data.tokens) {
                            throw new Error('No data received from Solana Tracker API');
                        }

                        // Chỉ lấy các trường cần thiết từ response
                        const filteredData = await Promise.all(
                            Object.entries(response?.data?.tokens).map(async ([address, tokenData]: [string, any]) => {
                                const bestPool = tokenData.pools?.length > 0 ? tokenData.pools[0] : null;
                                let logo_uri = null;

                                // Fetch image với timeout ngắn hơn
                                if (tokenData.token?.uri) {
                                    try {
                                        const { data } = await axios.get(tokenData.token.uri, { 
                                            timeout: 3000, // 3 giây timeout cho việc fetch image
                                            // Thêm headers để tránh CORS và tăng tốc độ
                                            headers: {
                                                'Accept': 'application/json',
                                                'Cache-Control': 'no-cache'
                                            }
                                        });
                                        logo_uri = data?.image || null;
                                    } catch (error) {
                                        // Log lỗi nhưng không ảnh hưởng đến luồng chính
                                        this.logger.warn(`Failed to fetch image from URI for token ${address}: ${error.message}`);
                                    }
                                }

                                return {
                                    address,
                                    name: tokenData.token?.name || null,
                                    symbol: tokenData.token?.symbol || null,
                                    logo_uri,
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
                                    liquidity: bestPool?.liquidity?.usd || 0,
                                    price: bestPool?.price?.usd || 0,
                                    program: bestPool?.market || ""
                                };
                            })
                        );

                        // Cache kết quả trong 3 phút
                        await this.cacheService.set(cacheKey, JSON.stringify({ data: filteredData, success: true }), 180);

                        return filteredData;
                    } catch (error) {
                        // Xử lý lỗi cho từng chunk riêng biệt
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
                            liquidity: 0,
                            price: 0,
                            program: ""
                        }));
                    }
                })
            );

            // Gộp kết quả từ tất cả các chunk
            const combinedData = allResults.flat();

            return {
                data: combinedData,
                success: true
            };
        } catch (error) {
            this.logger.error(`Error in getMultiTokensData: ${error.message}`);
            // Trả về dữ liệu cơ bản cho tất cả token
            return {
                data: tokenAddresses.map(address => ({
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
                    liquidity: 0,
                    price: 0,
                    program: ""
                })),
                success: false
            };
        }
    }
} 