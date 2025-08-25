import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AirdropListPool } from './airdrop-list-pool.entity';
import { AirdropPoolRound } from './airdrop-pool-round.entity';
import { AirdropListToken } from './airdrop-list-token.entity';

@Entity('airdrop_top_pools')
export class AirdropTopPools {
  @PrimaryGeneratedColumn({ name: 'atp_id', type: 'integer' })
  atp_id: number;

  @Column({ name: 'atp_pool_id', type: 'integer', nullable: false })
  atp_pool_id: number;

  @Column({ name: 'atp_pool_round_id', type: 'integer', nullable: false })
  atp_pool_round_id: number;

  @Column({ name: 'atp_token_id', type: 'integer', nullable: false })
  atp_token_id: number;

  @Column({ name: 'atp_num_top', type: 'integer', nullable: false })
  atp_num_top: number;

  @Column({ name: 'atp_total_volume', type: 'decimal', precision: 18, scale: 6, default: 0 })
  atp_total_volume: number;

  @Column({ name: 'atp_total_reward', type: 'decimal', precision: 18, scale: 6, default: 0 })
  atp_total_reward: number;

  @Column({ name: 'apt_percent_reward', type: 'decimal', precision: 18, scale: 6, default: 0 })
  apt_percent_reward: number;

  // Foreign key reference: airdrop_top_pools.atp_pool_id > airdrop_list_pool.alp_id
  @ManyToOne(() => AirdropListPool, pool => pool.alp_id)
  @JoinColumn({ name: 'atp_pool_id', referencedColumnName: 'alp_id' })
  pool: AirdropListPool;

  // Foreign key reference: airdrop_top_pools.atp_pool_round_id > airdrop_pool_rounds.apr_id
  @ManyToOne(() => AirdropPoolRound, round => round.apr_id)
  @JoinColumn({ name: 'atp_pool_round_id', referencedColumnName: 'apr_id' })
  poolRound: AirdropPoolRound;

  // Foreign key reference: airdrop_top_pools.atp_token_id > airdrop_list_tokens.alt_id
  @ManyToOne(() => AirdropListToken, token => token.alt_id)
  @JoinColumn({ name: 'atp_token_id', referencedColumnName: 'alt_id' })
  token: AirdropListToken;
}
