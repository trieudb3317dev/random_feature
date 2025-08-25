import { Injectable } from "@nestjs/common";
import { SolanaWebSocketService } from "../solana-websocket.service";
import { CacheService } from '../../cache/cache.service';
import { Cron } from "@nestjs/schedule";
import { Logger } from "@nestjs/common";

@Injectable()
export class WebSocketCleanupService {
    private readonly logger = new Logger(WebSocketCleanupService.name);

    constructor(
        private readonly solanaWebSocketService: SolanaWebSocketService,
        private readonly redisCacheService: CacheService
    ) { }

    @Cron('0 */15 * * * *')
    async cleanup() {
        try {
            // Instead of using keys, we'll use a specific pattern for listener keys
            const listenerKey = 'listener:*';
            // Delete all listener keys
            await this.redisCacheService.del(listenerKey);
        } catch (error) {
            this.logger.error('Error in cleanup service:', error);
        }
    }
} 