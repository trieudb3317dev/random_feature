import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { SolanaListToken } from '../../solana/entities/solana-list-token.entity';
import { BlockChat } from './block-chat.entity';

export enum ChatOption {
    ALL = 'all',
    TOKEN = 'token',
    GROUP = 'group'
}

export enum ChatType {
    PRIVATE = 'private',
    PUBLIC = 'public'
}

@Entity('chats')
export class Chat {
    @PrimaryGeneratedColumn()
    chat_id: number;

    @Column({ nullable: true })
    chat_token_address: string;

    @Column({ nullable: true })
    chat_group_id: number;

    @Column({ nullable: true })
    chat_auth: number;

    @Column({
        type: 'enum',
        enum: ChatOption,
        default: ChatOption.ALL
    })
    chat_option: ChatOption;

    @Column({
        type: 'enum',
        enum: ChatType,
        default: ChatType.PUBLIC
    })
    chat_type: ChatType;

    @ManyToOne(() => ListWallet, wallet => wallet.chats)
    wallet: ListWallet;

    @ManyToOne(() => SolanaListToken, token => token.chats)
    token: SolanaListToken;

    @OneToMany(() => BlockChat, blockChat => blockChat.chat)
    blockChats: BlockChat[];
} 