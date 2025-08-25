import { Entity, Column, OneToMany, BeforeInsert, getConnection, DataSource } from 'typeorm';
import { WalletAuth } from './wallet-auth.entity';
import { BlockChat } from '../../chats/entities/block-chat.entity';
import { Chat } from '../../chats/entities/chat.entity';
import { WalletReferent } from '../../referral/entities/wallet-referent.entity';
import { BgAffiliateTree } from '../../referral/entities/bg-affiliate-tree.entity';
import { BgAffiliateNode } from '../../referral/entities/bg-affiliate-node.entity';
import { BgAffiliateCommissionLog } from '../../referral/entities/bg-affiliate-commission-log.entity';
import { BgAffiliateCommissionReward } from '../../referral/entities/bg-affiliate-commission-reward.entity';
import { RefWithdrawHistory } from '../../referral/entities/ref-withdraw-history.entity';
import { TradingOrder } from '../../trade/entities/trading-order.entity';
import { AirdropListPool } from '../../airdrops/entities/airdrop-list-pool.entity';
import { AirdropPoolJoin } from '../../airdrops/entities/airdrop-pool-join.entity';
import { SwapOrder } from '../../swaps/entities/swap-order.entity';

@Entity('list_wallets')
export class ListWallet {
    @Column({ primary: true })
    wallet_id: number;

    @Column({ type: 'text' })
    wallet_private_key: string;

    @Column()
    wallet_solana_address: string;

    @Column()
    wallet_eth_address: string;

    @Column({
        type: 'enum',
        enum: ['member', 'master']
    })
    wallet_auth: string;

    @Column({
        type: 'enum',
        enum: ['normal', 'vip'],
        nullable: true
    })
    wallet_stream: string;

    @Column()
    wallet_status: boolean;

    @Column({
        type: 'varchar',
        length: 150,
        unique: true,
        nullable: true
    })
    wallet_nick_name: string;

    @Column({
        type: 'varchar',
        length: 50,
        nullable: true
    })
    wallet_country: string;

    @Column({
        type: 'varchar',
        length: 50,
        nullable: true
    })
    wallet_code_ref: string;

    @Column({
        type: 'varchar',
        length: 100,
        unique: true,
        nullable: true,
        comment: 'Bittworld UID (unique)'
    })
    bittworld_uid: string;

    @Column({
        type: 'varchar',
        length: 100,
        nullable: true,
        comment: 'Referrer Bittworld UID'
    })
    referrer_bittworld_uid: string;

    @Column({
        type: 'boolean',
        default: false,
        comment: 'Is Bittworld wallet?'
    })
    isBittworld: boolean;

    @OneToMany(() => WalletAuth, walletAuth => walletAuth.wa_wallet)
    wallet_auths: WalletAuth[];

    @OneToMany(() => BlockChat, blockChat => blockChat.wallet)
    blockChats: BlockChat[];

    @OneToMany(() => Chat, chat => chat.wallet)
    chats: Chat[];

    @OneToMany(() => WalletReferent, walletReferent => walletReferent.invitee)
    invitees: WalletReferent[];

    @OneToMany(() => WalletReferent, walletReferent => walletReferent.referent)
    referrals: WalletReferent[];

    // Trading relationships
    @OneToMany(() => TradingOrder, order => order.wallet)
    tradingOrders: TradingOrder[];

    // BG Affiliate relationships
    @OneToMany(() => BgAffiliateTree, tree => tree.rootWallet)
    bgAffiliateTrees: BgAffiliateTree[];

    @OneToMany(() => BgAffiliateNode, node => node.wallet)
    bgAffiliateNodes: BgAffiliateNode[];

    @OneToMany(() => BgAffiliateNode, node => node.parentWallet)
    bgAffiliateParentNodes: BgAffiliateNode[];

    @OneToMany(() => BgAffiliateCommissionLog, log => log.fromWallet)
    bgAffiliateCommissionLogsFrom: BgAffiliateCommissionLog[];

    @OneToMany(() => BgAffiliateCommissionLog, log => log.toWallet)
    bgAffiliateCommissionLogsTo: BgAffiliateCommissionLog[];

    @OneToMany(() => BgAffiliateCommissionReward, reward => reward.wallet)
    bgAffiliateCommissionRewards: BgAffiliateCommissionReward[];

    // Referral withdraw history relationship
    @OneToMany(() => RefWithdrawHistory, withdrawHistory => withdrawHistory.wallet)
    refWithdrawHistories: RefWithdrawHistory[];

    // Airdrop relationships
    @OneToMany(() => AirdropListPool, pool => pool.originator)
    airdropPools: AirdropListPool[];

    @OneToMany(() => AirdropPoolJoin, join => join.member)
    airdropPoolJoins: AirdropPoolJoin[];

    // Swap relationships
    @OneToMany(() => SwapOrder, swapOrder => swapOrder.wallet)
    swapOrders: SwapOrder[];

    @BeforeInsert()
    async setInitialId() {
        if (!this.wallet_id) {
            // Sử dụng một giá trị dựa trên timestamp + random để giảm khả năng trùng lặp
            const timestamp = new Date().getTime();
            const random = Math.floor(Math.random() * 1000);
            this.wallet_id = 3251125 + timestamp % 10000 + random;
        }
    }
}