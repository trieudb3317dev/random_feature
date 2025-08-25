import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BgAffiliateTree } from './bg-affiliate-tree.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';

@Entity('bg_affiliate_commission_logs')
export class BgAffiliateCommissionLog {
  @PrimaryGeneratedColumn({ name: 'bacl_id' })
  bacl_id: number;

  @Column({ name: 'bacl_tree_id', type: 'integer', nullable: false })
  bacl_tree_id: number;

  @Column({ name: 'bacl_from_wallet_id', type: 'integer', nullable: false })
  bacl_from_wallet_id: number;

  @Column({ name: 'bacl_to_wallet_id', type: 'integer', nullable: false })
  bacl_to_wallet_id: number;

  @Column({ 
    name: 'bacl_old_percent', 
    type: 'decimal', 
    precision: 5, 
    scale: 2, 
    nullable: true 
  })
  bacl_old_percent: number;

  @Column({ 
    name: 'bacl_new_percent', 
    type: 'decimal', 
    precision: 5, 
    scale: 2, 
    nullable: true 
  })
  bacl_new_percent: number;

  @CreateDateColumn({ name: 'bacl_changed_at' })
  bacl_changed_at: Date;

  // Foreign key references:
  // Ref: bg_affiliate_commission_logs.bacl_tree_id > bg_affiliate_trees.bat_id
  // Ref: bg_affiliate_commission_logs.bacl_from_wallet_id > list_wallets.wallet_id
  // Ref: bg_affiliate_commission_logs.bacl_to_wallet_id > list_wallets.wallet_id
  @ManyToOne(() => BgAffiliateTree, tree => tree.commissionLogs)
  @JoinColumn({ name: 'bacl_tree_id' })
  baclTree: BgAffiliateTree;

  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateCommissionLogsFrom)
  @JoinColumn({ name: 'bacl_from_wallet_id' })
  fromWallet: ListWallet;

  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateCommissionLogsTo)
  @JoinColumn({ name: 'bacl_to_wallet_id' })
  toWallet: ListWallet;
} 