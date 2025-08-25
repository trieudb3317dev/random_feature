import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket from 'ws';
import EventEmitter from 'eventemitter3';

@Injectable()
export class SolanaTrackerWebSocketService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SolanaTrackerWebSocketService.name);
    private socket: WebSocket | null = null;
    private transactionSocket: WebSocket | null = null;
    private reconnectAttempts = 0;
    private readonly reconnectDelay = 2500;
    private readonly reconnectDelayMax = 4500;
    private readonly randomizationFactor = 0.5;
    private readonly emitter = new EventEmitter();
    private readonly subscribedRooms = new Set<string>();
    private readonly transactions = new Set<string>();

    constructor(
        private readonly configService: ConfigService,
        private readonly eventEmitter: EventEmitter2
    ) {}

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
            this.logger.log(`Connected to ${type} WebSocket server`);
            this.reconnectAttempts = 0;
            this.resubscribeToRooms();
        });

        socket.on('close', () => {
            this.logger.log(`Disconnected from ${type} WebSocket server`);
            if (type === 'main') this.socket = null;
            if (type === 'transaction') this.transactionSocket = null;
            this.reconnect();
        });

        socket.on('message', (data: WebSocket.Data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'message') {
                    if (message.data?.tx && this.transactions.has(message.data.tx)) {
                        return;
                    } else if (message.data?.tx) {
                        this.transactions.add(message.data.tx);
                    }
                    
                    if (message.room.includes('price:')) {
                        this.eventEmitter.emit(`price-by-token:${message.data.token}`, message.data);
                    }
                    this.eventEmitter.emit(message.room, message.data);
                }
            } catch (error) {
                this.logger.error('Error processing message:', error);
            }
        });

        socket.on('error', (error) => {
            this.logger.error(`WebSocket ${type} error:`, error);
        });
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
        this.subscribedRooms.clear();
        this.transactions.clear();
    }

    private reconnect() {
        this.logger.log('Reconnecting to WebSocket server');
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

    subscribeToTransactions(tokenAddress: string) {
        const room = `transaction:${tokenAddress}`;
        this.subscribedRooms.add(room);
        if (this.transactionSocket?.readyState === WebSocket.OPEN) {
            this.transactionSocket.send(JSON.stringify({ type: 'join', room }));
        }
        this.eventEmitter.on(room, (data) => {
            this.logger.debug(`New transaction for ${tokenAddress}:`, data);
        });
    }

    unsubscribeFromTransactions(tokenAddress: string) {
        const room = `transaction:${tokenAddress}`;
        this.subscribedRooms.delete(room);
        if (this.transactionSocket?.readyState === WebSocket.OPEN) {
            this.transactionSocket.send(JSON.stringify({ type: 'leave', room }));
        }
        this.eventEmitter.removeAllListeners(room);
    }

    private resubscribeToRooms() {
        if (this.socket?.readyState === WebSocket.OPEN && 
            this.transactionSocket?.readyState === WebSocket.OPEN) {
            for (const room of this.subscribedRooms) {
                const socket = room.includes('transaction') ? this.transactionSocket : this.socket;
                socket?.send(JSON.stringify({ type: 'join', room }));
            }
        }
    }
} 