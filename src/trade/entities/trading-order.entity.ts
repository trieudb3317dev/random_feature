import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, OneToMany, UpdateDateColumn } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { BgAffiliateCommissionReward } from '../../referral/entities/bg-affiliate-commission-reward.entity';

@Entity('trading_orders')
export class TradingOrder {
    @PrimaryGeneratedColumn({ name: 'order_id' })
    order_id: number;

    @Column({ name: 'order_wallet_id', type: 'integer', nullable: false })
    order_wallet_id: number;

    @Column({ name: 'order_trade_type', type: 'enum', enum: ['buy', 'sell'], nullable: false })
    order_trade_type: 'buy' | 'sell';

    @Column({ name: 'order_token_address', type: 'varchar', length: 255, nullable: true })
    order_token_address: string;

    @Column({ name: 'order_token_name', type: 'varchar', length: 255, nullable: true })
    order_token_name: string;

    @Column({ name: 'order_qlty', type: 'decimal', precision: 18, scale: 6, nullable: true })
    order_qlty: number;

    @Column({ name: 'order_price', type: 'decimal', precision: 18, scale: 6, nullable: true })
    order_price: number;

    @Column({ name: 'order_price_matching', type: 'decimal', precision: 18, scale: 6, nullable: true })
    order_price_matching: number;

    @Column({ name: 'order_balance_before', type: 'decimal', precision: 30, scale: 15, nullable: true })
    order_balance_before: number;

    @Column({ name: 'order_total_value', type: 'decimal', precision: 18, scale: 6, nullable: true })
    order_total_value: number;

    @Column({ name: 'order_type', type: 'enum', enum: ['limit', 'market'], nullable: true })
    order_type: 'limit' | 'market';

    @Column({ name: 'order_status', type: 'enum', enum: ['pending', 'executed', 'canceled', 'failed'], nullable: true })
    order_status: 'pending' | 'executed' | 'canceled' | 'failed';

    @Column({ name: 'order_tx_hash', type: 'varchar', length: 255, nullable: true })
    order_tx_hash: string;

    @Column({ name: 'order_error_message', type: 'text', nullable: true })
    order_error_message: string;

    @Column({ name: 'order_stop_loss', type: 'decimal', precision: 18, scale: 6, nullable: true })
    order_stop_loss: number;

    @Column({ name: 'order_take_profit', type: 'decimal', precision: 18, scale: 6, nullable: true })
    order_take_profit: number;

    @CreateDateColumn({ name: 'order_created_at' })
    order_created_at: Date;

    @UpdateDateColumn({ name: 'order_updated_at' })
    order_updated_at: Date;

    @Column({ name: 'order_executed_at', type: 'timestamp', nullable: true })
    order_executed_at: Date;

    // Foreign key reference: trading_orders.order_wallet_id > list_wallets.wallet_id
    @ManyToOne(() => ListWallet, wallet => wallet.tradingOrders)
    @JoinColumn({ name: 'order_wallet_id' })
    wallet: ListWallet;

    // BG Affiliate relationships
    @OneToMany(() => BgAffiliateCommissionReward, reward => reward.order)
    bgAffiliateCommissionRewards: BgAffiliateCommissionReward[];
} 