import { EntityRepository, Repository } from 'typeorm';
import { SolanaWishlistToken, WishlistStatus } from '../entities/solana-wishlist-token.entity';

@EntityRepository(SolanaWishlistToken)
export class SolanaWishlistTokenRepository extends Repository<SolanaWishlistToken> {
    async findByWalletId(walletId: number): Promise<SolanaWishlistToken[]> {
        return this.find({
            where: { swt_wallet_id: walletId, swt_status: WishlistStatus.ON },
            relations: ['token']
        });
    }

    async findOneByWalletAndToken(walletId: number, tokenId: number): Promise<SolanaWishlistToken | undefined> {
        const result = await this.findOne({
            where: {
                swt_wallet_id: walletId,
                swt_token_id: tokenId
            }
        });
        return result || undefined;
    }
} 