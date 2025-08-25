import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MasterGroup } from './entities/master-group.entity';
import { MasterGroupAuth } from './entities/master-group-auth.entity';
import { MasterTransaction } from './entities/master-transaction.entity';
import { MasterTransactionDetail } from './entities/master-transaction-detail.entity';
import { MasterTradingService } from './master-trading.service';
import { MasterTradingController } from './master-trading.controller';
import { SolanaModule } from '../solana/solana.module';
import { NotificationModule } from '../notifications/notification.module';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { TelegramWalletsModule } from '../telegram-wallets/telegram-wallets.module';
import { OrderBookModule } from '../trade/order-book.module';
import { PriceFeedModule } from '../price-feed/price-feed.module';
import { SharedModule } from '../shared/shared.module';
import { TradeModule } from '../trade/trade.module';
import { TradingOrder } from '../trade/entities/trading-order.entity';
import { MasterConnect } from './entities/master-connect.entity';
import { PumpFunModule } from '../pump-fun/pump-fun.module';
import { SolanaWebSocketService } from '../solana/solana-websocket.service';
import { AuthModule } from '../auth/auth.module';
import { WalletAuth } from '../telegram-wallets/entities/wallet-auth.entity';
import { CacheModule } from '../cache/cache.module';
import { UserWallet } from '../telegram-wallets/entities/user-wallet.entity';
import { BittworldsModule } from '../bittworlds/bittworlds.module';
import { ReferralModule } from '../referral/referral.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            MasterGroup,
            MasterGroupAuth,
            MasterTransaction,
            MasterTransactionDetail,
            ListWallet,
            TradingOrder,
            MasterConnect,
            WalletAuth,
            UserWallet
        ]),
        EventEmitterModule.forRoot(),
        SolanaModule,
        NotificationModule,
        TelegramWalletsModule,
        OrderBookModule,
        PriceFeedModule,
        SharedModule,
        forwardRef(() => TradeModule),
        PumpFunModule,
        AuthModule,
        CacheModule,
        BittworldsModule,
        ReferralModule
    ],
    controllers: [MasterTradingController],
    providers: [MasterTradingService, SolanaWebSocketService],
    exports: [MasterTradingService]
})
export class MasterTradingModule { } 