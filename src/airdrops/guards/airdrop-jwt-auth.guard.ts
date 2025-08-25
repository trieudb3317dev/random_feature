import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';

@Injectable()
export class AirdropJwtAuthGuard extends AuthGuard('jwt') {
    private readonly logger = new Logger(AirdropJwtAuthGuard.name);

    constructor(
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
            // Chỉ kiểm tra wallet có tồn tại không
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: user.wallet_id }
            });

            if (!wallet) {
                this.logger.warn(`Wallet not found: ${user.wallet_id}`);
                throw new UnauthorizedException('Wallet not found');
            }

            // Kiểm tra wallet có active không
            if (!wallet.wallet_status) {
                this.logger.warn(`Wallet is inactive: ${user.wallet_id}`);
                throw new UnauthorizedException('Wallet is inactive');
            }

            this.logger.debug(`Validating auth for wallet ${user.wallet_id}`);

            return true;
        } catch (error) {
            this.logger.error(`Error validating wallet auth: ${error.message}`);
            if (error instanceof UnauthorizedException) {
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