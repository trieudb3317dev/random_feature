import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { MasterGroup } from './master-group.entity';

@Entity('master_group_auth')
export class MasterGroupAuth {
    @PrimaryGeneratedColumn()
    mga_id: number;

    @Column()
    mga_group_id: number;

    @Column()
    mga_wallet_member: number;

    @Column({
        type: 'enum',
        enum: ['running', 'pause'],
        default: 'running'
    })
    mga_status: 'running' | 'pause';

    @CreateDateColumn()
    created_at: Date;

    @ManyToOne(() => MasterGroup, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'mga_group_id' })
    master_group: MasterGroup;

    @ManyToOne(() => ListWallet)
    @JoinColumn({ name: 'mga_wallet_member' })
    member_wallet: ListWallet;
} 