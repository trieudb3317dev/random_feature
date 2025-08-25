import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class JwtBgStrategy extends PassportStrategy(Strategy, 'jwt-bg') {
  constructor() {
    super({
      jwtFromRequest: (req: Request) => {
        // Ưu tiên lấy từ Authorization header
        const [type, token] = req.headers.authorization?.split(' ') ?? [];
        if (type === 'Bearer' && token) {
          return token;
        }
        
        // Fallback: lấy từ cookie
        return req.cookies?.bg_access_token;
      },
      ignoreExpiration: false,
      secretOrKey: `${process.env.JWT_SECRET}-affiliate`,
    });
  }

  async validate(payload: any) {
    // Kiểm tra wallet_id có tồn tại trong payload không
    if (!payload.wallet_id) {
      throw new UnauthorizedException('Invalid token: missing wallet_id');
    }

    return {
      uid: payload.uid,
      wallet_id: payload.wallet_id,
      sol_public_key: payload.sol_public_key,
      eth_public_key: payload.eth_public_key,
      role: payload.role
    };
  }
} 