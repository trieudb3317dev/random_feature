import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, EntityManager } from 'typeorm';
import { OrderBook } from './entities/order-book.entity';
import { TradingOrder } from './entities/trading-order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { GetOrderBookDto } from './dto/get-order-book.dto';
import { OrderBookDepth } from './interfaces/order-book.interface';
import { SolanaService } from '../solana/solana.service';
import { OrderCacheService } from './services/order-cache.service';
import { Transactional } from 'typeorm-transactional';
import { StandardResponse } from './interfaces/standard-response.interface';
import { MasterTransaction } from '../master-trading/entities/master-transaction.entity';
import { RedisLockService } from '../common/services/redis-lock.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MasterGroupAuth } from '../master-trading/entities/master-group-auth.entity';
import { MasterTransactionDetail } from '../master-trading/entities/master-transaction-detail.entity';
import { In } from 'typeorm';

@Injectable()
export class OrderBookService {
    constructor(
        @InjectRepository(OrderBook)
        private readonly orderBookRepository: Repository<OrderBook>,
        @InjectRepository(TradingOrder)
        private readonly tradingOrderRepository: Repository<TradingOrder>,
        @InjectRepository(MasterTransaction)
        private readonly masterTransactionRepository: Repository<MasterTransaction>,
        private readonly solanaService: SolanaService,
        private readonly orderCacheService: OrderCacheService,
        private readonly redisLockService: RedisLockService,
        private readonly eventEmitter: EventEmitter2
    ) {
        // Comment phần subscribe price feed
        /*
        this.eventEmitter.on('price.update', async (data: any) => {
            await this.checkAndExecuteOrders(data);
        });
        */
    }

    /* Comment toàn bộ hàm checkAndExecuteOrders
    async checkAndExecuteOrders(priceData: any) {
        // Logic check và thực thi order
    }
    */

    /* Comment hàm addToOrderBook vì tạm thời không dùng
    async addToOrderBook(order: TradingOrder) {
        // Logic thêm vào order book
    }
    */

    @Transactional()
    async addToOrderBook(order: TradingOrder) {
        const orderBook = new OrderBook();
        orderBook.token_address = order.order_token_address;
        orderBook.price = order.order_price;
        orderBook.quantity = order.order_qlty;
        orderBook.side = order.order_trade_type;
        orderBook.order_id = order.order_id;

        await this.orderBookRepository.save(orderBook);
        await this.orderCacheService.invalidateCache(order.order_token_address);
    }

    async findMatchingOrders(tokenMint: string, currentPrice: number) {
        // Tìm các orders khớp giá
        return await this.orderBookRepository
            .createQueryBuilder('ob')
            .where('ob.token_address = :tokenMint', { tokenMint })
            .andWhere(new Brackets(qb => {
                qb.where('ob.trade_type = :buy AND :currentPrice <= ob.price', {
                    buy: 'buy',
                    currentPrice
                })
                    .orWhere('ob.trade_type = :sell AND :currentPrice >= ob.price', {
                        sell: 'sell',
                        currentPrice
                    });
            }))
            .getMany();
    }

    async removeFromOrderBook(orderId: number) {
        await this.orderBookRepository.delete({ order_id: orderId });
    }

    async getOrderBookDepth(params: GetOrderBookDto): Promise<StandardResponse<OrderBookDepth>> {
        const { token_address, depth, min_quantity, price_range_percentage } = params;

        // Get current price
        const currentPrice = await this.solanaService.getTokenPrice(token_address);

        // Calculate price range
        const priceRange = currentPrice * (price_range_percentage || 10) / 100;
        const minPrice = currentPrice - priceRange;
        const maxPrice = currentPrice + priceRange;

        // Get buy orders (bids)
        const bids = await this.orderBookRepository
            .createQueryBuilder('ob')
            .select([
                'ob.price as price',
                'SUM(ob.quantity) as totalQuantity',
                'COUNT(ob.id) as orderCount'
            ])
            .where('ob.token_address = :token_address', { token_address })
            .andWhere('ob.side = :side', { side: 'buy' })
            .andWhere('ob.price >= :minPrice', { minPrice })
            .andWhere('ob.price <= :currentPrice', { currentPrice })
            .having('SUM(ob.quantity) >= :min_quantity', { min_quantity: min_quantity || 0 })
            .groupBy('ob.price')
            .orderBy('ob.price', 'DESC')
            .limit(depth)
            .getRawMany();

        // Get sell orders (asks)
        const asks = await this.orderBookRepository
            .createQueryBuilder('ob')
            .select([
                'ob.price as price',
                'SUM(ob.quantity) as totalQuantity',
                'COUNT(ob.id) as orderCount'
            ])
            .where('ob.token_address = :token_address', { token_address })
            .andWhere('ob.side = :side', { side: 'sell' })
            .andWhere('ob.price <= :maxPrice', { maxPrice })
            .andWhere('ob.price >= :currentPrice', { currentPrice })
            .having('SUM(ob.quantity) >= :min_quantity', { min_quantity: min_quantity || 0 })
            .groupBy('ob.price')
            .orderBy('ob.price', 'ASC')
            .limit(depth)
            .getRawMany();

        const spread = asks[0]?.price - bids[0]?.price || 0;

        return {
            status: 200,
            message: "Order book retrieved successfully",
            data: {
                bids,
                asks,
                spread,
                lastPrice: currentPrice
            }
        };
    }

    async getAllPendingOrders(): Promise<OrderBook[]> {
        return this.orderBookRepository
            .createQueryBuilder('ob')
            .innerJoinAndSelect('ob.order', 'order')
            .where('order.order_status = :status', { status: OrderStatus.PENDING })
            .getMany();
    }

    // Thêm hàm mới để tìm master transactions khớp giá
    async findMatchingMasterTransactions(tokenMint: string, currentPrice: number) {
        return await this.masterTransactionRepository
            .createQueryBuilder('mt')
            .where('mt.mt_token_address = :tokenMint', { tokenMint })
            .andWhere('mt.mt_status = :status', { status: 'running' })
            .andWhere('mt.mt_type = :type', { type: 'limit' })
            .andWhere(new Brackets(qb => {
                qb.where('mt.mt_trade_type = :buy AND :currentPrice <= mt.mt_price', {
                    buy: 'buy',
                    currentPrice
                })
                    .orWhere('mt.mt_trade_type = :sell AND :currentPrice >= mt.mt_price', {
                        sell: 'sell',
                        currentPrice
                    });
            }))
            .getMany();
    }

    async processMatchingOrders(tokenMint: string, currentPrice: number) {
        return this.redisLockService.withLock(
            `orderbook:${tokenMint}`,
            async () => {
                await this.orderBookRepository.manager.transaction(async manager => {
                    const matchingOrders = await this.findMatchingOrders(tokenMint, currentPrice);
                    for (const orderBook of matchingOrders) {
                        // Lấy order gốc từ order book
                        const order = await this.tradingOrderRepository.findOne({
                            where: { order_id: orderBook.order_id },
                            relations: ['wallet']
                        });

                        if (order) {
                            await this.processOrder(order, currentPrice, manager);
                            await this.removeFromOrderBook(order.order_id);
                        }
                    }

                    // Process master transactions
                    const matchingMasterTxs = await this.findMatchingMasterTransactions(tokenMint, currentPrice);
                    for (const masterTx of matchingMasterTxs) {
                        await this.processMasterTransaction(masterTx, currentPrice, manager);
                    }

                    // Emit metrics
                    this.eventEmitter.emit('orderbook.processed', {
                        tokenMint,
                        currentPrice,
                        ordersProcessed: matchingOrders.length,
                        masterTxsProcessed: matchingMasterTxs.length,
                        timestamp: new Date()
                    });
                });
            }
        );
    }

    private async processOrder(order: TradingOrder, currentPrice: number, manager: EntityManager) {
        try {
            // Thực hiện swap
            const txHash = await this.solanaService.swapTokenOnSolana(
                order.wallet.wallet_private_key,
                order.order_trade_type === 'buy' ? 'SOL' : order.order_token_address,
                order.order_trade_type === 'buy' ? order.order_token_address : 'SOL',
                order.order_qlty,
                3, // slippage
                {} // options (tùy chọn)
            );

            // Cập nhật order
            order.order_status = 'executed';
            order.order_price_matching = currentPrice;
            if (txHash) {
                order.order_tx_hash = txHash.signature;
            }
            order.order_executed_at = new Date();
            await manager.save(order);

            // Emit event
            this.eventEmitter.emit('order.executed', {
                orderId: order.order_id,
                price: currentPrice,
                txHash: order.order_tx_hash
            });

        } catch (error) {
            order.order_status = 'failed';
            order.order_error_message = error.message;
            await manager.save(order);

            this.eventEmitter.emit('order.failed', {
                orderId: order.order_id,
                error: error.message
            });

            throw error;
        }
    }

    private async processMasterTransaction(masterTx: MasterTransaction, currentPrice: number, manager: EntityManager) {
        try {
            const groupIds = JSON.parse(masterTx.mt_group_list);
            const auths = await manager.find(MasterGroupAuth, {
                where: {
                    mga_group_id: In(groupIds),
                    mga_status: 'running'
                },
                relations: ['master_group', 'member_wallet']
            });

            for (const auth of auths) {
                const detail = new MasterTransactionDetail();
                detail.mt_transaction_id = masterTx.mt_id;
                detail.mt_wallet_master = auth.master_group.mg_master_wallet;
                detail.mt_wallet_member = auth.member_wallet.wallet_id;
                detail.mt_detail_type = masterTx.mt_trade_type;
                detail.mt_detail_token_name = masterTx.mt_token_name;
                detail.mt_detail_token_address = masterTx.mt_token_address;
                detail.mt_detail_price = currentPrice;
                detail.mt_detail_time = new Date();
                detail.mt_detail_status = 'wait';

                const savedDetail = await manager.save(detail);

                try {
                    const txHash = await this.solanaService.swapTokenOnSolana(
                        auth.member_wallet.wallet_private_key,
                        masterTx.mt_trade_type === 'buy' ? 'SOL' : masterTx.mt_token_address,
                        masterTx.mt_trade_type === 'buy' ? masterTx.mt_token_address : 'SOL',
                        masterTx.mt_price,
                        3, // slippage
                        {} // options (tùy chọn)
                    );

                    savedDetail.mt_detail_status = 'success';
                    if (txHash) {
                        savedDetail.mt_detail_hash = txHash.signature;
                    }
                    await manager.save(savedDetail);

                } catch (error) {
                    savedDetail.mt_detail_status = 'error';
                    savedDetail.mt_detail_message = error.message;
                    await manager.save(savedDetail);
                }
            }

            masterTx.mt_status = 'stop';
            await manager.save(masterTx);

        } catch (error) {
            console.error('Error processing master transaction:', error);
            throw error;
        }
    }
} 