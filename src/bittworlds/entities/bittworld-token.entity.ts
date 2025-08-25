import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('bittworld_token')
export class BittworldToken {
    @PrimaryGeneratedColumn()
    bt_id: number;

    @Column({ type: 'varchar', length: 100 })
    bt_name: string;

    @Column({ type: 'varchar', length: 20 })
    bt_symbol: string;

    @Column({ type: 'varchar', length: 255 })
    bt_address: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    bt_logo_url: string;

    @Column({ type: 'boolean', default: true })
    bt_status: boolean;

    @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}
