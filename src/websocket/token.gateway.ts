import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject } from '@nestjs/common';
import { TradeService } from '../trade/trade.service';
import { SolanaService } from '../solana/solana.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SolanaListTokenRepository } from '../solana/repositories/solana-list-token.repository';
import { Not, IsNull, SelectQueryBuilder } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { SolanaListToken } from '../solana/entities/solana-list-token.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
@WebSocketGateway({
    namespace: 'token'
})
export class TokenGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(TokenGateway.name);
    private readonly UPDATE_INTERVAL = 10000; // 10 seconds for client updates
    private readonly CACHE_UPDATE_INTERVAL = 7000; // 7 seconds for cache updates
    private readonly PING_INTERVAL = 20000; // 20 seconds
    private globalUpdateInterval: NodeJS.Timeout | null = null;
    private cacheUpdateInterval: NodeJS.Timeout | null = null;
    private lastUpdateTime: number = 0;
    private lastData: any = null;
    private clientSubscriptions = new Map<string, { params: any }>();
    private clientPingIntervals = new Map<string, NodeJS.Timeout>();

    constructor(
        @InjectRepository(SolanaListToken)
        private readonly solanaTokenRepository: SolanaListTokenRepository,
        private readonly tradeService: TradeService,
        private readonly solanaService: SolanaService,
        private readonly eventEmitter: EventEmitter2,
        private readonly dataSource: DataSource
    ) {
        this.logger.log('TokenGateway initialized');
        this.initializeRepository();
    }

    private async initializeRepository() {
        try {
            const count = await this.solanaTokenRepository.count({});
            this.logger.log(`Repository initialized successfully with ${count} tokens`);
        } catch (error) {
            this.logger.error('Failed to initialize repository:', error);
            throw error;
        }
    }

    async onModuleInit() {
        this.logger.log('TokenGateway initialized');
        // Add event listener for token.new events
        this.eventEmitter.on('token.new', async (data) => {
            this.logger.debug('Received token.new event, updating cache');
            if (this.lastData) {
                // Update cache with new token
                const newToken = data.token;
                this.lastData.tokens = [newToken, ...this.lastData.tokens].slice(0, 50);
                this.lastData.total += 1;
                this.lastUpdateTime = Date.now();
                
                // Notify all clients
                await this.updateAllClients();
            }
        });
    }

    async onModuleDestroy() {
        this.stopAllIntervals();
        // Clear all ping intervals
        for (const interval of this.clientPingIntervals.values()) {
            clearInterval(interval);
        }
        this.clientPingIntervals.clear();
        this.cleanupAllSubscriptions();
    }

    private async updateCache() {
        try {
            this.logger.debug('Updating cache...');
            // Fetch with default params to ensure we have a complete dataset
            const result = await this.fetchTokens({
                limit: 50, // Fetch more than needed to handle different client limits
                page: 1,
                verified: undefined,
                random: false
            });
            this.lastData = result;
            this.lastUpdateTime = Date.now();
            this.logger.debug('Cache updated successfully');
        } catch (error) {
            this.logger.error('Error updating cache:', error);
        }
    }

    private async updateAllClients() {
        try {
            this.logger.debug('Starting updateAllClients...');
            
            // Use cached data if available and not too old (less than 10 seconds)
            if (!this.lastData || Date.now() - this.lastUpdateTime > this.UPDATE_INTERVAL) {
                await this.updateCache();
            }

            this.logger.debug(`Updating ${this.clientSubscriptions.size} clients with data`);

            // Emit to all connected clients
            for (const [clientId, subscription] of this.clientSubscriptions.entries()) {
                const client = this.getClientSocket(clientId);
                if (client?.connected) {
                    try {
                        // Apply client's specific params to the shared data
                        const clientParams = subscription.params || {};
                        const page = clientParams.page || 1;
                        const limit = clientParams.limit || 24; // Match client's default
                        const skip = (page - 1) * limit;

                        // Get the appropriate slice of tokens based on client params
                        let tokens = [...this.lastData.tokens];
                        
                        // Apply random if requested
                        if (clientParams.random) {
                            const timestamp = Date.now();
                            const randomSeed = timestamp % 1000000;
                            const maxOffset = Math.max(0, tokens.length - limit);
                            const offset = Math.floor((randomSeed / 1000000) * maxOffset);
                            tokens = tokens.slice(offset, offset + limit);
                        } else {
                            // Apply pagination
                            tokens = tokens.slice(skip, skip + limit);
                        }

                        // Apply verified filter if requested
                        if (clientParams.verified !== undefined) {
                            tokens = tokens.filter(token => token.slt_is_verified === clientParams.verified);
                        }

                        const clientData = {
                            tokens,
                            total: this.lastData.total,
                            metadata: {
                                page,
                                limit,
                                skip,
                                timestamp: new Date()
                            }
                        };

                        this.logger.debug(`Emitting tokenUpdate to client ${clientId} with ${tokens.length} tokens`);
                        client.emit('tokenUpdate', {
                            event: 'tokenUpdate',
                            data: clientData
                        });
                    } catch (error) {
                        this.logger.error(`Error preparing data for client ${clientId}:`, error);
                    }
                } else {
                    this.logger.debug(`Client ${clientId} is not connected, cleaning up`);
                    this.cleanupClientSubscriptions(clientId);
                }
            }

            // If no clients left, stop the intervals
            if (this.clientSubscriptions.size === 0) {
                this.stopAllIntervals();
            }
        } catch (error) {
            this.logger.error('Error updating clients:', error);
        }
    }

    private getClientSocket(clientId: string): Socket | undefined {
        const adapterSockets = (this.server.sockets as any)?.sockets;
        return adapterSockets?.get?.(clientId);
    }

    async handleConnection(client: Socket) {
        this.logger.log(`Client connected to token namespace: ${client.id}`);
        client.emit('connected', { clientId: client.id });

        // Set up ping/pong to keep connection alive
        const pingInterval = setInterval(() => {
            if (client.connected) {
                this.logger.debug(`Sending ping to client ${client.id}`);
                client.emit('ping');
            }
        }, this.PING_INTERVAL);

        this.clientPingIntervals.set(client.id, pingInterval);

        client.on('pong', () => {
            this.logger.debug(`Received pong from client ${client.id}`);
        });

        client.on('disconnect', () => {
            const pingInterval = this.clientPingIntervals.get(client.id);
            if (pingInterval) {
                clearInterval(pingInterval);
                this.clientPingIntervals.delete(client.id);
            }
            this.cleanupClientSubscriptions(client.id);
        });
    }

    async handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected from token namespace: ${client.id}`);
        this.cleanupClientSubscriptions(client.id);
    }

    private cleanupClientSubscriptions(clientId: string) {
        this.clientSubscriptions.delete(clientId);
        this.logger.log(`Cleaned up subscriptions for client ${clientId}`);
        
        // If no clients left, stop the update interval
        if (this.clientSubscriptions.size === 0) {
            this.stopAllIntervals();
        }
    }

    private cleanupAllSubscriptions() {
        for (const [clientId] of this.clientSubscriptions) {
            this.cleanupClientSubscriptions(clientId);
        }
    }

    private async fetchTokens(params: any) {
        try {
            const conditions: any = {
                slt_name: Not(IsNull()),
                slt_symbol: Not(IsNull()),
                slt_logo_url: Not(IsNull())
            };

            if (params?.verified !== undefined) {
                conditions.slt_is_verified = params.verified;
            }

            if (params?.token_address) {
                conditions.slt_address = params.token_address;
            }

            const total = await this.solanaTokenRepository.count({ where: conditions });
            const page = params?.page || 1;
            const limit = params?.limit || 10;
            const skip = (page - 1) * limit;

            let offset = skip;
            if (params?.random) {
                const timestamp = Date.now();
                const randomSeed = timestamp % 1000000;
                const maxOffset = Math.max(0, total - limit);
                offset = Math.floor((randomSeed / 1000000) * maxOffset);
            }

            const tokens = await this.solanaTokenRepository.find({
                where: conditions,
                order: { slt_created_at: 'DESC' },
                skip: offset,
                take: limit
            });

            return { 
                tokens, 
                total,
                metadata: {
                    page,
                    limit,
                    skip,
                    timestamp: new Date()
                }
            };
        } catch (error) {
            this.logger.error(`Error fetching tokens: ${error.message}`);
            return { 
                tokens: [], 
                total: 0,
                metadata: {
                    page: params?.page || 1,
                    limit: params?.limit || 10,
                    skip: params?.skip || 0,
                    timestamp: new Date()
                }
            };
        }
    }

    private startAllIntervals() {
        if (this.globalUpdateInterval || this.cacheUpdateInterval) {
            this.logger.debug('Intervals already running');
            return;
        }

        this.logger.debug('Starting all intervals');
        
        // Start cache update interval
        this.cacheUpdateInterval = setInterval(async () => {
            this.logger.debug('Cache update interval triggered');
            if (this.clientSubscriptions.size > 0) {
                await this.updateCache();
            } else {
                this.stopAllIntervals();
            }
        }, this.CACHE_UPDATE_INTERVAL);

        // Start client update interval
        this.globalUpdateInterval = setInterval(async () => {
            this.logger.debug('Client update interval triggered');
            if (this.clientSubscriptions.size > 0) {
                await this.updateAllClients();
            } else {
                this.stopAllIntervals();
            }
        }, this.UPDATE_INTERVAL);

        // Initial cache update
        this.updateCache();
    }

    private stopAllIntervals() {
        if (this.globalUpdateInterval) {
            clearInterval(this.globalUpdateInterval);
            this.globalUpdateInterval = null;
        }
        if (this.cacheUpdateInterval) {
            clearInterval(this.cacheUpdateInterval);
            this.cacheUpdateInterval = null;
        }
        this.lastData = null;
        this.logger.debug('All intervals stopped');
    }

    @SubscribeMessage('subscribeTokens')
    async handleSubscribeTokens(client: Socket, data: any) {
        try {
            this.logger.log(`Client ${client.id} subscribing to tokens with params:`, data);
            
            // Store subscription with client params
            this.clientSubscriptions.set(client.id, { params: data });
            this.logger.debug(`Stored subscription for client ${client.id}`);

            // Start intervals if not running
            if (!this.globalUpdateInterval && !this.cacheUpdateInterval) {
                this.startAllIntervals();
            }

            // Send initial data immediately
            let clientData;
            if (this.lastData && Date.now() - this.lastUpdateTime <= this.UPDATE_INTERVAL) {
                // Use cached data if available and fresh
                const tokens = [...this.lastData.tokens];
                const page = data.page || 1;
                const limit = data.limit || 24;
                const skip = (page - 1) * limit;

                let filteredTokens = tokens;
                if (data.random) {
                    const timestamp = Date.now();
                    const randomSeed = timestamp % 1000000;
                    const maxOffset = Math.max(0, tokens.length - limit);
                    const offset = Math.floor((randomSeed / 1000000) * maxOffset);
                    filteredTokens = tokens.slice(offset, offset + limit);
                } else {
                    filteredTokens = tokens.slice(skip, skip + limit);
                }

                if (data.verified !== undefined) {
                    filteredTokens = filteredTokens.filter(token => token.slt_is_verified === data.verified);
                }

                clientData = {
                    tokens: filteredTokens,
                    total: this.lastData.total,
                    metadata: {
                        page,
                        limit,
                        skip,
                        timestamp: new Date()
                    }
                };
                this.logger.debug('Using cached data for initial response');
            } else {
                // Fetch fresh data if cache is not available or too old
                const result = await this.fetchTokens(data);
                clientData = {
                    tokens: result.tokens,
                    total: result.total,
                    metadata: {
                        page: data.page || 1,
                        limit: data.limit || 24,
                        skip: data.skip || 0,
                        timestamp: new Date()
                    }
                };
                this.logger.debug('Using fresh data for initial response');
            }

            this.logger.debug(`Sending initial data to client ${client.id} with ${clientData.tokens.length} tokens`);
            client.emit('tokenUpdate', {
                event: 'tokenUpdate',
                data: clientData
            });

        } catch (error) {
            this.logger.error(`Error subscribing to tokens: ${error.message}`);
            this.sendError(client, {
                event: 'error',
                data: { status: 500, message: 'Failed to subscribe to tokens' }
            });
        }
    }

    @SubscribeMessage('unSubscribeTokens')
    async handleUnSubscribeTokens(client: Socket) {
        try {
            this.logger.log(`Client ${client.id} unsubscribing from tokens`);
            this.cleanupClientSubscriptions(client.id);
            client.emit('unSubscribeTokens', {
                event: 'unSubscribeTokens',
                data: { status: 200, message: 'Successfully unsubscribed from tokens' }
            });
        } catch (error) {
            this.logger.error(`Error unsubscribing from tokens: ${error.message}`);
            this.sendError(client, {
                event: 'error',
                data: { status: 500, message: 'Failed to unsubscribe from tokens' }
            });
        }
    }

    private sendError(client: Socket, error: { event: string; data: any }) {
        client.emit(error.event, error.data);
    }
} 