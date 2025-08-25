import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SolanaRpcLimiterService {
    private readonly logger = new Logger(SolanaRpcLimiterService.name);
    private tokenBucket = {
        tokens: 100,
        lastRefill: Date.now(),
        capacity: 100,
        refillRate: 10, // tokens per second
    };

    async acquireToken(): Promise<boolean> {
        const now = Date.now();
        const timePassed = (now - this.tokenBucket.lastRefill) / 1000;

        // Refill tokens based on time passed
        this.tokenBucket.tokens = Math.min(
            this.tokenBucket.capacity,
            this.tokenBucket.tokens + timePassed * this.tokenBucket.refillRate
        );
        this.tokenBucket.lastRefill = now;

        if (this.tokenBucket.tokens >= 1) {
            this.tokenBucket.tokens -= 1;
            return true;
        }

        this.logger.warn('RPC rate limit reached, delaying request');
        return false;
    }

    async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
        while (!(await this.acquireToken())) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return fn();
    }
} 