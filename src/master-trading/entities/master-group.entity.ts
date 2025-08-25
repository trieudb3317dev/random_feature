import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { MasterGroupAuth } from './master-group-auth.entity';

@Entity('master_groups')
export class MasterGroup {
    @PrimaryGeneratedColumn()
    mg_id: number;

    @Column()
    mg_name: string;

    @Column({
        type: 'enum',
        enum: ['fixedprice', 'fixedratio', 'trackingratio']
    })
    mg_option: 'fixedprice' | 'fixedratio' | 'trackingratio';

    @Column({ type: 'decimal', precision: 18, scale: 6 })
    mg_fixed_price: number;

    @Column()
    mg_fixed_ratio: number;

    @Column({
        type: 'enum',
        enum: ['on', 'off', 'delete', 'delete-hidden'],
        default: 'on'
    })
    mg_status: 'on' | 'off' | 'delete' | 'delete-hidden';

    @Column()
    mg_master_wallet: number;

    @CreateDateColumn()
    created_at: Date;

    @ManyToOne(() => ListWallet)
    @JoinColumn({ name: 'mg_master_wallet' })
    master_wallet: ListWallet;

    @OneToMany(() => MasterGroupAuth, auth => auth.master_group)
    group_auths: MasterGroupAuth[];
} 