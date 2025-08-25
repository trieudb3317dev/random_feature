import { Injectable } from '@nestjs/common';
import { OrderBookService } from '../order-book.service';
import { Cache } from 'cache-manager';
import { OrderBook } from '../entities/order-book.entity';
import { PriorityQueue } from '@datastructures-js/priority-queue';

@Injectable()
export class MatchingEngineService {
    private orderCache: Map<string, PriorityQueue<OrderBook>> = new Map();

    constructor(
        private orderBookService: OrderBookService,
        private readonly cacheManager: Cache
    ) { }

    async initializeCache() {
        // Load pending orders into memory
        const pendingOrders = await this.orderBookService.getAllPendingOrders();
        for (const order of pendingOrders) {
            this.addToCache(order);
        }
    }

    private addToCache(order: OrderBook) {
        const key = `${order.token_address}_${order.side}`;
        if (!this.orderCache.has(key)) {
            this.orderCache.set(key, new PriorityQueue<OrderBook>((a, b) => {
                return order.side === 'buy' ? b.price - a.price : a.price - b.price;
            }));
        }
        const queue = this.orderCache.get(key);
        if (queue) {
            queue.push(order);
        }
    }

    async findMatchingOrders(tokenAddress: string, currentPrice: number): Promise<OrderBook[]> {
        const comparator = (a: OrderBook, b: OrderBook) => b.price - a.price;
        const buyOrders = this.orderCache.get(`${tokenAddress}_buy`) || new PriorityQueue(comparator);
        const sellOrders = this.orderCache.get(`${tokenAddress}_sell`) || new PriorityQueue(comparator);

        const matches: OrderBook[] = [];

        while (!buyOrders.isEmpty() && !sellOrders.isEmpty()) {
            const bestBuy = buyOrders.front();
            const bestSell = sellOrders.front();

            if (bestBuy && bestSell) {
                if (bestBuy.price >= bestSell.price) {
                    const dequeuedBuy = buyOrders.dequeue();
                    const dequeuedSell = sellOrders.dequeue();
                    if (dequeuedBuy && dequeuedSell) {
                        matches.push(dequeuedBuy);
                        matches.push(dequeuedSell);
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        return matches;
    }
} 