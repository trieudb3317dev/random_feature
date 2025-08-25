import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('airdrop_top_round')
export class AirdropTopRound {
  @PrimaryGeneratedColumn({ name: 'atr_id', type: 'integer' })
  atr_id: number;

  @Column({ name: 'atr_num_top', type: 'integer', nullable: false })
  atr_num_top: number;

  @Column({ name: 'atr_percent', type: 'integer', nullable: false })
  atr_percent: number;
}
