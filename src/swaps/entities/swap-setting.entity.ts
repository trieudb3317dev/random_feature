import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('swap_settings')
export class SwapSettings {
  @PrimaryGeneratedColumn({ name: 'swap_setting_id' })
  swap_setting_id: number;

  @Column({ 
    name: 'swap_fee_percent', 
    type: 'decimal', 
    precision: 5, 
    scale: 2,
    nullable: false,
  })
  swap_fee_percent: number;

  @Column({ 
    name: 'investor_share_percent', 
    type: 'decimal', 
    precision: 5, 
    scale: 2,
    nullable: false,
  })
  investor_share_percent: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
} 