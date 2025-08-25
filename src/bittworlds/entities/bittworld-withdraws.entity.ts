import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BittworldRewards } from './bittworld-rewards.entity';

@Entity('bittworld_withdraws')
export class BittworldWithdraw {
    @PrimaryGeneratedColumn({ name: 'bw_id' })
    bw_id: number;

    @Column({ name: 'bw_reward_id', type: 'integer', nullable: false })
    bw_reward_id: number;

    @Column({ 
        name: 'bw_amount_sol', 
        type: 'decimal', 
        precision: 18, 
        scale: 6, 
        nullable: true 
    })
    bw_amount_sol: number;

    @Column({ 
        name: 'bw_amount_usd', 
        type: 'decimal', 
        precision: 18, 
        scale: 6, 
        nullable: true 
    })
    bw_amount_usd: number;

    @Column({ 
        name: 'bw_address', 
        type: 'varchar', 
        length: 255, 
        nullable: true 
    })
    bw_address: string;

    @CreateDateColumn({ name: 'bw_date' })
    bw_date: Date;

    @Column({ 
        name: 'bw_status', 
        type: 'enum', 
        enum: ['pending', 'success', 'error', 'cancel'],
        default: 'pending'
    })
    bw_status: 'pending' | 'success' | 'error' | 'cancel';

    @Column({ 
        name: 'bw_tx_hash', 
        type: 'varchar', 
        length: 255, 
        nullable: true,
        comment: 'Transaction hash of the SOL transfer'
    })
    bw_tx_hash: string;

    // Foreign key reference: bittworld_withdraws.bw_reward_id > bittworld_rewards.br_id
    @ManyToOne(() => BittworldRewards, reward => reward.withdraws)
    @JoinColumn({ name: 'bw_reward_id' })
    reward: BittworldRewards;
} 