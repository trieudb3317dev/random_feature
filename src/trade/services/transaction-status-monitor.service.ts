import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradingOrder } from '../entities/trading-order.entity';
import { MasterTransactionDetail } from '../../master-trading/entities/master-transaction-detail.entity';
import { SolanaService } from '../../solana/solana.service';
import { Interval } from '@nestjs/schedule';
import { SolanaWebSocketService } from '../../solana/solana-websocket.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { SolanaTrackingService } from '../../solana/services/tracking.service';

@Injectable()
export class TransactionStatusMonitorService implements OnModuleInit {
    private pendingTransactions: Set<string> = new Set();

    constructor(
        @InjectRepository(TradingOrder)
        private tradingOrderRepository: Repository<TradingOrder>,
        @InjectRepository(MasterTransactionDetail)
        private masterTransactionDetailRepository: Repository<MasterTransactionDetail>,
        private solanaService: SolanaService,
        private readonly solanaWebSocketService: SolanaWebSocketService,
        private readonly eventEmitter: EventEmitter2,
        private readonly solanaTrackingService: SolanaTrackingService
    ) {
        // Lắng nghe sự kiện trạng thái giao dịch
        this.eventEmitter.on('transaction.status', async (data) => {
            await this.handleTransactionStatus(data);
        });
    }

    async onModuleInit() {
        console.log('TransactionStatusMonitorService initialized');
        // Khởi tạo theo dõi các giao dịch đang chờ xử lý
        await this.initializeTransactionTracking();
    }

    // Khởi tạo theo dõi các giao dịch đang chờ xử lý
    private async initializeTransactionTracking() {
        try {
            // Lấy danh sách các giao dịch đang chờ xử lý
            const pendingOrders = await this.tradingOrderRepository.find({
                where: { order_status: 'pending' }
            });

            const pendingMasterTransactions = await this.masterTransactionDetailRepository.find({
                where: { mt_detail_status: 'wait' }
            });

            // Đăng ký theo dõi các giao dịch qua WebSocket
            for (const order of pendingOrders) {
                if (order.order_tx_hash) {
                    this.pendingTransactions.add(order.order_tx_hash);
                    await this.solanaWebSocketService.trackTransactionStatus(order.order_tx_hash);
                }
            }

            for (const tx of pendingMasterTransactions) {
                if (tx.mt_detail_hash) {
                    this.pendingTransactions.add(tx.mt_detail_hash);
                    await this.solanaWebSocketService.trackTransactionStatus(tx.mt_detail_hash);
                }
            }

            console.log(`Tracking ${this.pendingTransactions.size} pending transactions via WebSocket`);
        } catch (error) {
            console.error('Error initializing transaction tracking:', error);
        }
    }

    // Chỉ chạy mỗi 30 giây để kiểm tra các giao dịch mới
    @Interval(30000)
    async checkForNewPendingTransactions() {
        try {
            // Lấy danh sách các giao dịch mới đang chờ xử lý
            const pendingOrders = await this.tradingOrderRepository.find({
                where: { order_status: 'pending' }
            });

            const pendingMasterTransactions = await this.masterTransactionDetailRepository.find({
                where: { mt_detail_status: 'wait' }
            });

            // Đăng ký theo dõi các giao dịch mới qua WebSocket
            for (const order of pendingOrders) {
                if (order.order_tx_hash && !this.pendingTransactions.has(order.order_tx_hash)) {
                    this.pendingTransactions.add(order.order_tx_hash);
                    await this.solanaWebSocketService.trackTransactionStatus(order.order_tx_hash);
                }
            }

            for (const tx of pendingMasterTransactions) {
                if (tx.mt_detail_hash && !this.pendingTransactions.has(tx.mt_detail_hash)) {
                    this.pendingTransactions.add(tx.mt_detail_hash);
                    await this.solanaWebSocketService.trackTransactionStatus(tx.mt_detail_hash);
                }
            }
        } catch (error) {
            console.error('Error checking for new pending transactions:', error);
        }
    }

    private async handleTransactionStatus(data: any) {
        const { signature, status } = data;

        if (status === 'confirmed' || status === 'finalized') {
            await this.updateOrderStatus(signature, 'executed');
            await this.updateTransactionStatus(signature, 'success');
            this.pendingTransactions.delete(signature);
        } else if (status === 'failed') {
            await this.updateOrderStatus(signature, 'failed');
            await this.updateTransactionStatus(signature, 'error');
            this.pendingTransactions.delete(signature);
        }
    }

    private async updateOrderStatus(signature: string, status: 'executed' | 'failed') {
        try {
            // Tìm các giao dịch có tx_hash bằng signature
            const orders = await this.tradingOrderRepository.find({
                where: { order_tx_hash: signature }
            });

            for (const order of orders) {
                // Cập nhật trạng thái giao dịch
                order.order_status = status;
                order.order_executed_at = new Date();
                await this.tradingOrderRepository.save(order);

                // Emit sự kiện order.status.updated với đầy đủ thông tin
                this.eventEmitter.emit('order.status.updated', {
                    order_id: order.order_id,
                    token_address: order.order_token_address,
                    status: status,
                    price: order.order_price,
                    quantity: order.order_qlty,
                    total_value: order.order_total_value,
                    executed_at: order.order_executed_at,
                    tx_hash: order.order_tx_hash
                });

                console.log(`Order ${order.order_id} status updated to ${status} and event emitted`);
            }
        } catch (error) {
            console.error(`Error updating order status: ${signature} to ${status}:`, error);
        }
    }

    private async updateTransactionStatus(
        signature: string,
        status: 'error' | 'success'
    ) {
        try {
            // Tìm các giao dịch chi tiết liên quan đến signature này
            const details = await this.masterTransactionDetailRepository.find({
                where: { mt_detail_hash: signature }
            });

            for (const detail of details) {
                // Cập nhật trạng thái giao dịch
                detail.mt_detail_status = status;
                await this.masterTransactionDetailRepository.save(detail);

                console.log(`Master transaction detail ${detail.mt_detail_id} status updated to ${status}`);
            }
        } catch (error) {
            console.error(`Error updating transaction status for ${signature}:`, error);
        }
    }

    @Cron('*/30 * * * * *')
    async monitorPendingTransactions() {
        try {
            // Lấy danh sách các giao dịch đang chờ xử lý
            const pendingMasterTransactions = await this.masterTransactionDetailRepository.find({
                where: { mt_detail_status: 'wait' }
            });

            // Đăng ký theo dõi các giao dịch qua WebSocket
            for (const detail of pendingMasterTransactions) {
                if (detail.mt_detail_hash) {
                    await this.solanaTrackingService.trackTransaction(
                        detail.mt_detail_hash,
                        `master-tx-${detail.mt_detail_id}`
                    );
                }
            }
        } catch (error) {
            console.error('Error monitoring pending transactions:', error);
        }
    }
} 