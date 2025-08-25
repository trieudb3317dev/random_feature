import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Commitment, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SolanaPriceCacheService } from '../solana/solana-price-cache.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    namespace: 'balance',
    transports: ['websocket', 'polling'],
    path: '/socket.io'
  },
})
export class WalletBalanceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WalletBalanceGateway.name);
  private readonly rpcConnection: Connection;
  private readonly wsConnection: Connection;
  private readonly usdtMint: PublicKey;
  private readonly subscribedWallets: Map<string, Set<string>> = new Map();
  private readonly logSubscriptions: Map<string, number> = new Map();
  private readonly tokenAccountSubscriptions: Map<string, number> = new Map();
  private lastProcessedSlot: number = 0;
  private readonly commitment: Commitment = 'confirmed';

  constructor(
    private readonly configService: ConfigService,
    private readonly solanaPriceCacheService: SolanaPriceCacheService
  ) {
    // Kết nối RPC cho việc lấy dữ liệu ban đầu
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL');
    if (!rpcUrl) {
      throw new Error('SOLANA_RPC_URL is not configured');
    }
    this.rpcConnection = new Connection(rpcUrl, this.commitment);
    
    // Chuyển đổi wss:// thành https:// cho WebSocket connection
    const wssUrl = this.configService.get<string>('SOLANA_WSS_URL');
    if (!wssUrl) {
      throw new Error('SOLANA_WSS_URL is not configured');
    }
    const wsUrl = wssUrl.replace('wss://', 'https://');
    this.wsConnection = new Connection(wsUrl, this.commitment);
    
    this.usdtMint = new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');

    // Khởi tạo lastProcessedSlot
    this.initializeLastProcessedSlot();
  }

  private async initializeLastProcessedSlot() {
    try {
      const slot = await this.wsConnection.getSlot(this.commitment);
      this.lastProcessedSlot = slot;
    } catch (error) {
      this.logger.error(`Error initializing last processed slot: ${error.message}`);
    }
  }

  private async getLatestSlot(): Promise<number> {
    try {
      return await this.wsConnection.getSlot(this.commitment);
    } catch (error) {
      this.logger.error(`Error getting latest slot: ${error.message}`);
      return this.lastProcessedSlot;
    }
  }

  private async waitForLatestSlot(): Promise<void> {
    const maxRetries = 3;
    let retries = 0;
    let lastSlot = this.lastProcessedSlot;
    
    while (retries < maxRetries) {
      const currentSlot = await this.getLatestSlot();
      if (currentSlot > lastSlot) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const finalSlot = await this.getLatestSlot();
        if (finalSlot === currentSlot) {
          this.lastProcessedSlot = currentSlot;
          return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }
  }

  handleConnection(client: Socket) {
    // this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // this.logger.log(`Client disconnected: ${client.id}`);
    // Dọn dẹp subscriptions khi client ngắt kết nối
    this.subscribedWallets.forEach((clients, wallet) => {
      clients.delete(client.id);
      if (clients.size === 0) {
        // Hủy đăng ký lắng nghe logs
        const logSubscriptionId = this.logSubscriptions.get(wallet);
        if (logSubscriptionId) {
          this.wsConnection.removeOnLogsListener(logSubscriptionId);
          this.logSubscriptions.delete(wallet);
        }

        // Hủy đăng ký lắng nghe token accounts
        const tokenSubscriptionId = this.tokenAccountSubscriptions.get(wallet);
        if (tokenSubscriptionId) {
          this.wsConnection.removeAccountChangeListener(tokenSubscriptionId);
          this.tokenAccountSubscriptions.delete(wallet);
        }

        this.subscribedWallets.delete(wallet);
      }
    });
  }

  @SubscribeMessage('subscribeBalance')
  async handleSubscribeBalance(client: Socket, walletAddress: string) {
    // this.logger.log(`Client ${client.id} subscribing to balance for wallet: ${walletAddress}`);
    
    try {
      // Thêm client vào danh sách subscription
      if (!this.subscribedWallets.has(walletAddress)) {
        this.subscribedWallets.set(walletAddress, new Set());
      }
      const clients = this.subscribedWallets.get(walletAddress);
      if (clients) {
        clients.add(client.id);
      }

      // Lấy số dư ban đầu thông qua RPC
      const balances = await this.getTokenBalances(walletAddress);
      // this.logger.log(`Gửi số dư ban đầu cho client ${client.id}:`, balances);
      client.emit('balanceUpdate', { walletAddress, ...balances });

      // Nếu chưa có subscription cho ví này, tạo mới
      if (!this.logSubscriptions.has(walletAddress)) {
        const publicKey = new PublicKey(walletAddress);

        // Đăng ký lắng nghe logs cho ví
        const logSubscriptionId = this.wsConnection.onLogs(
          publicKey,
          async (logs) => {
            if (logs.err) return; // Bỏ qua nếu có lỗi

            try {
              // Đợi slot mới nhất
              await this.waitForLatestSlot();
              
              const newBalances = await this.getTokenBalances(walletAddress);
              const clients = this.subscribedWallets.get(walletAddress);
              if (clients) {
                clients.forEach(clientId => {
                  const clientSocket = this.server.sockets.sockets.get(clientId);
                  if (clientSocket) {
                    clientSocket.emit('balanceUpdate', { walletAddress, ...newBalances });
                  }
                });
              }
            } catch (error) {
              this.logger.error(`Lỗi khi cập nhật số dư cho ${walletAddress}: ${error.message}`);
            }
          },
          this.commitment
        );
        this.logSubscriptions.set(walletAddress, logSubscriptionId);

        // Lấy và lắng nghe các token accounts
        const tokenAccounts = await this.rpcConnection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );

        // Đăng ký lắng nghe thay đổi cho mỗi token account
        for (const { pubkey } of tokenAccounts.value) {
          const tokenSubscriptionId = this.wsConnection.onAccountChange(
            pubkey,
            async () => {
              try {
                // Đợi slot mới nhất
                await this.waitForLatestSlot();
                
                const newBalances = await this.getTokenBalances(walletAddress);
                const clients = this.subscribedWallets.get(walletAddress);
                if (clients) {
                  clients.forEach(clientId => {
                    const clientSocket = this.server.sockets.sockets.get(clientId);
                    if (clientSocket) {
                      clientSocket.emit('balanceUpdate', { walletAddress, ...newBalances });
                    }
                  });
                }
              } catch (error) {
                this.logger.error(`Lỗi khi cập nhật số dư cho ${walletAddress}: ${error.message}`);
              }
            },
            this.commitment
          );
          this.tokenAccountSubscriptions.set(walletAddress, tokenSubscriptionId);
        }
      }
    } catch (error) {
      this.logger.error(`Lỗi khi đăng ký theo dõi số dư cho client ${client.id}: ${error.message}`);
      client.emit('error', { message: 'Không thể đăng ký theo dõi số dư' });
    }
  }

  private async getTokenPrices() {
    try {
      // Lấy giá SOL/USD
      const solPrice = await this.solanaPriceCacheService.getSOLPriceInUSD();
      
      // USDT luôn = 1 USD
      const usdtPrice = 1;
      
      return {
        sol: solPrice,
        usdt: usdtPrice
      };
    } catch (error) {
      this.logger.error(`Lỗi khi lấy giá token: ${error.message}`);
      // Fallback prices
      return {
        sol: 0,
        usdt: 1
      };
    }
  }

  private async getTokenBalances(walletAddress: string) {
    try {
      const publicKey = new PublicKey(walletAddress);
      
      // this.logger.log(`Đang lấy thông tin token accounts cho ví: ${walletAddress}`);
      
      // Lấy số dư SOL
      const solBalance = await this.rpcConnection.getBalance(publicKey, this.commitment);
      const solAmount = solBalance / LAMPORTS_PER_SOL;
      
      // Lấy tất cả token accounts của ví thông qua RPC
      const tokenAccounts = await this.rpcConnection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      // this.logger.log(`Tìm thấy ${tokenAccounts.value.length} token accounts`);

      // Khởi tạo số dư
      const balances = {
        sol: solAmount,
        usdt: 0,
      };

      // Xử lý từng token account
      for (const { account } of tokenAccounts.value) {
        const parsedInfo = account.data.parsed.info;
        const mintAddress = parsedInfo.mint;
        const amount = parsedInfo.tokenAmount.uiAmount;

        // this.logger.log(`Đang xử lý token account - Mint: ${mintAddress}, Số lượng: ${amount}`);

        // Kiểm tra USDT token
        if (mintAddress === this.usdtMint.toBase58()) {
          balances.usdt = amount;
          // this.logger.log(`Tìm thấy số dư USDT: ${amount}`);
        }
      }

      // Lấy giá token
      const prices = await this.getTokenPrices();
      
      // Tính giá trị USD
      const balancesWithUSD = {
        ...balances,
        solUsd: balances.sol * prices.sol,
        usdtUsd: balances.usdt * prices.usdt,
        totalUsd: (balances.sol * prices.sol) + (balances.usdt * prices.usdt),
        prices: {
          sol: prices.sol,
          usdt: prices.usdt
        }
      };

      // this.logger.log(`Số dư cuối cùng cho ${walletAddress}:`, balancesWithUSD);
      return balancesWithUSD;
    } catch (error) {
      this.logger.error(`Lỗi khi lấy số dư token cho ${walletAddress}: ${error.message}`);
      throw error;
    }
  }

  // Phương thức để broadcast cập nhật số dư cho tất cả clients đã kết nối
  async broadcastBalanceUpdate(walletAddress: string, balances: any) {
    // this.logger.log(`Đang broadcast cập nhật số dư cho ${walletAddress}:`, balances);
    this.server.emit('balanceUpdate', { walletAddress, ...balances });
  }
} 