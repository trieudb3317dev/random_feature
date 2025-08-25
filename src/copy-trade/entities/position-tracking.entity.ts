import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CopyTrade } from './copy-trade.entity';

@Entity('position_tracking')
export class PositionTracking {
    @PrimaryGeneratedColumn()
    pt_id: number;

    @ManyToOne(() => CopyTrade)
    @JoinColumn({ name: 'ct_trade_id' })
    ct_trade: CopyTrade;

    @Column()
    pt_token_address: string;

    @Column('decimal', { precision: 18, scale: 6 })
    pt_entry_price: number;

    @Column('decimal', { precision: 18, scale: 6 })
    pt_amount: number;

    @Column()
    pt_buy_tx_hash: string;

    @Column({ nullable: true })
    pt_sell_tx_hash: string;

    @Column()
    pt_entry_time: Date;

    @Column({ nullable: true })
    pt_exit_time: Date;

    @Column({
        type: 'enum',
        enum: ['open', 'closed'],
        default: 'open'
    })
    pt_status: 'open' | 'closed';
} 