import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, BeforeInsert } from 'typeorm';
import { WalletReferent } from './wallet-referent.entity';
import { RefWithdrawHistory } from './ref-withdraw-history.entity';

@Entity('wallet_ref_rewards')
export class WalletRefReward {
    @PrimaryColumn()
    wrr_id: number;

    @Column()
    wrr_ref_id: number;

    @Column({ type: 'varchar', nullable: true })
    wrr_signature: string;

    @Column({ type: 'decimal', precision: 20, scale: 8 })
    wrr_sol_reward: number;

    @Column({ type: 'decimal', precision: 20, scale: 8 })
    wrr_use_reward: number;

    @Column({ 
        name: 'wrr_withdraw_status', 
        type: 'boolean', 
        default: false,
        nullable: false 
    })
    wrr_withdraw_status: boolean;

    @Column({
        name: 'wrr_withdraw_id',
        type: 'integer',
        nullable: true,
        default: null
    })
    wrr_withdraw_id: number | null;

    @ManyToOne(() => RefWithdrawHistory, withdrawHistory => withdrawHistory.rwh_id, { nullable: true })
    @JoinColumn({ name: 'wrr_withdraw_id', referencedColumnName: 'rwh_id' })
    withdrawHistory: RefWithdrawHistory;

    @ManyToOne(() => WalletReferent, walletReferent => walletReferent.rewards)
    @JoinColumn({ name: 'wrr_ref_id' })
    referent: WalletReferent;

    @BeforeInsert()
    async setInitialId() {
        if (!this.wrr_id) {
            const timestamp = new Date().getTime();
            const random = Math.floor(Math.random() * 1000);
            this.wrr_id = timestamp % 10000 + random;
        }
    }
} 