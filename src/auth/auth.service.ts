import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TelegramWalletsService } from '../telegram-wallets/telegram-wallets.service';
import { InjectRepository } from '@nestjs/typeorm';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { WalletAuth } from '../telegram-wallets/entities/wallet-auth.entity';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly telegramWalletsService: TelegramWalletsService,
        @InjectRepository(ListWallet)
        private listWalletRepository: Repository<ListWallet>,
        @InjectRepository(WalletAuth)
        private walletAuthRepository: Repository<WalletAuth>,
    ) { }

    async refreshToken(user: any) {
        if (!user) {
            throw new UnauthorizedException('Invalid user');
        }

        if (!user.uid || !user.wallet_id) {
            throw new UnauthorizedException('Invalid token payload structure');
        }

        const wallet = await this.listWalletRepository.findOne({
            where: { wallet_id: user.wallet_id }
        });

        if (!wallet) {
            throw new UnauthorizedException('Wallet not found');
        }

        const walletAuth = await this.walletAuthRepository.findOne({
            where: {
                wa_user_id: user.uid,
                wa_wallet_id: user.wallet_id
            }
        });

        if (!walletAuth) {
            throw new UnauthorizedException('User and wallet are no longer connected');
        }

        const payload = {
            uid: user.uid,
            wallet_id: user.wallet_id,
            sol_public_key: wallet.wallet_solana_address,
            eth_public_key: wallet.wallet_eth_address,
        };

        const jwtSecret = this.configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
            throw new Error('JWT_SECRET is missing in environment variables');
        }

        const jwtExpiration = this.configService.get<string>('JWT_EXPIRATION', '86400');
        const expiresIn = parseInt(jwtExpiration, 10);

        const signOptions: jwt.SignOptions = {
            expiresIn,
            algorithm: 'HS256',
        };

        const token = jwt.sign(payload, jwtSecret, signOptions);

        return {
            status: 200,
            token: token,
        };
    }
}
