import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Check } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';

@Entity('master_connects')
@Check(`"mc_master_wallet" <> "mc_member_wallet"`)
export class MasterConnect {
    @PrimaryGeneratedColumn()
    mc_id: number;

    @Column()
    mc_master_wallet: number;

    @Column()
    mc_member_wallet: number;

    @Column({
        type: 'enum',
        enum: ['price', 'ratio', 'default'],
        default: 'default',
    })
    mc_option_limit: 'price' | 'ratio' | 'default';

    @Column({
        type: 'decimal',
        precision: 18,
        scale: 6,
        default: 0
    })
    mc_price_limit: number;

    @Column({
        default: 0,
        comment: 'Ratio limit (5-100%)'
    })
    mc_ratio_limit: number;

    @Column({
        type: 'enum',
        enum: ['pending', 'connect', 'pause', 'disconnect', 'block', 'delete', 'delete-hidden'],
        default: 'connect',
    })
    mc_status: 'pending' | 'connect' | 'pause' | 'disconnect' | 'block' | 'delete' | 'delete-hidden';

    @ManyToOne(() => ListWallet)
    @JoinColumn({ name: 'mc_master_wallet' })
    master_wallet: ListWallet;

    @ManyToOne(() => ListWallet)
    @JoinColumn({ name: 'mc_member_wallet' })
    member_wallet: ListWallet;
} 