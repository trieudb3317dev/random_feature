import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { BgRefService } from '../bg-ref.service';

export interface RequestWithBgUser extends Request {
  user: {
    uid: number;
    wallet_id: number;
    sol_public_key: string;
    eth_public_key: string;
    role?: string;
  };
}

@Injectable()
export class JwtBgAuthGuard extends AuthGuard('jwt-bg') {
  constructor(
    private bgRefService: BgRefService,
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

    const request = context.switchToHttp().getRequest<RequestWithBgUser>();
    const user = request.user;

    try {
      // Kiểm tra wallet có phải là wallet main không
      const isMainWallet = await this.checkMainWallet(user.wallet_id);
      if (!isMainWallet) {
        throw new UnauthorizedException('Access denied: wallet is not main wallet');
      }

      // Kiểm tra wallet có thuộc luồng BG affiliate không
      const isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(user.wallet_id);
      if (!isBgAffiliate) {
        throw new UnauthorizedException('Access denied: wallet is not in BG affiliate system');
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication failed');
    }
    return user;
  }

  private async checkMainWallet(walletId: number): Promise<boolean> {
    // Kiểm tra wallet có wa_type = 'main' trong bảng wallet_auth
    const query = `
      SELECT COUNT(*) as count 
      FROM wallet_auth 
      WHERE wa_wallet_id = $1 AND wa_type = 'main'
    `;
    
    try {
      const result = await this.bgRefService['dataSource'].query(query, [walletId]);
      return result[0]?.count > 0;
    } catch (error) {
      console.error('Error checking main wallet:', error);
      return false;
    }
  }
} 