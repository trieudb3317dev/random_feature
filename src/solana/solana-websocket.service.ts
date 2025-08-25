import { Injectable, OnModuleInit, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import WebSocket from 'ws';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '../cache/cache.service';
import { Cron } from '@nestjs/schedule';
import { SolanaListPoolRepository } from '../solana/repositories/solana-list-pool.repository';
import { SolanaListPool } from './entities/solana-list-pool.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';

interface TransactionSignature {
    signature: string;
    slot?: number;
}

interface TransactionBatch {
    signatures: TransactionSignature[];
    transactions: any[];
}

@Injectable()
export class SolanaWebSocketService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SolanaWebSocketService.name);
    private ws: WebSocket;
    private subscriptions: Map<string, number> = new Map();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 1000;
    private isConnected = false;
    private connectionPromise: Promise<void> | null = null;
    private eventListeners: Map<string, (...args: any[]) => void> = new Map();
    private accountSubscriptions: Map<string, Set<string>> = new Map();
    private isHealthy = true;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private pendingRequests = new Map<number, {
        resolve: Function,
        reject: Function,
        timestamp: number,
        retries: number
    }>();
    private readonly requestTimeout = 15000; // 15 seconds
    private readonly maxRequestRetries = 3;
    private activeSubscriptions: Map<string, Set<string>> = new Map(); // wallet -> Set of service IDs
    private subscriptionLastUsed: Map<string, number> = new Map(); // key -> timestamp
    private readonly MAX_SUBSCRIPTIONS = 200; // Giới hạn số lượng subscriptions
    private apiUsageCounter = 0;
    private connection: Connection;
    private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 30000; // 30 seconds
    private readonly MAX_CONCURRENT_REQUESTS = 10;
    private readonly REQUEST_INTERVAL = 100; // ms
    private requestQueue: Array<() => Promise<any>> = [];
    private isProcessingQueue = false;

    constructor(
        private readonly configService: ConfigService,
        private readonly eventEmitter: EventEmitter2,
        @Inject('SOLANA_CONNECTION')
        private readonly solanaConnection: Connection,
        private readonly cacheService: CacheService
    ) {
        const wsUrl = this.configService.get<string>('SOLANA_WSS_URL');
        if (!wsUrl) {
            throw new Error('SOLANA_WSS_URL is not defined');
        }
        this.ws = new WebSocket(wsUrl);
        this.setupWebSocket();

        const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL');
        if (!rpcUrl) {
            throw new Error('SOLANA_RPC_URL is not configured');
        }
        this.connection = new Connection(rpcUrl, 'confirmed');
    }

    private setupWebSocket() {
        this.ws.on('open', () => {
            this.isConnected = true;
            console.log('WebSocket connected');
        });

        this.ws.on('message', (data) => {
            // Handle incoming messages
            this.handleWebSocketMessage(data);
        });

        this.ws.on('close', () => {
            this.isConnected = false;
            this.logger.warn('WebSocket disconnected, attempting to reconnect...');
            this.connect();
        });

        this.ws.on('error', (error) => {
            this.logger.error('WebSocket error:', error);
            this.eventEmitter.emit('websocket.error', error);
        });
    }

    async onModuleInit() {
        await this.connect();
        this.startHealthCheck();
    }

    onModuleDestroy() {
        this.stopHealthCheck();
        this.disconnect();

        // Hủy tất cả event listeners
        for (const [listenerId, listener] of this.eventListeners.entries()) {
            const [eventName] = listenerId.split(':');
            this.eventEmitter.removeListener(eventName, listener);
        }
        this.eventListeners.clear();
    }

    private async connect(): Promise<void> {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = new Promise((resolve, reject) => {
            try {
                const wsEndpoint = this.configService.get<string>('SOLANA_WSS_URL', 'wss://api.mainnet-beta.solana.com');
                console.log(`Connecting to Solana WebSocket: ${wsEndpoint}`);

                this.ws = new WebSocket(wsEndpoint);

                this.ws.on('open', () => {
                    console.log('Solana WebSocket connected');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.resubscribeAll();
                    resolve();
                });

                this.ws.on('message', (data: Buffer) => {
                    try {
                        const response = JSON.parse(data.toString());
                        this.handleWebSocketMessage(response);
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                });

                this.ws.on('error', (error) => {
                    console.error('Solana WebSocket error:', error);
                    if (!this.isConnected) {
                        reject(error);
                    }
                });

                this.ws.on('close', () => {
                    console.log('Solana WebSocket disconnected');
                    this.isConnected = false;
                    this.connectionPromise = null;
                    this.attemptReconnect();
                });
            } catch (error) {
                console.error('Error connecting to Solana WebSocket:', error);
                this.connectionPromise = null;
                reject(error);
            }
        });

        return this.connectionPromise;
    }

    private disconnect() {
        if (this.ws) {
            this.ws.terminate();
            this.isConnected = false;
            this.connectionPromise = null;
        }
    }

    private attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connect().catch(error => {
                console.error('Reconnection failed:', error);
            });
        }, delay);
    }

    private async resubscribeAll() {
        console.log(`Resubscribing to ${this.subscriptions.size} subscriptions`);

        // Tạo bản sao của subscriptions để tránh lỗi khi thay đổi trong quá trình lặp
        const subscriptions = new Map(this.subscriptions);

        // Xóa tất cả subscriptions hiện tại
        this.subscriptions.clear();

        // Đăng ký lại từng subscription
        for (const [key, _] of subscriptions) {
            const [type, address] = key.split(':');

            if (type === 'account') {
                await this.trackTransactions(new PublicKey(address));
            } else if (type === 'transaction') {
                await this.trackTransactionStatus(address);
            } else if (type === 'accountBalance') {
                await this.trackAccountBalance(new PublicKey(address));
            } else if (type === 'accountChanges') {
                await this.trackAccountChanges(new PublicKey(address));
            }
        }
    }

    private handleWebSocketMessage(response: any) {
        // Handle pending request responses
        if (response.id && this.pendingRequests.has(response.id)) {
            const { resolve } = this.pendingRequests.get(response.id)!;
            this.pendingRequests.delete(response.id);

            if (response.error) {
                console.error('WebSocket request error:', response.error);
                // Không resolve ở đây, để retry mechanism xử lý
            } else {
                resolve(response.result);
            }
            return;
        }

        if (response.method === 'accountNotification') {
            const accountAddress = response.params.result.value.pubkey;
            const data = response.params.result.value;

            // Thêm log để debug
            this.logger.debug(`WebSocket message received for ${accountAddress}:`, data);

            if (data.lamports !== undefined) {
                // Emit event với số dư mới
                this.eventEmitter.emit('account.balance.changed', {
                    account: accountAddress,
                    balance: data.lamports,
                    timestamp: Date.now()
                });

                // Cập nhật cache trực tiếp
                this.cacheService.set(
                    `sol_balance:${accountAddress}`,
                    (data.lamports / LAMPORTS_PER_SOL).toString(),
                    30 // TTL 30 seconds
                );
            }
        } else if (response.method === 'signatureNotification') {
            const signature = response.params.result.value.signature;
            const status = response.params.result.value.err ? 'failed' : 'executed';

            this.eventEmitter.emit('transaction.status', {
                signature,
                status,
                slot: response.params.result.context.slot
            });

            // Hủy đăng ký theo dõi transaction sau khi nhận được kết quả
            this.unsubscribe(`transaction:${signature}`);
        } else if (response.method === 'accountChangeNotification') {
            const accountAddress = response.params.result.value.pubkey;
            const data = response.params.result.value;
            const slot = response.params.result.context.slot;

            this.eventEmitter.emit('account.changed', {
                account: accountAddress,
                data,
                slot
            });
        } else if (response.id && this.subscriptions.has(response.id.toString())) {
            // Lưu subscription ID
            const subscriptionId = response.result;
            const requestId = response.id.toString();

            if (subscriptionId) {
                // Tìm key tương ứng với requestId
                for (const [key, id] of this.subscriptions.entries()) {
                    if (id === parseInt(requestId)) {
                        // Cập nhật subscription ID
                        this.subscriptions.set(key, subscriptionId);
                        break;
                    }
                }
            }
        }
    }

    async trackTransactions(accountAddress: PublicKey) {
        await this.ensureConnected();

        const key = `account:${accountAddress.toString()}`;
        if (this.subscriptions.has(key)) {
            return;
        }

        const requestId = Math.floor(Math.random() * 1000000);
        this.subscriptions.set(key, requestId);

        const subscribeMessage = {
            jsonrpc: '2.0',
            id: requestId,
            method: 'accountSubscribe',
            params: [
                accountAddress.toString(),
                {
                    encoding: 'jsonParsed',
                    commitment: 'confirmed'
                }
            ]
        };

        this.ws.send(JSON.stringify(subscribeMessage));
        console.log(`Tracking transactions for account: ${accountAddress.toString()}`);
    }

    async trackTransactionStatus(signature: string) {
        await this.ensureConnected();

        const key = `transaction:${signature}`;
        if (this.subscriptions.has(key)) {
            return;
        }

        const requestId = Math.floor(Math.random() * 1000000);
        this.subscriptions.set(key, requestId);

        const subscribeMessage = {
            jsonrpc: '2.0',
            id: requestId,
            method: 'signatureSubscribe',
            params: [
                signature,
                {
                    commitment: 'confirmed',
                    enableReceivedNotification: false
                }
            ]
        };

        this.ws.send(JSON.stringify(subscribeMessage));
        console.log(`Tracking transaction status: ${signature}`);
    }

    async trackAccountBalance(accountAddress: PublicKey) {
        const accountKey = accountAddress.toString();

        // Kiểm tra xem account đã được theo dõi chưa
        if (this.subscriptions.has(`balance:${accountKey}`)) {
            return;
        }

        // Thêm vào danh sách subscriptions của account
        if (!this.accountSubscriptions.has(accountKey)) {
            this.accountSubscriptions.set(accountKey, new Set());
        }
        this.accountSubscriptions.get(accountKey)!.add(`balance:${accountKey}`);

        try {
            const subscriptionId = await this.sendRequest('accountSubscribe', [
                accountKey,
                {
                    encoding: 'jsonParsed',
                    commitment: 'confirmed'
                }
            ]);

            this.subscriptions.set(`balance:${accountKey}`, subscriptionId);
            console.log(`Tracking balance for account: ${accountKey}`);
        } catch (error) {
            console.error(`Failed to track balance for account ${accountKey}:`, error);
            // Fallback to RPC if WebSocket fails
            this.eventEmitter.emit('websocket.fallback', {
                type: 'accountBalance',
                account: accountKey
            });
        }
    }


    async trackAccountChanges(accountAddress: PublicKey) {
        await this.ensureConnected();

        const key = `accountChanges:${accountAddress.toString()}`;
        if (this.subscriptions.has(key)) {
            return;
        }

        const requestId = Math.floor(Math.random() * 1000000);
        this.subscriptions.set(key, requestId);

        const subscribeMessage = {
            jsonrpc: '2.0',
            id: requestId,
            method: 'accountSubscribe',
            params: [
                accountAddress.toString(),
                {
                    encoding: 'jsonParsed',
                    commitment: 'confirmed'
                }
            ]
        };

        this.ws.send(JSON.stringify(subscribeMessage));
    }

    async unsubscribe(key: string) {
        if (!this.subscriptions.has(key)) {
            return;
        }

        const subscriptionId = this.subscriptions.get(key);
        this.subscriptions.delete(key);

        if (!this.isConnected) {
            return;
        }

        const unsubscribeMessage = {
            jsonrpc: '2.0',
            id: Math.floor(Math.random() * 1000000),
            method: 'unsubscribe',
            params: [subscriptionId]
        };

        this.ws.send(JSON.stringify(unsubscribeMessage));
        console.log(`Unsubscribed from ${key}`);
    }

    private async ensureConnected() {
        if (!this.isConnected) {
            await this.connect();
        }
    }

    // Hàm để hủy đăng ký tất cả các subscription
    async unsubscribeAll() {
        for (const key of this.subscriptions.keys()) {
            await this.unsubscribe(key);
        }
    }

    // Thêm phương thức để đăng ký và quản lý listeners
    registerEventListener(eventName: string, accountId: string, callback: (...args: any[]) => void): string {
        const listenerId = `${eventName}:${accountId}:${Date.now()}`;

        // Lưu trữ listener để có thể remove sau này
        this.eventListeners.set(listenerId, callback);

        // Đăng ký listener với EventEmitter
        this.eventEmitter.on(eventName, callback);

        return listenerId;
    }

    removeEventListener(listenerId: string): boolean {
        const listener = this.eventListeners.get(listenerId);
        if (!listener) return false;

        const [eventName] = listenerId.split(':');
        this.eventEmitter.removeListener(eventName, listener);
        this.eventListeners.delete(listenerId);

        return true;
    }

    // Hàm để hủy tất cả subscriptions của một account
    async unsubscribeAccount(accountAddress: string) {
        if (!this.accountSubscriptions.has(accountAddress)) {
            return;
        }

        const subscriptions = this.accountSubscriptions.get(accountAddress)!;
        for (const subKey of subscriptions) {
            await this.unsubscribe(subKey);
        }

        this.accountSubscriptions.delete(accountAddress);
    }

    // Thêm health check định kỳ
    private startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(() => {
            this.checkHealth();
        }, 30000); // Check every 30 seconds
    }

    private stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    private async checkHealth() {
        if (!this.isConnected) {
            this.isHealthy = false;
            console.log('WebSocket is disconnected, attempting to reconnect...');
            try {
                await this.connect();
                this.isHealthy = true;
            } catch (error) {
                console.error('Failed to reconnect WebSocket:', error);
            }
            return;
        }

        try {
            // Ping the WebSocket server
            const pingResult = await this.ping();
            this.isHealthy = pingResult;

            if (!this.isHealthy) {
                console.log('WebSocket is unhealthy, attempting to reconnect...');
                this.disconnect();
                await this.connect();
            }
        } catch (error) {
            console.error('WebSocket health check failed:', error);
            this.isHealthy = false;

            // Try to reconnect
            try {
                this.disconnect();
                await this.connect();
                this.isHealthy = true;
            } catch (reconnectError) {
                console.error('Failed to reconnect WebSocket:', reconnectError);
            }
        }
    }

    // Thêm phương thức ping để kiểm tra kết nối
    private async ping(): Promise<boolean> {
        return new Promise((resolve) => {
            if (!this.isConnected || !this.ws) {
                resolve(false);
                return;
            }

            const requestId = Math.floor(Math.random() * 1000000);
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                resolve(false);
            }, 5000);

            this.pendingRequests.set(requestId, {
                resolve: (result: any) => {
                    clearTimeout(timeout);
                    resolve(true);
                },
                reject: () => {
                    clearTimeout(timeout);
                    resolve(false);
                },
                timestamp: Date.now(),
                retries: 0
            });

            try {
                const pingMessage = {
                    jsonrpc: '2.0',
                    id: requestId,
                    method: 'getHealth'
                };
                this.ws.send(JSON.stringify(pingMessage));
            } catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                resolve(false);
            }
        });
    }

    // Thêm cơ chế retry cho các request
    private async sendRequest(method: string, params: any[] = []): Promise<any> {
        this.incrementApiUsage();

        if (!this.isHealthy) {
            await this.checkHealth();
            if (!this.isHealthy) {
                throw new Error('WebSocket is not healthy');
            }
        }

        await this.ensureConnected();

        return new Promise((resolve, reject) => {
            const requestId = Math.floor(Math.random() * 1000000);

            const request = {
                jsonrpc: '2.0',
                id: requestId,
                method,
                params
            };

            const timeout = setTimeout(() => {
                const pendingRequest = this.pendingRequests.get(requestId);
                if (!pendingRequest) return;

                this.pendingRequests.delete(requestId);

                if (pendingRequest.retries < this.maxRequestRetries) {
                    console.log(`Request ${method} timed out, retrying (${pendingRequest.retries + 1}/${this.maxRequestRetries})...`);

                    // Retry the request
                    this.sendRequest(method, params)
                        .then(resolve)
                        .catch(reject);
                } else {
                    console.error(`Request ${method} failed after ${this.maxRequestRetries} retries`);
                    reject(new Error(`Request timed out after ${this.maxRequestRetries} retries`));
                }
            }, this.requestTimeout);

            this.pendingRequests.set(requestId, {
                resolve: (result: any) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                reject: (error: any) => {
                    clearTimeout(timeout);
                    reject(error);
                },
                timestamp: Date.now(),
                retries: 0
            });

            try {
                this.ws.send(JSON.stringify(request));
            } catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(error);
            }
        });
    }

    async trackTransaction(signature: string) {
        try {
            // Thay thế this.connection bằng this.solanaConnection
            const subscriptionId = await this.solanaConnection.onSignature(
                signature,
                (result, context) => {
                    const status = result.err ? 'error' : 'success';

                    // Emit sự kiện với trạng thái giao dịch
                    this.eventEmitter.emit('transaction.status', {
                        signature,
                        status,
                        result,
                        context
                    });
                },
                'confirmed'
            );

            // Lưu subscription ID để có thể hủy sau này
            this.subscriptions.set(`tx:${signature}`, subscriptionId);

            return subscriptionId;
        } catch (error) {
            console.error(`Error tracking transaction ${signature}:`, error);

            // Emit sự kiện fallback để xử lý bằng RPC
            this.eventEmitter.emit('websocket.fallback', {
                type: 'transaction',
                signature
            });

            throw error;
        }
    }

    // Thêm phương thức theo dõi API usage
    private incrementApiUsage() {
        this.apiUsageCounter++;

        if (this.apiUsageCounter % 100 === 0) {
            this.logger.log(`API usage counter: ${this.apiUsageCounter}`);
            // Lưu vào cache để có thể theo dõi qua các lần restart
            this.cacheService.set('api_usage_counter', this.apiUsageCounter.toString(), 86400);
        }
    }

    // Thêm phương thức cleanup subscriptions
    @Cron('0 */15 * * * *') // Mỗi 15 phút
    async cleanupSubscriptions() {

        const now = Date.now();
        const unusedThreshold = 30 * 60 * 1000; // 30 phút
        let cleanedCount = 0;

        // Tạo bản sao để tránh lỗi khi xóa trong quá trình lặp
        const subscriptionsToCheck = new Map(this.subscriptions);

        for (const [key, subscriptionId] of subscriptionsToCheck.entries()) {
            const lastUsed = this.subscriptionLastUsed.get(key) || 0;

            // Nếu subscription không được sử dụng trong 30 phút
            if (now - lastUsed > unusedThreshold) {
                try {
                    await this.solanaConnection.removeAccountChangeListener(subscriptionId);
                    this.subscriptions.delete(key);
                    this.subscriptionLastUsed.delete(key);

                    // Nếu là wallet subscription, cập nhật activeSubscriptions
                    if (this.activeSubscriptions.has(key)) {
                        this.activeSubscriptions.delete(key);
                    }

                    cleanedCount++;
                } catch (error) {
                    this.logger.error(`Error removing subscription ${key}:`, error);
                }
            }
        }
    }

    // Cập nhật phương thức subscribeToWalletTransactions để giới hạn số lượng subscriptions
    async subscribeToWalletTransactions(walletAddress: string, serviceId: string): Promise<void> {
        try {
            // Cập nhật thời gian sử dụng gần nhất
            this.subscriptionLastUsed.set(walletAddress, Date.now());

            if (!this.activeSubscriptions.has(walletAddress)) {
                // Kiểm tra giới hạn số lượng subscriptions
                if (this.subscriptions.size >= this.MAX_SUBSCRIPTIONS) {
                    this.logger.warn(`Maximum subscription limit (${this.MAX_SUBSCRIPTIONS}) reached. Using fallback for ${walletAddress}`);
                    this.eventEmitter.emit('websocket.fallback', {
                        type: 'accountLogs',
                        account: walletAddress,
                        serviceId
                    });
                    return;
                }

                const pubkey = new PublicKey(walletAddress);
                const subscriptionId = await this.solanaConnection.onLogs(
                    pubkey,
                    (logs) => {
                        // Cập nhật thời gian sử dụng gần nhất khi nhận được logs
                        this.subscriptionLastUsed.set(walletAddress, Date.now());

                        // Chỉ emit khi có signature
                        if (logs.signature) {
                            this.eventEmitter.emit('wallet.transaction', {
                                address: walletAddress,
                                signature: logs.signature,
                                accountInfo: {
                                    logs: logs.logs,
                                    err: logs.err
                                },
                                serviceId
                            });
                        }
                    },
                    'confirmed'
                );
                this.subscriptions.set(walletAddress, subscriptionId);
                this.activeSubscriptions.set(walletAddress, new Set([serviceId]));
            } else {
                this.activeSubscriptions.get(walletAddress)?.add(serviceId);
            }
            this.logger.log(`${serviceId} subscribed to wallet ${walletAddress}`);
        } catch (error) {
            this.logger.error(`Error subscribing to wallet ${walletAddress}:`, error);
            throw error;
        }
    }

    // Thêm phương thức log subscription stats
    @Cron('0 */5 * * * *') // Mỗi 5 phút
    async logSubscriptionStats() {
        // Log chi tiết các wallet có nhiều subscribers
        const topWallets = Array.from(this.activeSubscriptions.entries())
            .filter(([_, subscribers]) => subscribers.size > 1)
            .sort(([_, a], [__, b]) => b.size - a.size)
            .slice(0, 5);

        if (topWallets.length > 0) {
            this.logger.log(`Top wallets by subscriber count:`);
            for (const [wallet, subscribers] of topWallets) {
                this.logger.log(`- ${wallet}: ${subscribers.size} subscribers`);
            }
        }
    }

    async unsubscribeFromWallet(walletAddress: string, serviceId: string): Promise<void> {
        try {
            const subscribers = this.activeSubscriptions.get(walletAddress);
            if (subscribers) {
                subscribers.delete(serviceId);
                this.logger.log(`${serviceId} unsubscribed from wallet ${walletAddress}`);

                // Nếu không còn ai theo dõi ví này
                if (subscribers.size === 0) {
                    const subscriptionId = this.subscriptions.get(walletAddress);
                    if (subscriptionId) {
                        await this.solanaConnection.removeOnLogsListener(subscriptionId);
                        this.subscriptions.delete(walletAddress);
                        this.subscriptionLastUsed.delete(walletAddress);
                    }
                    this.activeSubscriptions.delete(walletAddress);
                    this.logger.log(`Removed subscription for wallet ${walletAddress}`);
                }
            }
        } catch (error) {
            this.logger.error(`Error unsubscribing from wallet ${walletAddress}:`, error);
        }
    }

    async trackTokenPrice(tokenAddress: string) {
        try {
            // Thay vì truy vấn database, sử dụng API hoặc RPC
            const solAddress = 'So11111111111111111111111111111111111111112';

            // Lấy thông tin pool từ API hoặc cache
            const poolInfo = await this.getPoolInfoForToken(tokenAddress, solAddress);

            if (poolInfo && poolInfo.poolId) {
                // Đăng ký theo dõi thay đổi account
                const pubkey = new PublicKey(poolInfo.poolId);
                this.trackAccountChanges(pubkey);

                // Đăng ký event listener riêng
                this.eventEmitter.on(`account:${pubkey.toString()}`, (data) => {
                    this.updateTokenPrice(tokenAddress, poolInfo, data);
                });
            } else {
                console.log(`No pool found for token ${tokenAddress}`);
            }
        } catch (error) {
            console.error(`Error tracking token price for ${tokenAddress}:`, error);
        }
    }

    // Thêm phương thức mới để lấy thông tin pool
    private async getPoolInfoForToken(tokenAddress: string, solAddress: string) {
        try {
            // Thử lấy từ cache trước
            const cacheKey = `pool_info:${tokenAddress}`;
            const cachedInfo = await this.cacheService.get(cacheKey);

            if (cachedInfo) {
                return JSON.parse(cachedInfo as string);
            }

            // Nếu không có trong cache, lấy từ API
            // Đây là ví dụ, thay thế bằng API thực tế của bạn
            const response = await fetch(`https://api.raydium.io/v2/main/pools`);
            if (response.ok) {
                const pools = await response.json();

                // Tìm pool chứa token và SOL
                const pool = pools.find(p =>
                    (p.baseMint === tokenAddress && p.quoteMint === solAddress) ||
                    (p.baseMint === solAddress && p.quoteMint === tokenAddress)
                );

                if (pool) {
                    const poolInfo = {
                        poolId: pool.id,
                        isSolTokenA: pool.baseMint === solAddress,
                        baseReserve: pool.baseReserve,
                        quoteReserve: pool.quoteReserve
                    };

                    // Lưu vào cache
                    await this.cacheService.set(cacheKey, JSON.stringify(poolInfo), 3600);
                    return poolInfo;
                }
            }

            return null;
        } catch (error) {
            console.error(`Error getting pool info for ${tokenAddress}:`, error);
            return null;
        }
    }

    // Cập nhật phương thức updateTokenPrice
    private updateTokenPrice(tokenAddress: string, poolInfo: any, data: any) {
        try {
            // Tính toán giá mới từ dữ liệu pool
            let priceInSol;

            if (poolInfo.isSolTokenA) {
                // SOL là token A (base)
                priceInSol = data.baseReserve / data.quoteReserve;
            } else {
                // SOL là token B (quote)
                priceInSol = data.quoteReserve / data.baseReserve;
            }

            // Lưu vào cache
            this.cacheService.set(`token_price_sol:${tokenAddress}`, priceInSol.toString(), 300);

            // Phát sự kiện giá thay đổi
            this.eventEmitter.emit('token.price.changed', {
                token: tokenAddress,
                priceInSol: priceInSol
            });
        } catch (error) {
            console.error('Error updating token price:', error);
        }
    }

    async getSolPrice(): Promise<number> {
        try {
            // Kiểm tra cache trước
            const cachedPrice = this.priceCache.get('SOL');
            if (cachedPrice && Date.now() - cachedPrice.timestamp < this.CACHE_TTL) {
                return cachedPrice.price;
            }

            // Lấy giá SOL từ QuickNode
            const response = await axios.get('https://api.quicknode.com/solana/price');
            if (response.status === 200 && response.data?.price) {
                const price = parseFloat(response.data.price);

                // Cập nhật cache
                this.priceCache.set('SOL', {
                    price,
                    timestamp: Date.now()
                });

                return price;
            }
            throw new Error('Invalid response from QuickNode price API');
        } catch (error) {
            this.logger.error(`Error getting SOL price: ${error.message}`);
            throw error;
        }
    }

    async getTokenPrice(tokenAddress: string): Promise<number> {
        try {
            // Kiểm tra cache trước
            const cachedPrice = this.priceCache.get(tokenAddress);
            if (cachedPrice && Date.now() - cachedPrice.timestamp < this.CACHE_TTL) {
                return cachedPrice.price;
            }

            // Lấy giá token từ QuickNode
            const response = await axios.get(`https://api.quicknode.com/solana/token/${tokenAddress}/price`);
            if (response.status === 200 && response.data?.price) {
                const price = parseFloat(response.data.price);

                // Cập nhật cache
                this.priceCache.set(tokenAddress, {
                    price,
                    timestamp: Date.now()
                });

                return price;
            }
            throw new Error('Invalid response from QuickNode token price API');
        } catch (error) {
            this.logger.error(`Error getting token price for ${tokenAddress}: ${error.message}`);
            throw error;
        }
    }

    private async processRequestQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift();
            if (request) {
                try {
                    await request();
                    await new Promise(resolve => setTimeout(resolve, this.REQUEST_INTERVAL));
                } catch (error) {
                    this.logger.error('Error processing request:', error);
                }
            }
        }

        this.isProcessingQueue = false;
    }

    private enqueueRequest(request: () => Promise<any>): Promise<any> {
        return new Promise((resolve, reject) => {
            this.requestQueue.push(async () => {
                try {
                    const result = await request();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
            this.processRequestQueue();
        });
    }

    public async getHistoricalTransactions(tokenAddress: string, limit: number = 100): Promise<any[]> {
        try {
            // Check cache first
            const cacheKey = `historical_tx:${tokenAddress}:${limit}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                this.logger.log(`Returning cached historical transactions for ${tokenAddress}`);
                return JSON.parse(cachedData as string);
            }

            this.logger.log(`Fetching historical transactions for ${tokenAddress} using RPC`);

            // Use RPC connection instead of WebSocket
            const signatures = await this.solanaConnection.getSignaturesForAddress(
                new PublicKey(tokenAddress),
                { limit }
            );

            // Tăng batch size lên để giảm số lượng request
            const batchSize = 50;
            const batches: Array<TransactionSignature[]> = [];
            for (let i = 0; i < signatures.length; i += batchSize) {
                batches.push(signatures.slice(i, i + batchSize));
            }

            const transactions: Array<any> = [];

            // Xử lý từng batch với delay
            for (const batch of batches) {
                try {
                    // Thêm delay giữa các batch
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const batchTransactions = await Promise.all(
                        batch.map(sig =>
                            this.solanaConnection.getTransaction(sig.signature, {
                                maxSupportedTransactionVersion: 0
                            })
                        )
                    );

                    // Lọc và thêm các transaction hợp lệ
                    const validTransactions = batchTransactions.filter(tx => tx !== null);
                    transactions.push(...validTransactions);

                    this.logger.log(`Processed batch of ${validTransactions.length} transactions`);

                } catch (error) {
                    this.logger.error(`Error processing batch: ${error.message}`);
                    // Nếu gặp lỗi rate limit, tăng delay
                    if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                    // Continue with next batch even if one fails
                }
            }

            // Cache the result for 1 hour
            if (transactions.length > 0) {
                await this.cacheService.set(cacheKey, JSON.stringify(transactions), 3600);
            }

            return transactions;
        } catch (error) {
            this.logger.error(`Error getting historical transactions: ${error.message}`);
            throw error;
        }
    }
} 