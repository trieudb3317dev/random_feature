import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { SolanaListCategoriesToken } from './solana-list-categories-token.entity';
import { SolanaWishlistToken } from './solana-wishlist-token.entity';
import { SolanaTokenJoinCategory } from './solana-token-join-category.entity';
import { Chat } from '../../chats/entities/chat.entity';

export enum TokenProgram {
    KCM = 'kcm',
    PUMPFUN = 'pumpfun',
    RAYDIUM = 'raydium',
    JUPITER = 'jupiter',
    GMGN = 'gmgn',
    MEMEPUMP = 'memepump',
    OTHER = 'other'
}

@Entity('solana_list_token')
export class SolanaListToken {
    @PrimaryGeneratedColumn()
    slt_id: number;

    @Column({ length: 100 })
    slt_name: string;

    @Column({ length: 50 })
    slt_symbol: string;

    @Column({ length: 44, unique: true })
    slt_address: string;

    @Column({ default: 9 })
    slt_decimals: number;

    @Column({ type: 'text', nullable: true })
    slt_logo_url: string | null;

    @Column({ length: 100, nullable: true })
    slt_coingecko_id: string;

    @Column({ length: 100, nullable: true })
    slt_tradingview_symbol: string;

    @Column({ default: false })
    slt_is_verified: boolean;

    @Column({ type: 'numeric', nullable: true })
    slt_market_cap: number;

    @Column({ type: 'numeric', nullable: true })
    slt_price: number;

    @Column({ type: 'text', nullable: true })
    slt_metadata_uri: string;

    @Column({ type: 'text', nullable: true })
    slt_keypair: string;

    @Column({ type: 'text', nullable: true })
    slt_description: string;

    @Column({ length: 100, nullable: true })
    slt_twitter: string;

    @Column({ length: 100, nullable: true })
    slt_telegram: string;

    @Column({ length: 255, nullable: true })
    slt_website: string;

    @Column({ type: 'text', nullable: true })
    slt_transaction_hash: string;

    @Column({ nullable: true })
    slt_wallet_id: number | null;

    @Column({
        type: 'enum',
        enum: TokenProgram,
        default: TokenProgram.OTHER
    })
    slt_program: TokenProgram;

    @Column({ type: 'numeric', default: 0 })
    slt_initial_liquidity: number;

    @Column({ default: false })
    slt_create_check: boolean;

    @Column({ nullable: true })
    slt_category: number;

    @ManyToOne(() => ListWallet)
    @JoinColumn({ name: 'slt_wallet_id' })
    wallet: ListWallet;

    @OneToMany(() => SolanaWishlistToken, wishlist => wishlist.token)
    wishlists: SolanaWishlistToken[];

    @OneToMany(() => SolanaTokenJoinCategory, join => join.token)
    categoryJoins: SolanaTokenJoinCategory[];

    @CreateDateColumn({ type: 'timestamp' })
    slt_created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    slt_updated_at: Date;

    @OneToMany(() => SolanaTokenJoinCategory, join => join.token)
    token_join_categories: SolanaTokenJoinCategory[];

    @OneToMany(() => Chat, chat => chat.token)
    chats: Chat[];
}