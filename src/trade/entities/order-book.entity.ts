import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { TradingOrder } from './trading-order.entity';

@Entity('order_books')
export class OrderBook {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    token_address: string;

    @Column('decimal', { precision: 18, scale: 8 })
    price: number;

    @Column('decimal', { precision: 18, scale: 8 })
    quantity: number;

    @Column({
        type: 'enum',
        enum: ['buy', 'sell']
    })
    side: 'buy' | 'sell';

    @Column()
    order_id: number;

    @CreateDateColumn()
    created_at: Date;

    @ManyToOne(() => TradingOrder)
    @JoinColumn({ name: 'order_id' })
    order: TradingOrder;
} 