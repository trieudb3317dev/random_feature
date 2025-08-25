import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, OneToMany, BeforeInsert } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { WalletRefReward } from './wallet-ref-reward.entity'; 

@Entity('wallet_referents')
export class WalletReferent {
    @PrimaryColumn()
    wr_id: number;

    @Column()
    wr_wallet_invitee: number;

    @Column()
    wr_wallet_referent: number;

    @Column({ type: 'smallint' })
    wr_wallet_level: number;

    @ManyToOne(() => ListWallet, wallet => wallet.wallet_id)
    @JoinColumn({ name: 'wr_wallet_invitee' })
    invitee: ListWallet;

    @ManyToOne(() => ListWallet, wallet => wallet.wallet_id)
    @JoinColumn({ name: 'wr_wallet_referent' })
    referent: ListWallet;

    @OneToMany(() => WalletRefReward, walletRefReward => walletRefReward.referent)
    rewards: WalletRefReward[];

    @BeforeInsert()
    async setInitialId() {
        if (!this.wr_id) {
            const timestamp = new Date().getTime();
            const random = Math.floor(Math.random() * 1000);
            this.wr_id = timestamp % 10000 + random;
        }
    }
} 