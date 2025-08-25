import { Module, forwardRef } from '@nestjs/common';
import { OnChainController } from './on-chain.controller';
import { OnChainService } from './on-chain.service';
import { JwtModule } from '@nestjs/jwt';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SolanaModule } from '../solana/solana.module';
import { CacheModule } from '../cache/cache.module';
import { SharedWebSocketModule } from '../websocket/shared-websocket.module';
import { BirdeyeService } from './birdeye.service';
import { SolanaTrackerService } from './solana-tracker.service';
import { HttpModule } from '@nestjs/axios';
import { CopyTradeModule } from '../copy-trade/copy-trade.module';
import { SolanaTrackerTradeService } from './services/solana-tracker-trade.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '1d' },
    }),
    EventEmitterModule.forRoot(),
    forwardRef(() => SolanaModule),
    CacheModule,
    SharedWebSocketModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    forwardRef(() => CopyTradeModule)
  ],
  controllers: [OnChainController],
  providers: [
    OnChainService, 
    BirdeyeService, 
    SolanaTrackerService,
    SolanaTrackerTradeService
  ],
  exports: [
    OnChainService, 
    BirdeyeService, 
    SolanaTrackerService,
    SolanaTrackerTradeService
  ]
})
export class OnChainModule { }
