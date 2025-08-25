import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { WalletReferentService } from '../services/wallet-referent.service';
import { ReferralWithdrawService } from '../services/referral-withdraw.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Request } from 'express';

interface RequestWithUser extends Request {
    user: any; // Hoặc định nghĩa kiểu cụ thể hơn nếu bạn biết cấu trúc của user
}

@Controller('referent')
export class ReferentController {
    constructor(
        private readonly walletReferentService: WalletReferentService,
        private readonly referralWithdrawService: ReferralWithdrawService,
    ) {}

    // @UseGuards(JwtAuthGuard)
    // @Get('get-referent')
    // async getReferent(@Req() request: RequestWithUser) {
    //     // Lấy wallet_id từ JWT token
    //     const walletId = request.user?.wallet_id;
        
    //     if (!walletId) {
    //         return {
    //             success: false,
    //             message: 'Không tìm thấy thông tin ví trong token',
    //             data: null
    //         };
    //     }

    //     const referentInfo = await this.walletReferentService.getReferentInfo(walletId);
        
    //     if (!referentInfo) {
    //         return {
    //             success: false,
    //             message: 'Không tìm thấy thông tin người giới thiệu',
    //             data: null
    //         };
    //     }

    //     return {
    //         success: true,
    //         message: 'Lấy thông tin người giới thiệu thành công',
    //         data: referentInfo
    //     };
    // }

    // @UseGuards(JwtAuthGuard)
    // @Get('get-list-members')
    // async getListMembers(@Req() request: RequestWithUser) {
    //     const walletId = request.user?.wallet_id;
        
    //     if (!walletId) {
    //         return {
    //             success: false,
    //             message: 'Không tìm thấy thông tin ví trong token',
    //             data: null
    //         };
    //     }

    //     return await this.walletReferentService.getListMembers(walletId);
    // }

    // @UseGuards(JwtAuthGuard)
    // @Get('rewards')
    // async getRewards(@Req() request: RequestWithUser) {
    //     const walletId = request.user?.wallet_id;
        
    //     if (!walletId) {
    //         return {
    //             success: false,
    //             message: 'Không tìm thấy thông tin ví trong token',
    //             data: null
    //         };
    //     }

    //     return await this.walletReferentService.getRewards(walletId);
    // }

    // @UseGuards(JwtAuthGuard)
    // @Post('withdraw')
    // async withdraw(@Req() request: RequestWithUser) {
    //     const walletId = request.user?.wallet_id;
        
    //     if (!walletId) {
    //         return {
    //             success: false,
    //             message: 'Không tìm thấy thông tin ví trong token',
    //             data: null
    //         };
    //     }

    //     const result = await this.referralWithdrawService.createWithdrawRequest(walletId);
        
    //     return {
    //         success: result.success,
    //         message: result.message,
    //         data: result.success ? {
    //             withdrawId: result.withdrawId,
    //             amountUSD: result.amountUSD,
    //             amountSOL: result.amountSOL,
    //             amountUSDStored: result.amountUSD, // This is the same as amountUSD, stored in rwh_amount_usd
    //         } : null
    //     };
    // }

    // @UseGuards(JwtAuthGuard)
    // @Get('withdraw-history')
    // async getWithdrawHistory(@Req() request: RequestWithUser) {
    //     const walletId = request.user?.wallet_id;
        
    //     if (!walletId) {
    //         return {
    //             success: false,
    //             message: 'Không tìm thấy thông tin ví trong token',
    //             data: null
    //         };
    //     }

    //     const history = await this.referralWithdrawService.getWithdrawalHistory(walletId);
        
    //     return {
    //         success: true,
    //         message: 'Lấy lịch sử rút tiền thành công',
    //         data: history
    //     };
    // }

    // @UseGuards(JwtAuthGuard)
    // @Get('available-withdrawal')
    // async getAvailableWithdrawal(@Req() request: RequestWithUser) {
    //     const walletId = request.user?.wallet_id;
        
    //     if (!walletId) {
    //         return {
    //             success: false,
    //             message: 'Không tìm thấy thông tin ví trong token',
    //             data: null
    //         };
    //     }

    //     const available = await this.referralWithdrawService.getAvailableWithdrawalAmount(walletId);
        
    //     return {
    //         success: true,
    //         message: 'Lấy thông tin rút tiền khả dụng thành công',
    //         data: available
    //     };
    // }
} 