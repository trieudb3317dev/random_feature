import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SolanaService } from './solana.service';
import { Connection } from '@solana/web3.js';
import { AuthModule } from '../auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolanaListToken } from './entities/solana-list-token.entity';
import { SolanaTokensService } from './solana-tokens.service';
import { SolanaTokensController } from './solana-tokens.controller';
import { SolanaListPool } from './entities/solana-list-pool.entity';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SolanaTrackingService } from './services/tracking.service';
import { WebSocketCleanupService } from './services/cleanup.service';
import { SolanaFallbackService } from './services/fallback.service';
import { ScheduleModule } from '@nestjs/schedule';
import { SolanaListPoolRepository } from './repositories/solana-list-pool.repository';
import { SolanaListTokenRepository } from './repositories/solana-list-token.repository';
import { SmartRouteSolanaModule } from './smart-route-solana.module';
import { WalletAuth } from '../telegram-wallets/entities/wallet-auth.entity';
import { SolanaPriceCacheService } from './solana-price-cache.service';
import { SolanaListCategoriesToken } from './entities/solana-list-categories-token.entity';
import { SolanaTokenJoinCategory } from './entities/solana-token-join-category.entity';
import { SolanaListCategoriesTokenRepository } from './repositories/solana-list-categories-token.repository';
import { SolanaTokenJoinCategoryRepository } from './repositories/solana-token-join-category.repository';
import { SolanaCacheService } from './solana-cache.service';
import { SharedWebSocketModule } from '../websocket/shared-websocket.module';
import { CacheModule } from '../cache/cache.module';
import { SolanaConnectionModule } from './solana-connection.module';
import { SolanaWebSocketService } from './solana-websocket.service';
import { BirdeyeService } from '../on-chain/birdeye.service';
import { SolanaWishlistToken } from './entities/solana-wishlist-token.entity';
import { SolanaWishlistTokenRepository } from './repositories/solana-wishlist-token.repository';
import { OnChainModule } from '../on-chain/on-chain.module';
import { ChatsModule } from '../chats/chats.module';
import { SolanaTrackerService } from '../on-chain/solana-tracker.service';
import { CopyTradeModule } from '../copy-trade/copy-trade.module';
import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [
        ConfigModule,
        AuthModule,
        SharedWebSocketModule,
        CacheModule,
        SolanaConnectionModule,
        HttpModule.register({
            timeout: 10000,
            maxRedirects: 5,
        }),
        forwardRef(() => SmartRouteSolanaModule),
        TypeOrmModule.forFeature([
            SolanaListPool,
            SolanaListToken,
            WalletAuth,
            SolanaListCategoriesToken,
            SolanaTokenJoinCategory,
            SolanaWishlistToken,
            SolanaListTokenRepository,
            SolanaWishlistTokenRepository
        ]),
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        forwardRef(() => OnChainModule),
        forwardRef(() => ChatsModule),
        forwardRef(() => CopyTradeModule)
    ],
    providers: [
        {
            provide: SolanaService,
            useClass: SolanaService
        },
        SolanaTokensService,
        SolanaTrackingService,
        WebSocketCleanupService,
        SolanaFallbackService,
        SolanaListPoolRepository,
        SolanaListTokenRepository,
        SolanaListCategoriesTokenRepository,
        SolanaTokenJoinCategoryRepository,
        {
            provide: SolanaPriceCacheService,
            useClass: SolanaPriceCacheService
        },
        SolanaCacheService,
        SolanaWebSocketService,
        BirdeyeService,
        SolanaTrackerService,
        {
            provide: 'SOLANA_CONNECTION',
            useFactory: (configService: ConfigService) => {
                const rpcUrl = configService.getOrThrow<string>('SOLANA_RPC_URL');
                return new Connection(rpcUrl, 'confirmed');
            },
            inject: [ConfigService]
        }
    ],
    controllers: [SolanaTokensController],
    exports: [
        SolanaService,
        SolanaTokensService,
        SolanaTrackingService,
        WebSocketCleanupService,
        SolanaFallbackService,
        SolanaListPoolRepository,
        SolanaListTokenRepository,
        SolanaListCategoriesTokenRepository,
        SolanaTokenJoinCategoryRepository,
        SolanaPriceCacheService,
        SolanaCacheService,
        SolanaWebSocketService,
        BirdeyeService,
        SolanaTrackerService
    ]
})
export class SolanaModule { }
