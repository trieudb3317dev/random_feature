import { Injectable, OnModuleDestroy, Logger, Inject, forwardRef } from "@nestjs/common";
import { SolanaWebSocketService } from "../solana-websocket.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PublicKey } from "@solana/web3.js";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Cron } from "@nestjs/schedule";
import { SolanaService } from "../solana.service";
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class SolanaTrackingService implements OnModuleDestroy {
    private readonly logger = new Logger(SolanaTrackingService.name);
    private trackedAccounts: Map<string, Set<string>> = new Map();
    private trackedPrices: Map<string, Set<string>> = new Map();
    private listenerIds: Set<string> = new Set();
    private trackedTransactions: Map<string, Set<string>> = new Map();
    private lastActivityTime: Map<string, number> = new Map();

    constructor(
        private readonly solanaWebSocketService: SolanaWebSocketService,
        private readonly cacheService: CacheService,
        private readonly eventEmitter: EventEmitter2,
        @Inject(forwardRef(() => SolanaService))
        private readonly solanaService: SolanaService
    ) { }

    async trackAccountBalance(accountAddress: string, owner: string) {
        // Cập nhật thời gian hoạt động
        this.lastActivityTime.set(`balance:${accountAddress}:${owner}`, Date.now());

        // Kiểm tra xem account đã được theo dõi chưa
        if (!this.trackedAccounts.has(accountAddress)) {
            this.trackedAccounts.set(accountAddress, new Set());

            // Đăng ký theo dõi qua WebSocket
            await this.solanaWebSocketService.trackAccountBalance(new PublicKey(accountAddress));

            // Đăng ký listener để cập nhật cache khi có thay đổi số dư
            const balanceListenerId = this.solanaWebSocketService.registerEventListener(
                'account.balance.changed',
                accountAddress,
                async (data) => {
                    if (data.account === accountAddress) {
                        await this.solanaService.updateBalanceCache(
                            accountAddress,
                            data.balance,
                            this.solanaService.CACHE_TTL.STABLE
                        );
                    }
                }
            );

            // Đăng ký listener cho WebSocket error
            const errorListenerId = this.solanaWebSocketService.registerEventListener(
                'websocket.error',
                accountAddress,
                async () => {
                    await this.solanaService.handleWebSocketError(accountAddress);
                }
            );

            // Đăng ký listener cho WebSocket stable
            const stableListenerId = this.solanaWebSocketService.registerEventListener(
                'websocket.stable',
                accountAddress,
                async () => {
                    await this.solanaService.handleWebSocketStable(accountAddress);
                }
            );

            this.listenerIds.add(balanceListenerId);
            this.listenerIds.add(errorListenerId);
            this.listenerIds.add(stableListenerId);
            this.logger.log(`Started tracking balance for account ${accountAddress}`);
        }

        // Thêm owner vào danh sách theo dõi account
        this.trackedAccounts.get(accountAddress)!.add(owner);
    }

    async untrackAccountBalance(accountAddress: string, owner: string) {
        if (!this.trackedAccounts.has(accountAddress)) {
            return;
        }

        const owners = this.trackedAccounts.get(accountAddress)!;
        owners.delete(owner);

        // Nếu không còn ai theo dõi account này
        if (owners.size === 0) {
            // Hủy đăng ký WebSocket
            await this.solanaWebSocketService.unsubscribe(`balance:${accountAddress}`);
            this.trackedAccounts.delete(accountAddress);

            // Tìm và hủy listener
            for (const listenerId of this.listenerIds) {
                if (listenerId.includes(accountAddress)) {
                    this.solanaWebSocketService.removeEventListener(listenerId);
                    this.listenerIds.delete(listenerId);
                }
            }

            this.logger.log(`Stopped tracking balance for account ${accountAddress}`);
        }
    }

    async trackTransactions(accountAddress: string, owner: string) {
        // Cập nhật thời gian hoạt động
        this.lastActivityTime.set(`transactions:${accountAddress}:${owner}`, Date.now());

        // Kiểm tra xem account đã được theo dõi chưa
        if (!this.trackedAccounts.has(accountAddress)) {
            this.trackedAccounts.set(accountAddress, new Set());

            try {
                // Đăng ký theo dõi qua WebSocket
                await this.solanaWebSocketService.subscribeToWalletTransactions(
                    accountAddress,
                    owner
                );

                this.logger.log(`Started tracking transactions for account ${accountAddress}`);
            } catch (error) {
                this.logger.error(`Error tracking transactions for ${accountAddress}:`, error);

                // Fallback to RPC
                this.eventEmitter.emit('websocket.fallback', {
                    type: 'accountLogs',
                    account: accountAddress,
                    serviceId: owner
                });
            }
        }

        // Thêm owner vào danh sách theo dõi account
        this.trackedAccounts.get(accountAddress)!.add(owner);
    }

    async trackTransaction(signature: string, owner: string) {
        // Kiểm tra xem transaction đã được theo dõi chưa
        const trackedTransactions = this.trackedTransactions || new Map<string, Set<string>>();

        if (!trackedTransactions.has(signature)) {
            trackedTransactions.set(signature, new Set());

            // Đăng ký theo dõi qua WebSocket
            await this.solanaWebSocketService.trackTransaction(signature);

            // Đăng ký listener để xử lý trạng thái giao dịch
            const listenerId = this.solanaWebSocketService.registerEventListener(
                'transaction.status',
                signature,
                (data) => {
                    if (data.signature === signature) {
                        this.eventEmitter.emit('transaction.status', data);
                    }
                }
            );

            this.listenerIds.add(listenerId);
        }

        // Thêm owner vào danh sách theo dõi transaction
        trackedTransactions.get(signature)!.add(owner);

        // Lưu lại Map nếu chưa được khởi tạo
        if (!this.trackedTransactions) {
            this.trackedTransactions = trackedTransactions;
        }
    }

    // Tương tự cho trackTokenPrice, trackTokenBalance, v.v.

    @Cron('0 */30 * * * *') // Run every 30 minutes
    async cleanupInactiveTracking() {
        const now = Date.now();
        const inactiveThreshold = 2 * 60 * 60 * 1000; // 2 giờ
        let cleanedCount = 0;

        // Cleanup inactive account balance tracking
        for (const [account, owners] of this.trackedAccounts.entries()) {
            const inactiveOwners: string[] = [];

            for (const owner of owners) {
                const lastActivity = this.lastActivityTime.get(`balance:${account}:${owner}`) || 0;
                if (now - lastActivity > inactiveThreshold) {
                    inactiveOwners.push(owner);
                }
            }

            for (const owner of inactiveOwners) {
                await this.untrackAccountBalance(account, owner);
                cleanedCount++;
            }
        }

        // Cleanup inactive transaction tracking
        for (const [signature, owners] of this.trackedTransactions.entries()) {
            const inactiveOwners: string[] = [];

            for (const owner of owners) {
                const lastActivity = this.lastActivityTime.get(`transaction:${signature}:${owner}`) || 0;
                if (now - lastActivity > inactiveThreshold) {
                    inactiveOwners.push(owner);
                }
            }

            for (const owner of inactiveOwners) {
                owners.delete(owner);
                cleanedCount++;
            }

            if (owners.size === 0) {
                this.trackedTransactions.delete(signature);
            }
        }

        this.logger.log(`Cleaned up ${cleanedCount} inactive tracking subscriptions`);
    }

    onModuleDestroy() {
        // Hủy tất cả listeners khi service bị destroy
        for (const listenerId of this.listenerIds) {
            this.solanaWebSocketService.removeEventListener(listenerId);
        }
        this.listenerIds.clear();
        this.logger.log('Cleaned up all listeners on module destroy');
    }
} 