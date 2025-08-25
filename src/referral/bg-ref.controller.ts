import { Controller, Post, Get, Put, Body, Param, Query, UseGuards, Request, Res, HttpCode, HttpStatus, UnauthorizedException, Req, BadRequestException } from '@nestjs/common';
import { BgRefService } from './bg-ref.service';
import { BgRefWithdrawService } from './services/bg-ref-withdraw.service';
import { JwtBgAuthGuard } from './guards/jwt-bg-auth.guard';
import { BgAuthService, ManualLoginDto, ManualLoginResponseDto } from './bg-auth.service';
import { Response } from 'express';
import { UpdateBgAliasDto } from './dto/update-bg-alias.dto';

import { RequestWithBgUser } from './guards/jwt-bg-auth.guard';

interface RequestWithUser extends RequestWithBgUser {}
    
@Controller('bg-ref')
export class BgRefController {
  constructor(
    private readonly bgRefService: BgRefService,
    private readonly bgAuthService: BgAuthService,
    private readonly bgRefWithdrawService: BgRefWithdrawService
  ) {}

  /**
   * Connect Telegram cho BG affiliate
   */
  // @Post('connect-telegram')
  // async connectTelegram(
  //   @Body() body: { id: string; code: string },
  //   @Res({ passthrough: true }) response: Response
  // ) {
  //   return await this.bgAuthService.connectTelegram(body, response);
  // }

  /**
   * Login Email cho BG affiliate
   */
  @Post('login-email')
  async loginEmail(
    @Body() body: { code: string },
    @Res({ passthrough: true }) response: Response
  ) {
    return await this.bgAuthService.loginEmail(body, response);
  }

  /**
   * Login bằng email và mật khẩu cho BG affiliate
   */
  @Post('manual-login')
  async loginPassword(
    @Body() body: ManualLoginDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<ManualLoginResponseDto> {
    return await this.bgAuthService.loginWithPassword(body, response);
  }

  /**
   * Refresh token cho BG affiliate
   */
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Res({ passthrough: true }) response: Response,
    @Req() req: Request,
  ) {
    // Chỉ cần refresh token từ cookies
    const refreshToken = (req as any).cookies?.bg_refresh_token;
    
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    return await this.bgAuthService.refreshToken(refreshToken, response);
  }

  /**
   * Logout BG affiliate
   */
  @Post('logout')
  async logout(@Res({ passthrough: true }) response: Response) {
    return await this.bgAuthService.logout(response);
  }

  /**
   * Cập nhật commission percent của node (chỉ người giới thiệu trực tiếp mới có quyền)
   */
  @UseGuards(JwtBgAuthGuard)
  @Put('nodes/commission')
  async updateCommissionPercent(
    @Request() req: RequestWithUser,
    @Body() body: {
      toWalletId: number;
      newPercent: number;
    }
  ) {
    const fromWalletId = req.user?.wallet_id;
    if (!fromWalletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    return await this.bgRefService.updateCommissionPercent(
      fromWalletId,
      body.toWalletId,
      body.newPercent
    );
  }

  /**
   * Update bg_alias of node (only upline has permission)
   */
  @UseGuards(JwtBgAuthGuard)
  @Put('nodes/alias')
  async updateBgAlias(
    @Request() req: RequestWithUser,
    @Body() body: UpdateBgAliasDto
  ) {
    const fromWalletId = req.user?.wallet_id;
      if (!fromWalletId) {
        throw new BadRequestException('Cannot find wallet info in token');
    }
    return await this.bgRefService.updateBgAlias(
      fromWalletId,
      body.toWalletId,
      body.newAlias
    );
  }


  /**
   * Lấy lịch sử hoa hồng của wallet hiện tại
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('commission-history')
  async getWalletCommissionHistory(@Request() req: RequestWithUser) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    return await this.bgRefService.getWalletCommissionHistory(walletId);
  }

  /**
   * Kiểm tra status của wallet trong luồng BG affiliate (chỉ ví tuyến trên mới có quyền)
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('bg-affiliate-status/:targetWalletId')
  async checkBgAffiliateStatus(
    @Request() req: RequestWithUser,
    @Param('targetWalletId') targetWalletId: number
  ) {
    const fromWalletId = req.user?.wallet_id;
    if (!fromWalletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    return await this.bgRefService.checkBgAffiliateStatusInDownline(fromWalletId, targetWalletId);
  }

  /**
   * Kiểm tra status của wallet hiện tại
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('my-bg-affiliate-status')
  async checkMyBgAffiliateStatus(@Request() req: RequestWithUser) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    const isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(walletId);
    const bgAffiliateInfo = await this.bgRefService.getWalletBgAffiliateInfo(walletId);
    
    // Lấy thông tin wallet hiện tại và email từ user_wallets
    const currentWalletWithEmail = await this.bgRefService['listWalletRepository']
      .createQueryBuilder('wallet')
      .leftJoin('wallet.wallet_auths', 'wallet_auths')
      .leftJoin('wallet_auths.wa_user', 'user_wallet')
      .select([
        'wallet.wallet_id',
        'wallet.wallet_solana_address',
        'wallet.wallet_nick_name',
        'wallet.wallet_eth_address',
        'wallet.wallet_code_ref',
        'user_wallet.uw_email'
      ])
      .where('wallet.wallet_id = :walletId', { walletId })
      .getRawOne();
    
    return {
      isBgAffiliate,
      currentWallet: currentWalletWithEmail ? {
        walletId: currentWalletWithEmail.wallet_wallet_id,
        solanaAddress: currentWalletWithEmail.wallet_wallet_solana_address,
        nickName: currentWalletWithEmail.wallet_wallet_nick_name,
        ethAddress: currentWalletWithEmail.wallet_wallet_eth_address,
        refCode: currentWalletWithEmail.wallet_wallet_code_ref || null,
        email: currentWalletWithEmail.user_wallet_uw_email || null
      } : null,
      bgAffiliateInfo,
    };
  }



  /**
   * Lấy thống kê BG affiliate của wallet hiện tại
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('bg-affiliate-stats')
  async getWalletBgAffiliateStats(@Request() req: RequestWithUser) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    return await this.bgRefService.getWalletBgAffiliateStats(walletId);
  }

  /**
   * Lấy thông tin cây affiliate của wallet hiện tại (chỉ hiển thị tuyến dưới)
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('trees')
  async getMyAffiliateTree(@Request() req: RequestWithUser) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    return await this.bgRefService.getMyAffiliateTree(walletId);
  }

  /**
   * Lấy thống kê chi tiết về downline members với bộ lọc
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('downline-stats')
  async getDownlineStats(
    @Request() req: RequestWithUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('minCommission') minCommission?: string,
    @Query('maxCommission') maxCommission?: string,
    @Query('minVolume') minVolume?: string,
    @Query('maxVolume') maxVolume?: string,
    @Query('level') level?: string,
    @Query('sortBy') sortBy?: 'commission' | 'volume' | 'transactions' | 'level',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc'
  ) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    return await this.bgRefService.getDownlineStats(
      walletId,
      {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        minCommission: minCommission ? parseFloat(minCommission) : undefined,
        maxCommission: maxCommission ? parseFloat(maxCommission) : undefined,
        minVolume: minVolume ? parseFloat(minVolume) : undefined,
        maxVolume: maxVolume ? parseFloat(maxVolume) : undefined,
        level: level ? parseInt(level) : undefined,
        sortBy: sortBy || 'commission',
        sortOrder: sortOrder || 'desc'
      }
    );
  }

  /**
   * Tạo yêu cầu rút tiền BG affiliate rewards
   */
  @UseGuards(JwtBgAuthGuard)
  @Post('withdraw')
  async withdraw(@Request() req: RequestWithUser) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    const result = await this.bgRefWithdrawService.createWithdrawRequest(walletId);
    
    return {
      success: result.success,
      message: result.message,
      data: result.success ? {
        withdrawId: result.withdrawId,
        amountUSD: result.amountUSD,
        amountSOL: result.amountSOL,
        amountUSDStored: result.amountUSD, // This is the same as amountUSD, stored in rwh_amount_usd
        breakdown: result.breakdown,
      } : null
    };
  }

  /**
   * Hủy yêu cầu rút tiền BG affiliate đang pending
   */
  @UseGuards(JwtBgAuthGuard)
  @Post('cancel-withdraw/:withdrawId')
  async cancelWithdraw(
    @Request() req: RequestWithUser,
    @Param('withdrawId') withdrawId: number
  ) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    const result = await this.bgRefWithdrawService.cancelWithdrawRequest(walletId, withdrawId);
    
    return {
      success: result.success,
      message: result.message,
      data: result.success ? {
        withdrawId: result.withdrawId,
        cancelledAt: result.cancelledAt
      } : null
    };
  }

  /**
   * Lấy lịch sử rút tiền BG affiliate
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('withdraw-history')
  async getWithdrawHistory(@Request() req: RequestWithUser) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    const history = await this.bgRefWithdrawService.getWithdrawalHistory(walletId);
    
    return {
      success: true,
      message: 'Lấy lịch sử rút tiền BG affiliate thành công',
      data: history
    };
  }

  /**
   * Lấy thông tin số tiền có thể rút BG affiliate
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('available-withdrawal')
  async getAvailableWithdrawal(@Request() req: RequestWithUser) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    const available = await this.bgRefWithdrawService.getAvailableWithdrawalAmount(walletId);
    
    return {
      success: true,
      message: 'Lấy thông tin rút tiền BG affiliate khả dụng thành công',
      data: available
    };
  }

  /**
   * Lấy thông tin yêu cầu rút tiền đang pending
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('pending-withdrawal')
  async getPendingWithdrawal(@Request() req: RequestWithUser) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    const pending = await this.bgRefWithdrawService.getPendingWithdrawal(walletId);
    
    return {
      success: true,
      message: 'Lấy thông tin yêu cầu rút tiền đang chờ xử lý thành công',
      data: pending
    };
  }

  /**
   * Lấy thông tin transaction status
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('transaction-status/:withdrawId')
  async getTransactionStatus(
    @Request() req: RequestWithUser,
    @Param('withdrawId') withdrawId: number
  ) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    const status = await this.bgRefWithdrawService.getTransactionStatus(walletId, withdrawId);
    
    return {
      success: true,
      message: 'Lấy thông tin trạng thái giao dịch thành công',
      data: status
    };
  }

  /**
   * Lấy số lượng phần thưởng có thể nhận từ hệ thống ref truyền thống
   */
  @UseGuards(JwtBgAuthGuard)
  @Get('traditional-referral-rewards')
  async getTraditionalReferralRewards(@Request() req: RequestWithUser) {
    const walletId = req.user?.wallet_id;
    if (!walletId) {
      throw new Error('Không tìm thấy thông tin ví trong token');
    }

    const rewards = await this.bgRefService.getTraditionalReferralRewards(walletId);
    
    return {
      success: true,
      message: 'Lấy thông tin phần thưởng ref truyền thống thành công',
      data: rewards
    };
  }
} 