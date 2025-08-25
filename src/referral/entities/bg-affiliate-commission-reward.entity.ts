import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BgAffiliateTree } from './bg-affiliate-tree.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { TradingOrder } from '../../trade/entities/trading-order.entity';
import { RefWithdrawHistory } from './ref-withdraw-history.entity';

@Entity('bg_affiliate_commission_rewards')
export class BgAffiliateCommissionReward {
  @PrimaryGeneratedColumn({ name: 'bacr_id' })
  bacr_id: number;

  @Column({ name: 'bacr_tree_id', type: 'integer', nullable: false })
  bacr_tree_id: number;

  @Column({ name: 'bacr_order_id', type: 'integer', nullable: false })
  bacr_order_id: number;

  @Column({ name: 'bacr_wallet_id', type: 'integer', nullable: false })
  bacr_wallet_id: number;

  @Column({ 
    name: 'bacr_commission_amount', 
    type: 'decimal', 
    precision: 18, 
    scale: 6, 
    nullable: true 
  })
  bacr_commission_amount: number;

  @Column({ name: 'bacr_level', type: 'integer', nullable: false })
  bacr_level: number;

  @CreateDateColumn({ name: 'bacr_created_at' })
  bacr_created_at: Date;

  @Column({ 
    name: 'bacr_withdraw_status', 
    type: 'boolean', 
    default: false,
    nullable: false 
  })
  bacr_withdraw_status: boolean;

  @Column({
    name: 'bacr_withdraw_id',
    type: 'integer',
    nullable: true,
    default: null
  })
  bacr_withdraw_id: number | null;

  @ManyToOne(() => RefWithdrawHistory, withdrawHistory => withdrawHistory.rwh_id, { nullable: true })
  @JoinColumn({ name: 'bacr_withdraw_id', referencedColumnName: 'rwh_id' })
  withdrawHistory: RefWithdrawHistory;

  // Foreign key references:
  // Ref: bg_affiliate_commission_rewards.bacr_tree_id > bg_affiliate_trees.bat_id
  // Ref: bg_affiliate_commission_rewards.bacr_order_id > trading_orders.order_id
  // Ref: bg_affiliate_commission_rewards.bacr_wallet_id > list_wallets.wallet_id
  @ManyToOne(() => BgAffiliateTree, tree => tree.commissionRewards)
  @JoinColumn({ name: 'bacr_tree_id' })
  bacrTree: BgAffiliateTree;

  @ManyToOne(() => TradingOrder, order => order.bgAffiliateCommissionRewards)
  @JoinColumn({ name: 'bacr_order_id' })
  order: TradingOrder;

  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateCommissionRewards)
  @JoinColumn({ name: 'bacr_wallet_id' })
  wallet: ListWallet;
} 