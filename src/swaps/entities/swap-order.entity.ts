import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { SwapInvestorReward } from './swap-investor-reward.entity';

export enum SwapOrderStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum SwapOrderType {
  USDT_TO_SOL = 'usdt_to_sol',
  SOL_TO_USDT = 'sol_to_usdt',
}

@Entity('swap_orders')
export class SwapOrder {
  @PrimaryGeneratedColumn({ name: 'swap_order_id' })
  swap_order_id: number;

  @Column({ name: 'wallet_id', type: 'integer', nullable: false })
  wallet_id: number;

  @Column({ 
    name: 'swap_type', 
    type: 'enum', 
    enum: SwapOrderType,
    nullable: false 
  })
  swap_type: SwapOrderType;

  @Column({ 
    name: 'input_amount', 
    type: 'decimal', 
    precision: 18, 
    scale: 6,
    nullable: false 
  })
  input_amount: number;

  @Column({ 
    name: 'output_amount', 
    type: 'decimal', 
    precision: 18, 
    scale: 6,
    nullable: true 
  })
  output_amount: number;

  @Column({ 
    name: 'exchange_rate', 
    type: 'decimal', 
    precision: 18, 
    scale: 6,
    nullable: true 
  })
  exchange_rate: number;

  @Column({ 
    name: 'fee_amount', 
    type: 'decimal', 
    precision: 18, 
    scale: 6,
    default: 0 
  })
  fee_amount: number;

  @Column({ 
    name: 'status', 
    type: 'enum', 
    enum: SwapOrderStatus,
    default: SwapOrderStatus.PENDING 
  })
  status: SwapOrderStatus;

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

  // Foreign key reference
  @ManyToOne(() => ListWallet, wallet => wallet.swapOrders)
  @JoinColumn({ name: 'wallet_id' })
  wallet: ListWallet;

  // One-to-many relationship with SwapInvestorReward
  @OneToMany(() => SwapInvestorReward, reward => reward.swapOrder)
  investorRewards: SwapInvestorReward[];
} 