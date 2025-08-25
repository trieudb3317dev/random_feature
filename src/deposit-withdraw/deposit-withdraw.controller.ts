import { Controller, Post, Get, Body, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DepositWithdrawService } from './deposit-withdraw.service';
import { CreateDepositWithdrawDto, CreateMultiTokenDepositWithdrawDto, GetHistoryDto, DepositWithdrawResponseDto } from './dto/deposit-withdraw.dto';

@ApiTags('deposit-withdraw')
@Controller('deposit-withdraw')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DepositWithdrawController {
  constructor(private readonly depositWithdrawService: DepositWithdrawService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new deposit or withdrawal transaction (SOL only)' })
  @ApiResponse({ status: 201, description: 'Transaction created successfully', type: DepositWithdrawResponseDto })
  async createDepositWithdraw(
    @Body() dto: CreateDepositWithdrawDto,
    @Request() req,
  ) {
    return this.depositWithdrawService.createDepositWithdraw(dto, req.user.uid, req.user.wallet_id);
  }

  @Post('multi-token')
  @ApiOperation({ summary: 'Create a new deposit or withdrawal transaction (supports all tokens: SOL, USDT, USDC, etc.)' })
  @ApiResponse({ status: 201, description: 'Transaction created successfully', type: DepositWithdrawResponseDto })
  async createMultiTokenDepositWithdraw(
    @Body() dto: CreateMultiTokenDepositWithdrawDto,
    @Request() req,
  ) {
    return this.depositWithdrawService.createMultiTokenDepositWithdraw(dto, req.user.uid, req.user.wallet_id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get deposit/withdrawal history' })
  @ApiResponse({ status: 200, description: 'Return transaction history', type: [DepositWithdrawResponseDto] })
  async getHistory(
    @Query() dto: GetHistoryDto,
    @Request() req,
  ) {
    // Ensure user can only view their own history
    dto.wallet_address_from = req.user.sol_public_key;
    return this.depositWithdrawService.getHistory(dto);
  }
  
} 