import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AirdropListToken } from './airdrop-list-token.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';

export enum AirdropRewardStatus {
  CAN_WITHDRAW = 'can_withdraw',
  WITHDRAWN = 'withdrawn'
}

export enum AirdropRewardType {
  TYPE_1 = '1',
  TYPE_2 = '2'
}

export enum AirdropRewardSubType {
  LEADER_BONUS = 'leader_bonus',      // 10% thưởng Leader
  PARTICIPATION_SHARE = 'participation_share',  // 90% thưởng tham gia
  TOP_POOL_REWARD = 'top_pool_reward'  // Thưởng TOP Pool
}

@Entity('airdrop_rewards')
export class AirdropReward {
  @PrimaryGeneratedColumn({ name: 'ar_id', type: 'integer' })
  ar_id: number;

  @Column({ name: 'ar_token_airdrop_id', type: 'integer', nullable: false })
  ar_token_airdrop_id: number;

  @Column({ name: 'ar_wallet_id', type: 'integer', nullable: false })
  ar_wallet_id: number;

  @Column({ name: 'ar_wallet_address', type: 'varchar', length: 255, nullable: false })
  ar_wallet_address: string;

  @Column({ name: 'ar_amount', type: 'decimal', precision: 18, scale: 6, default: 0 })
  ar_amount: number;

  @Column({ name: 'ar_hash', type: 'text', nullable: true })
  ar_hash: string | null;

  @Column({
    name: 'ar_status',
    type: 'enum',
    enum: AirdropRewardStatus,
    default: AirdropRewardStatus.CAN_WITHDRAW
  })
  ar_status: AirdropRewardStatus;

  @Column({
    name: 'ar_type',
    type: 'enum',
    enum: AirdropRewardType,
    default: AirdropRewardType.TYPE_1
  })
  ar_type: AirdropRewardType;

  @Column({
    name: 'ar_sub_type',
    type: 'enum',
    enum: AirdropRewardSubType,
    nullable: true
  })
  ar_sub_type: AirdropRewardSubType | null;

  @Column({ name: 'ar_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  ar_date: Date;

  @ManyToOne(() => AirdropListToken)
  @JoinColumn({ name: 'ar_token_airdrop_id', referencedColumnName: 'alt_id' })
  tokenAirdrop: AirdropListToken;

  @ManyToOne(() => ListWallet)
  @JoinColumn({ name: 'ar_wallet_id', referencedColumnName: 'wallet_id' })
  wallet: ListWallet;
} 