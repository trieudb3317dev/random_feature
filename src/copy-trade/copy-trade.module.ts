import { Module, Logger, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CopyTradeController } from './copy-trade.controller';
import { CopyTradeService } from './copy-trade.service';
import { CopyTrade } from './entities/copy-trade.entity';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { TelegramWalletsModule } from 'src/telegram-wallets/telegram-wallets.module';
import { SolanaModule } from '../solana/solana.module';
import { CopyTradeDetail } from './entities/copy-trade-detail.entity';
import { HashExclude } from './entities/hash_exclude.entity';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { PositionTracking } from './entities/position-tracking.entity';
import { SmartRouteSolanaModule } from '../solana/smart-route-solana.module';
import { SolanaWebSocketService } from '../solana/solana-websocket.service';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '../cache/cache.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            CopyTrade,
            CopyTradeDetail,
            HashExclude,
            ListWallet,
            PositionTracking
        ]),
        JwtModule.register({}),
        AuthModule,
        forwardRef(() => TelegramWalletsModule),
        forwardRef(() => SolanaModule),
        forwardRef(() => SmartRouteSolanaModule),
        EventEmitterModule.forRoot(),
        CacheModule,
    ],
    controllers: [CopyTradeController],
    providers: [
        CopyTradeService,
        SolanaWebSocketService,
        Logger
    ],
    exports: [CopyTradeService],
})
export class CopyTradeModule { }
