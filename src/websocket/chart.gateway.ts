import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChartType } from '../on-chain/solana-tracker.service';
import { SharedWebSocketService } from './services/shared-websocket.service';

interface OHLCVData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    buyVolume: number;
    sellVolume: number;
    buyCount: number;
    sellCount: number;
}

@WebSocketGateway({
    namespace: 'chart',
    transports: ['websocket'],
    path: '/socket.io',
    allowEIO3: true,
    allowEIO4: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 60000
})
export class ChartGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ChartGateway.name);
    private readonly DEFAULT_TIMEFRAME: ChartType = '5m';
    private readonly SUPPORTED_TIMEFRAMES: ChartType[] = [
        '1s', '5s', '15s', '30s', '1m', '3m', '5m', '15m', '30m',
        '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1mn'
    ];
    private candleData: Map<string, Map<ChartType, Map<number, OHLCVData>>> = new Map();
    private currentPrices: Map<string, Map<ChartType, number>> = new Map();
    private readonly MAX_PRICE_CHANGE_PERCENT = 70;

    constructor(
        private readonly sharedWebSocketService: SharedWebSocketService,
        private readonly eventEmitter: EventEmitter2
    ) {
        // this.logger.log('ChartGateway constructor called');
        // this.logger.log('EventEmitter instance:', this.eventEmitter ? 'Available' : 'Not available');
        
        // Listen for specific client events
        this.eventEmitter.onAny((event: string, data: any) => {
            // this.logger.log(`[ChartGateway] Received event ${event}:`, data);
            if (event.startsWith('chart.update:')) {
                const clientId = event.split("update:")[1];
                // this.logger.log(`[ChartGateway] Received event ${event} for client ${clientId}:`, data);
                if (data && data.tokenAddress && data.timeframe && data.data) {
                    this.handleChartUpdate(clientId, data);
                } else {
                    this.logger.error(`[ChartGateway] Invalid chart update data for client ${clientId}:`, data);
                }
            }
        });

        // this.logger.log('ChartGateway event listeners registered');
    }

    handleConnection(client: Socket) {
        // this.logger.log(`Client connected to chart namespace: ${client.id}`);
        
        client.emit('connected', { clientId: client.id });
    }

    handleDisconnect(client: Socket) {
        // this.logger.log(`Client disconnected from chart namespace: ${client.id}`);
        this.sharedWebSocketService.removeClient(client.id);
    }

    private isValidPriceChange(tokenAddress: string, timeframe: ChartType, newPrice: number): boolean {
        if (!this.currentPrices.has(tokenAddress)) {
            this.currentPrices.set(tokenAddress, new Map());
        }
        const timeframePrices = this.currentPrices.get(tokenAddress)!;
        
        if (!timeframePrices.has(timeframe)) {
            timeframePrices.set(timeframe, newPrice);
            this.logger.log(`[Price Validation] Giá đầu tiên cho ${tokenAddress} (${timeframe}): ${newPrice}`);
            return true;
        }

        const currentPrice = timeframePrices.get(timeframe)!;
        const priceChangePercent = Math.abs((newPrice - currentPrice) / currentPrice * 100);
        
        if (priceChangePercent <= this.MAX_PRICE_CHANGE_PERCENT) {
            timeframePrices.set(timeframe, newPrice);
            return true;
        }
        
        this.logger.warn(`[Price Validation] Phát hiện giá bị lệch lớn cho ${tokenAddress} (${timeframe}):
            - Giá hiện tại: ${currentPrice}
            - Giá mới: ${newPrice}
            - Phần trăm thay đổi: ${priceChangePercent.toFixed(2)}%
            - Ngưỡng cho phép: ${this.MAX_PRICE_CHANGE_PERCENT}%
            => Bỏ qua cập nhật này`);
        return false;
    }

    private handleChartUpdate(clientId: string, data: any) {
        const { tokenAddress, timeframe, data: updateData } = data;

        if (!updateData) {
            this.logger.error(`[handleChartUpdate] No update data received for client ${clientId}`);
            return;
        }

        // Validate price change before proceeding
        if (!this.isValidPriceChange(tokenAddress, timeframe, updateData.priceUsd)) {
            return;
        }

        this.logger.debug(`[handleChartUpdate] Update data:`, updateData);

        // Update candle data
        if (!this.candleData.has(tokenAddress)) {
            // this.logger.log(`Creating new candle data for token ${tokenAddress}`);
            this.candleData.set(tokenAddress, new Map());
        }
        if (!this.candleData.get(tokenAddress)!.has(timeframe)) {
            // this.logger.log(`Creating new timeframe data for ${timeframe}`);
            this.candleData.get(tokenAddress)!.set(timeframe, new Map());
        }

        const timeframeData = this.candleData.get(tokenAddress)!.get(timeframe)!;
        const candleTime = this.getCandleTime(updateData.time, timeframe);

        this.logger.debug(`Processing candle for time ${candleTime}:`, {
            price: updateData.priceUsd,
            volume: updateData.volume,
            type: updateData.type
        });

        let candle = timeframeData.get(candleTime);
        if (!candle) {
            // this.logger.log(`Creating new candle for time ${candleTime}`);
            candle = {
                time: candleTime,
                open: updateData.priceUsd,
                high: updateData.priceUsd,
                low: updateData.priceUsd,
                close: updateData.priceUsd,
                volume: updateData.volume,
                buyVolume: updateData.type === 'buy' ? updateData.volume : 0,
                sellVolume: updateData.type === 'sell' ? updateData.volume : 0,
                buyCount: updateData.type === 'buy' ? 1 : 0,
                sellCount: updateData.type === 'sell' ? 1 : 0
            };
            timeframeData.set(candleTime, candle);
        } else {
            // this.logger.log(`Updating existing candle for time ${candleTime}`);
            candle.high = Math.max(candle.high, updateData.priceUsd);
            candle.low = Math.min(candle.low, updateData.priceUsd);
            candle.close = updateData.priceUsd;
            candle.volume += updateData.volume;

            if (updateData.type === 'buy') {
                candle.buyVolume += updateData.volume;
                candle.buyCount++;
            } else {
                candle.sellVolume += updateData.volume;
                candle.sellCount++;
            }
        }

        // Prepare data for client
        const clientData = {
            tokenAddress,
            timeframe,
            timestamp: Date.now(),
            data: {
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume
            }
        };

        // this.logger.log(`Emitting chartUpdate to client ${clientId}:`, clientData);
        
        // Emit update to client directly
        this.server.to(clientId).emit('chartUpdate', clientData);
        // this.logger.log(`Successfully emitted chartUpdate to client ${clientId}`);
    }

    private getCandleTime(timestamp: number, timeframe: ChartType): number {
        const date = new Date(timestamp);
        switch (timeframe) {
            case '1s': return Math.floor(timestamp / 1000) * 1000;
            case '5s': return Math.floor(timestamp / 5000) * 5000;
            case '15s': return Math.floor(timestamp / 15000) * 15000;
            case '30s': return Math.floor(timestamp / 30000) * 30000;
            case '1m': date.setSeconds(0, 0); return date.getTime();
            case '3m': date.setMinutes(Math.floor(date.getMinutes() / 3) * 3, 0, 0); return date.getTime();
            case '5m': date.setMinutes(Math.floor(date.getMinutes() / 5) * 5, 0, 0); return date.getTime();
            case '15m': date.setMinutes(Math.floor(date.getMinutes() / 15) * 15, 0, 0); return date.getTime();
            case '30m': date.setMinutes(Math.floor(date.getMinutes() / 30) * 30, 0, 0); return date.getTime();
            case '1h': date.setMinutes(0, 0, 0); return date.getTime();
            case '2h': date.setHours(Math.floor(date.getHours() / 2) * 2, 0, 0, 0); return date.getTime();
            case '4h': date.setHours(Math.floor(date.getHours() / 4) * 4, 0, 0, 0); return date.getTime();
            case '6h': date.setHours(Math.floor(date.getHours() / 6) * 6, 0, 0, 0); return date.getTime();
            case '8h': date.setHours(Math.floor(date.getHours() / 8) * 8, 0, 0, 0); return date.getTime();
            case '12h': date.setHours(Math.floor(date.getHours() / 12) * 12, 0, 0, 0); return date.getTime();
            case '1d': date.setHours(0, 0, 0, 0); return date.getTime();
            case '3d': date.setDate(date.getDate() - (date.getDate() % 3)); date.setHours(0, 0, 0, 0); return date.getTime();
            case '1w': {
                // Set to previous Sunday
                const day = date.getDay();
                date.setDate(date.getDate() - day);
                date.setHours(0, 0, 0, 0);
                return date.getTime();
            }
            case '1mn': {
                // Set to first day of month
                date.setDate(1);
                date.setHours(0, 0, 0, 0);
                return date.getTime();
            }
            default: return timestamp;
        }
    }

    @SubscribeMessage('subscribeToChart')
    async handleSubscribeToChart(client: Socket, data: { tokenAddress: string, timeframe?: ChartType }) {
        try {
            const { tokenAddress, timeframe = this.DEFAULT_TIMEFRAME } = data;
            this.logger.log(`Client ${client.id} subscribing to chart:`, { tokenAddress, timeframe });

            if (!tokenAddress) {
                throw new Error('Token address is required');
            }

            if (!this.SUPPORTED_TIMEFRAMES.includes(timeframe)) {
                throw new Error(`Unsupported timeframe. Supported timeframes: ${this.SUPPORTED_TIMEFRAMES.join(', ')}`);
            }

            // Subscribe client to token using shared service
            this.sharedWebSocketService.subscribeClient(client.id, tokenAddress, timeframe);
            this.logger.log(`Client ${client.id} subscribed to token ${tokenAddress} with timeframe ${timeframe}`);

            // Send initial data if available
            const timeframeData = this.candleData.get(tokenAddress)?.get(timeframe);
            if (timeframeData) {
                const candles = Array.from(timeframeData.values())
                    .sort((a, b) => a.time - b.time);
                this.logger.log(`Sending initial data to client ${client.id}: ${candles.length} candles`);
                
                const initialData = {
                    tokenAddress,
                    timeframe,
                    candles: candles.map(candle => ({
                        time: candle.time,
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                        volume: candle.volume
                    }))
                };

                this.logger.debug(`Initial data:`, initialData);
                client.emit('initialData', initialData);
                // this.logger.log(`Successfully sent initial data to client ${client.id}`);
            } else {
                // this.logger.log(`No initial data available for client ${client.id}`);
            }

            client.emit('subscriptionSuccess', {
                success: true,
                message: 'Successfully subscribed to chart',
                data: { tokenAddress, timeframe }
            });
        } catch (error) {
            this.logger.error(`Error subscribing to chart: ${error.message}`);
            client.emit('subscriptionError', {
                success: false,
                message: error.message
            });
        }
    }

    @SubscribeMessage('unsubscribeFromChart')
    async handleUnsubscribeFromChart(client: Socket, data: { tokenAddress: string }) {
        try {
            const { tokenAddress } = data;
            this.sharedWebSocketService.unsubscribeClient(client.id, tokenAddress);

            client.emit('unsubscriptionSuccess', {
                success: true,
                message: 'Successfully unsubscribed from chart',
                data: { tokenAddress }
            });
        } catch (error) {
            this.logger.error(`Error unsubscribing from chart: ${error.message}`);
            client.emit('error', {
                success: false,
                message: 'Failed to unsubscribe from chart',
                details: error
            });
        }
    }
} 