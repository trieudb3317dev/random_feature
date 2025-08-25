import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { CopyTradeDetail } from './copy-trade-detail.entity';

@Entity('copy_trade')
export class CopyTrade {
    @PrimaryGeneratedColumn()
    ct_id: number;

    @Column({ name: 'ct_wallet_id' })
    ct_wallet_id: number;

    @ManyToOne(() => ListWallet)
    @JoinColumn({ name: 'ct_wallet_id' })
    ct_wallet: ListWallet;

    @Column({ type: 'varchar', length: 255 })
    ct_tracking_wallet: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    ct_tracking_name: string;

    @Column({ type: 'decimal', precision: 18, scale: 6 })
    ct_amount: number;

    @Column({ type: 'enum', enum: ['maxbuy', 'fixedbuy', 'fixedratio'], default: 'maxbuy' })
    ct_buy_option: 'maxbuy' | 'fixedbuy' | 'fixedratio';

    @Column({ type: 'int', nullable: true })
    ct_fixed_ratio: number;

    @Column({ type: 'enum', enum: ['auto', 'notsell', 'manual'], default: 'auto' })
    ct_sell_method: 'auto' | 'notsell' | 'manual';

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    ct_tp: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
    ct_sl: number;

    @Column({ type: 'enum', enum: ['running', 'pause', 'stop'], default: 'running' })
    ct_status: 'running' | 'pause' | 'stop';

    @OneToMany(() => CopyTradeDetail, detail => detail.ct_trade)
    details: CopyTradeDetail[];
}
