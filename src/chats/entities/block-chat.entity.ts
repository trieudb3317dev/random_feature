import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Chat } from './chat.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';

export enum BlockStatus {
    ON = 'on',
    OFF = 'off'
}

@Entity('block_chats')
export class BlockChat {
    @PrimaryGeneratedColumn()
    bc_id: number;

    @Column()
    bc_chat_id: number;

    @Column()
    bc_wallet_id: number;

    @Column({
        type: 'enum',
        enum: BlockStatus,
        default: BlockStatus.OFF
    })
    bc_status: BlockStatus;

    @ManyToOne(() => Chat, chat => chat.blockChats)
    chat: Chat;

    @ManyToOne(() => ListWallet, wallet => wallet.blockChats)
    wallet: ListWallet;
} 