import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SolanaListToken } from './solana-list-token.entity';
import { SolanaListCategoriesToken } from './solana-list-categories-token.entity';

export enum JoinCategoryStatus {
    ON = 'on',
    OFF = 'off'
}

@Entity('solana_token_join_category')
export class SolanaTokenJoinCategory {
    @PrimaryGeneratedColumn()
    stjc_id: number;

    @Column({ name: 'stjc_token_id' })
    stjc_token_id: number;

    @Column({ name: 'stjc_category_id' })
    stjc_category_id: number;

    @Column({
        name: 'stjc_status',
        type: 'enum',
        enum: JoinCategoryStatus,
        default: JoinCategoryStatus.ON
    })
    stjc_status: JoinCategoryStatus;

    @CreateDateColumn({ name: 'stjc_created_at' })
    stjc_created_at: Date;

    @UpdateDateColumn({ name: 'stjc_updated_at' })
    stjc_updated_at: Date;

    @ManyToOne(() => SolanaListToken, token => token.token_join_categories)
    @JoinColumn({ name: 'stjc_token_id' })
    token: SolanaListToken;

    @ManyToOne(() => SolanaListCategoriesToken, category => category.token_join_categories)
    @JoinColumn({ name: 'stjc_category_id' })
    category: SolanaListCategoriesToken;
} 