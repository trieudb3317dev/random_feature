import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { WalletReferent } from './entities/wallet-referent.entity';
import { WalletRefReward } from './entities/wallet-ref-reward.entity';
import { ReferentSetting } from './entities/referent-setting.entity';
import { ReferentLevelReward } from './entities/referent-level-rewards.entity';
import { BgAffiliateTree } from './entities/bg-affiliate-tree.entity';
import { BgAffiliateNode } from './entities/bg-affiliate-node.entity';
import { BgAffiliateCommissionLog } from './entities/bg-affiliate-commission-log.entity';
import { BgAffiliateCommissionReward } from './entities/bg-affiliate-commission-reward.entity';
import { RefWithdrawHistory } from './entities/ref-withdraw-history.entity';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { WalletReferentService } from './services/wallet-referent.service';
import { ReferralWithdrawService } from './services/referral-withdraw.service';
import { ReferentController } from './controllers/referent.controller';
import { BgRefModule } from './bg-ref.module';
import { SolanaModule } from '../solana/solana.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WalletReferent,
      WalletRefReward,
      ReferentSetting,
      ReferentLevelReward,
      BgAffiliateTree,
      BgAffiliateNode,
      BgAffiliateCommissionLog,
      BgAffiliateCommissionReward,
      RefWithdrawHistory,
      ListWallet,
    ]),
    ScheduleModule.forRoot(),
    SolanaModule,
    BgRefModule,
  ],
  providers: [
    WalletReferentService,
    ReferralWithdrawService
  ],
  controllers: [
    ReferentController
  ],
  exports: [
    TypeOrmModule,
    WalletReferentService,
    ReferralWithdrawService,
    BgRefModule
  ],
})
export class ReferralModule {} 