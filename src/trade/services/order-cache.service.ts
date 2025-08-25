import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheService } from '../../cache/cache.service';
import { OrderBook } from "../entities/order-book.entity";
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class OrderCacheService {
    constructor(
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private cacheService: CacheService,
        @InjectRepository(OrderBook)
        private orderBookRepository: Repository<OrderBook>
    ) { }

    private readonly ORDER_BOOK_CACHE_KEY = 'order_book';
    private readonly CACHE_TTL = 60; // 60 seconds

    async getCachedOrderBook(tokenAddress: string): Promise<OrderBook[]> {
        const cacheKey = `${this.ORDER_BOOK_CACHE_KEY}:${tokenAddress}`;
        let orders = await this.cacheManager.get<OrderBook[]>(cacheKey);

        if (!orders) {
            orders = await this.orderBookRepository.find({
                where: { token_address: tokenAddress }
            });
            await this.cacheManager.set(cacheKey, orders, this.CACHE_TTL);
        }

        return orders;
    }

    async invalidateCache(tokenAddress: string): Promise<void> {
        const cacheKey = `${this.ORDER_BOOK_CACHE_KEY}:${tokenAddress}`;
        await this.cacheManager.del(cacheKey);
    }
} 