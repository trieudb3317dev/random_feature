import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListWallet } from './entities/list-wallet.entity';
import { UserWallet } from './entities/user-wallet.entity';
import { WalletAuth } from './entities/wallet-auth.entity';
import { TelegramWalletsController } from './telegram-wallets.controller';
import { TelegramWalletsService } from './telegram-wallets.service';
import { MemepumpTokenService } from './memepump-token.service';
import { ConfigModule } from '@nestjs/config';
import { SolanaModule } from '../solana/solana.module';
import { UserWalletCode } from './entities/user-wallet-code.entity';
import { SolanaListToken } from '../solana/entities/solana-list-token.entity';
import { SolanaListCategoriesToken } from '../solana/entities/solana-list-categories-token.entity';
import { SolanaTokenJoinCategory } from '../solana/entities/solana-token-join-category.entity';
import { CacheModule } from '../cache/cache.module';
import { ChatsModule } from '../chats/chats.module';
import { GoogleAuthService } from '../telegram-bot/google-auth.service';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import { HttpModule } from '@nestjs/axios';
import { NotificationModule } from '../notifications/notification.module';
import { BgRefModule } from '../referral/bg-ref.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserWalletCode,
      ListWallet,
      UserWallet,
      WalletAuth,
      SolanaListToken,
      SolanaListCategoriesToken,
      SolanaTokenJoinCategory
    ]),
    ConfigModule,
    HttpModule,
    SolanaModule,
    CacheModule,
    forwardRef(() => ChatsModule),
    forwardRef(() => TelegramBotModule),
    NotificationModule,
    forwardRef(() => BgRefModule)
  ],
  controllers: [TelegramWalletsController],
  providers: [
    TelegramWalletsService,
    MemepumpTokenService,
    GoogleAuthService
  ],
  exports: [TelegramWalletsService]
})
export class TelegramWalletsModule { }
