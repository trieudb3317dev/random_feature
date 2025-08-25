import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderBookService } from './order-book.service';
import { OrderBook } from './entities/order-book.entity';
import { TradingOrder } from './entities/trading-order.entity';
import { MasterTransaction } from '../master-trading/entities/master-transaction.entity';
import { SolanaModule } from '../solana/solana.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SharedModule } from '../shared/shared.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            OrderBook,
            TradingOrder,
            MasterTransaction
        ]),
        SolanaModule,
        EventEmitterModule,
        SharedModule
    ],
    providers: [OrderBookService],
    exports: [OrderBookService]
})
export class OrderBookModule { } 