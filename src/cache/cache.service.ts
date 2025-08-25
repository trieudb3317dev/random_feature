import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class CacheService implements OnModuleInit {
    private readonly logger = new Logger(CacheService.name);
    private redis: RedisClientType;
    private memoryCache = new Map<string, { value: any, expire: number, timeout?: NodeJS.Timeout }>();

    constructor(private configService: ConfigService) {
        this.redis = createClient({
            username: 'default',
            password: this.configService.get('REDIS_PASSWORD'),
            socket: {
                host: this.configService.get('REDIS_HOST'),
                port: Number(this.configService.get('REDIS_PORT')),
            },
        });
        this.redis.on('error', (err) => this.logger.error('Redis Client Error', err));
    }

    async onModuleInit() {
        try {
            await this.redis.connect();
            this.logger.log('✅ Successfully connected to Redis Cloud');
        } catch (error) {
            this.logger.error('❌ Failed to connect to Redis:', error);
        }
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const data = await this.redis.get(key);
            if (data) return JSON.parse(data);
            // Nếu không có trên Redis, kiểm tra RAM
            const mem = this.memoryCache.get(key);
            if (mem && mem.expire > Date.now()) return mem.value;
            return null;
        } catch (error) {
            this.logger.error('[Redis][GET] Error:', error);
            // Nếu Redis lỗi, kiểm tra RAM
            const mem = this.memoryCache.get(key);
            if (mem && mem.expire > Date.now()) return mem.value;
            return null;
        }
    }

    async set(key: string, value: any, ttl: number = 3600): Promise<void> {
        try {
            await this.redis.set(key, JSON.stringify(value), { EX: ttl });
        } catch (error) {
            this.logger.error('[Redis][SET] Error:', error);
            // Nếu Redis lỗi, lưu vào RAM
            const expire = Date.now() + ttl * 1000;
            if (this.memoryCache.has(key)) {
                clearTimeout(this.memoryCache.get(key)?.timeout);
            }
            const timeout = setTimeout(() => this.memoryCache.delete(key), ttl * 1000);
            this.memoryCache.set(key, { value, expire, timeout });
        }
    }

    async del(key: string): Promise<void> {
        try {
            await this.redis.del(key);
        } catch (error) {
            this.logger.error('[Redis][DEL] Error:', error);
            if (this.memoryCache.has(key)) {
                clearTimeout(this.memoryCache.get(key)?.timeout);
                this.memoryCache.delete(key);
            }
        }
    }

    async keys(pattern: string): Promise<string[]> {
        try {
            const keys = await this.redis.keys(pattern);
            return keys;
        } catch (error) {
            this.logger.error('[Redis][KEYS] Error:', error);
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return Array.from(this.memoryCache.keys()).filter(key => regex.test(key));
        }
    }

    async reset(): Promise<void> {
        try {
            const keys = await this.keys("*");
            for (const key of keys) {
                await this.del(key);
            }
            this.logger.log('[Redis][RESET] All cache cleared');
        } catch (error) {
            this.logger.error('[Redis][RESET] Error:', error);
        }
    }
} 