import { Module, forwardRef } from '@nestjs/common';
import { SolanaWebSocketService } from './solana-websocket.service';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../cache/cache.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WebSocketModule } from '../websocket/websocket.module';
import { SolanaConnectionModule } from './solana-connection.module';

@Module({
    imports: [
        ConfigModule,
        CacheModule,
        EventEmitterModule.forRoot(),
        SolanaConnectionModule,
        forwardRef(() => WebSocketModule)
    ],
    providers: [
        SolanaWebSocketService
    ],
    exports: [SolanaWebSocketService, forwardRef(() => WebSocketModule)]
})
export class SolanaWebSocketModule { } 