import { Module, forwardRef } from '@nestjs/common';
import { SolanaModule } from './solana.module';
import { SmartRouteSolanaService } from './smart-route-solana.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolanaListToken } from './entities/solana-list-token.entity';
import { SolanaListPool } from './entities/solana-list-pool.entity';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '../cache/cache.module';
import { SharedWebSocketModule } from '../websocket/shared-websocket.module';
import { SolanaConnectionModule } from './solana-connection.module';
import { PumpFunModule } from '../pump-fun/pump-fun.module';

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([SolanaListToken, SolanaListPool]),
        CacheModule,
        EventEmitterModule.forRoot(),
        SharedWebSocketModule,
        SolanaConnectionModule,
        PumpFunModule,
        forwardRef(() => SolanaModule)
    ],
    providers: [
        SmartRouteSolanaService
    ],
    exports: [SmartRouteSolanaService]
})
export class SmartRouteSolanaModule { } 