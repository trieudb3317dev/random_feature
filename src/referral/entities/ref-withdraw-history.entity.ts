import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { WalletRefReward } from './wallet-ref-reward.entity';
import { BgAffiliateCommissionReward } from './bg-affiliate-commission-reward.entity';

export enum WithdrawStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  RETRY = 'retry'
}

@Entity('ref_withdraw_histories')
@Index(['rwh_wallet_id', 'rwh_status'], { unique: true, where: "rwh_status = 'pending'" })
export class RefWithdrawHistory {
  @PrimaryGeneratedColumn({ name: 'rwh_id' })
  rwh_id: number;

  @Column({ name: 'rwh_wallet_id', type: 'integer', nullable: false })
  rwh_wallet_id: number;

  @Column({ 
    name: 'rwh_amount', 
    type: 'decimal', 
    precision: 18, 
    scale: 6, 
    nullable: false 
  })
  rwh_amount: number;

  @Column({ 
    name: 'rwh_amount_usd', 
    type: 'decimal', 
    precision: 18, 
    scale: 6, 
    nullable: true 
  })
  rwh_amount_usd: number | null;

  @Column({ 
    name: 'rwh_hash', 
    type: 'varchar', 
    length: 255, 
    nullable: true 
  })
  rwh_hash: string | null;

  @Column({ 
    name: 'rwh_status', 
    type: 'enum', 
    enum: WithdrawStatus,
    default: WithdrawStatus.PENDING,
    nullable: false 
  })
  rwh_status: WithdrawStatus;

  @Column({ 
    name: 'rwh_date', 
    type: 'timestamp', 
    nullable: false 
  })
  rwh_date: Date;

  @Column({ 
    name: 'rwh_retry_count', 
    type: 'integer', 
    default: 0,
    nullable: false 
  })
  rwh_retry_count: number;

  @Column({ 
    name: 'rwh_next_retry_at', 
    type: 'timestamp', 
    nullable: true 
  })
  rwh_next_retry_at: Date | null;

  @CreateDateColumn({ name: 'rwh_created_at' })
  rwh_created_at: Date;

  @UpdateDateColumn({ name: 'rwh_updated_at' })
  rwh_updated_at: Date;

  // Foreign key references:
  // Ref: ref_withdraw_histories.rwh_wallet_id > list_wallets.wallet_id
  @ManyToOne(() => ListWallet, wallet => wallet.refWithdrawHistories)
  @JoinColumn({ name: 'rwh_wallet_id' })
  wallet: ListWallet;

  // One-to-many relationships
  @OneToMany(() => WalletRefReward, reward => reward.withdrawHistory)
  walletRefRewards: WalletRefReward[];

  @OneToMany(() => BgAffiliateCommissionReward, reward => reward.withdrawHistory)
  bgAffiliateCommissionRewards: BgAffiliateCommissionReward[];
} 