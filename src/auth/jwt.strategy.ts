import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        @InjectRepository(ListWallet)
        private readonly listWalletRepository: Repository<ListWallet>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET,
        });
    }

    async validate(payload: any) {
        const wallet = await this.listWalletRepository.findOne({
            where: { wallet_id: payload.wallet_id }
        });

        if (!wallet) {
            throw new UnauthorizedException('Wallet not found');
        }

        return {
            uid: payload.uid,
            wallet_id: payload.wallet_id,
            sol_public_key: payload.sol_public_key,
            eth_public_key: payload.eth_public_key
        };
    }
}
