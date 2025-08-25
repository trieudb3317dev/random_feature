import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BgAffiliateTree } from './bg-affiliate-tree.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';

@Entity('bg_affiliate_nodes')
export class BgAffiliateNode {
  @PrimaryGeneratedColumn({ name: 'ban_id' })
  ban_id: number;

  @Column({ name: 'ban_tree_id', type: 'integer', nullable: false })
  ban_tree_id: number;

  @Column({ name: 'ban_wallet_id', type: 'integer', nullable: false, unique: true })
  ban_wallet_id: number;

  @Column({ name: 'ban_parent_wallet_id', type: 'integer', nullable: true })
  ban_parent_wallet_id: number | null;

  @Column({ 
    name: 'ban_commission_percent', 
    type: 'decimal', 
    precision: 5, 
    scale: 2, 
    nullable: false 
  })
  ban_commission_percent: number;

  @CreateDateColumn({ name: 'ban_effective_from' })
  ban_effective_from: Date;

  @Column({ 
    name: 'ban_status', 
    type: 'boolean', 
    default: true,
    nullable: false 
  })
  ban_status: boolean;

  @Column({ name: 'bg_alias', type: 'varchar', length: 255, nullable: true })
  bg_alias: string;

  // Foreign key references:
  // Ref: bg_affiliate_nodes.ban_tree_id > bg_affiliate_trees.bat_id
  // Ref: bg_affiliate_nodes.ban_wallet_id > list_wallets.wallet_id
  // Ref: bg_affiliate_nodes.ban_parent_wallet_id > list_wallets.wallet_id
  @ManyToOne(() => BgAffiliateTree, tree => tree.nodes)
  @JoinColumn({ name: 'ban_tree_id' })
  banTree: BgAffiliateTree;

  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateNodes)
  @JoinColumn({ name: 'ban_wallet_id' })
  wallet: ListWallet;

  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateParentNodes)
  @JoinColumn({ name: 'ban_parent_wallet_id' })
  parentWallet: ListWallet;
} 