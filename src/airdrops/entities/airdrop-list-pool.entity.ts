import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { AirdropPoolJoin } from './airdrop-pool-join.entity';

export enum AirdropPoolStatus {
    PENDING = 'pending',
    ACTIVE = 'active',
    END = 'end',
    ERROR = 'error'
}

@Entity('airdrop_list_pool')
export class AirdropListPool {
    @PrimaryGeneratedColumn({ name: 'alp_id' })
    alp_id: number;

    @Column({ name: 'alp_originator', type: 'integer', nullable: false })
    alp_originator: number;

    @Column({ name: 'alp_name', type: 'varchar', length: 255, nullable: false })
    alp_name: string;

    @Column({ name: 'alp_slug', type: 'varchar', length: 255, nullable: false })
    alp_slug: string;

    @Column({ name: 'alp_describe', type: 'varchar', length: 1000, nullable: true })
    alp_describe: string;

    @Column({ name: 'alp_logo', type: 'varchar', length: 500, nullable: true })
    alp_logo: string;

    @Column({ name: 'alp_member_num', type: 'integer', default: 0 })
    alp_member_num: number;

    @Column({ name: 'apl_volume', type: 'decimal', precision: 18, scale: 6, default: 0 })
    apl_volume: number;

    @CreateDateColumn({ name: 'apl_creation_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    apl_creation_date: Date;

    @Column({ name: 'apl_end_date', type: 'timestamp', nullable: true })
    apl_end_date: Date;

    @Column({ name: 'apl_round_end', type: 'timestamp', nullable: true })
    apl_round_end: Date | null;

    @Column({
        name: 'apl_status',
        type: 'enum',
        enum: AirdropPoolStatus,
        default: AirdropPoolStatus.PENDING
    })
    apl_status: AirdropPoolStatus;

    @Column({ name: 'apl_hash', type: 'text', nullable: true })
    apl_hash: string | null;

    // Foreign key reference: airdrop_list_pool.alp_originator > list_wallets.wallet_id
    @ManyToOne(() => ListWallet, wallet => wallet.airdropPools)
    @JoinColumn({ name: 'alp_originator', referencedColumnName: 'wallet_id' })
    originator: ListWallet;

    // Relationships
    @OneToMany(() => AirdropPoolJoin, join => join.pool)
    poolJoins: AirdropPoolJoin[];
} 