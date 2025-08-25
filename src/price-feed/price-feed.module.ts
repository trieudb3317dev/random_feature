import { Module, forwardRef } from '@nestjs/common';
import { PriceFeedService } from './price-feed.service';
import { TradeModule } from '../trade/trade.module';
import { OrderBookModule } from '../trade/order-book.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MasterTradingModule } from '../master-trading/master-trading.module';

@Module({
    imports: [
        EventEmitterModule,
        forwardRef(() => TradeModule),
        OrderBookModule,
        forwardRef(() => MasterTradingModule)
    ],
    providers: [PriceFeedService],
    exports: [PriceFeedService]
})
export class PriceFeedModule { } 