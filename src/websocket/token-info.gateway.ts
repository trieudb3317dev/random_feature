import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SharedWebSocketService } from './services/shared-websocket.service';

@WebSocketGateway({
    namespace: 'token-info',
    transports: ['websocket'],
    path: '/socket.io',
    allowEIO3: true,
    allowEIO4: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 60000
})
export class TokenInfoGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private readonly logger = new Logger(TokenInfoGateway.name);
    private tokenSubscriptions: Map<string, Set<string>> = new Map(); // Map<tokenAddress, Set<clientId>>
    private clientSubscriptions: Map<string, Set<string>> = new Map(); // Map<clientId, Set<tokenAddress>>
    private tokenData: Map<string, any> = new Map(); // Map<tokenAddress, data>
    private holdersData: Map<string, any> = new Map(); // Map<tokenAddress, holders data>

    constructor(
        private readonly configService: ConfigService,
        private readonly sharedWebSocketService: SharedWebSocketService
    ) {}

    afterInit(server: Server) {
        // this.logger.log('TokenInfoGateway initialized');
        this.server = server;
    }

    handleConnection(client: Socket) {
        // this.logger.log(`👤 Client connected: ${client.id}`);
        this.clientSubscriptions.set(client.id, new Set());
    }

    handleDisconnect(client: Socket) {
        // this.logger.log(`👋 Client disconnected: ${client.id}`);
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

            // this.logger.log(`📌 Client ${client.id} subscribing to ${tokenAddress}`);
            await this.subscribeToToken(tokenAddress, client.id);
            
            // Send current data if available
            const tokenInfo = this.tokenData.get(tokenAddress);
            if (tokenInfo) {
                client.emit('tokenInfo', tokenInfo);
            }
            
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

            // this.logger.log(`❌ Client ${client.id} unsubscribing from ${tokenAddress}`);
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

    private async subscribeToToken(tokenAddress: string, clientId: string) {
        try {
            if (!this.tokenSubscriptions.has(tokenAddress)) {
                this.tokenSubscriptions.set(tokenAddress, new Set());
                this.tokenData.set(tokenAddress, null);
                this.holdersData.set(tokenAddress, null);

                // Subscribe to token info
                const tokenRoomName = `token:${tokenAddress}`;
                // this.logger.log(`Joining room: ${tokenRoomName}`);
                this.sharedWebSocketService.joinRoom(tokenRoomName);
                
                this.sharedWebSocketService.on(tokenRoomName, (data: any) => {
                    this.handleTokenUpdate(tokenAddress, data);
                });

                // Subscribe to holders info
                const holdersRoomName = `holders:${tokenAddress}`;
                // this.logger.log(`Joining room: ${holdersRoomName}`);
                this.sharedWebSocketService.joinRoom(holdersRoomName);
                
                this.sharedWebSocketService.on(holdersRoomName, (data: any) => {
                    this.handleHoldersUpdate(tokenAddress, data);
                });
            }

            this.tokenSubscriptions.get(tokenAddress)!.add(clientId);
            this.clientSubscriptions.get(clientId)!.add(tokenAddress);
        } catch (error) {
            this.logger.error(`Error subscribing to token ${tokenAddress}:`, error);
            throw error;
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
                    this.tokenData.delete(tokenAddress);
                    this.holdersData.delete(tokenAddress);
                    
                    // Leave token info room
                    const tokenRoomName = `token:${tokenAddress}`;
                    // this.logger.log(`Leaving room: ${tokenRoomName}`);
                    this.sharedWebSocketService.leaveRoom(tokenRoomName);

                    // Leave holders room
                    const holdersRoomName = `holders:${tokenAddress}`;
                    // this.logger.log(`Leaving room: ${holdersRoomName}`);
                    this.sharedWebSocketService.leaveRoom(holdersRoomName);
                }
            }
        } catch (error) {
            this.logger.error(`Error unsubscribing from token ${tokenAddress}:`, error);
        }
    }

    private handleHoldersUpdate(tokenAddress: string, data: any) {
        try {
            // this.logger.log(`📊 Holders update for ${tokenAddress}: ${JSON.stringify(data)}`);
            // Store holders data
            this.holdersData.set(tokenAddress, data);
            // Broadcast updated token info with holders
            this.broadcastTokenInfo(tokenAddress);
        } catch (error) {
            this.logger.error(`Error handling holders update for ${tokenAddress}:`, error);
        }
    }

    private handleTokenUpdate(tokenAddress: string, data: any) {
        try {
            this.tokenData.set(tokenAddress, data);
            this.broadcastTokenInfo(tokenAddress);
        } catch (error) {
            this.logger.error(`Error handling token update for ${tokenAddress}:`, error);
        }
    }

    private broadcastTokenInfo(tokenAddress: string) {
        const subscribers = this.tokenSubscriptions.get(tokenAddress);
        const tokenInfo = this.tokenData.get(tokenAddress);
        const holdersInfo = this.holdersData.get(tokenAddress);
        
        if (subscribers && tokenInfo) {
            const combinedData = {
                ...tokenInfo,
                holders: holdersInfo.total
            };
            
            subscribers.forEach(clientId => {
                this.server.to(clientId).emit('tokenInfo', combinedData);
            });
        }
    }
}