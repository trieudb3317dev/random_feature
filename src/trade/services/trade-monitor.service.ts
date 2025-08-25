import { Injectable } from "@nestjs/common";

@Injectable()
export class TradeMonitorService {
    private readonly metrics = {
        ordersProcessed: 0,
        matchingTime: [] as number[],
        priceUpdates: 0,
        errors: 0
    };

    logMatchingPerformance(duration: number) {
        this.metrics.matchingTime.push(duration);
        this.metrics.ordersProcessed++;

        if (this.metrics.matchingTime.length > 100) {
            const avgTime = this.calculateAverageMatchingTime();
            console.log(`Average matching time: ${avgTime}ms`);
            this.metrics.matchingTime = [];
        }
    }

    private calculateAverageMatchingTime(): number {
        return this.metrics.matchingTime.reduce((a, b) => a + b, 0) / this.metrics.matchingTime.length;
    }
} 