import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import { RateLimit } from 'nestjs-rate-limiter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { MasterGroup } from '../../master-trading/entities/master-group.entity';
import { MasterGroupAuth } from '../../master-trading/entities/master-group-auth.entity';
import { WsJwtAuthGuard } from 'src/auth/guards/ws-jwt-auth.guard';
import { WsThrottlerGuard } from 'src/websocket/throttler.guard';
import { ChatsService } from '../chats.service';

interface ChatMetrics {
    connectedClients: number;
    messagesSent: number;
    activeRooms: Set<string>;
    lastUpdated: Date;
}

@WebSocketGateway({
    namespace: 'chats',
    transports: ['websocket'],
    path: '/socket.io',
    allowEIO3: true,
    allowEIO4: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 60000
})
@UseGuards(WsJwtAuthGuard/*, WsThrottlerGuard*/)
export class ChatsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ChatsGateway.name);
    private connectedClients: Map<string, Set<string>> = new Map(); // Map<room_id, Set<client_id>>
    private metrics: ChatMetrics = {
        connectedClients: 0,
        messagesSent: 0,
        activeRooms: new Set(),
        lastUpdated: new Date()
    };
    private walletMap: Map<number, string> = new Map();

    constructor(
        @InjectRepository(ListWallet)
        private listWalletRepository: Repository<ListWallet>,
        @InjectRepository(MasterGroup)
        private masterGroupRepository: Repository<MasterGroup>,
        @InjectRepository(MasterGroupAuth)
        private masterGroupAuthRepository: Repository<MasterGroupAuth>,
        @Inject(forwardRef(() => ChatsService))
        private readonly chatsService: ChatsService
    ) { }

    afterInit(server: Server) {
        this.logger.log('ChatsGateway initialized');
        this.server = server;
    }

    handleConnection(client: Socket) {
        this.logger.log(`👤 Client connected: ${client.id}`);
        this.updateMetrics();
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`👋 Client disconnected: ${client.id}`);
        this.removeClientFromAllRooms(client);
        this.updateMetrics();
    }

    private removeClientFromAllRooms(client: Socket) {
        this.connectedClients.forEach((clients, roomId) => {
            if (clients.has(client.id)) {
                clients.delete(client.id);
                if (clients.size === 0) {
                    this.connectedClients.delete(roomId);
                }
            }
        });
    }

    //@RateLimit({
    //    points: 10,
    //    duration: 60,
    //    errorMessage: 'Too many join requests, please wait a minute'
    //})
    @UseGuards(WsJwtAuthGuard)
    @SubscribeMessage('join-group')
    async handleJoinGroup(client: Socket, data: { group_id: number }) {
        try {
            if (!data.group_id) {
                throw new Error('Missing group_id');
            }

            // Lấy wallet_id từ JWT token
            const walletId = (client as any).user?.wallet_id;
            if (!walletId) {
                throw new UnauthorizedException('Invalid authentication');
            }

            // Kiểm tra quyền truy cập
            const { isMaster, isMember } = await this.chatsService.checkGroupAuth(data.group_id, walletId);
            if (!isMaster && !isMember) {
                throw new Error('You do not have permission to join this group chat');
            }

            const roomId = `group:${data.group_id}`;

            // Thêm client vào room
            client.join(roomId);

            // Lưu thông tin client
            if (!this.connectedClients.has(roomId)) {
                this.connectedClients.set(roomId, new Set());
            }
            this.connectedClients.get(roomId)?.add(client.id);

            this.updateMetrics();
            this.logger.log(`Client ${client.id} joined room ${roomId}`);

            return {
                success: true,
                roomId,
                activeClients: this.connectedClients.get(roomId)?.size || 0
            };
        } catch (error) {
            this.logger.error(`Error in join-group: ${error.message}`);
            if (error instanceof UnauthorizedException) {
                client.emit('error', {
                    status: 'error',
                    message: error.message,
                    cause: {
                        pattern: 'join-group',
                        data: data
                    }
                });
            } else {
                client.emit('error', {
                    status: 'error',
                    message: error.message || 'Internal server error',
                    cause: {
                        pattern: 'join-group',
                        data: data
                    }
                });
            }
            return {
                success: false,
                error: error.message || 'Internal server error'
            };
        }
    }

    //@RateLimit({
    //    points: 10,
    //    duration: 60,
    //    errorMessage: 'Too many join requests, please wait a minute'
    //})
    @SubscribeMessage('join-token')
    async handleJoinToken(client: Socket, data: { token_address: string }) {
        try {
            if (!data.token_address) {
                throw new Error('Missing token_address');
            }

            const roomId = `token:${data.token_address}`;

            // Thêm client vào room
            client.join(roomId);

            // Lưu thông tin client
            if (!this.connectedClients.has(roomId)) {
                this.connectedClients.set(roomId, new Set());
            }
            this.connectedClients.get(roomId)?.add(client.id);

            this.updateMetrics();
            this.logger.log(`Client ${client.id} joined room ${roomId}`);

            return {
                success: true,
                roomId,
                activeClients: this.connectedClients.get(roomId)?.size || 0
            };
        } catch (error) {
            this.logger.error(`Error in join-token: ${error.message}`);
            client.emit('error', { message: error.message });
            return { success: false, error: error.message };
        }
    }

    //@RateLimit({
    //    points: 10,
    //    duration: 60,
    //    errorMessage: 'Too many join requests, please wait a minute'
    //})
    @SubscribeMessage('join-chat')
    async handleJoinChat(client: Socket, data: { type: string }) {
        try {
            if (data.type !== 'all') {
                throw new Error('Invalid chat type');
            }

            const roomId = 'all';

            // Thêm client vào room
            client.join(roomId);

            // Lưu thông tin client
            if (!this.connectedClients.has(roomId)) {
                this.connectedClients.set(roomId, new Set());
            }
            this.connectedClients.get(roomId)?.add(client.id);

            this.updateMetrics();
            this.logger.log(`Client ${client.id} joined room ${roomId}`);

            return {
                success: true,
                roomId,
                activeClients: this.connectedClients.get(roomId)?.size || 0
            };
        } catch (error) {
            this.logger.error(`Error in join-chat: ${error.message}`);
            client.emit('error', {
                status: 'error',
                message: error.message,
                cause: {
                    pattern: 'join-chat',
                    data: data
                }
            });
            return {
                success: false,
                error: error.message || 'Internal server error'
            };
        }
    }

    @SubscribeMessage('leave-chat')
    handleLeaveChat(client: Socket) {
        try {
            const roomId = 'all';
            client.leave(roomId);

            const clients = this.connectedClients.get(roomId);
            if (clients) {
                clients.delete(client.id);
                if (clients.size === 0) {
                    this.connectedClients.delete(roomId);
                }
            }

            this.updateMetrics();
            this.logger.log(`Client ${client.id} left room ${roomId}`);

            return {
                success: true,
                activeClients: this.connectedClients.get(roomId)?.size || 0
            };
        } catch (error) {
            this.logger.error(`Error leaving chat: ${error.message}`);
            client.emit('error', {
                message: error.message,
                timestamp: new Date()
            });
            return { success: false, error: error.message };
        }
    }

    @SubscribeMessage('leave-token')
    handleLeaveToken(client: Socket, data: { token_address: string }) {
        try {
            if (!data.token_address) {
                throw new Error('Missing token_address');
            }

            const roomId = `token:${data.token_address}`;
            client.leave(roomId);

            const clients = this.connectedClients.get(roomId);
            if (clients) {
                clients.delete(client.id);
                if (clients.size === 0) {
                    this.connectedClients.delete(roomId);
                }
            }

            this.updateMetrics();
            this.logger.log(`Client ${client.id} left room ${roomId}`);

            return {
                success: true,
                activeClients: this.connectedClients.get(roomId)?.size || 0
            };
        } catch (error) {
            this.logger.error(`Error leaving token chat: ${error.message}`);
            client.emit('error', {
                message: error.message,
                timestamp: new Date()
            });
            return { success: false, error: error.message };
        }
    }

    //@RateLimit({
    //    points: 20,
    //    duration: 60,
    //    errorMessage: 'Too many messages, please wait a minute'
    //})
    @SubscribeMessage('send-message')
    async handleMessage(client: Socket, payload: {
        type: 'all' | 'token' | 'group',
        token_address?: string,
        group_id?: number,
        content: string,
        wallet_id?: number
    }) {
        try {
            let roomId: string;

            if (payload.type === 'all') {
                roomId = 'all';
            } else if (payload.type === 'token' && payload.token_address) {
                roomId = `token:${payload.token_address}`;
            } else if (payload.type === 'group' && payload.group_id) {
                roomId = `group:${payload.group_id}`;
            } else {
                throw new Error('Invalid message type or missing required parameters');
            }

            // Kiểm tra xem client có trong room không
            const roomClients = this.connectedClients.get(roomId);
            if (!roomClients?.has(client.id)) {
                throw new Error('You must join the chat room first');
            }

            // Lấy wallet_id từ JWT token
            const walletId = (client as any).user?.wallet_id;
            if (!walletId) {
                throw new UnauthorizedException('Invalid authentication');
            }

            const message = {
                type: payload.type,
                token_address: payload.token_address,
                group_id: payload.group_id,
                content: payload.content,
                wallet_id: walletId,
                timestamp: new Date()
            };

            // Gửi message thông qua service để lưu vào database
            if (payload.type === 'all') {
                await this.chatsService.sendMessageToAll(payload.content, walletId);
            } else if (payload.type === 'token' && payload.token_address) {
                await this.chatsService.sendMessage(payload.token_address, payload.content, walletId);
            } else if (payload.type === 'group' && payload.group_id) {
                await this.chatsService.sendMessageToGroup(payload.group_id, payload.content, walletId);
            }

            this.metrics.messagesSent++;
            this.updateMetrics();

            return { success: true, message };
        } catch (error) {
            this.logger.error(`Error sending message: ${error.message}`);
            client.emit('error', {
                message: error.message,
                timestamp: new Date()
            });
            return { success: false, error: error.message };
        }
    }

    async broadcastMessage(type: 'all' | 'token' | 'group', identifier: string, message: any) {
        const room = type === 'all' ? 'all' : type === 'group' ? `group:${identifier}` : `token:${identifier}`;
        try {
            // Lấy thông tin wallet
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_solana_address: message.ch_wallet_address }
            });

            const formattedMessage = {
                _id: message._id,
                ch_id: message.ch_id,
                chat_id: message.chat_id,
                ch_wallet_address: message.ch_wallet_address,
                ch_content: message.ch_content,
                chat_type: message.chat_type,
                ch_status: message.ch_status,
                ch_is_master: message.ch_is_master,
                country: wallet?.wallet_country || null,
                nick_name: wallet?.wallet_nick_name || '',
                createdAt: message.createdAt
            };

            // Broadcast message đến tất cả client trong room
            this.server.to(room).emit('message', {
                status: 200,
                data: formattedMessage
            });
        } catch (error) {
            this.logger.error('Error broadcasting message:', error);
            this.server.to(room).emit('error', {
                status: 500,
                message: error.message
            });
        }
    }

    @SubscribeMessage('error')
    handleError(client: Socket, error: any) {
        this.logger.error(`WebSocket Error for client ${client.id}:`, error);
        client.emit('error', {
            message: 'An error occurred',
            timestamp: new Date()
        });
    }

    @SubscribeMessage('get-metrics')
    handleGetMetrics() {
        this.updateMetrics();
        return this.metrics;
    }

    private updateMetrics() {
        if (this.server && this.server.engine) {
            this.metrics = {
                connectedClients: this.server.engine.clientsCount,
                messagesSent: this.metrics.messagesSent,
                activeRooms: new Set(Array.from(this.connectedClients.keys())),
                lastUpdated: new Date()
            };
        }
    }
} 