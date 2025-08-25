import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TradeController } from './trade.controller';
import { TradeService } from './trade.service';
import { TradingOrder } from './entities/trading-order.entity';
import { OrderBook } from './entities/order-book.entity';
import { SolanaModule } from '../solana/solana.module';
import { TelegramWalletsModule } from '../telegram-wallets/telegram-wallets.module';
import { NotificationModule } from '../notifications/notification.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OrderBookModule } from './order-book.module';
import { PriceFeedModule } from '../price-feed/price-feed.module';
import { MasterTradingModule } from '../master-trading/master-trading.module';
import { OrderCacheService } from './services/order-cache.service';
import { PriceQueueService } from './services/price-queue.service';
import { TradeMonitorService } from './services/trade-monitor.service';
import { SharedModule } from '../shared/shared.module';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { MasterGroupRepository } from '../master-groups/master-group.repository';
import { MasterGroup } from 'src/master-trading/entities/master-group.entity';
import { SolanaListToken } from '../solana/entities/solana-list-token.entity';
import { MasterTransactionDetail } from 'src/master-trading/entities/master-transaction-detail.entity';
import { TransactionStatusMonitorService } from './services/transaction-status-monitor.service';
import { JwtModule } from '@nestjs/jwt';
import { WalletAuth } from '../telegram-wallets/entities/wallet-auth.entity';
import { SolanaTokensModule } from '../solana/solana-tokens.module';
import { OrderBookService } from './order-book.service';
import { MasterTransaction } from '../master-trading/entities/master-transaction.entity';
import { SolanaWebSocketModule } from '../solana/solana-websocket.module';
import { SharedWebSocketModule } from '../shared/shared-websocket.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { CacheModule } from '../cache/cache.module';
import { BirdeyeService } from '../on-chain/birdeye.service';
import { ReferralModule } from '../referral/referral.module';
import { BittworldsModule } from '../bittworlds/bittworlds.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            TradingOrder,
            OrderBook,
            ListWallet,
            MasterGroup,
            SolanaListToken,
            MasterTransactionDetail,
            WalletAuth,
            MasterTransaction
        ]),
        JwtModule.registerAsync({
            useFactory: () => ({
                secret: process.env.JWT_SECRET,
                signOptions: { expiresIn: '1d' },
            }),
        }),
        ScheduleModule.forRoot(),
        SolanaModule,
        TelegramWalletsModule,
        NotificationModule,
        EventEmitterModule.forRoot(),
        forwardRef(() => OrderBookModule),
        forwardRef(() => PriceFeedModule),
        forwardRef(() => MasterTradingModule),
        CacheModule,
        SharedModule,
        forwardRef(() => SolanaTokensModule),
        forwardRef(() => SharedWebSocketModule),
        forwardRef(() => WebSocketModule),
        ReferralModule,
        BittworldsModule
    ],
    controllers: [TradeController],
    providers: [
        TradeService,
        OrderCacheService,
        PriceQueueService,
        TradeMonitorService,
        MasterGroupRepository,
        // TransactionStatusMonitorService,
        OrderBookService,
        BirdeyeService
    ],
    exports: [TradeService, OrderCacheService, OrderBookService]
})
export class TradeModule { } 