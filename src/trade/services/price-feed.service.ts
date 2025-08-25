import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import WebSocket from 'ws';
import { OrderBookService } from "../order-book.service";

@Injectable()
export class PriceFeedService {
    private wsClient: WebSocket;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private readonly RECONNECT_INTERVAL = 5000; // 5s
    private lastPrices = new Map<string, number>();
    private subscribedTokens = new Set<string>();

    constructor(
        private readonly eventEmitter: EventEmitter2,
        private readonly configService: ConfigService,
        private readonly orderBookService: OrderBookService
    ) {
        this.initializeWebSocket();
    }

    async subscribeToToken(tokenAddress: string) {
        if (!this.subscribedTokens.has(tokenAddress)) {
            this.subscribedTokens.add(tokenAddress);

            if (this.wsClient?.readyState === WebSocket.OPEN) {
                this.wsClient.send(JSON.stringify({
                    type: "subscribe",
                    tokens: [tokenAddress]
                }));
            }
        }
    }

    private initializeWebSocket() {
        try {
            const wsUrl = this.configService.get<string>('WS_PRICE_FEED_URL');
            if (!wsUrl) {
                throw new Error('WebSocket URL is not configured');
            }
            this.wsClient = new WebSocket(wsUrl);

            this.wsClient.on('open', async () => {
                console.log('Jupiter WebSocket connected');
                this.reconnectAttempts = 0;

                const pendingOrders = await this.orderBookService.getAllPendingOrders();
                const tokenAddresses = new Set(
                    pendingOrders.map(order => order.token_address)
                );

                if (tokenAddresses.size > 0) {
                    this.wsClient.send(JSON.stringify({
                        type: "subscribe",
                        tokens: Array.from(tokenAddresses)
                    }));

                    tokenAddresses.forEach(token => {
                        this.subscribedTokens.add(token as string);
                    });
                }
            });

            this.wsClient.on('message', (data: string) => {
                try {
                    const priceData = JSON.parse(data);
                    this.handlePriceUpdate(priceData);
                } catch (error) {
                    console.error('Error parsing price data:', error);
                }
            });

            this.wsClient.on('close', () => {
                console.log('WebSocket disconnected');
                this.handleDisconnect();
            });

            this.wsClient.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.handleDisconnect();
            });
        } catch (error) {
            console.error('Failed to initialize Jupiter WebSocket:', error);
            this.handleDisconnect();
        }
    }

    private handleDisconnect() {
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);

            setTimeout(() => {
                this.initializeWebSocket();
            }, this.RECONNECT_INTERVAL * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached. Using fallback price source.');
            this.switchToFallbackPriceSource();
        }
    }

    private async handlePriceUpdate(priceData: any) {
        const { tokenMint, price } = priceData;

        // Validate price change
        const lastPrice = this.lastPrices.get(tokenMint);
        if (lastPrice && Math.abs((price - lastPrice) / lastPrice) > 0.1) {
            console.warn(`Large price change detected for ${tokenMint}: ${lastPrice} -> ${price}`);
        }

        this.lastPrices.set(tokenMint, price);
        this.eventEmitter.emit('price.update', {
            tokenMint: tokenMint,
            price: parseFloat(price)
        });
    }

    private async switchToFallbackPriceSource() {
        // Implement fallback price source (e.g., REST API)
        setInterval(async () => {
            try {
                const prices = await this.getFallbackPrices();
                prices.forEach(price => this.handlePriceUpdate(price));
            } catch (error) {
                console.error('Error fetching fallback prices:', error);
            }
        }, 5000);
    }

    private async getFallbackPrices(): Promise<Array<{ tokenMint: string, price: number }>> {
        try {
            // Lấy giá từ Jupiter API v2 cho các token đã subscribe
            const tokens = Array.from(this.subscribedTokens);

            // Tạo query string từ danh sách token
            const tokenIds = tokens.join(',');
            const response = await fetch(`https://api.jup.ag/price/v2?ids=${tokenIds}`);
            const data = await response.json();

            // Parse response data
            return tokens.map(tokenMint => ({
                tokenMint,
                price: data.data[tokenMint]?.price
                    ? parseFloat(data.data[tokenMint].price)
                    : 0
            }));

        } catch (error) {
            console.error('Error fetching fallback prices:', error);
            return [];
        }
    }
}