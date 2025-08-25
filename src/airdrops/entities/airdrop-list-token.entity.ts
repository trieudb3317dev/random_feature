import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export enum AirdropListTokenStatus {
  ACTIVE = 'active',
  END = 'end',
  PAUSE = 'pause',
  CANCEL = 'cancel'
}

@Entity('airdrop_list_tokens')
export class AirdropListToken {
  @PrimaryGeneratedColumn({ name: 'alt_id', type: 'integer' })
  alt_id: number;

  @Column({ name: 'alt_token_name', type: 'varchar', length: 255, nullable: false })
  alt_token_name: string;

  @Column({ name: 'alt_token_mint', type: 'varchar', length: 255, nullable: false })
  alt_token_mint: string;

  @Column({ name: 'alt_amount_airdrop_1', type: 'decimal', precision: 18, scale: 6, default: 0 })
  alt_amount_airdrop_1: number;

  @Column({
    name: 'alt_status_1',
    type: 'enum',
    enum: AirdropListTokenStatus,
    default: AirdropListTokenStatus.ACTIVE
  })
  alt_status_1: AirdropListTokenStatus;

  @Column({ name: 'alt_amount_airdrop_2', type: 'decimal', precision: 18, scale: 6, nullable: true })
  alt_amount_airdrop_2: number | null;

  @Column({
    name: 'alt_status_2',
    type: 'enum',
    enum: AirdropListTokenStatus,
    nullable: true
  })
  alt_status_2: AirdropListTokenStatus | null;
} 