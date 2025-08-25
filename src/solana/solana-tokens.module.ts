import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolanaTokensController } from './solana-tokens.controller';
import { SolanaTokensService } from './solana-tokens.service';
import { SolanaListToken } from './entities/solana-list-token.entity';
import { SolanaListPool } from './entities/solana-list-pool.entity';
import { SolanaService } from './solana.service';
import { TokenListenPumpfunService } from './token-listen-pumpfun.service';
import { TokenMetadataService } from './token-metadata.service';
import { SmartRouteSolanaModule } from './smart-route-solana.module';
import { SolanaListPoolRepository } from './repositories/solana-list-pool.repository';
import { SolanaListTokenRepository } from './repositories/solana-list-token.repository';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { AuthModule } from '../auth/auth.module';
import { TradeModule } from '../trade/trade.module';
import { SolanaListCategoriesTokenRepository } from './repositories/solana-list-categories-token.repository';
import { SolanaTokenJoinCategoryRepository } from './repositories/solana-token-join-category.repository';
import { SolanaTokenJoinCategory } from './entities/solana-token-join-category.entity';
import { SolanaPriceCacheService } from './solana-price-cache.service';
import { SolanaListCategoriesToken } from './entities/solana-list-categories-token.entity';
import { SharedWebSocketModule } from '../shared/shared-websocket.module';
import { SolanaCacheService } from './solana-cache.service';
import { CacheModule } from '../cache/cache.module';
import { SolanaWishlistToken } from './entities/solana-wishlist-token.entity';
import { SolanaWishlistTokenRepository } from './repositories/solana-wishlist-token.repository';
import { OnChainModule } from '../on-chain/on-chain.module';
import { ChatsModule } from '../chats/chats.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            SolanaListToken,
            SolanaListPool,
            ListWallet,
            SolanaTokenJoinCategory,
            SolanaListCategoriesToken,
            SolanaWishlistToken
        ]),
        SmartRouteSolanaModule,
        CacheModule,
        EventEmitterModule.forRoot(),
        AuthModule,
        forwardRef(() => SharedWebSocketModule),
        forwardRef(() => TradeModule),
        OnChainModule,
        ChatsModule
    ],
    controllers: [SolanaTokensController],
    providers: [
        SolanaTokensService,
        SolanaService,
        TokenListenPumpfunService,
        TokenMetadataService,
        SolanaListPoolRepository,
        SolanaListTokenRepository,
        SolanaListCategoriesTokenRepository,
        SolanaTokenJoinCategoryRepository,
        SolanaPriceCacheService,
        SolanaCacheService,
        SolanaWishlistTokenRepository
    ],
    exports: [
        SolanaTokensService,
        SolanaService,
        SolanaListTokenRepository,
        SolanaListPoolRepository,
        SolanaListCategoriesTokenRepository,
        SolanaTokenJoinCategoryRepository,
        SolanaPriceCacheService,
        SolanaCacheService,
        SolanaWishlistTokenRepository
    ]
})
export class SolanaTokensModule { } 