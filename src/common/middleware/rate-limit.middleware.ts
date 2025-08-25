import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../cache/cache.service';

interface RateLimitInfo {
    totalHits: number;
    resetTime: Date;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
    private limiter: any;
    private readonly WINDOW_MS = 60 * 1000; // 1 minute
    private readonly MAX_REQUESTS = 5000; // 5000 requests per minute

    constructor(
        private configService: ConfigService,
        private cacheService: CacheService,
    ) {
        const store = {
            increment: async (key: string): Promise<RateLimitInfo> => {
                const now = Date.now();
                const resetTime = new Date(now + this.WINDOW_MS);

                const current = await store.get(key);
                const totalHits = (current?.totalHits || 0) + 1;

                await this.cacheService.set(key, { totalHits, resetTime }, Math.floor(this.WINDOW_MS / 1000));

                return { totalHits, resetTime };
            },
            decrement: async (key: string): Promise<void> => {
                const current = await store.get(key);
                if (current) {
                    const totalHits = Math.max(0, current.totalHits - 1);
                    await this.cacheService.set(key, { ...current, totalHits }, Math.floor(this.WINDOW_MS / 1000));
                }
            },
            resetKey: async (key: string): Promise<void> => {
                await this.cacheService.del(key);
            },
            get: async (key: string): Promise<RateLimitInfo | undefined> => {
                const value = await this.cacheService.get(key);
                if (!value) return undefined;

                // If the stored value is a string (old format), convert it
                if (typeof value === 'string') {
                    const totalHits = parseInt(value);
                    const resetTime = new Date(Date.now() + this.WINDOW_MS);
                    return { totalHits, resetTime };
                }

                return value as RateLimitInfo;
            }
        };

        this.limiter = rateLimit({
            windowMs: this.WINDOW_MS,
            max: this.MAX_REQUESTS,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => {
                return `rate_limit:${req.ip}`;
            },
            handler: (req, res, next, options) => {
                const randomMinutes = Math.floor(Math.random() * 6) + 5; // 5-10 minutes
                const retryAfter = randomMinutes * 60; // Convert to seconds

                res.set('Retry-After', String(retryAfter));
                res.status(429).json({
                    status: 429,
                    message: `Too many requests, please try again after ${randomMinutes} minutes.`,
                    retryAfter: retryAfter
                });
            },
            skip: async (req) => {
                return false; // Don't skip any requests
            },
            store
        });
    }

    use(req: Request, res: Response, next: NextFunction) {
        this.limiter(req, res, next);
    }
} 