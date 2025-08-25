import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { BgRefController } from './bg-ref.controller';
import { BgRefService } from './bg-ref.service';
import { BgAuthService } from './bg-auth.service';
import { BgRefWithdrawService } from './services/bg-ref-withdraw.service';
import { JwtBgAuthGuard } from './guards/jwt-bg-auth.guard';
import { JwtBgStrategy } from './strategies/jwt-bg.strategy';
import { BgAffiliateTree } from './entities/bg-affiliate-tree.entity';
import { BgAffiliateNode } from './entities/bg-affiliate-node.entity';
import { BgAffiliateCommissionLog } from './entities/bg-affiliate-commission-log.entity';
import { BgAffiliateCommissionReward } from './entities/bg-affiliate-commission-reward.entity';
import { WalletRefReward } from './entities/wallet-ref-reward.entity';
import { RefWithdrawHistory } from './entities/ref-withdraw-history.entity';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { WalletAuth } from '../telegram-wallets/entities/wallet-auth.entity';
import { UserWallet } from '../telegram-wallets/entities/user-wallet.entity';
import { TelegramWalletsModule } from '../telegram-wallets/telegram-wallets.module';
import { SolanaModule } from '../solana/solana.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BgAffiliateTree,
      BgAffiliateNode,
      BgAffiliateCommissionLog,
      BgAffiliateCommissionReward,
      WalletRefReward,
      RefWithdrawHistory,
      ListWallet,
      WalletAuth,
      UserWallet
    ]),
    JwtModule.register({
      secret: `${process.env.JWT_SECRET}-affiliate`,
      signOptions: { expiresIn: '15m' },
    }),
    PassportModule,
    ConfigModule,
    HttpModule,
    ScheduleModule.forRoot(),
    forwardRef(() => TelegramWalletsModule),
    forwardRef(() => SolanaModule),
    SharedModule
  ],
  controllers: [BgRefController],
  providers: [
    BgRefService,
    BgAuthService,
    BgRefWithdrawService,
    JwtBgAuthGuard,
    JwtBgStrategy
  ],
  exports: [
    BgRefService,
    BgAuthService,
    BgRefWithdrawService,
    JwtBgAuthGuard
  ]
})
export class BgRefModule {} 