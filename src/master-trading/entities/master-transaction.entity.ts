import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TradingOrder } from '../../trade/entities/trading-order.entity';

@Entity('master_transaction')
export class MasterTransaction {
    @PrimaryGeneratedColumn()
    mt_id: number;

    @Column()
    mt_master_wallet: number;

    @Column('text')
    mt_group_list: string; // JSON string của array group IDs

    @Column({ type: 'text', nullable: true })
    mt_member_list: string; // JSON string của array member wallet IDs

    @Column()
    mt_token_name: string;

    @Column()
    mt_token_address: string;

    @Column({
        type: 'enum',
        enum: ['buy', 'sell'],
        name: 'mt_trade_type'
    })
    mt_trade_type: 'buy' | 'sell';

    @Column({
        type: 'enum',
        enum: ['limit', 'market']
    })
    mt_type: 'limit' | 'market';

    @Column({ type: 'decimal', precision: 18, scale: 6 })
    mt_price: number;

    @Column({
        type: 'enum',
        enum: ['running', 'pause', 'stop', 'failed'],
        default: 'running'
    })
    mt_status: 'running' | 'pause' | 'stop' | 'failed';

    @Column({ nullable: true })
    mt_transaction_folow: number;

    @ManyToOne(() => TradingOrder)
    @JoinColumn({ name: 'mt_transaction_folow' })
    trading_order: TradingOrder;

    @Column({
        nullable: true,
        type: 'enum',
        enum: ['raydium', 'jupiter', 'pumpfun']
    })
    mt_used_dex: 'raydium' | 'jupiter' | 'pumpfun';

    @Column({ nullable: true })
    mt_error_message?: string;
} 