import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SolanaTokenJoinCategory } from './solana-token-join-category.entity';

export enum CategoryPrioritize {
    YES = 'yes',
    NO = 'no'
}

export enum CategoryStatus {
    ACTIVE = 'active',
    HIDDEN = 'hidden'
}

@Entity('solana_list_categories_token')
export class SolanaListCategoriesToken {
    @PrimaryGeneratedColumn()
    slct_id: number;

    @Column({ length: 100 })
    slct_name: string;

    @Column({ length: 100, nullable: true })
    slct_slug: string;

    @Column({
        type: 'enum',
        enum: CategoryPrioritize,
        default: CategoryPrioritize.NO
    })
    slct_prioritize: CategoryPrioritize;

    @Column({
        type: 'enum',
        enum: CategoryStatus,
        default: CategoryStatus.ACTIVE
    })
    sltc_status: CategoryStatus;

    @CreateDateColumn({ name: 'slct_created_at' })
    slct_created_at: Date;

    @UpdateDateColumn({ name: 'slct_updated_at' })
    slct_updated_at: Date;

    @OneToMany(() => SolanaTokenJoinCategory, join => join.category)
    token_join_categories: SolanaTokenJoinCategory[];
} 