import { Module, MiddlewareConsumer, RequestMethod, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramWalletsModule } from './telegram-wallets/telegram-wallets.module';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { CopyTradeModule } from './copy-trade/copy-trade.module';
import { SolanaModule } from './solana/solana.module';
import { AuthModule } from './auth/auth.module';
import { initializeTransactionalContext } from 'typeorm-transactional';
import { MasterTradingModule } from './master-trading/master-trading.module';
import { TradeModule } from './trade/trade.module';
import { PriceFeedModule } from './price-feed/price-feed.module';
import { PumpFunModule } from './pump-fun/pump-fun.module';
import { SmartRouteSolanaModule } from './solana/smart-route-solana.module';
import { Connection } from '@solana/web3.js';
import { DbSyncService } from './db-sync.service';
import { SolanaTokensModule } from './solana/solana-tokens.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SharedWebSocketModule } from './websocket/shared-websocket.module';
import { OnChainModule } from './on-chain/on-chain.module';
import { WebSocketModule } from './websocket/websocket.module';
import { CacheModule } from './cache/cache.module';
import { ChatsModule } from './chats/chats.module';
import { ReferralModule } from './referral/referral.module';
import { DepositWithdrawModule } from './deposit-withdraw/deposit-withdraw.module';
import { AdminModule } from './admin/admin.module';
import { SwapModule } from './swaps/swap.module';
import { AirdropsModule } from './airdrops/airdrops.module';
import { BittworldsModule } from './bittworlds/bittworlds.module';
//import { ThrottlerModule } from '@nestjs/throttler';
//import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';

// Initialize transactional context
initializeTransactionalContext();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CacheModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      synchronize: false,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      extra: {
        ssl: {
          rejectUnauthorized: false,
        },
        timezone: 'UTC',
      }
    }),  
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('DB_MONGODB_URI_CHAT'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    SharedWebSocketModule,
    SolanaModule,
    OnChainModule,
    TelegramWalletsModule,
    TelegramBotModule,
    CopyTradeModule,
    SmartRouteSolanaModule,
    MasterTradingModule,
    TradeModule,
    PriceFeedModule,
    PumpFunModule,
    SolanaTokensModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    forwardRef(() => WebSocketModule),
    ChatsModule,
    ReferralModule,
    DepositWithdrawModule,
    SwapModule,
    AdminModule,
    AirdropsModule,
    BittworldsModule,
    // ThrottlerModule.forRoot({
    //   throttlers: [{
    //     ttl: 60, // 1 phút
    //     limit: 5000, // 5000 request mỗi phút cho WebSocket
    //   }],
    // }),
  ],
  controllers: [AppController],
  providers: [
    DbSyncService,
    AppService,
    {
      provide: 'SOLANA_CONNECTION',
      useFactory: (configService: ConfigService) => {
        const rpcUrl = configService.get<string>('SOLANA_RPC_URL');
        if (!rpcUrl) {
          throw new Error('SOLANA_RPC_URL is not defined in environment variables');
        }
        return new Connection(rpcUrl, 'confirmed');
      },
      inject: [ConfigService],
    },
  ],
  exports: [DbSyncService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    //consumer
    //  .apply(RateLimitMiddleware)
    //  .forRoutes('*');
  }
}