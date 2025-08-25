import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SolanaTrackerWebSocketService } from './hooks/solana-tracker-websocket.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@WebSocketGateway({
    namespace: 'token-txs',
    transports: ['websocket'],
    path: '/socket.io',
    allowEIO3: true,
    allowEIO4: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 60000
})
export class TokenTxsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private readonly logger = new Logger(TokenTxsGateway.name);
    private tokenSubscriptions: Map<string, Set<string>> = new Map(); // Map<tokenAddress, Set<clientId>>
    private clientSubscriptions: Map<string, Set<string>> = new Map(); // Map<clientId, Set<tokenAddress>>
    private pendingSubscriptions: Set<string> = new Set(); // Track tokens waiting to be subscribed

    constructor(
        private readonly configService: ConfigService,
        private readonly solanaTrackerWs: SolanaTrackerWebSocketService,
        private readonly eventEmitter: EventEmitter2
    ) {
        // Không khởi tạo BirdeyeWebSocket nữa
    }

    afterInit(server: Server) {
        this.logger.log('TokenTxsGateway initialized');
        this.server = server;
        // Không cần connect cho BirdeyeWebSocket
    }

    handleConnection(client: Socket) {
        this.logger.log(`👤 Client connected: ${client.id}`);
        this.clientSubscriptions.set(client.id, new Set());
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`👋 Client disconnected: ${client.id}`);
        const subscribedTokens = this.clientSubscriptions.get(client.id);
        if (subscribedTokens) {
            subscribedTokens.forEach(tokenAddress => {
                this.unsubscribeFromToken(client, tokenAddress);
            });
        }
        this.clientSubscriptions.delete(client.id);
    }

    @SubscribeMessage('subscribe')
    async handleSubscribe(client: Socket, data: { tokenAddress: string }) {
        try {
            const { tokenAddress } = data;
            if (!tokenAddress) {
                this.logger.error(`❌ Client ${client.id} tried to subscribe without token address`);
                this.handleError(client, 'Token address is required', 'SUBSCRIBE_ERROR');
                return;
            }

            this.logger.log(`📌 Client ${client.id} subscribing to ${tokenAddress}`);
            this.subscribeToToken(tokenAddress, client.id, client);
            client.emit('subscribed', { tokenAddress });
        } catch (error) {
            this.logger.error(`❌ Error subscribing client ${client.id} to token: ${error.message}`);
            this.handleError(client, error.message, 'SUBSCRIBE_ERROR');
        }
    }

    @SubscribeMessage('unsubscribe')
    async handleUnsubscribe(client: Socket, data: { tokenAddress: string }) {
        try {
            const { tokenAddress } = data;
            if (!tokenAddress) {
                this.logger.error(`❌ Client ${client.id} tried to unsubscribe without token address`);
                this.handleError(client, 'Token address is required', 'UNSUBSCRIBE_ERROR');
                return;
            }

            this.logger.log(`❌ Client ${client.id} unsubscribing from ${tokenAddress}`);
            this.unsubscribeFromToken(client, tokenAddress);
            client.emit('unsubscribed', { tokenAddress });
        } catch (error) {
            this.logger.error(`❌ Error unsubscribing client ${client.id} from token: ${error.message}`);
            this.handleError(client, error.message, 'UNSUBSCRIBE_ERROR');
        }
    }

    private handleError(client: Socket, message: string, context: string) {
        this.logger.error(`[${context}] Error for client ${client.id}: ${message}`);
        client.emit('error', {
            context,
            message,
            timestamp: new Date()
        });
    }

    private subscribeToToken(tokenAddress: string, clientId: string, client: Socket) {
        try {
            if (!this.tokenSubscriptions.has(tokenAddress)) {
                this.tokenSubscriptions.set(tokenAddress, new Set());
            }
            this.tokenSubscriptions.get(tokenAddress)!.add(clientId);
            this.clientSubscriptions.get(clientId)!.add(tokenAddress);

            if (this.tokenSubscriptions.get(tokenAddress)!.size === 1) {
                this.pendingSubscriptions.add(tokenAddress);
                this.logger.log(`🔄 Registering new listener for token ${tokenAddress}`);
                // Đăng ký với Solana Tracker WebSocket
                this.solanaTrackerWs.subscribeToTransactions(tokenAddress);
                this.logger.log(`✅ Subscribed to Solana Tracker WebSocket for token ${tokenAddress}`);
                
                // Lắng nghe sự kiện transaction
                const listener = (data: any) => {
                    this.logger.log(`🔔 Listener triggered for token ${tokenAddress}`);
                    // this.logger.log(`📥 Received transaction data for token ${tokenAddress}: ${JSON.stringify(data)}`);
                    // data có thể là mảng, emit từng phần tử hoặc emit cả mảng
                    if (Array.isArray(data)) {
                        this.logger.log(`📦 Processing array of ${data.length} transactions for token ${tokenAddress}`);
                        data.forEach((tx, index) => {
                            this.logger.log(`📤 Emitting transaction ${index + 1}/${data.length} to client ${clientId}`);
                            this.server.to(clientId).emit('transaction', tx);
                        });
                    } else {
                        this.logger.log(`📤 Emitting single transaction to client ${clientId}`);
                        this.server.to(clientId).emit('transaction', data);
                    }
                };

                const eventName = `transaction:${tokenAddress}`;
                this.eventEmitter.on(eventName, listener);
                this.logger.log(`✅ Listener registered successfully for token ${tokenAddress} with event ${eventName}`);
                
                // Lưu listener để có thể remove khi unsubscribe
                (client as any)[`__solanaTrackerListener_${tokenAddress}`] = listener;
            } else {
                this.logger.log(`ℹ️ Token ${tokenAddress} already has ${this.tokenSubscriptions.get(tokenAddress)!.size} subscribers`);
            }
        } catch (error) {
            this.logger.error(`Error subscribing to token ${tokenAddress}:`, error);
        }
    }

    private unsubscribeFromToken(client: Socket, tokenAddress: string) {
        try {
            if (this.tokenSubscriptions.has(tokenAddress)) {
                const subscribers = this.tokenSubscriptions.get(tokenAddress)!;
                subscribers.delete(client.id);
                this.clientSubscriptions.get(client.id)!.delete(tokenAddress);

                if (subscribers.size === 0) {
                    this.tokenSubscriptions.delete(tokenAddress);
                    this.pendingSubscriptions.delete(tokenAddress);
                    // Hủy đăng ký với Solana Tracker WebSocket
                    this.solanaTrackerWs.unsubscribeFromTransactions(tokenAddress);
                }
                // Remove listener cho client này
                const listener = (client as any)[`__solanaTrackerListener_${tokenAddress}`];
                if (listener) {
                    const eventName = `transaction:${tokenAddress}`;
                    this.eventEmitter.off(eventName, listener);
                    this.logger.log(`✅ Removed listener for token ${tokenAddress}`);
                    delete (client as any)[`__solanaTrackerListener_${tokenAddress}`];
                }
            }
        } catch (error) {
            this.logger.error(`Error unsubscribing from token ${tokenAddress}:`, error);
        }
    }
} 