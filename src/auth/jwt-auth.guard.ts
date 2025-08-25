import { Injectable, ExecutionContext, UnauthorizedException, Logger, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletAuth } from '../telegram-wallets/entities/wallet-auth.entity';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    private readonly logger = new Logger(JwtAuthGuard.name);

    constructor(
        @InjectRepository(WalletAuth)
        private readonly walletAuthRepository: Repository<WalletAuth>,
        @InjectRepository(ListWallet)
        private readonly listWalletRepository: Repository<ListWallet>,
    ) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Gọi phương thức canActivate của AuthGuard để xác thực JWT
        const canActivate = await super.canActivate(context);
        
        // Nếu JWT không hợp lệ, trả về false
        if (!canActivate) {
            return false;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        try {
            // Kiểm tra mối quan hệ trong wallet_auth
            const walletAuth = await this.walletAuthRepository
                .createQueryBuilder('wa')
                .where('wa.wa_user_id = :userId', { userId: user.uid })
                .andWhere('wa.wa_wallet_id = :walletId', { walletId: user.wallet_id })
                .getOne();

            if (!walletAuth) {
                console.log('JwtAuthGuard - Wallet auth not found');
                throw new UnauthorizedException('User and wallet are no longer connected');
            }

            // Kiểm tra wallet_nick_name
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: user.wallet_id }
            });

            if (!wallet) {
                throw new UnauthorizedException('Wallet not found');
            }

            if (!wallet.wallet_nick_name) {
                throw new ForbiddenException('Wallet nickname is required');
            }

            this.logger.debug(`Validating auth for user ${user.uid} and wallet ${user.wallet_id}`);

            return true;
        } catch (error) {
            console.error('Error validating wallet auth:', error);
            if (error instanceof ForbiddenException) {
                throw error;
            }
            throw new UnauthorizedException('Error validating wallet auth');
        }
    }

    handleRequest(err, user, info) {
        // Xử lý lỗi từ passport-jwt
        if (err || !user) {
            throw err || new UnauthorizedException('Authentication failed');
        }
        return user;
    }
}
