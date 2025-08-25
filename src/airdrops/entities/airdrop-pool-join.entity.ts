import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { AirdropListPool } from './airdrop-list-pool.entity';

export enum AirdropPoolJoinStatus {
    PENDING = 'pending',
    ACTIVE = 'active',
    WITHDRAW = 'withdraw',
    ERROR = 'error'
}

@Entity('airdrop_pool_joins')
export class AirdropPoolJoin {
    @PrimaryGeneratedColumn({ name: 'apj_id' })
    apj_id: number;

    @Column({ name: 'apj_pool_id', type: 'integer', nullable: false })
    apj_pool_id: number;

    @Column({ name: 'apj_member', type: 'integer', nullable: false })
    apj_member: number;

    @Column({ name: 'apj_volume', type: 'decimal', precision: 18, scale: 6, default: 0 })
    apj_volume: number;

    @CreateDateColumn({ name: 'apj_stake_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    apj_stake_date: Date;

    @Column({ name: 'apj_stake_end', type: 'timestamp', nullable: true })
    apj_stake_end: Date;

    @Column({ name: 'apj_round_end', type: 'timestamp', nullable: true })
    apj_round_end: Date | null;

    @Column({
        name: 'apj_status',
        type: 'enum',
        enum: AirdropPoolJoinStatus,
        default: AirdropPoolJoinStatus.PENDING
    })
    apj_status: AirdropPoolJoinStatus;

    @Column({ name: 'apj_hash', type: 'text', nullable: true })
    apj_hash: string | null;

    // Foreign key reference: airdrop_pool_joins.apj_pool_id > airdrop_list_pool.alp_id
    @ManyToOne(() => AirdropListPool, pool => pool.poolJoins)
    @JoinColumn({ name: 'apj_pool_id', referencedColumnName: 'alp_id' })
    pool: AirdropListPool;

    // Foreign key reference: airdrop_pool_joins.apj_member > list_wallets.wallet_id
    @ManyToOne(() => ListWallet, wallet => wallet.airdropPoolJoins)
    @JoinColumn({ name: 'apj_member', referencedColumnName: 'wallet_id' })
    member: ListWallet;
} 