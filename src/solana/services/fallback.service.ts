import { Injectable, Inject, Logger } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '../../cache/cache.service';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class SolanaFallbackService {
    private readonly logger = new Logger(SolanaFallbackService.name);
    private fallbackAccounts = new Set<string>();
    private fallbackTransactions = new Set<string>();
    private fallbackPrices = new Map<string, number>();
    private lastPollTime = new Map<string, number>();
    private readonly MIN_POLL_INTERVAL = 60000; // 1 phút

    constructor(
        @Inject('SOLANA_CONNECTION')
        private readonly connection: Connection,
        private readonly eventEmitter: EventEmitter2,
        private readonly cacheService: CacheService
    ) {
        // Lắng nghe sự kiện fallback
        this.eventEmitter.on('websocket.fallback', (data) => {
            this.handleFallback(data);
        });
    }

    private handleFallback(data: any) {
        const now = Date.now();

        switch (data.type) {
            case 'accountBalance':
            case 'accountLogs':
                // Kiểm tra thời gian poll gần nhất
                const lastPoll = this.lastPollTime.get(data.account) || 0;
                if (now - lastPoll < this.MIN_POLL_INTERVAL) {
                    return; // Bỏ qua nếu đã poll gần đây
                }

                this.fallbackAccounts.add(data.account);
                this.lastPollTime.set(data.account, now);
                break;

            case 'transaction':
                this.fallbackTransactions.add(data.signature);
                break;

            case 'tokenPrice':
                this.fallbackPrices.set(data.token, data.interval || 30);
                break;

            default:
                this.logger.log(`Unknown fallback type: ${data.type}`);
        }
    }

    @Cron('0 */1 * * * *') // Run every 1 minute
    async pollAccountBalances() {
        if (this.fallbackAccounts.size === 0) return;

        this.logger.log(`Polling ${this.fallbackAccounts.size} account balances via RPC...`);
        let successCount = 0;

        // Tạo bản sao để tránh lỗi khi xóa trong quá trình lặp
        const accounts = Array.from(this.fallbackAccounts);

        for (const account of accounts) {
            try {
                const publicKey = new PublicKey(account);
                const balance = await this.connection.getBalance(publicKey);
                const solBalance = balance / LAMPORTS_PER_SOL;

                // Update cache
                await this.cacheService.set(`sol_balance:${account}`, solBalance.toString(), 60);

                // Emit event to simulate WebSocket
                this.eventEmitter.emit('account.balance.changed', {
                    account,
                    balance
                });

                successCount++;

                // Xóa khỏi danh sách fallback sau khi poll thành công
                this.fallbackAccounts.delete(account);
            } catch (error) {
                this.logger.error(`Error polling balance for ${account}:`, error);
            }
        }

        this.logger.log(`Successfully polled ${successCount}/${accounts.length} account balances`);
    }

    @Cron('0 */2 * * * *') // Run every 2 minutes
    async pollTransactionStatuses() {
        if (this.fallbackTransactions.size === 0) return;

        this.logger.log(`Polling ${this.fallbackTransactions.size} transaction statuses via RPC...`);
        let successCount = 0;
        let finishedCount = 0;

        // Tạo bản sao để tránh lỗi khi xóa trong quá trình lặp
        const signatures = Array.from(this.fallbackTransactions);

        for (const signature of signatures) {
            try {
                const status = await this.connection.getSignatureStatus(signature, {
                    searchTransactionHistory: true
                });

                if (!status || !status.value) {
                    continue;
                }

                let txStatus: 'confirmed' | 'finalized' | 'failed' | 'pending' = 'pending';

                if (status.value.err) {
                    txStatus = 'failed';
                    this.fallbackTransactions.delete(signature);
                    finishedCount++;
                } else if (status.value.confirmationStatus === 'confirmed') {
                    txStatus = 'confirmed';
                } else if (status.value.confirmationStatus === 'finalized') {
                    txStatus = 'finalized';
                    this.fallbackTransactions.delete(signature);
                    finishedCount++;
                }

                // Update cache
                await this.cacheService.set(`tx_status:${signature}`, txStatus, 300);

                // Emit event to simulate WebSocket
                this.eventEmitter.emit('transaction.status', {
                    signature,
                    status: txStatus
                });

                successCount++;
            } catch (error) {
                this.logger.error(`Error polling status for transaction ${signature}:`, error);
            }
        }

        this.logger.log(`Successfully polled ${successCount}/${signatures.length} transaction statuses. Finished tracking ${finishedCount} transactions.`);
    }

    // Thêm phương thức cleanup
    @Cron('0 */30 * * * *') // Run every 30 minutes
    async cleanupStaleData() {
        const now = Date.now();
        const staleThreshold = 30 * 60 * 1000; // 30 phút

        // Cleanup stale transactions
        let staleTransactions = 0;
        for (const signature of this.fallbackTransactions) {
            const lastPoll = this.lastPollTime.get(`tx:${signature}`) || 0;
            if (now - lastPoll > staleThreshold) {
                this.fallbackTransactions.delete(signature);
                staleTransactions++;
            }
        }

        // Cleanup stale accounts
        let staleAccounts = 0;
        for (const account of this.fallbackAccounts) {
            const lastPoll = this.lastPollTime.get(account) || 0;
            if (now - lastPoll > staleThreshold) {
                this.fallbackAccounts.delete(account);
                staleAccounts++;
            }
        }

        this.logger.log(`Cleaned up ${staleTransactions} stale transactions and ${staleAccounts} stale accounts`);
    }
}