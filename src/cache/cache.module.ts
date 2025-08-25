import { Module, Global } from '@nestjs/common';
import { CacheService } from './cache.service';
import { FileCacheService } from './file-cache.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

@Global()
@Module({
    imports: [
        NestCacheModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            isGlobal: true,
            useFactory: async (configService: ConfigService) => ({
                store: redisStore,
                socket: {
                    host: configService.get('REDIS_HOST'),
                    port: Number(configService.get('REDIS_PORT')),
                },
                username: 'default',
                password: configService.get('REDIS_PASSWORD'),
                ttl: 86400, // 24 hours
                db: 0,
                keyPrefix: 'cache:',
            }),
        }),
    ],
    providers: [CacheService, FileCacheService],
    exports: [CacheService, FileCacheService, NestCacheModule],
})
export class CacheModule { } 