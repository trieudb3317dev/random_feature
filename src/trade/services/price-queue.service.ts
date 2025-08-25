import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Queue } from '@datastructures-js/queue';
import { PriceUpdate } from "../interfaces/price-update.interface";
import { TradeService } from "../trade.service";

@Injectable()
export class PriceQueueService {
    private priceQueue: Map<string, Queue<PriceUpdate>> = new Map();
    private processing = false;

    constructor(
        private readonly eventEmitter: EventEmitter2,
        private readonly tradeService: TradeService
    ) {
        this.setupPriceListener();
    }

    private setupPriceListener() {
        this.eventEmitter.on('price.update', (priceData: PriceUpdate) => {
            this.addToQueue(priceData);
            this.processQueue();
        });
    }

    private addToQueue(priceData: PriceUpdate) {
        const { tokenMint } = priceData;
        if (!this.priceQueue.has(tokenMint)) {
            this.priceQueue.set(tokenMint, new Queue<PriceUpdate>());
        }
        this.priceQueue.get(tokenMint)?.enqueue(priceData);
    }

    private async processQueue() {
        if (this.processing) return;
        this.processing = true;

        try {
            for (const [tokenMint, queue] of this.priceQueue.entries()) {
                while (!queue.isEmpty()) {
                    const priceData = queue.dequeue();
                    if (priceData) {
                        await this.tradeService.processOrderBook(
                            priceData.tokenMint,
                            priceData.price
                        );
                    }
                }
            }
        } catch (error) {
            console.error('Error processing price queue:', error);
        } finally {
            this.processing = false;
        }
    }
} 