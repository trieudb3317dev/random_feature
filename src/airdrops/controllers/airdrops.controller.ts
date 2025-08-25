import { Controller, Post, Get, Body, UseGuards, Request, HttpStatus, Param, Query, UseInterceptors, UploadedFile, Put, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AirdropJwtAuthGuard } from '../guards/airdrop-jwt-auth.guard';
import { AirdropsService } from '../services/airdrops.service';
import { CreatePoolDto } from '../dto/create-pool.dto';
import { CreatePoolResponseDto } from '../dto/create-pool-response.dto';
import { StakePoolDto } from '../dto/join-pool.dto';
import { StakePoolResponseDto } from '../dto/join-pool-response.dto';
import { GetPoolsResponseDto } from '../dto/get-pools-response.dto';
import { GetPoolDetailResponseDto } from '../dto/get-pool-detail-response.dto';
import { GetPoolDetailDto } from '../dto/get-pool-detail.dto';
import { GetPoolsDto } from '../dto/get-pools.dto';
import { GetPoolDetailTransactionsResponseDto } from '../dto/get-pool-detail-transactions-response.dto';
import { GetPoolDetailTransactionsDto } from '../dto/get-pool-detail-transactions.dto';
import { UpdatePoolDto } from '../dto/update-pool.dto';
import { UpdatePoolResponseDto } from '../dto/update-pool-response.dto';
import { GetRewardHistoryDto } from '../dto/get-reward-history.dto';
import { GetRewardHistoryResponseDto } from '../dto/get-reward-history-response.dto';


@ApiTags('Airdrops')
@Controller('airdrops')
@UseGuards(AirdropJwtAuthGuard)
@ApiBearerAuth()
export class AirdropsController {
    constructor(private readonly airdropsService: AirdropsService) {}

    @Post('create-pool')
    @UseInterceptors(FileInterceptor('logo'))
    @ApiOperation({
        summary: 'Create new airdrop pool',
        description: 'Create a new airdrop pool with token X. Logo is optional - can be uploaded as file or provided as URL. Requires minimum 1,000,000 token X.'
    })
    @ApiConsumes('multipart/form-data')
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Pool created successfully',
        type: CreatePoolResponseDto
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid data or insufficient balance'
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Unauthorized access'
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Server error'
    })
    async createPool(
        @Request() req: any, 
        @Body() createPoolDto: CreatePoolDto,
        @UploadedFile() logoFile?: Express.Multer.File
    ) {
        // Get wallet_id from JWT token
        const walletId = req.user.wallet_id;
        
        if (!walletId) {
            throw new Error('Wallet ID not found in token');
        }

        return await this.airdropsService.createPool(walletId, createPoolDto, logoFile);
    }

    @Put('pool/:idOrSlug')
    @UseInterceptors(FileInterceptor('logo'))
    @ApiOperation({
        summary: 'Update airdrop pool logo and description',
        description: 'Update logo and description of an airdrop pool. Only the pool creator can update the pool. Logo is optional - can be uploaded as file or provided as URL.'
    })
    @ApiParam({
        name: 'idOrSlug',
        description: 'ID or slug of the pool (e.g., 1 or "my-airdrop-pool-1")',
        example: 'my-airdrop-pool-1'
    })
    @ApiConsumes('multipart/form-data')
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Pool updated successfully',
        type: UpdatePoolResponseDto
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Pool not found or user is not the pool creator'
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Unauthorized access'
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Server error'
    })
    async updatePool(
        @Param('idOrSlug') idOrSlug: string,
        @Body() updatePoolDto: UpdatePoolDto,
        @Request() req: any,
        @UploadedFile() logoFile?: Express.Multer.File
    ) {
        // Get wallet_id from JWT token
        const walletId = req.user.wallet_id;
        
        if (!walletId) {
            throw new Error('Wallet ID not found in token');
        }

        return await this.airdropsService.updatePool(walletId, idOrSlug, updatePoolDto, logoFile);
    }

    @Post('stake-pool')
    @ApiOperation({
        summary: 'Stake into airdrop pool',
        description: 'Stake token X into an existing airdrop pool. Can stake multiple times.'
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Stake pool successfully',
        type: StakePoolResponseDto
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid data, pool not found, or insufficient balance'
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Unauthorized access'
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Server error'
    })
    async stakePool(@Request() req: any, @Body() stakePoolDto: StakePoolDto) {
        // Get wallet_id from JWT token
        const walletId = req.user.wallet_id;
        
        if (!walletId) {
            throw new Error('Wallet ID not found in token');
        }

        return await this.airdropsService.stakePool(walletId, stakePoolDto);
    }

    @Get('check-balance')
    @ApiOperation({
        summary: 'Check wallet balance for staking',
        description: 'Check current token X balance and validate if wallet can stake specified amount'
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Balance check completed',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                data: {
                    type: 'object',
                    properties: {
                        currentBalance: { type: 'number' },
                        currentBalanceInTokens: { type: 'number' },
                        maxPossibleStake: { type: 'number' },
                        suggestions: { type: 'array', items: { type: 'string' } }
                    }
                }
            }
        }
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Unauthorized access'
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Server error'
    })
    async checkBalance(@Request() req: any, @Query('stakeAmount') stakeAmount?: string) {
        // Get wallet_id from JWT token
        const walletId = req.user.wallet_id;
        
        if (!walletId) {
            throw new Error('Wallet ID not found in token');
        }

        const amount = stakeAmount ? parseInt(stakeAmount) : 1000000; // Default 1M tokens
        return await this.airdropsService.checkWalletBalanceForStake(walletId, amount);
    }

    @Get('suggest-stake-amount')
    @ApiOperation({
        summary: 'Get suggested stake amount based on wallet balance',
        description: 'Get the maximum possible stake amount and suggestions based on current wallet balance'
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Suggestions provided',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                data: {
                    type: 'object',
                    properties: {
                        currentBalance: { type: 'number' },
                        currentBalanceInTokens: { type: 'number' },
                        maxPossibleStake: { type: 'number' },
                        suggestedAmounts: { type: 'array', items: { type: 'number' } },
                        suggestions: { type: 'array', items: { type: 'string' } }
                    }
                }
            }
        }
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Unauthorized access'
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Server error'
    })
    async suggestStakeAmount(@Request() req: any) {
        // Get wallet_id from JWT token
        const walletId = req.user.wallet_id;
        
        if (!walletId) {
            throw new Error('Wallet ID not found in token');
        }

        return await this.airdropsService.suggestStakeAmount(walletId);
    }

    @Get('pools')
    @ApiOperation({
        summary: 'Get airdrop pools list',
        description: 'Get list of airdrop pools with filtering and sorting. Supports filtering by: all pools, created pools, joined pools.'
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Get pools list successfully',
        type: GetPoolsResponseDto
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Unauthorized access'
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Server error'
    })
    async getPools(@Query() query: GetPoolsDto, @Request() req: any): Promise<GetPoolsResponseDto> {
        // Get wallet_id from JWT token
        const walletId = req.user.wallet_id;
        
        if (!walletId) {
            throw new Error('Wallet ID not found in token');
        }

        const pools = await this.airdropsService.getPools(walletId, query);

        return {
            success: true,
            message: 'Get pools list successfully',
            data: pools
        };
    }

    @Get('pool/:idOrSlug')
    @UseGuards(AirdropJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Get airdrop pool details',
        description: 'Get detailed information of an airdrop pool by ID or slug. If user is creator, will show additional members list.'
    })
    @ApiParam({
        name: 'idOrSlug',
        description: 'ID or slug of the pool (e.g., 1 or "my-airdrop-pool-1")',
        example: 'my-airdrop-pool-1'
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Get pool details successfully',
        type: GetPoolDetailResponseDto
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Pool not found'
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Unauthorized access'
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Server error'
    })
    async getPoolDetail(
        @Param('idOrSlug') idOrSlug: string,
        @Query() query: GetPoolDetailDto,
        @Request() req: any
    ): Promise<GetPoolDetailResponseDto> {
        const walletId = req.user.wallet_id;
        
        if (!walletId) {
            throw new Error('Wallet ID not found in token');
        }

        const poolDetail = await this.airdropsService.getPoolDetailByIdOrSlug(
            idOrSlug,
            walletId,
            query
        );

        return {
            success: true,
            message: 'Get pool details successfully',
            data: poolDetail
        };
    }

    @Get('pool-detail/:idOrSlug')
    @UseGuards(AirdropJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Get airdrop pool detail with transactions',
        description: 'Get detailed information of an airdrop pool by ID or slug with transactions list. Pool creators can see all transactions, while pool members can only see their own transactions.'
    })
    @ApiParam({
        name: 'idOrSlug',
        description: 'ID or slug of the pool (e.g., 1 or "my-airdrop-pool-1")',
        example: 'my-airdrop-pool-1'
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Get pool detail transactions successfully',
        type: GetPoolDetailTransactionsResponseDto
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Pool not found or user is not the pool creator or member'
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Unauthorized access'
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Server error'
    })
    async getPoolDetailTransactions(
        @Param('idOrSlug') idOrSlug: string,
        @Query() query: GetPoolDetailTransactionsDto,
        @Request() req: any
    ): Promise<GetPoolDetailTransactionsResponseDto> {
        const walletId = req.user.wallet_id;
        
        if (!walletId) {
            throw new Error('Wallet ID not found in token');
        }

        const poolDetailTransactions = await this.airdropsService.getPoolDetailTransactionsByIdOrSlug(
            idOrSlug,
            walletId,
            query
        );

        return {
            success: true,
            message: 'Get pool detail transactions successfully',
            data: poolDetailTransactions
        };
    }

    @Get('reward-history')
    @UseGuards(AirdropJwtAuthGuard)
    async getRewardHistory(
        @Query() query: GetRewardHistoryDto,
        @Request() req: any
    ): Promise<GetRewardHistoryResponseDto> {
        const walletId = req.user.wallet_id;
        
        if (!walletId) {
            throw new BadRequestException('Wallet ID not found in token');
        }

        return await this.airdropsService.getUserRewardHistory(walletId, query);
    }

} 