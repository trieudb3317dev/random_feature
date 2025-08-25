import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { SwapService } from './swap.service';
import { CreateSwapDto } from './dto/create-swap.dto';
import { ContributeCapitalDto } from './dto/contribute-capital.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('swaps')
@UseGuards(JwtAuthGuard)
export class SwapController {
  constructor(private readonly swapService: SwapService) {}

  @Post()
  async createSwap(
    @Body() createSwapDto: CreateSwapDto,
    @Request() req: any,
  ) {
    const walletId = req.user.wallet_id;
    return await this.swapService.createSwap(createSwapDto, walletId);
  }

  @Post('contribute-capital')
  async contributeCapital(
    @Body() contributeCapitalDto: ContributeCapitalDto,
    @Request() req: any,
  ) {
    const wallet_address = req.user.sol_public_key;
    return await this.swapService.contributeCapital(contributeCapitalDto, wallet_address);
  }


  @Get('rewards/history')
  async getRewardHistory(
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
  ) {
    return await this.swapService.getRewardHistory(limit, offset);
  }

  // @Get(':swapOrderId')
  // async getSwapOrder(
  //   @Param('swapOrderId') swapOrderId: number,
  //   @Request() req: any,
  // ) {
  //   const walletId = req.user.wallet_id;
  //   return await this.swapService.getSwapOrder(swapOrderId, walletId);
  // }

  @Get()
  async getSwapHistory(
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
    @Request() req: any,
  ) {
    const walletId = req.user.wallet_id;
    return await this.swapService.getSwapHistory(walletId, limit, offset);
  }
} 