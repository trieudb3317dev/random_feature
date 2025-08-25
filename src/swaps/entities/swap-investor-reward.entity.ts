import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SwapOrder } from './swap-order.entity';

export enum RewardStatus {
  PENDING = 'pending',
  WAIT_BALANCE = 'wait_balance',
  PAID = 'paid',
  FAILED = 'failed',
}

@Entity('swap_investor_rewards')
export class SwapInvestorReward {
  @PrimaryGeneratedColumn({ name: 'swap_investor_reward_id' })
  swap_investor_reward_id: number;

  @Column({ 
    name: 'reward_sol_amount', 
    type: 'decimal', 
    precision: 18, 
    scale: 6,
    nullable: false 
  })
  reward_sol_amount: number;

  @Column({ 
    name: 'swap_order_id', 
    type: 'integer',
    nullable: false 
  })
  swap_order_id: number;

  @Column({ 
    name: 'investor_id', 
    type: 'integer',
    nullable: false 
  })
  investor_id: number;

  @Column({ 
    name: 'status', 
    type: 'enum', 
    enum: RewardStatus,
    default: RewardStatus.PENDING 
  })
  status: RewardStatus;

  @Column({ 
    name: 'transaction_hash', 
    type: 'varchar', 
    length: 255,
    nullable: true 
  })
  transaction_hash: string;

  @Column({ 
    name: 'error_message', 
    type: 'text',
    nullable: true 
  })
  error_message: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // Foreign key reference to SwapOrder
  @ManyToOne(() => SwapOrder, swapOrder => swapOrder.investorRewards)
  @JoinColumn({ name: 'swap_order_id' })
  swapOrder: SwapOrder;
} 