import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('solana_list_pools')
export class SolanaListPool {
    @PrimaryGeneratedColumn()
    slp_id: number;

    @Column({ unique: true })
    slp_pool_id: string;

    @Column()
    slp_mint_program_id_a: string;

    @Column()
    slp_mint_program_id_b: string;

    @Column()
    slp_mint_a: string;

    @Column()
    slp_mint_b: string;

    @Column()
    slp_vault_a: string;

    @Column()
    slp_vault_b: string;

    @Column()
    slp_mint_decimals_a: number;

    @Column()
    slp_mint_decimals_b: number;

    @Column()
    slp_config_id: string;

    @Column()
    slp_config_index: number;

    @Column()
    slp_config_protocol_fee_rate: number;

    @Column()
    slp_config_trade_fee_rate: number;

    @Column()
    slp_config_tick_spacing: number;

    @Column()
    slp_config_fund_fee_rate: number;

    @Column()
    slp_source: string;

    @Column({ type: 'decimal', precision: 24, scale: 8, nullable: true })
    slp_reserve_a: number;

    @Column({ type: 'decimal', precision: 24, scale: 8, nullable: true })
    slp_reserve_b: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
} 