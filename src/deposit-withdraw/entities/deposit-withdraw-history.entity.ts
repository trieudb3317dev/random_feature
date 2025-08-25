import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('deposit_withdraw_history')
export class DepositWithdrawHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  wallet_id: number;

  @Column({ nullable: true })
  wallet_address_from: string;

  @Column({ nullable: true })
  wallet_address_to: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column('decimal', { precision: 20, scale: 9 })
  amount: number;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ nullable: true })
  transaction_hash: string;

  @Column({ nullable: true })
  error_message: string;

  @Column({ 
    type: 'varchar', 
    length: 10, 
    nullable: true, 
    comment: 'Token symbol (e.g., SOL, USDT, USDC)' 
  })
  token_symbol: string | null;

  @Column({ 
    type: 'varchar', 
    length: 44, 
    nullable: true, 
    comment: 'Token mint address (for SPL tokens)' 
  })
  token_mint_address: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
} 