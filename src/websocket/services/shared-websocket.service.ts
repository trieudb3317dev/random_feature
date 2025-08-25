import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket from 'ws';
import EventEmitter from 'eventemitter3';
import { ChartType } from '../../on-chain/solana-tracker.service';

@Injectable()
export class SharedWebSocketService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SharedWebSocketService.name);
    private socket: WebSocket | null = null;
    private transactionSocket: WebSocket | null = null;
    private reconnectAttempts = 0;
    private readonly reconnectDelay = 2500;
    private readonly reconnectDelayMax = 4500;
    private readonly randomizationFactor = 0.5;
    private readonly emitter = new EventEmitter();
    private readonly subscribedRooms = new Set<string>();

    // Map để theo dõi các subscription
    private readonly tokenSubscriptions: Map<string, {
        clients: Set<string>;
        timeframes: Map<string, Set<string>>; // Map<timeframe, Set<clientId>>
    }> = new Map();

    // Map để theo dõi các client
    private readonly clientSubscriptions: Map<string, {
        tokens: Set<string>;
        timeframes: Map<string, ChartType>; // Map<tokenAddress, timeframe>
    }> = new Map();

    constructor(
        private readonly configService: ConfigService,
        private readonly eventEmitter: EventEmitter2
    ) { }

    onModuleInit() {
        this.connect();
    }

    onModuleDestroy() {
        this.disconnect();
    }

    private async connect() {
        if (this.socket && this.transactionSocket) return;

        try {
            const wsUrl = this.configService.get<string>('SOLANA_TRACKER_WS_URL');
            if (!wsUrl) {
                throw new Error('SOLANA_TRACKER_WS_URL not configured');
            }

            this.socket = new WebSocket(wsUrl);
            this.transactionSocket = new WebSocket(wsUrl);

            this.setupSocketListeners(this.socket, 'main');
            this.setupSocketListeners(this.transactionSocket, 'transaction');
        } catch (error) {
            this.logger.error('Error connecting to WebSocket:', error);
            this.reconnect();
        }
    }

    private setupSocketListeners(socket: WebSocket, type: string) {
        socket.on('open', () => {
            // this.logger.log(`Connected to ${type} WebSocket server`);
            this.logger.debug(`WebSocket ${type} readyState: ${socket.readyState}`);
            this.reconnectAttempts = 0;
            this.resubscribeToRooms();
        });

        socket.on('close', (code: number, reason: string) => {
            // this.logger.log(`Disconnected from ${type} WebSocket server. Code: ${code}, Reason: ${reason}`);
            if (type === 'main') this.socket = null;
            if (type === 'transaction') this.transactionSocket = null;
            this.reconnect();
        });

        socket.on('message', (data: WebSocket.Data) => {
            try {
                const rawMessage = data.toString();
                // this.logger.log(`[${type}] Received raw message:`, rawMessage);
                const message = JSON.parse(rawMessage);
                
                if (message.type === 'message') {
                    // this.logger.log(`[${type}] Processing message for room ${message.room}`);
                    this.logger.debug(`[${type}] Message data:`, message.data);
                    
                    // Log subscription details
                    if (message.room.includes('transaction:')) {
                        const tokenAddress = message.room.split(':')[1];
                        const subscription = this.tokenSubscriptions.get(tokenAddress);
                        // this.logger.log(`[${type}] Found ${subscription?.clients.size || 0} clients subscribed to token ${tokenAddress}`);
                    }

                    // Emit to internal event emitter for other services
                    this.emitter.emit(message.room, message.data);
                    // Process the message for chart updates
                    this.handleMessage(message);
                } else {
                    // this.logger.log(`[${type}] Received message type: ${message.type}`);
                    if (message.type === 'subscription_success') {
                        // this.logger.log(`[${type}] Successfully subscribed to ${message.channel}`);
                    } else if (message.type === 'error') {
                        this.logger.error(`[${type}] WebSocket error: ${message.message}`);
                    }
                }
            } catch (error) {
                this.logger.error(`[${type}] Error processing message:`, error);
                this.logger.error(`[${type}] Raw message:`, data.toString());
            }
        });

        socket.on('error', (error) => {
            this.logger.error(`[${type}] WebSocket error:`, error);
            this.logger.error(`[${type}] WebSocket readyState: ${socket.readyState}`);
        });
    }

    private handleMessage(message: any) {
        const { room, data } = message;
        // this.logger.log(`Processing message for room ${room}`);

        if (room.includes('transaction:')) {
            const tokenAddress = room.split(':')[1];
            const subscription = this.tokenSubscriptions.get(tokenAddress);

            if (subscription) {
                // this.logger.log(`Found ${subscription.clients.size} clients subscribed to token ${tokenAddress}`);
                
                // Process each transaction in the data array
                if (Array.isArray(data)) {
                    data.forEach(transaction => {
                        this.logger.debug(`Processing transaction:`, transaction);
                        
                        // Log client subscription details
                        subscription.clients.forEach(clientId => {
                            const clientSub = this.clientSubscriptions.get(clientId);
                            if (clientSub) {
                                const timeframe = clientSub.timeframes.get(tokenAddress);
                                // this.logger.log(`Client ${clientId} subscription details:`, {
                                //     tokenAddress,
                                //     timeframe,
                                //     hasTimeframe: !!timeframe
                                // });

                                if (timeframe) {
                                    // this.logger.log(`Emitting chart update for client ${clientId}:`, {
                                    //     tokenAddress,
                                    //     timeframe,
                                    //     price: transaction.priceUsd,
                                    //     volume: transaction.volume,
                                    //     type: transaction.type,
                                    //     time: transaction.time
                                    // });

                                    this.eventEmitter.emit(`chart.update:${clientId}`, {
                                        tokenAddress,
                                        timeframe,
                                        data: transaction
                                    });
                                } else {
                                    this.logger.warn(`No timeframe found for client ${clientId} and token ${tokenAddress}`);
                                }
                            } else {
                                this.logger.warn(`No subscription found for client ${clientId}`);
                            }
                        });
                    });
                } else {
                    this.logger.warn(`Expected array of transactions but got:`, typeof data);
                }
            } else {
                this.logger.warn(`No subscription found for token ${tokenAddress}`);
            }
        }
    }

    private disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        if (this.transactionSocket) {
            this.transactionSocket.close();
            this.transactionSocket = null;
        }
        this.tokenSubscriptions.clear();
        this.clientSubscriptions.clear();
    }

    private reconnect() {
        // this.logger.log('Reconnecting to WebSocket server');
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.reconnectDelayMax
        );
        const jitter = delay * this.randomizationFactor;
        const reconnectDelay = delay + Math.random() * jitter;

        setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, reconnectDelay);
    }

    private resubscribeToRooms() {
        if (this.socket?.readyState === WebSocket.OPEN &&
            this.transactionSocket?.readyState === WebSocket.OPEN) {

            // Resubscribe to all token subscriptions
            for (const [tokenAddress] of this.tokenSubscriptions) {
                const room = `transaction:${tokenAddress}`;
                this.transactionSocket?.send(JSON.stringify({ type: 'join', room }));
            }
        }
    }

    // Public methods for client management
    subscribeClient(clientId: string, tokenAddress: string, timeframe: ChartType) {
        // this.logger.log(`Subscribing client ${clientId} to token ${tokenAddress} with timeframe ${timeframe}`);
        this.logger.debug('Current WebSocket states:', {
            mainSocket: this.socket?.readyState,
            transactionSocket: this.transactionSocket?.readyState
        });

        // Add client subscription
        if (!this.clientSubscriptions.has(clientId)) {
            // this.logger.log(`Creating new subscription for client ${clientId}`);
            this.clientSubscriptions.set(clientId, {
                tokens: new Set(),
                timeframes: new Map()
            });
        }

        const clientSub = this.clientSubscriptions.get(clientId)!;
        clientSub.tokens.add(tokenAddress);
        clientSub.timeframes.set(tokenAddress, timeframe);

        // Add token subscription
        if (!this.tokenSubscriptions.has(tokenAddress)) {
            // this.logger.log(`Creating new subscription for token ${tokenAddress}`);
            this.tokenSubscriptions.set(tokenAddress, {
                clients: new Set(),
                timeframes: new Map()
            });

            // Subscribe to token if this is the first client
            const room = `transaction:${tokenAddress}`;
            if (this.transactionSocket?.readyState === WebSocket.OPEN) {
                // this.logger.log(`Joining room ${room} for token ${tokenAddress}`);
                const joinMessage = JSON.stringify({ type: 'join', room });
                this.logger.debug(`Sending join message: ${joinMessage}`);
                this.transactionSocket.send(joinMessage);
            } else {
                this.logger.warn(`Transaction socket not ready for token ${tokenAddress}. State: ${this.transactionSocket?.readyState}`);
            }
        }

        const tokenSub = this.tokenSubscriptions.get(tokenAddress)!;
        tokenSub.clients.add(clientId);

        if (!tokenSub.timeframes.has(timeframe)) {
            tokenSub.timeframes.set(timeframe, new Set());
        }
        tokenSub.timeframes.get(timeframe)!.add(clientId);

        // this.logger.log(`Client ${clientId} subscribed to ${tokenAddress} with timeframe ${timeframe}`);
        this.logger.debug(`Current subscriptions for token ${tokenAddress}:`, {
            totalClients: tokenSub.clients.size,
            timeframes: Array.from(tokenSub.timeframes.keys()),
            clientsPerTimeframe: Object.fromEntries(
                Array.from(tokenSub.timeframes.entries()).map(([tf, clients]) => [tf, clients.size])
            )
        });
    }

    unsubscribeClient(clientId: string, tokenAddress: string) {
        // Remove client subscription
        const clientSub = this.clientSubscriptions.get(clientId);
        if (clientSub) {
            clientSub.tokens.delete(tokenAddress);
            clientSub.timeframes.delete(tokenAddress);
        }

        // Remove token subscription
        const tokenSub = this.tokenSubscriptions.get(tokenAddress);
        if (tokenSub) {
            tokenSub.clients.delete(clientId);

            // Remove client from all timeframe sets
            for (const clients of tokenSub.timeframes.values()) {
                clients.delete(clientId);
            }

            // If no clients left, unsubscribe from token
            if (tokenSub.clients.size === 0) {
                const room = `transaction:${tokenAddress}`;
                if (this.transactionSocket?.readyState === WebSocket.OPEN) {
                    this.transactionSocket.send(JSON.stringify({ type: 'leave', room }));
                }
                this.tokenSubscriptions.delete(tokenAddress);
            }
        }

        this.logger.debug(`Client ${clientId} unsubscribed from ${tokenAddress}`);
    }

    removeClient(clientId: string) {
        const clientSub = this.clientSubscriptions.get(clientId);
        if (clientSub) {
            // Unsubscribe from all tokens
            for (const tokenAddress of clientSub.tokens) {
                this.unsubscribeClient(clientId, tokenAddress);
            }
            this.clientSubscriptions.delete(clientId);
        }
    }

    getClientSubscriptions(clientId: string) {
        return this.clientSubscriptions.get(clientId);
    }

    getTokenSubscriptions(tokenAddress: string) {
        return this.tokenSubscriptions.get(tokenAddress);
    }

    joinRoom(room: string) {
        if (!this.subscribedRooms.has(room)) {
            this.subscribedRooms.add(room);
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'join', room }));
            }
        }
    }

    leaveRoom(room: string) {
        if (this.subscribedRooms.has(room)) {
            this.subscribedRooms.delete(room);
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'leave', room }));
            }
        }
    }

    on(event: string, callback: (data: any) => void) {
        this.emitter.on(event, callback);
    }

    off(event: string, callback: (data: any) => void) {
        this.emitter.off(event, callback);
    }
} 