import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Connection } from '@solana/web3.js';
import { CacheModule } from '../cache/cache.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolanaWebSocketService } from '../solana/solana-websocket.service';
import { TradeModule } from '../trade/trade.module';
import { SolanaListToken } from '../solana/entities/solana-list-token.entity';
import { SolanaListTokenRepository } from '../solana/repositories/solana-list-token.repository';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
    imports: [
        ConfigModule,
        CacheModule,
        EventEmitterModule.forRoot(),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: '1d' },
            }),
            inject: [ConfigService],
        }),
        TypeOrmModule.forFeature([SolanaListToken]),
        forwardRef(() => TradeModule),
        forwardRef(() => WebSocketModule)
    ],
    providers: [
        {
            provide: 'SOLANA_CONNECTION',
            useFactory: (configService: ConfigService) => {
                const rpcUrl = configService.get<string>('SOLANA_RPC_URL');
                if (!rpcUrl) {
                    throw new Error('SOLANA_RPC_URL is not defined');
                }
                return new Connection(rpcUrl);
            },
            inject: [ConfigService],
        },
        SolanaWebSocketService,
        SolanaListTokenRepository
    ],
    exports: [
        SolanaWebSocketService,
        SolanaListTokenRepository,
        forwardRef(() => WebSocketModule)
    ]
})
export class SharedWebSocketModule { } 