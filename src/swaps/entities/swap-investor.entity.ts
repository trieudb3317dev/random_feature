import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('swap_investors')
export class SwapInvestors {
  @PrimaryGeneratedColumn({ name: 'swap_investor_id' })
  swap_investor_id: number;

  @Column({ 
    name: 'wallet_address', 
    type: 'varchar', 
    length: 255,
    nullable: false 
  })
  wallet_address: string;

  @Column({ 
    name: 'coins', 
    type: 'text',
    nullable: true
  })
  coins: string[]; // Đổi type thành array

  @Column({ 
    name: 'amount_sol', 
    type: 'decimal', 
    precision: 18, 
    scale: 6,
    nullable: false,
    default: 0
  })
  amount_sol: number;

  @Column({ 
    name: 'amount_usdt', 
    type: 'decimal', 
    precision: 18, 
    scale: 6,
    nullable: false,
    default: 0
  })
  amount_usdt: number;

  @Column({ 
    name: 'amount_usd', 
    type: 'decimal', 
    precision: 18, 
    scale: 6,
    nullable: false,
    default: 0
  })
  amount_usd: number;

  @Column({ 
    name: 'active', 
    type: 'boolean',
    default: true 
  })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
} 