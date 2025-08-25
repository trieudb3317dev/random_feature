import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { BittworldWithdraw } from './bittworld-withdraws.entity';

@Entity('bittworld_rewards')
export class BittworldRewards {
    @PrimaryGeneratedColumn({ name: 'br_id' })
    br_id: number;

    @Column({ 
        name: 'br_amount_sol', 
        type: 'decimal', 
        precision: 18, 
        scale: 6, 
        nullable: true 
    })
    br_amount_sol: number;

    @Column({ 
        name: 'br_amount_usd', 
        type: 'decimal', 
        precision: 18, 
        scale: 6, 
        nullable: true 
    })
    br_amount_usd: number;

    @CreateDateColumn({ name: 'br_date' })
    br_date: Date;

    @Column({ 
        name: 'br_status', 
        type: 'enum', 
        enum: ['pending', 'can_withdraw', 'withdrawn'],
        default: 'pending'
    })
    br_status: 'pending' | 'can_withdraw' | 'withdrawn';

    // Relationship với bittworld_withdraws
    @OneToMany(() => BittworldWithdraw, withdraw => withdraw.reward)
    withdraws: BittworldWithdraw[];
} 