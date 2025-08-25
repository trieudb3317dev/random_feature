import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SolanaListToken } from './solana-list-token.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';

export enum WishlistStatus {
    ON = 'on',
    OFF = 'off'
}

@Entity('solana_wishlist_token')
export class SolanaWishlistToken {
    @PrimaryGeneratedColumn()
    swt_id: number;

    @Column({ name: 'swt_token_id' })
    swt_token_id: number;

    @Column({ name: 'swt_wallet_id' })
    swt_wallet_id: number;

    @Column({
        name: 'swt_status',
        type: 'enum',
        enum: WishlistStatus,
        default: WishlistStatus.ON
    })
    swt_status: WishlistStatus;

    @CreateDateColumn({ name: 'swt_created_at' })
    swt_created_at: Date;

    @UpdateDateColumn({ name: 'swt_updated_at' })
    swt_updated_at: Date;

    @ManyToOne(() => SolanaListToken)
    @JoinColumn({ name: 'swt_token_id' })
    token: SolanaListToken;

    @ManyToOne(() => ListWallet)
    @JoinColumn({ name: 'swt_wallet_id' })
    wallet: ListWallet;
} 