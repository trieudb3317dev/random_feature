import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BittworldRewards } from './entities/bittworld-rewards.entity';
import { BittworldWithdraw } from './entities/bittworld-withdraws.entity';
import { BittworldToken } from './entities/bittworld-token.entity';
import { BittworldsService } from './services/bittworlds.service';
import { BittworldsController } from './controllers/bittworlds.controller';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { BgAffiliateTree } from '../referral/entities/bg-affiliate-tree.entity';
import { SolanaModule } from '../solana/solana.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [
        TypeOrmModule.forFeature([BittworldRewards, BittworldWithdraw, BittworldToken, ListWallet, BgAffiliateTree]),
        SolanaModule,
        ConfigModule,
        ScheduleModule,
        HttpModule
    ],
    controllers: [BittworldsController],
    providers: [BittworldsService],
    exports: [BittworldsService]
})
export class BittworldsModule {} 