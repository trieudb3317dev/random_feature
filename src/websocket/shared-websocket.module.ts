import { Module } from '@nestjs/common';
import { SolanaWebSocketService } from '../solana/solana-websocket.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Connection } from '@solana/web3.js';
import { CacheModule } from '../cache/cache.module';

@Module({
    imports: [
        ConfigModule,
        EventEmitterModule.forRoot(),
        CacheModule
    ],
    providers: [
        {
            provide: 'SOLANA_CONNECTION',
            useFactory: async (configService: ConfigService) => {
                const rpcUrl = configService.get<string>('SOLANA_RPC_URL');
                if (!rpcUrl) {
                    throw new Error('SOLANA_RPC_URL is not defined');
                }
                return new Connection(rpcUrl, 'confirmed');
            },
            inject: [ConfigService],
        },
        SolanaWebSocketService
    ],
    exports: [SolanaWebSocketService]
})
export class SharedWebSocketModule { } 