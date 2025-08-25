import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AirdropListPool } from './airdrop-list-pool.entity';
import { AirdropPoolRound } from './airdrop-pool-round.entity';

@Entity('airdrop_round_details')
export class AirdropRoundDetail {
  @PrimaryGeneratedColumn({ name: 'ard_id', type: 'integer' })
  ard_id: number;

  @Column({ name: 'ard_pool_id', type: 'integer', nullable: false })
  ard_pool_id: number;

  @Column({ name: 'ard_round_id', type: 'integer', nullable: false })
  ard_round_id: number;

  @Column({ name: 'ard_total_volume', type: 'decimal', precision: 18, scale: 6, default: 0 })
  ard_total_volume: number;

  @ManyToOne(() => AirdropListPool, pool => pool.poolJoins)
  @JoinColumn({ name: 'ard_pool_id', referencedColumnName: 'alp_id' })
  pool: AirdropListPool;

  @ManyToOne(() => AirdropPoolRound, round => round.roundDetails)
  @JoinColumn({ name: 'ard_round_id', referencedColumnName: 'apr_id' })
  round: AirdropPoolRound;
} 