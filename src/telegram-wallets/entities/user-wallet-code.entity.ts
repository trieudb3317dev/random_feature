import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { UserWallet } from './user-wallet.entity';

@Entity('user_wallet_code')
export class UserWalletCode {
    @PrimaryGeneratedColumn()
    tw_code_id: number;

    @Column()
    tw_code_value: string;

    @Column({ type: 'smallint', default: 1 })
    tw_code_type: number;

    @Column({ type: 'timestamp' })
    tw_code_time: Date;

    @Column()
    tw_code_status: boolean;

    @Column()
    tw_wallet_id: number;

    @ManyToOne(() => UserWallet)
    @JoinColumn({ name: 'tw_wallet_id', referencedColumnName: 'uw_id' })
    wallet: UserWallet;
}
