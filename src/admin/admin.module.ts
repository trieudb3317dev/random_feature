import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGateway } from './admin.gateway';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { SolanaListCategoriesToken } from '../solana/entities/solana-list-categories-token.entity';
import { Setting } from './entities/setting.entity';
import { UserAdmin } from './entities/user-admin.entity';
import { AdminJwtStrategy } from './strategies/jwt.strategy';
import { UserWallet } from '../telegram-wallets/entities/user-wallet.entity';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { ReferentSetting } from '../referral/entities/referent-setting.entity';
import { WalletReferent } from '../referral/entities/wallet-referent.entity';
import { ReferentLevelReward } from 'src/referral/entities/referent-level-rewards.entity';
import { ReferralModule } from '../referral/referral.module';
import { TradingOrder } from '../trade/entities/trading-order.entity';
import { SwapInvestors } from '../swaps/entities/swap-investor.entity';
import { SwapSettings } from '../swaps/entities/swap-setting.entity';
import { SwapInvestorReward } from '../swaps/entities/swap-investor-reward.entity';
import { AirdropListPool } from '../airdrops/entities/airdrop-list-pool.entity';
import { AirdropPoolJoin } from '../airdrops/entities/airdrop-pool-join.entity';
import { AirdropListToken } from '../airdrops/entities/airdrop-list-token.entity';
import { AirdropReward } from '../airdrops/entities/airdrop-reward.entity';
import { AirdropPoolRound } from '../airdrops/entities/airdrop-pool-round.entity';
import { AirdropRoundDetail } from '../airdrops/entities/airdrop-round-detail.entity';
import { AirdropTopRound } from '../airdrops/entities/airdrop-top-round.entity';
import { AirdropTopPools } from '../airdrops/entities/airdrop-top-pools.entity';
import { BittworldsModule } from '../bittworlds/bittworlds.module';
import { BittworldRewards } from '../bittworlds/entities/bittworld-rewards.entity';
import { BittworldWithdraw } from '../bittworlds/entities/bittworld-withdraws.entity';
import { BittworldToken } from '../bittworlds/entities/bittworld-token.entity';
import { AirdropAdminService } from './airdrop-admin.service';
import { SharedModule } from '../shared/shared.module';
import { OnChainModule } from '../on-chain/on-chain.module';
import { ScheduledTasksService } from './scheduled-tasks.service';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      ListWallet, 
      SolanaListCategoriesToken, 
      Setting, 
      UserAdmin, 
      UserWallet, 
      ReferentSetting,
      WalletReferent,
      ReferentLevelReward,
      TradingOrder,
      SwapInvestors,
      SwapSettings,
      SwapInvestorReward,
      AirdropListPool,
      AirdropPoolJoin,
      AirdropListToken,
      AirdropReward,
      AirdropPoolRound,
      AirdropRoundDetail,
      AirdropTopRound,
      AirdropTopPools,
      BittworldRewards,
      BittworldWithdraw,
      BittworldToken,
    ]),
    PassportModule.register({ defaultStrategy: 'admin-jwt' }),
    JwtModule.register({
      secret: 'your-secret-key',
      signOptions: { expiresIn: '1d' },
    }),
    MulterModule.register({
      storage: diskStorage({
        destination: './src/admin/uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
    ReferralModule,
    BittworldsModule,
    SharedModule,
    OnChainModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGateway, AdminJwtStrategy, AirdropAdminService, ScheduledTasksService],
  exports: [AdminService, AdminGateway],
})
export class AdminModule implements OnModuleInit {
  onModuleInit() {
    const uploadsDir = path.join(process.cwd(), 'src', 'admin', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  }
}
