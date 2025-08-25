import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket from 'ws';
import { TradeService } from '../trade/trade.service';
import { MasterTradingService } from '../master-trading/master-trading.service';
import { OrderBookService } from '../trade/order-book.service';

@Injectable()
export class PriceFeedService implements OnModuleInit, OnModuleDestroy {
    private ws: WebSocket;
    private subscribedTokens: Set<string> = new Set();
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;

    constructor(
        private eventEmitter: EventEmitter2,
        @Inject(forwardRef(() => TradeService))
        private tradeService: TradeService,
        @Inject(forwardRef(() => MasterTradingService))
        private masterTradingService: MasterTradingService,
        private orderBookService: OrderBookService
    ) { }

    onModuleInit() {
        this.connectWebSocket();
    }

    onModuleDestroy() {
        this.ws?.close();
    }

    private connectWebSocket() {
        try {
            this.ws = new WebSocket('wss://price.jup.ag/price', {
                handshakeTimeout: 10000,
                headers: {
                    'Origin': 'https://jup.ag',
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
                console.log('Connected to Jupiter Price WebSocket');
                this.reconnectAttempts = 0;
                // Resubscribe to all tokens after reconnect
                this.subscribedTokens.forEach(token => this.subscribeToToken(token));
            });

            this.ws.on('message', (data: string) => {
                try {
                    const priceData = JSON.parse(data);
                    if (priceData.error) {
                        console.error('Price feed error:', priceData.error);
                        return;
                    }
                    this.eventEmitter.emit('price.update', priceData);
                } catch (error) {
                    console.error('Error parsing price data:', error);
                }
            });

            this.ws.on('error', (error) => {
                console.error('WebSocket price feed error:');
                this.handleReconnect();
            });

            this.ws.on('close', (code, reason) => {
                console.log('WebSocket connection closed:', code, reason);
                this.handleReconnect();
            });
        } catch (error) {
            console.error('Error creating WebSocket connection:', error);
            this.handleReconnect();
        }
    }

    private handleReconnect() {
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);
            setTimeout(() => {
                this.connectWebSocket();
            }, Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)); // Exponential backoff with max 30s
        } else {
            console.error('Max reconnection attempts reached. Please check your internet connection and Jupiter API status.');
        }
    }

    subscribeToToken(tokenAddress: string) {
        if (!this.subscribedTokens.has(tokenAddress)) {
            this.subscribedTokens.add(tokenAddress);
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'subscribe',
                    tokens: [tokenAddress]
                }));
            }
        }
    }

    unsubscribeFromToken(tokenAddress: string) {
        if (this.subscribedTokens.has(tokenAddress)) {
            this.subscribedTokens.delete(tokenAddress);
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'unsubscribe',
                    tokens: [tokenAddress]
                }));
            }
        }
    }

    async handlePriceUpdate(tokenAddress: string, price: number) {
        try {
            await this.orderBookService.processMatchingOrders(tokenAddress, price);
        } catch (error) {
            console.error('Error processing price update:', error);
            this.eventEmitter.emit('price.error', {
                tokenAddress,
                price,
                error: error.message,
                timestamp: new Date()
            });
        }
    }
} 