import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { AirdropRoundDetail } from './airdrop-round-detail.entity';

export enum AirdropPoolRoundStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  END = 'end'
}

@Entity('airdrop_pool_rounds')
export class AirdropPoolRound {
  @PrimaryGeneratedColumn({ name: 'apr_id', type: 'integer' })
  apr_id: number;

  @Column({ name: 'apr_num_round', type: 'integer', nullable: false })
  apr_num_round: number;

  @Column({ name: 'apr_start_date', type: 'timestamp', nullable: false })
  apr_start_date: Date;

  @Column({ name: 'apr_end_date', type: 'timestamp', nullable: true })
  apr_end_date: Date | null;

  @Column({
    name: 'apr_status',
    type: 'enum',
    enum: AirdropPoolRoundStatus,
    default: AirdropPoolRoundStatus.PENDING
  })
  apr_status: AirdropPoolRoundStatus;

  @OneToMany(() => AirdropRoundDetail, (detail: AirdropRoundDetail) => detail.round)
  roundDetails: AirdropRoundDetail[];
} 