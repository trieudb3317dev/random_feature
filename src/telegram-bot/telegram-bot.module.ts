import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { TelegramBotService } from './telegram-bot.service';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { UserWallet } from '../telegram-wallets/entities/user-wallet.entity';
import { WalletAuth } from '../telegram-wallets/entities/wallet-auth.entity';
import { UserWalletCode } from '../telegram-wallets/entities/user-wallet-code.entity';
import { WalletReferent } from '../referral/entities/wallet-referent.entity';
import { TelegramWalletsModule } from '../telegram-wallets/telegram-wallets.module';
import { SolanaModule } from '../solana/solana.module';
import { ReferralModule } from 'src/referral/referral.module';
import { LoginEmailController } from './login-email.controller';
import { LoginEmailService } from './login-email.service';
import { AuthModule } from '../auth/auth.module';
import { GoogleAuthService } from './google-auth.service';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([
      ListWallet, 
      UserWallet, 
      WalletAuth,
      UserWalletCode,
      WalletReferent
    ]),
    forwardRef(() => TelegramWalletsModule),
    forwardRef(() => SolanaModule),
    forwardRef(() => ReferralModule),
    forwardRef(() => AuthModule),
    NotificationModule,
  ],
  controllers: [LoginEmailController],
  providers: [
    TelegramBotService, 
    LoginEmailService, 
    GoogleAuthService
  ],
  exports: [
    TelegramBotService, 
    GoogleAuthService
  ],
})
export class TelegramBotModule {}
