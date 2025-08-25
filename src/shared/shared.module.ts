import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderBook } from '../trade/entities/order-book.entity';
import { TradingOrder } from '../trade/entities/trading-order.entity';
import { MasterTransaction } from '../master-trading/entities/master-transaction.entity';
import { CacheModule } from '../cache/cache.module';
import { OrderCacheService } from '../trade/services/order-cache.service';
import { RedisLockService } from '../common/services/redis-lock.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            OrderBook,
            TradingOrder,
            MasterTransaction
        ]),
        CacheModule
    ],
    providers: [
        OrderCacheService,
        RedisLockService
    ],
    exports: [OrderCacheService, RedisLockService]
})
export class SharedModule { } 