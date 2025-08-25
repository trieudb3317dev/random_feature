import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

interface CacheItem {
    value: any;
    timestamp: number;
    ttl: number;
}

@Injectable()
export class FileCacheService {
    private readonly logger = new Logger(FileCacheService.name);
    private readonly cacheDir = path.join(process.cwd(), 'cache');
    private cache: Map<string, CacheItem> = new Map();

    constructor() {
        this.initializeCache();
    }

    private async initializeCache() {
        try {
            // Tạo thư mục cache nếu chưa tồn tại
            await fs.mkdir(this.cacheDir, { recursive: true });
            
            // Đọc file cache nếu tồn tại
            const cacheFile = path.join(this.cacheDir, 'cache.json');
            try {
                const data = await fs.readFile(cacheFile, 'utf-8');
                const parsedData = JSON.parse(data);
                this.cache = new Map(Object.entries(parsedData));
                this.logger.log('Cache loaded from file');
            } catch (error) {
                this.logger.log('No existing cache file found');
            }
        } catch (error) {
            this.logger.error('Error initializing cache:', error);
        }
    }

    async get(key: string): Promise<any> {
        const item = this.cache.get(key);
        if (!item) return null;

        // Kiểm tra TTL
        if (Date.now() - item.timestamp > item.ttl * 1000) {
            this.cache.delete(key);
            await this.saveCacheToFile();
            return null;
        }

        return item.value;
    }

    async set(key: string, value: any, ttl: number = 3600): Promise<void> {
        const item: CacheItem = {
            value,
            timestamp: Date.now(),
            ttl
        };
        this.cache.set(key, item);
        await this.saveCacheToFile();
    }

    async del(key: string): Promise<void> {
        this.cache.delete(key);
        await this.saveCacheToFile();
    }

    async clear(): Promise<void> {
        this.cache.clear();
        await this.saveCacheToFile();
    }

    private async saveCacheToFile(): Promise<void> {
        try {
            const cacheFile = path.join(this.cacheDir, 'cache.json');
            const data = Object.fromEntries(this.cache);
            await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));
        } catch (error) {
            this.logger.error('Error saving cache to file:', error);
        }
    }

    // Phương thức để lấy tất cả các key trong cache
    async keys(): Promise<string[]> {
        return Array.from(this.cache.keys());
    }

    // Phương thức để kiểm tra key có tồn tại không
    async has(key: string): Promise<boolean> {
        return this.cache.has(key);
    }

    // Phương thức để lấy thời gian còn lại của cache (TTL)
    async ttl(key: string): Promise<number> {
        const item = this.cache.get(key);
        if (!item) return -1;
        
        const remaining = item.ttl - (Date.now() - item.timestamp) / 1000;
        return remaining > 0 ? remaining : -1;
    }
} 