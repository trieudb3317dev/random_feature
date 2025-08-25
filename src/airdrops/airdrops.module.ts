import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AirdropListPool } from './entities/airdrop-list-pool.entity';
import { AirdropPoolJoin } from './entities/airdrop-pool-join.entity';
import { AirdropReward } from './entities/airdrop-reward.entity';

import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { AirdropsController } from './controllers/airdrops.controller';
import { AirdropsService } from './services/airdrops.service';
import { AirdropJwtAuthGuard } from './guards/airdrop-jwt-auth.guard';
import { SolanaModule } from '../solana/solana.module';
import { SharedModule } from '../shared/shared.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AirdropListPool,
      AirdropPoolJoin,
      AirdropReward,
      ListWallet
    ]),
    ConfigModule,
    SolanaModule,
    SharedModule,
    CloudinaryModule
  ],
  controllers: [AirdropsController],
  providers: [AirdropsService, AirdropJwtAuthGuard],
  exports: [AirdropsService],
})
export class AirdropsModule {} 