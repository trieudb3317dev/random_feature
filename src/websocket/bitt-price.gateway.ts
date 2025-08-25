import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/bitt-price',
  cors: {
    origin: "*",
    transports: ['websocket', 'polling'],
    path: '/socket.io'
  }
})
export class BittPriceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BittPriceGateway.name);
  private bittworldWs: any;
  private isConnected = false;
  private reconnectInterval: NodeJS.Timeout;
  private readonly RECONNECT_DELAY = 3000; // 3 seconds
  
  // Cache để lưu giá BITT mới nhất
  private latestPriceCache: any = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 60000; // Cache TTL: 1 phút

  constructor() {
    this.connectToBittworld();
  }

  private async connectToBittworld() {
    try {
      // Sử dụng WebSocket thuần để kết nối đến Bittworld
      const ws = await import('ws');
      this.bittworldWs = new ws.default('wss://bei.bittworld.com/ws');
      
      this.bittworldWs.on('open', () => {
        this.isConnected = true;
        this.subscribeToBittPrice();
      });

      this.bittworldWs.on('message', (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleBittworldMessage(message);
        } catch (error) {
          this.logger.error('Error parsing message:', error);
        }
      });

      this.bittworldWs.on('close', () => {
        this.logger.log('Disconnected from Bittworld WebSocket');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.bittworldWs.on('error', (error) => {
        this.logger.error('Bittworld WebSocket error:', error);
        this.isConnected = false;
        this.scheduleReconnect();
      });

    } catch (error) {
      this.logger.error('Error connecting to Bittworld:', error);
      this.scheduleReconnect();
    }
  }

  private subscribeToBittPrice() {
    if (this.isConnected) {
      const subscribeMessage = {
        method: "price.subscribe",
        params: ["BITT_USDT"],
        id: Date.now()
      };
      
      this.bittworldWs.send(JSON.stringify(subscribeMessage));
    }
  }

  private handleBittworldMessage(message: any) {
    if (message.method === 'price.update' && message.params && message.params.length >= 2) {
      const symbol = message.params[0];
      const price = message.params[1];
      
      // Tạo object price mới
      const newPrice = {
        symbol,
        price: parseFloat(price),
        timestamp: new Date().toISOString()
      };
      
      // Cập nhật cache
      this.latestPriceCache = newPrice;
      this.cacheTimestamp = Date.now();
      
      // Broadcast price update to all connected clients
      this.server.emit('bitt-price-update', newPrice);
      
      this.logger.log(`BITT price update: ${symbol} = ${price} (cached)`);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
    }
    
    // Xóa cache khi mất kết nối
    this.clearCache();
    
    this.reconnectInterval = setTimeout(() => {
      this.connectToBittworld();
    }, this.RECONNECT_DELAY);
  }

  // Kiểm tra cache còn hợp lệ không
  private isCacheValid(): boolean {
    if (!this.latestPriceCache || this.cacheTimestamp === 0) {
      return false;
    }
    
    const now = Date.now();
    return (now - this.cacheTimestamp) < this.CACHE_TTL;
  }

  // Xóa cache
  private clearCache(): void {
    this.latestPriceCache = null;
    this.cacheTimestamp = 0;
    this.logger.log('Price cache cleared');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    
    // Send current connection status
    client.emit('connection-status', {
      connected: this.isConnected,
      message: this.isConnected ? 'Connected to Bittworld' : 'Disconnected from Bittworld'
    });
    
    // Gửi giá cache mới nhất cho client mới (nếu có và còn hợp lệ)
    if (this.latestPriceCache && this.isCacheValid()) {
      client.emit('bitt-price-update', this.latestPriceCache);
      this.logger.log(`Sent cached price to new client: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
  }

  @SubscribeMessage('get-price')
  handleGetPrice(client: Socket) {
    if (this.isConnected) {
      client.emit('price-status', {
        status: 'connected',
        message: 'Connected to Bittworld price feed'
      });
      
      // Gửi giá cache hiện tại nếu có
      if (this.latestPriceCache && this.isCacheValid()) {
        client.emit('bitt-price-update', this.latestPriceCache);
        this.logger.log(`Sent cached price to client ${client.id} on request`);
      }
    } else {
      client.emit('price-status', {
        status: 'disconnected',
        message: 'Not connected to Bittworld'
      });
    }
  }

  @SubscribeMessage('subscribe-price')
  handleSubscribePrice(client: Socket) {
    client.join('price-updates');
    client.emit('subscription-confirmed', {
      message: 'Subscribed to BITT price updates'
    });
  }

  @SubscribeMessage('unsubscribe-price')
  handleUnsubscribePrice(client: Socket) {
    client.leave('price-updates');
    client.emit('unsubscription-confirmed', {
      message: 'Unsubscribed from BITT price updates'
    });
  }

  onModuleDestroy() {
    if (this.bittworldWs) {
      this.bittworldWs.close();
    }
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
    }
  }
}
