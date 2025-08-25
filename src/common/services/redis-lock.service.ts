import { Injectable } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class RedisLockService {
    private readonly DEFAULT_TIMEOUT = 30000; // 30s
    private readonly DEFAULT_RETRY_COUNT = 3;
    private readonly RETRY_DELAY = 1000; // 1s

    constructor(
        private redisService: CacheService,
        private eventEmitter: EventEmitter2
    ) { }

    async acquireLockWithRetry(
        key: string,
        timeout: number = this.DEFAULT_TIMEOUT,
        retries: number = this.DEFAULT_RETRY_COUNT
    ): Promise<string> {
        let lastError;

        for (let i = 0; i < retries; i++) {
            try {
                const lockId = await this.acquireLock(key, timeout);
                return lockId;
            } catch (error) {
                lastError = error;
                if (i < retries - 1) {
                    await this.sleep(this.RETRY_DELAY);
                    continue;
                }
            }
        }

        this.eventEmitter.emit('lock.failed', {
            key,
            error: lastError?.message,
            timestamp: new Date()
        });

        throw new Error(`Failed to acquire lock after ${retries} attempts`);
    }

    async withLock<T>(
        key: string,
        callback: () => Promise<T>,
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<T> {
        const startTime = Date.now();
        const lockId = await this.acquireLockWithRetry(key, timeout);

        try {
            return await callback();
        } finally {
            const duration = Date.now() - startTime;
            await this.releaseLock(key, lockId);

            // Emit metrics
            this.eventEmitter.emit('lock.released', {
                key,
                duration,
                timestamp: new Date()
            });
        }
    }

    private async acquireLock(key: string, timeout: number): Promise<string> {
        const lockId = Math.random().toString(36).substring(2);
        await this.redisService.set(`lock:${key}`, lockId, timeout);

        // Verify lock was acquired
        const currentLock = await this.redisService.get(`lock:${key}`);
        if (currentLock !== lockId) {
            throw new Error('Failed to acquire lock');
        }

        return lockId;
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async releaseLock(key: string, lockId: string): Promise<void> {
        const currentLock = await this.redisService.get(`lock:${key}`);
        if (currentLock === lockId) {
            await this.redisService.del(`lock:${key}`);
        }
    }
}