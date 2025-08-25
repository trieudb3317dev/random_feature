import { Entity, Column, OneToMany, BeforeInsert, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { WalletAuth } from './wallet-auth.entity';

@Entity('user_wallets')
export class UserWallet {
    @Column({ primary: true })
    uw_id: number;

    @Column({ nullable: true })
    uw_telegram_id: string;

    @Column({ nullable: true })
    uw_phone: string;

    @Column({ nullable: true })
    uw_email: string;

    @Column({ nullable: true })
    uw_password: string;

    @Column({ type: 'varchar', nullable: true })
    google_auth: string | null;

    @Column({ default: false })
    active_gg_auth: boolean;

    @Column({ default: false })
    active_email: boolean;

    @Column({
        type: 'boolean',
        default: false,
        comment: 'Is Bittworld user wallet?'
    })
    isBittworld: boolean;

    @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    @OneToMany(() => WalletAuth, walletAuth => walletAuth.wa_user)
    wallet_auths: WalletAuth[];

    @BeforeInsert()
    async setInitialId() {
        if (!this.uw_id) {
            // Sử dụng một giá trị dựa trên timestamp + random để giảm khả năng trùng lặp
            const timestamp = new Date().getTime();
            const random = Math.floor(Math.random() * 1000);
            this.uw_id = 7251125 + timestamp % 10000 + random;
        }
    }
}