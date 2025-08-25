import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SolanaListToken, TokenProgram } from './entities/solana-list-token.entity';
import { TokenMetadataService } from './token-metadata.service';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import WebSocket from 'ws';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';

interface TokenQueueItem {
    mint: string;
    name: string;
    symbol: string;
    logo: string | null;
    signature: string;
    traderPublicKey: string;
    pool?: string;
    uri?: string;
    initialBuy?: number;
    marketCapSol?: number;
    createdAt: number;
    metadataFetched: boolean;
    retryCount?: number;
}

@Injectable()
export class TokenListenPumpfunService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TokenListenPumpfunService.name);
    private ws: WebSocket | null = null;
    private isConnected = false;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private readonly RECONNECT_INTERVAL = 5000;
    private readonly HEARTBEAT_INTERVAL = 30000;
    private readonly BATCH_PROCESS_INTERVAL = 3000; // Xử lý batch mỗi 3 giây
    private readonly QUEUE_LIFETIME = 30000; // 30 seconds
    private readonly MAX_BATCH_SIZE = 20; // Giới hạn số lượng token xử lý mỗi batch
    private readonly MAX_METADATA_FETCH_PER_BATCH = 5; // Giới hạn số lượng metadata fetch mỗi batch
    private readonly MAX_RETRY_ATTEMPTS = 3; // Số lần thử lại tối đa cho mỗi token
    private readonly MAX_FAILED_ATTEMPTS = 10; // Số lần thất bại tối đa trước khi kích hoạt circuit breaker
    private readonly CIRCUIT_BREAKER_RESET_TIME = 60000; // 1 phút reset circuit breaker

    private heartbeatInterval: NodeJS.Timeout;
    private batchProcessInterval: NodeJS.Timeout;
    private tokenQueue: Map<string, TokenQueueItem> = new Map();
    private failedAttempts = 0;
    private circuitBreakerActive = false;
    private circuitBreakerTimeout: NodeJS.Timeout | null = null;
    private readonly WEBSOCKET_URL = 'wss://pumpportal.fun/api/data';

    constructor(
        @InjectRepository(SolanaListToken)
        private readonly solanaListTokenRepository: Repository<SolanaListToken>,
        @InjectRepository(ListWallet)
        private readonly listWalletRepository: Repository<ListWallet>,
        private readonly tokenMetadataService: TokenMetadataService,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    async onModuleInit() {
        await this.connect();
        this.startBatchProcessing();
    }

    async onModuleDestroy() {
        this.disconnect();
        this.stopBatchProcessing();
        if (this.circuitBreakerTimeout) {
            clearTimeout(this.circuitBreakerTimeout);
        }
    }

    private startBatchProcessing() {
        this.batchProcessInterval = setInterval(async () => {
            await this.processTokenQueue();
        }, this.BATCH_PROCESS_INTERVAL);
    }

    private stopBatchProcessing() {
        if (this.batchProcessInterval) {
            clearInterval(this.batchProcessInterval);
        }
    }

    private async fetchMetadata(uri: string): Promise<{ image?: string }> {
        try {
            if (uri.startsWith('https://')) {
                try {
                    const response = await axios.get(uri, {
                        timeout: 5000
                    });
                    if (response.data) {
                        return response.data;
                    }
                } catch (error) {
                    // Xóa log lỗi
                }
            }

            const gateways = [
                'https://metadata.pumplify.eu/data/',
                'https://ipfs.io/ipfs/',
                'https://gateway.ipfs.io/ipfs/',
                'https://cloudflare-ipfs.com/ipfs/',
                'https://dweb.link/ipfs/',
                'https://ipfs.infura.io/ipfs/'
            ];

            let cid = uri;
            if (uri.startsWith('ipfs://')) {
                cid = uri.replace('ipfs://', '');
            } else if (uri.startsWith('https://ipfs.io/ipfs/')) {
                cid = uri.replace('https://ipfs.io/ipfs/', '');
            } else if (uri.startsWith('https://metadata.pumplify.eu/data/')) {
                cid = uri.replace('https://metadata.pumplify.eu/data/', '');
            }
            
            for (const gateway of gateways) {
                try {
                    const response = await axios.get(`${gateway}${cid}`, {
                        timeout: 5000
                    });
                    if (response.data) {
                        return response.data;
                    }
                } catch (error) {
                    continue;
                }
            }

            return {};
        } catch (error) {
            return {};
        }
    }

    private async processTokenQueue() {
        if (this.tokenQueue.size === 0 || this.circuitBreakerActive) return;

        try {
            const now = Date.now();
            const tokens = Array.from(this.tokenQueue.values());
            
            // Cleanup expired tokens
            for (const token of tokens) {
                if (now - token.createdAt > this.QUEUE_LIFETIME) {
                    this.tokenQueue.delete(token.mint);
                }
            }

            // Get remaining tokens with URI
            const remainingTokens = Array.from(this.tokenQueue.values())
                .filter(token => token.uri && token.uri.length > 0)
                .slice(0, this.MAX_BATCH_SIZE);
            
            if (remainingTokens.length === 0) return;

            // Process metadata in smaller batches
            const tokensNeedingMetadata = remainingTokens
                .filter(token => !token.metadataFetched && token.uri)
                .slice(0, this.MAX_METADATA_FETCH_PER_BATCH);

            for (const token of tokensNeedingMetadata) {
                if (!token.uri) continue;
                try {
                    const metadata = await this.fetchMetadata(token.uri);
                    if (metadata.image) {
                        token.logo = metadata.image;
                    }
                    token.metadataFetched = true;
                    this.failedAttempts = Math.max(0, this.failedAttempts - 1);
                } catch (error) {
                    token.retryCount = (token.retryCount || 0) + 1;
                    if (token.retryCount >= this.MAX_RETRY_ATTEMPTS) {
                        this.tokenQueue.delete(token.mint);
                    }
                    this.failedAttempts++;
                }
            }

            if (this.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
                this.activateCircuitBreaker();
                return;
            }

            // Check existing tokens - More thorough check
            for (const token of remainingTokens) {
                try {
                    // Check by address
                    const existingByAddress = await this.solanaListTokenRepository.findOne({
                        where: { slt_address: token.mint }
                    });
                    if (existingByAddress) {
                        this.logger.debug(`Token ${token.mint} already exists by address`);
                        this.tokenQueue.delete(token.mint);
                        continue;
                    }

                    // Check by transaction hash
                    const existingByHash = await this.solanaListTokenRepository.findOne({
                        where: { slt_transaction_hash: token.signature }
                    });
                    if (existingByHash) {
                        this.logger.debug(`Token ${token.mint} already exists by transaction hash`);
                        this.tokenQueue.delete(token.mint);
                        continue;
                    }
                } catch (error) {
                    this.logger.error(`Error checking token existence: ${error.message}`);
                    this.tokenQueue.delete(token.mint);
                }
            }

            // Get remaining tokens after existence check
            const tokensToSave = Array.from(this.tokenQueue.values())
                .filter(token => token.uri && token.uri.length > 0)
                .slice(0, this.MAX_BATCH_SIZE);

            if (tokensToSave.length === 0) return;

            // Get wallet information
            const traderPublicKeys = tokensToSave.map(t => t.traderPublicKey);
            const wallets = await this.listWalletRepository.find({
                where: { wallet_solana_address: In(traderPublicKeys) }
            });
            const walletMap = new Map(wallets.map(w => [w.wallet_solana_address, w]));

            // Create and save token entities
            const tokenEntities = tokensToSave.map(token => {
                const wallet = walletMap.get(token.traderPublicKey);
                let program = TokenProgram.OTHER;
                
                if (token.pool) {
                    const poolLower = token.pool.toLowerCase();
                    if (poolLower === 'pump' || poolLower === 'pumpfun') {
                        program = TokenProgram.PUMPFUN;
                    } else if (Object.values(TokenProgram).includes(poolLower as TokenProgram)) {
                        program = TokenProgram.PUMPFUN;
                    }
                }

                const entity = new SolanaListToken();
                entity.slt_name = token.name;
                entity.slt_symbol = token.symbol;
                entity.slt_address = token.mint;
                entity.slt_decimals = 9;
                entity.slt_metadata_uri = token.uri || '';
                entity.slt_program = program;
                entity.slt_is_verified = true;
                entity.slt_create_check = false;
                entity.slt_initial_liquidity = token.initialBuy || 0;
                entity.slt_market_cap = token.marketCapSol || 0;
                entity.slt_transaction_hash = token.signature;
                entity.slt_logo_url = token.logo;
                entity.slt_wallet_id = wallet ? wallet.wallet_id : null;

                return entity;
            });

            // Save tokens one by one to handle duplicates gracefully
            for (const entity of tokenEntities) {
                try {
                    const savedToken = await this.solanaListTokenRepository.save(entity);
                    
                    const wallet = wallets.find(w => w.wallet_id === savedToken.slt_wallet_id);
                    this.eventEmitter.emit('token.new', {
                        token: savedToken,
                        metadata: {
                            timestamp: new Date(),
                            source: 'pumpfun',
                            wallet
                        }
                    });

                    if (savedToken.slt_metadata_uri && savedToken.slt_metadata_uri.length > 0 && savedToken.slt_wallet_id) {
                        await this.tokenMetadataService.addToQueue(
                            savedToken.slt_address,
                            savedToken.slt_metadata_uri,
                            savedToken.slt_wallet_id
                        );
                    }

                    this.tokenQueue.delete(savedToken.slt_address);
                } catch (error) {
                    if (error.code === '23505') { // PostgreSQL duplicate key error code
                        this.logger.debug(`Token ${entity.slt_address} already exists, skipping`);
                        this.tokenQueue.delete(entity.slt_address);
                    } else {
                        this.logger.error(`Error saving token ${entity.slt_address}: ${error.message}`);
                        this.failedAttempts++;
                    }
                }
            }

            // Reset failed attempts on successful batch
            this.failedAttempts = 0;

        } catch (error) {
            this.logger.error('Error processing token queue:', error);
            this.failedAttempts++;
            
            if (this.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
                this.activateCircuitBreaker();
            }
        }
    }

    private activateCircuitBreaker() {
        this.circuitBreakerActive = true;
        this.logger.warn('Circuit breaker activated due to too many failures');
        
        if (this.circuitBreakerTimeout) {
            clearTimeout(this.circuitBreakerTimeout);
        }
        
        this.circuitBreakerTimeout = setTimeout(() => {
            this.circuitBreakerActive = false;
            this.failedAttempts = 0;
            this.logger.log('Circuit breaker reset');
        }, this.CIRCUIT_BREAKER_RESET_TIME);
    }

    private async handleNewToken(data: any) {
        try {
            if (!data.mint || !data.name || !data.symbol) {
                return;
            }

            const existingQueueItem = this.tokenQueue.get(data.mint);
            if (existingQueueItem) {
                if (data.logo && data.logo !== existingQueueItem.logo) {
                    existingQueueItem.logo = data.logo;
                }
                existingQueueItem.createdAt = Date.now();
            } else {
                this.tokenQueue.set(data.mint, {
                    mint: data.mint,
                    name: data.name,
                    symbol: data.symbol,
                    logo: null,
                    signature: data.signature,
                    traderPublicKey: data.traderPublicKey,
                    pool: data.pool,
                    uri: data.uri,
                    initialBuy: data.initialBuy,
                    marketCapSol: data.marketCapSol,
                    createdAt: Date.now(),
                    metadataFetched: false
                });
            }
        } catch (error) {
            // Xóa log lỗi
        }
    }

    private async connect() {
        try {
            if (this.ws) {
                this.disconnect();
            }

            this.ws = new WebSocket(this.WEBSOCKET_URL, {
                headers: {
                    'Origin': 'https://pumpportal.fun',
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
                    'Sec-WebSocket-Version': '13'
                }
            });

            this.ws.on('open', () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                this.subscribeToEvents();
            });

            this.ws.on('message', async (data: any) => {
                try {
                    const messageStr = Buffer.isBuffer(data) ? data.toString() : data;
                    const message = JSON.parse(messageStr);

                    if (message.errors) {
                        if (message.errors.includes('Failed to subscribe')) {
                            setTimeout(() => this.subscribeToEvents(), 5000);
                        }
                        return;
                    }

                    if (message.signature && message.mint) {
                        await this.handleNewToken(message);
                    }
                } catch (error) {
                    // Xóa log lỗi
                }
            });

            this.ws.on('close', (code: number, reason: string) => {
                this.isConnected = false;
                this.stopHeartbeat();
                this.handleReconnect();
            });

            this.ws.on('error', (error) => {
                this.isConnected = false;
                this.stopHeartbeat();
                this.handleReconnect();
            });

        } catch (error) {
            // Xóa log lỗi
            this.handleReconnect();
        }
    }

    private handleReconnect() {
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), this.RECONNECT_INTERVAL);
        }
    }

    private startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
                const heartbeat = {
                    type: 'ping',
                    timestamp: Date.now()
                };
                this.ws.send(JSON.stringify(heartbeat));
            }
        }, this.HEARTBEAT_INTERVAL);
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
    }

    private subscribeToEvents() {
        if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
            const subscribeMessage = {
                method: "subscribeNewToken",
                params: {
                    type: "new_token"
                }
            };
            this.ws.send(JSON.stringify(subscribeMessage));
        }
    }

    private disconnect() {
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.isConnected = false;
            this.stopHeartbeat();
            this.ws = null;
        }
    }
} 