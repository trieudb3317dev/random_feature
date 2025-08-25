import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, BeforeInsert } from 'typeorm';
import { UserWallet } from './user-wallet.entity';
import { ListWallet } from './list-wallet.entity';

@Entity('wallet_auth')
export class WalletAuth {
    @PrimaryGeneratedColumn()
    wa_id: number;

    @Column()
    wa_user_id: number;

    @Column()
    wa_wallet_id: number;

    @Column({
        type: 'enum',
        enum: ['main', 'other', 'import']
    })
    wa_type: string;

    @Column({ nullable: true, type: 'varchar' })
    wa_name: string | null;

    @ManyToOne(() => UserWallet)
    @JoinColumn({ name: 'wa_user_id', referencedColumnName: 'uw_id' })
    wa_user: UserWallet;

    @ManyToOne(() => ListWallet)
    @JoinColumn({ name: 'wa_wallet_id' })
    wa_wallet: ListWallet;
} 