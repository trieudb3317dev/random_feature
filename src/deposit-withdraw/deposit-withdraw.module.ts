import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepositWithdrawService } from './deposit-withdraw.service';
import { DepositWithdrawController } from './deposit-withdraw.controller';
import { DepositWithdrawHistory } from './entities/deposit-withdraw-history.entity';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { UserWallet } from '../telegram-wallets/entities/user-wallet.entity';
import { ConfigModule } from '@nestjs/config';
import { TelegramWalletsModule } from '../telegram-wallets/telegram-wallets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DepositWithdrawHistory,
      ListWallet,
      UserWallet
    ]),
    ConfigModule,
    TelegramWalletsModule
  ],
  controllers: [DepositWithdrawController],
  providers: [
    DepositWithdrawService,
  ],
  exports: [DepositWithdrawService],
})
export class DepositWithdrawModule {} 