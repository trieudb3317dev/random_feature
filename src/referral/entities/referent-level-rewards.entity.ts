import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, BeforeInsert } from 'typeorm';

@Entity('referent_level_rewards')
export class ReferentLevelReward {
    @PrimaryColumn()
    rlr_id: number;

    @Column({ type: 'smallint' })
    rlr_level: number;  // Cấp độ (1-7)

    @Column({ type: 'decimal', precision: 5, scale: 2 })
    rlr_percentage: number;  // Phần trăm thưởng cho cấp này

    @Column({ type: 'boolean', default: true })
    rlr_is_active: boolean;  // Có thể bật/tắt từng cấp
}