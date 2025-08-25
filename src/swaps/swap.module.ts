import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SwapController } from './swap.controller';
import { SwapService } from './swap.service';
import { SwapOrder } from './entities/swap-order.entity';
import { SwapInvestorReward } from './entities/swap-investor-reward.entity';
import { SwapInvestors } from './entities/swap-investor.entity';
import { SwapSettings } from './entities/swap-setting.entity';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SwapOrder, SwapInvestorReward, SwapInvestors, SwapSettings, ListWallet]),
  ],
  controllers: [SwapController],
  providers: [SwapService],
  exports: [SwapService],
})
export class SwapModule {} 