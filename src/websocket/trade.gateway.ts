import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { TradeService } from '../trade/trade.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface OrderSubscription {
    orderId: string;
    tokenAddress: string;
    walletId: string;
    isMasterOrder: boolean;
    memberWalletId?: string;
    interval: NodeJS.Timeout;
    lastStatus?: string;
    listeners?: {
        orderCreated: (order: any) => Promise<void>;
        orderStatusUpdated: (order: any) => Promise<void>;
        orderCanceled: (order: any) => Promise<void>;
    };
}

interface ExtendedSocket extends Socket {
    userId?: string;
    memberWalletId?: string;
    orderSubscriptions: Map<string, OrderSubscription>;
    limit?: number;
    latestOrdersResult?: any;
}

interface ErrorResponse {
    status: string;
    message: string;
}

interface OrdersResponse {
    event: string;
    data: any;
}

interface ClientSubscription {
    socket: ExtendedSocket;
    interval: NodeJS.Timeout;
}

@WebSocketGateway({
    namespace: 'trade'
})
export class TradeGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;
    private readonly logger = new Logger(TradeGateway.name);
    private readonly MIN_UPDATE_INTERVAL = 1000; // 1 second
    private readonly MAX_UPDATE_INTERVAL = 5000; // 5 seconds
    private currentUpdateInterval = 3000; // Start with 3 seconds
    private readonly performanceMetrics = {
        queryTimes: [] as number[],
        maxQueryTimes: 50,
        lastAdjustmentTime: Date.now(),
        adjustmentInterval: 60000,
        performanceThreshold: 200
    };

    constructor(
        @Inject(forwardRef(() => TradeService))
        private readonly tradeService: TradeService,
        private readonly eventEmitter: EventEmitter2
    ) {
        // Register event listeners
        this.eventEmitter.on('order.created', (order) => {
            this.handleOrderCreated(order).catch(error => {
                this.logger.error(`Error handling order.created: ${error.message}`);
            });
        });

        this.eventEmitter.on('order.status.updated', (order) => {
            this.handleOrderStatusUpdated(order).catch(error => {
                this.logger.error(`Error handling order.status.updated: ${error.message}`);
            });
        });

        this.eventEmitter.on('order.canceled', (order) => {
            this.handleOrderCanceled(order).catch(error => {
                this.logger.error(`Error handling order.canceled: ${error.message}`);
            });
        });

        this.eventEmitter.on('order.executed', (data) => {
            this.handleOrderStatusUpdated({
                order_id: data.orderId,
                token_address: data.tokenAddress,
                status: 'executed',
                price: data.price
            }).catch(error => {
                this.logger.error(`Error handling order.executed: ${error.message}`);
            });
        });
    }

    handleConnection(client: ExtendedSocket) {
        this.logger.log(`Client connected: ${client.id}`);
        client.orderSubscriptions = new Map();
    }

    handleDisconnect(client: ExtendedSocket) {
        this.logger.log(`Client disconnected: ${client.id}`);
        this.cleanupClientSubscriptions(client);
    }

    private cleanupClientSubscriptions(client: ExtendedSocket) {
        if (client.orderSubscriptions) {
            for (const [key, subscription] of client.orderSubscriptions.entries()) {
                if (subscription.listeners) {
                    this.eventEmitter.removeListener('order.created', subscription.listeners.orderCreated);
                    this.eventEmitter.removeListener('order.status.updated', subscription.listeners.orderStatusUpdated);
                    this.eventEmitter.removeListener('order.canceled', subscription.listeners.orderCanceled);
                }
                clearInterval(subscription.interval);
            }
            client.orderSubscriptions.clear();
        }
    }

    @SubscribeMessage('getOrders')
    async handleGetOrders(client: ExtendedSocket, data: any) {
        try {
            if (!client.userId) {
                this.logger.warn('Unauthorized access attempt to getOrders');
                this.sendError(client, { status: 401, message: 'Authentication required' });
                return;
            }

            if (!data || !data.token_address) {
                this.sendError(client, { status: 400, message: 'Token address is required' });
                return;
            }

            const user = { wallet_id: parseInt(client.userId) };
            const ordersResult = await this.tradeService.getOrders(user, {
                token_address: data.token_address,
                token: data.token_address,
                limit: data.limit || 30,
                offset: data.offset || 0
            });

            if (ordersResult.status !== 200) {
                this.sendError(client, {
                    status: ordersResult.status,
                    message: ordersResult.message
                });
                return;
            }

            if ('data' in ordersResult && ordersResult.data && ordersResult.data.orders) {
                ordersResult.data.orders.sort((a, b) => {
                    const aTime = new Date(a.created_at).getTime();
                    const bTime = new Date(b.created_at).getTime();
                    return bTime - aTime;
                });
            }

            client.emit('getOrders', ordersResult);

            const subscriptionKey = `${data.token_address}-${client.userId}`;
            if (!client.orderSubscriptions.has(subscriptionKey)) {
                const currentOrderStatus = 'data' in ordersResult && ordersResult.data?.orders?.[0]
                    ? ordersResult.data.orders[0].status
                    : undefined;

                const orderCreatedListener = async (data: any): Promise<void> => {
                    if (data.token_address === data.token_address) {
                        client.emit('order.created', {
                            orderId: data.order_id,
                            tokenAddress: data.token_address,
                            tradeType: data.trade_type,
                            status: data.status,
                            timestamp: new Date().toISOString()
                        });
                    }
                };

                const orderStatusUpdatedListener = async (data: any): Promise<void> => {
                    if (data.orderId && 'data' in ordersResult && ordersResult.data?.orders?.some(
                        (order: any) => order.order_id === data.orderId
                    )) {
                        client.emit('order.status.updated', {
                            orderId: data.orderId,
                            status: data.status,
                            timestamp: new Date().toISOString()
                        });
                    }
                };

                const orderCanceledListener = async (data: any): Promise<void> => {
                    if (data.token_address === data.token_address) {
                        client.emit('order.canceled', {
                            orderId: data.order_id,
                            tokenAddress: data.token_address,
                            timestamp: new Date().toISOString()
                        });
                    }
                };

                this.eventEmitter.on('order.created', orderCreatedListener);
                this.eventEmitter.on('order.status.updated', orderStatusUpdatedListener);
                this.eventEmitter.on('order.canceled', orderCanceledListener);

                const subscription: OrderSubscription = {
                    orderId: 'data' in ordersResult ? ordersResult.data?.orders?.[0]?.order_id || '' : '',
                    tokenAddress: data.token_address,
                    walletId: client.userId,
                    isMasterOrder: false,
                    lastStatus: currentOrderStatus,
                    interval: setInterval(() => { }, 1000000),
                    listeners: {
                        orderCreated: orderCreatedListener,
                        orderStatusUpdated: orderStatusUpdatedListener,
                        orderCanceled: orderCanceledListener
                    }
                };

                client.orderSubscriptions.set(subscriptionKey, subscription);
            }
        } catch (error) {
            this.logger.error('Error in handleGetOrders:', error);
            this.sendError(client, {
                status: 500,
                message: `Internal server error: ${error.message}`
            });
        }
    }

    @SubscribeMessage('unGetOrders')
    async handleUnGetOrders(client: ExtendedSocket, data: any) {
        try {
            if (!client.orderSubscriptions || client.orderSubscriptions.size === 0) {
                client.emit('unGetOrders', {
                    status: 404,
                    message: 'No active order subscriptions found'
                });
                return;
            }

            for (const [key, subscription] of client.orderSubscriptions.entries()) {
                if (subscription.listeners) {
                    this.eventEmitter.removeListener('order.created', subscription.listeners.orderCreated);
                    this.eventEmitter.removeListener('order.status.updated', subscription.listeners.orderStatusUpdated);
                    this.eventEmitter.removeListener('order.canceled', subscription.listeners.orderCanceled);
                }

                if (subscription.interval) {
                    clearInterval(subscription.interval);
                }
            }

            client.orderSubscriptions.clear();

            this.logger.log(`Successfully unsubscribed from all orders for client ${client.userId}`);

            client.emit('unGetOrders', {
                status: 200,
                message: 'Successfully unsubscribed from all orders'
            });
        } catch (error) {
            this.logger.error(`Error in handleUnGetOrders: ${error.message}`);
            this.sendError(client, {
                status: 500,
                message: `Error unsubscribing from orders: ${error.message}`
            });
        }
    }

    private async handleOrderCreated(data: any) {
        try {
            const response = await this.tradeService.getOrders(
                { wallet_id: null },
                { token_address: data.token_address, limit: 10 }
            );

            const clients = this.getClientsByToken(data.token_address);
            for (const client of clients) {
                client.emit('getOrders', response);
            }
        } catch (error) {
            this.logger.error(`Error handling order created: ${error.message}`);
        }
    }

    private async handleOrderStatusUpdated(data: any) {
        try {
            const response = await this.tradeService.getOrders(
                { wallet_id: null },
                { token_address: data.token_address, limit: 10 }
            );

            const clients = this.getClientsByToken(data.token_address);
            for (const client of clients) {
                client.emit('getOrders', response);
            }
        } catch (error) {
            this.logger.error(`Error handling order status updated: ${error.message}`);
        }
    }

    private async handleOrderCanceled(data: any) {
        try {
            const response = await this.tradeService.getOrders(
                { wallet_id: null },
                { token_address: data.token_address, limit: 10 }
            );

            const clients = this.getClientsByToken(data.token_address);
            for (const client of clients) {
                client.emit('getOrders', response);
            }
        } catch (error) {
            this.logger.error(`Error handling order canceled: ${error.message}`);
        }
    }

    public getClientsByToken(tokenAddress: string): ExtendedSocket[] {
        const subscribedClients: ExtendedSocket[] = [];
        for (const [_, client] of this.server.sockets.sockets) {
            const extendedClient = client as ExtendedSocket;
            if (extendedClient.orderSubscriptions) {
                for (const [key, subscription] of extendedClient.orderSubscriptions.entries()) {
                    if (key.startsWith(`${tokenAddress}-`)) {
                        subscribedClients.push(extendedClient);
                        break;
                    }
                }
            }
        }
        return subscribedClients;
    }

    private sendError(client: ExtendedSocket, error: { status: number; message: string }) {
        client.emit('error', error);
    }

    public sendMessage(client: ExtendedSocket, message: { event: string; data: any }) {
        client.emit(message.event, message.data);
    }

    private updatePerformanceMetrics(queryTime: number) {
        this.performanceMetrics.queryTimes.push(queryTime);

        if (this.performanceMetrics.queryTimes.length > this.performanceMetrics.maxQueryTimes) {
            this.performanceMetrics.queryTimes.shift();
        }

        const now = Date.now();
        if (now - this.performanceMetrics.lastAdjustmentTime > this.performanceMetrics.adjustmentInterval) {
            this.adjustUpdateInterval();
            this.performanceMetrics.lastAdjustmentTime = now;
        }
    }

    private adjustUpdateInterval() {
        if (this.performanceMetrics.queryTimes.length === 0) return;

        const avgQueryTime = this.performanceMetrics.queryTimes.reduce((sum, time) => sum + time, 0) /
            this.performanceMetrics.queryTimes.length;

        this.logger.log(`Average query time: ${avgQueryTime.toFixed(2)}ms, Current interval: ${this.currentUpdateInterval}ms`);

        if (avgQueryTime > this.performanceMetrics.performanceThreshold) {
            if (this.currentUpdateInterval < this.MAX_UPDATE_INTERVAL) {
                this.currentUpdateInterval = Math.min(this.currentUpdateInterval + 1000, this.MAX_UPDATE_INTERVAL);
                this.logger.log(`Performance poor, increasing interval to ${this.currentUpdateInterval}ms`);
            }
        } else {
            if (this.currentUpdateInterval > 2000) {
                this.currentUpdateInterval = Math.max(this.currentUpdateInterval - 1000, 2000);
                this.logger.log(`Performance good, decreasing interval to ${this.currentUpdateInterval}ms`);
            }
        }
    }
} 