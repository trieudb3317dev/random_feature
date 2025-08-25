import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { MasterTransaction } from './master-transaction.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';

@Entity('master_transaction_detail')
export class MasterTransactionDetail {
    @PrimaryGeneratedColumn()
    mt_detail_id: number;

    @Column({ nullable: true })
    mt_transaction_id: number;

    @Column({ nullable: true })
    mt_wallet_master: number;

    @Column({ nullable: true })
    mt_wallet_member: number;

    @Column({
        type: 'enum',
        enum: ['buy', 'sell'],
        nullable: true
    })
    mt_detail_type: 'buy' | 'sell';

    @Column({ nullable: true })
    mt_detail_token_name: string;

    @Column({ nullable: true })
    mt_detail_token_address: string;

    @Column({ type: 'decimal', precision: 18, scale: 6 })
    mt_detail_total_usd: number;

    @Column({ type: 'decimal', precision: 30, scale: 15, nullable: true })
    mt_detail_amount: number;

    @Column({ type: 'decimal', precision: 18, scale: 6 })
    mt_detail_price: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    mt_detail_profit: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    mt_detail_received: number;

    @Column({ 
        type: 'timestamp',
        nullable: true 
    })
    mt_detail_time: Date;

    @Column('text', { nullable: true })
    mt_detail_hash: string;

    @Column({ nullable: true })
    mt_detail_message: string;

    @Column({
        type: 'enum',
        enum: ['wait', 'success', 'error'],
        default: 'wait'
    })
    mt_detail_status: 'wait' | 'success' | 'error';

    @ManyToOne(() => MasterTransaction)
    @JoinColumn({ name: 'mt_transaction_id' })
    master_transaction: MasterTransaction;

    @ManyToOne(() => ListWallet)
    @JoinColumn({ name: 'mt_wallet_master' })
    master_wallet: ListWallet;

    @ManyToOne(() => ListWallet)
    @JoinColumn({ name: 'mt_wallet_member' })
    member_wallet: ListWallet;
} 