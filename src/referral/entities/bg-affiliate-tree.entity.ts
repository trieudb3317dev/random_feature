import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { BgAffiliateNode } from './bg-affiliate-node.entity';
import { BgAffiliateCommissionLog } from './bg-affiliate-commission-log.entity';
import { BgAffiliateCommissionReward } from './bg-affiliate-commission-reward.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';

@Entity('bg_affiliate_trees')
export class BgAffiliateTree {
  @PrimaryGeneratedColumn({ name: 'bat_id' })
  bat_id: number;

  @Column({ name: 'bat_root_wallet_id', type: 'integer', nullable: false })
  bat_root_wallet_id: number;

  @Column({ 
    name: 'bat_total_commission_percent', 
    type: 'decimal', 
    precision: 5, 
    scale: 2, 
    default: 70.00 
  })
  bat_total_commission_percent: number;

  @Column({ name: 'bat_alias', type: 'varchar', length: 255, nullable: true })
  bat_alias: string;

  @CreateDateColumn({ name: 'bat_created_at' })
  bat_created_at: Date;

  // Foreign key reference: bg_affiliate_trees.bat_root_wallet_id > list_wallets.wallet_id
  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateTrees)
  @JoinColumn({ name: 'bat_root_wallet_id' })
  rootWallet: ListWallet;

  // Relationships
  @OneToMany(() => BgAffiliateNode, node => node.banTree)
  nodes: BgAffiliateNode[];

  @OneToMany(() => BgAffiliateCommissionLog, log => log.baclTree)
  commissionLogs: BgAffiliateCommissionLog[];

  @OneToMany(() => BgAffiliateCommissionReward, reward => reward.bacrTree)
  commissionRewards: BgAffiliateCommissionReward[];
} 