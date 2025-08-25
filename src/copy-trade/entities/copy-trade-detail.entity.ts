import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CopyTrade } from './copy-trade.entity';

@Entity('copy_trade_detail')
export class CopyTradeDetail {
    @PrimaryGeneratedColumn()
    ct_detail_id: number;

    @ManyToOne(() => CopyTrade)
    @JoinColumn({ name: 'ct_trade_id' })
    ct_trade: CopyTrade;

    @Column({
        type: 'enum',
        enum: ['buy', 'sell'],
        default: 'buy'
    })
    ct_type: 'buy' | 'sell';

    @Column({ type: 'varchar', length: 255, nullable: true })
    ct_detail_token_name: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    ct_detail_token_address: string;

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    ct_detail_total_usd: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    ct_detail_amount: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    ct_detail_price: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    ct_detail_profit: number;

    @Column({ type: 'timestamp', nullable: true })
    ct_detail_time: Date;

    @Column({ type: 'varchar', length: 255, nullable: true })
    ct_copytrade_hash: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    ct_traking_hash: string;

    @Column({
        type: 'enum',
        enum: ['wait', 'success', 'error'],
        default: 'wait'
    })
    ct_detail_status: 'wait' | 'success' | 'error';

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    ct_detail_buy_price: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    ct_detail_current_price: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    ct_detail_pnl: number;

    @Column({ nullable: true })
    ct_detail_message: string;
}
