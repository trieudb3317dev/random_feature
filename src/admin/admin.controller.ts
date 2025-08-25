import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Query, UseGuards, Request, Res, HttpCode, UseInterceptors, UploadedFile, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CategoryPrioritize, CategoryStatus } from '../solana/entities/solana-list-categories-token.entity';
import { Setting } from './entities/setting.entity';
import { AdminGateway } from './admin.gateway';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Response } from 'express';
import { JwtAuthAdminGuard } from './guards/jwt-auth.guard';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { ReferentSetting } from '../referral/entities/referent-setting.entity';
import { WalletReferent } from '../referral/entities/wallet-referent.entity';
import { ReferentLevelReward } from '../referral/entities/referent-level-rewards.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateInvestorDto } from './dto/create-investor.dto';
import { SwapSettingDto, UpdateSwapSettingDto } from './dto/swap-setting.dto';
import { AirdropPoolListResponseDto, AirdropPoolResponseDto } from './dto/airdrop-pool-response.dto';
import { AirdropPoolStatsResponseDto } from './dto/airdrop-pool-stats-response.dto';
import { AirdropPoolDetailResponseDto } from './dto/airdrop-pool-detail-response.dto';
import { AirdropStakingLeaderboardResponseDto } from './dto/airdrop-staking-leaderboard.dto';
import { ConflictException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { AirdropAdminService } from './airdrop-admin.service';
import { CreateAirdropTokenDto } from './dto/create-airdrop-token.dto';
import { UpdateAirdropTokenDto } from './dto/update-airdrop-token.dto';
import { GetAirdropTokensDto } from './dto/get-airdrop-tokens.dto';
import { AirdropCalculateDto } from './dto/airdrop-calculate.dto';
import { GetAirdropRewardsDto } from './dto/get-airdrop-rewards.dto';
import { AirdropRewardsListResponseDto } from './dto/airdrop-rewards-response.dto';
import { ChangeBgAffiliateFlowDto, ChangeBgAffiliateFlowResponseDto } from './dto/change-bg-flow.dto';
import { SendLeaderboardEmailResponseDto } from './dto/airdrop-staking-leaderboard.dto';
import { CreateBittworldTokenDto } from './dto/create-bittworld-token.dto';
import { CreateBittworldTokenResponseDto } from './dto/bittworld-token-response.dto';
import { UpdateBittworldTokenDto } from './dto/update-bittworld-token.dto';
import { UpdateBittworldTokenResponseDto } from './dto/update-bittworld-token-response.dto';
import { DeleteBittworldTokenResponseDto } from './dto/delete-bittworld-token-response.dto';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminGateway: AdminGateway,
    private readonly airdropAdminService: AirdropAdminService
  ) {}

  // @Post('register')
  // register(@Body() registerDto: RegisterDto) {
  //   return this.adminService.register(registerDto);
  // }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.adminService.login(loginDto, response);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) response: Response) {
    return this.adminService.logout(response);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get admin profile' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  getProfile(@Request() req): ProfileResponseDto {
    const { password, ...profile } = req.user;
    return profile;
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('change-password')
  @HttpCode(200)
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto
  ) {
    return this.adminService.changePassword(
      req.user.username,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword
    );
  }

  // Setting endpoints
  @Get('setting')
  async getSetting(): Promise<Setting> {
    return this.adminService.getSetting();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('setting')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: './public/uploads',
        filename: (req, file, cb) => {
          cb(null, `logo${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async updateSetting(
    @Body() data: {
      appName?: string;
      telegramBot?: string;
    },
    @UploadedFile() file: any,
  ): Promise<Setting> {
    try {
      // Get current settings to check for existing logo
      const currentSettings = await this.adminService.getSetting();
      
      // If there's a new file and an old logo exists, delete the old file
      if (file && currentSettings?.logo) {
        const oldLogoPath = path.join(process.cwd(), 'public', 'uploads', path.basename(currentSettings.logo));
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }

      const updateData = {
        ...data,
        logo: file ? `/uploads/logo${extname(file.originalname)}` : currentSettings?.logo,
      };
      return this.adminService.updateSetting(updateData);
    } catch (error) {
      // If there's an error and we uploaded a new file, try to delete it
      if (file) {
        const newLogoPath = path.join(process.cwd(), 'public', 'uploads', `logo${extname(file.originalname)}`);
        if (fs.existsSync(newLogoPath)) {
          fs.unlinkSync(newLogoPath);
        }
      }
      throw error;
    }
  }

  // Category endpoints
  @UseGuards(JwtAuthAdminGuard)
  @Get('categories-token')
  async getAllCategories(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 100,
    @Query('search') search?: string
  ): Promise<{ data: CategoryResponseDto[]; total: number; page: number; limit: number }> {
    return this.adminService.getAllCategories(page, limit, search);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Post('categories-token')
  async createCategory(
    @Body() data: {
      slct_name: string;
      slct_slug: string;
    }
  ): Promise<CategoryResponseDto> {
    return this.adminService.createCategory(data);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('categories-token/:id')
  async updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: {
      slct_name?: string;
      slct_slug?: string;
      slct_prioritize?: CategoryPrioritize;
      sltc_status?: CategoryStatus;
    }
  ): Promise<CategoryResponseDto> {
    return this.adminService.updateCategory(id, data);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Delete('categories-token/:id')
  async deleteCategory(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    return this.adminService.deleteCategory(id);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('online-stats')
  @ApiOperation({ summary: 'Get online users statistics' })
  @ApiResponse({ status: 200, description: 'Returns online users statistics' })
  async getOnlineStats(@Request() req) {
    return this.adminGateway.handleGetOnlineStats(req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('list-wallets')
  @ApiOperation({ summary: 'Get list of user wallets' })
  @ApiResponse({ status: 200, description: 'Returns list of user wallets with pagination' })
  async getListWallets(
    @Request() req: any,
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 100,
    @Query('search') search?: string,
    @Query('wallet_auth') wallet_auth?: string,
    @Query('wallet_type') wallet_type?: 'main' | 'all',
    @Query('isBittworld') isBittworld?: string,
    @Query('bittworld_uid') bittworld_uid?: string,
    @Query('bg_affiliate') bg_affiliate?: 'bg' | 'non_bg'
  ): Promise<{ data: ListWallet[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    return this.adminService.getListWallets(page, limit, search, wallet_auth, wallet_type, req.user, isBittworld, bittworld_uid, bg_affiliate);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('list-wallets/:id/auth')
  @ApiOperation({ summary: 'Update wallet auth type' })
  @ApiResponse({ status: 200, description: 'Returns success message' })
  async updateWalletAuth(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: { wallet_auth: 'member' | 'master' }
  ): Promise<{ message: string }> {
    return this.adminService.updateWalletAuth(id, data.wallet_auth);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('referent-settings')
  @ApiOperation({ summary: 'Get referent setting' })
  @ApiResponse({ status: 200, type: ReferentSetting })
  async getReferentSettings(): Promise<ReferentSetting> {
    return this.adminService.getReferentSettings();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('referent-settings')
  @ApiOperation({ summary: 'Update referent setting' })
  @ApiResponse({ status: 200, type: ReferentSetting })
  async updateReferentSettings(
    @Body() data: {
      rs_ref_level?: number;
    }
  ): Promise<ReferentSetting> {
    return this.adminService.updateReferentSettings(data);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('referent-level-rewards')
  @ApiOperation({ summary: 'Get all referent level rewards' })
  @ApiResponse({ status: 200, type: [ReferentLevelReward] })
  async getReferentLevelRewards(): Promise<ReferentLevelReward[]> {
    return this.adminService.getReferentLevelRewards();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('referent-level-rewards/:id')
  @ApiOperation({ summary: 'Update referent level reward percentage' })
  @ApiResponse({ status: 200, type: ReferentLevelReward })
  async updateReferentLevelReward(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: { rlr_percentage: number }
  ): Promise<ReferentLevelReward> {
    return this.adminService.updateReferentLevelReward(id, data.rlr_percentage);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('wallet-referents')
  @ApiOperation({ summary: 'Get list of wallet referents' })
  @ApiResponse({ status: 200, description: 'Returns list of wallet referents with pagination' })
  async getWalletReferents(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 100,
    @Query('search') search?: string
  ): Promise<{ data: WalletReferent[]; total: number; page: number; limit: number }> {
    return this.adminService.getWalletReferents(page, limit, search);
  }

  // BG Affiliate Management Endpoints
  @UseGuards(JwtAuthAdminGuard)
  @Post('bg-affiliate')
  @ApiOperation({ summary: 'Create new BG affiliate (allows wallets in traditional referral system, but not in other BG systems)' })
  @ApiResponse({ status: 201, description: 'BG affiliate created successfully' })
  @ApiResponse({ status: 400, description: 'Wallet already in BG affiliate system or invalid commission percent' })
  async createBgAffiliate(
    @Request() req: any,
    @Body() data: {
      walletId: number;
      totalCommissionPercent: number;
      batAlias: string;
    }
  ): Promise<{ message: string; treeId: number; totalCommissionPercent: number; batAlias: string; walletInfo: any }> {
    const result = await this.adminService.createBgAffiliate(data, req.user);
    
    // Lấy thông tin wallet để trả về
    const wallet = await this.adminService.getWalletInfo(data.walletId);
    
    return {
      ...result,
      walletInfo: wallet
    };
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('bg-affiliate/commission')
  @ApiOperation({ summary: 'Admin update root BG commission (only root BG, with minimum check)' })
  @ApiResponse({ status: 200, description: 'Root BG commission updated successfully' })
  async updateBgAffiliateCommission(
    @Request() req: any,
    @Body() data: {
      rootWalletId?: number;
      treeId?: number;
      newPercent: number;
      batAlias?: string;
    }
  ): Promise<{ 
    success: boolean;
    message: string;
    oldPercent: number;
    newPercent: number;
    minRequiredPercent: number | null;
    treeInfo: any;
  }> {
    return this.adminService.updateBgAffiliateCommission(data, req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('bg-affiliate/trees')
  @ApiOperation({ summary: 'Get all BG affiliate trees' })
  @ApiResponse({ status: 200, description: 'Returns list of BG affiliate trees' })
  async getAllBgAffiliateTrees(
    @Request() req: any,
    @Query('isBittworld') isBittworld?: 'true' | 'false'
  ): Promise<any[]> {
    return this.adminService.getAllBgAffiliateTrees(req.user, isBittworld);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('bg-affiliate/trees/wallet/:walletId')
  @ApiOperation({ summary: 'Get BG affiliate tree detail by wallet ID' })
  @ApiResponse({ status: 200, description: 'Returns BG affiliate tree detail with hierarchical structure' })
  async getBgAffiliateTreeByWallet(
    @Param('walletId', ParseIntPipe) walletId: number
  ): Promise<any> {
    return this.adminService.getBgAffiliateTreeByWallet(walletId);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('bg-affiliate/wallet/:walletId/stats')
  @ApiOperation({ summary: 'Get wallet BG affiliate stats' })
  @ApiResponse({ status: 200, description: 'Returns wallet BG affiliate statistics' })
  async getWalletBgAffiliateStats(
    @Param('walletId', ParseIntPipe) walletId: number
  ): Promise<any> {
    return this.adminService.getWalletBgAffiliateStats(walletId);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('bg-affiliate/statistics')
  @ApiOperation({ summary: 'Get BG affiliate system overview' })
  @ApiResponse({ status: 200, description: 'Returns BG affiliate system overview' })
  async getBgAffiliateOverview(): Promise<any> {
    return this.adminService.getBgAffiliateOverview();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('dashboard/statistics')
  @ApiOperation({ summary: 'Get dashboard overview statistics' })
  @ApiResponse({ status: 200, description: 'Returns comprehensive dashboard statistics' })
  async getDashboardStatistics(): Promise<any> {
    return this.adminService.getDashboardStatistics();
  }


  @UseGuards(JwtAuthAdminGuard)
  @Put('bg-affiliate/nodes/status')
  @ApiOperation({ summary: 'Update BG affiliate node status' })
  @ApiResponse({ status: 200, description: 'Node status updated successfully' })
  async updateBgAffiliateNodeStatus(
    @Request() req: any,
    @Body() data: {
      walletId: number;
      status: boolean;
    }
  ): Promise<{ 
    success: boolean;
    message: string;
    walletId: number;
    oldStatus: boolean;
    newStatus: boolean;
    nodeInfo?: any;
  }> {
    return this.adminService.updateBgAffiliateNodeStatus(data, req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('bg-affiliate/change-flow')
  @ApiOperation({ summary: 'Change BG affiliate flow - Change upline referrer' })
  @ApiResponse({ status: 200, description: 'BG affiliate flow changed successfully', type: ChangeBgAffiliateFlowResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request or circular reference detected' })
  @ApiResponse({ status: 404, description: 'Wallet or node not found' })
  async changeBgAffiliateFlow(
    @Request() req: any,
    @Body() data: ChangeBgAffiliateFlowDto
  ): Promise<ChangeBgAffiliateFlowResponseDto> {
    return this.adminService.changeBgAffiliateFlow(data, req.user);
  }


  @UseGuards(JwtAuthAdminGuard)
  @Get('order-history')
  @ApiOperation({ summary: 'Get all order history' })
  @ApiResponse({ status: 200, description: 'Returns all order history with filters' })
  async getOrderHistory(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('isBittworld') isBittworld?: string
  ) {
    return this.adminService.getOrderHistory(page, limit, search, status, isBittworld);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('order-statistics')
  @ApiOperation({ summary: 'Get order statistics' })
  @ApiResponse({ status: 200, description: 'Returns order statistics' })
  async getOrderStats() {
    return this.adminService.getOrderStats();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('wallet-statistics')
  @ApiOperation({ summary: 'Get wallet statistics' })
  @ApiResponse({ status: 200, description: 'Returns wallet statistics' })
  async getWalletStats() {
    return this.adminService.getWalletStats();
  }

  // ==================== TRADITIONAL REFERRAL MANAGEMENT ====================

  @UseGuards(JwtAuthAdminGuard)
  @Get('traditional-referrals')
  @ApiOperation({ summary: 'Get traditional referral list with pagination and search' })
  @ApiResponse({ status: 200, description: 'Returns traditional referral list with stats' })
  async getTraditionalReferrals(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 100,
    @Query('search') search?: string,
    @Query('level', new ParseIntPipe({ optional: true })) level?: number
  ) {
    return this.adminService.getTraditionalReferrals(page, limit, search, level);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('traditional-referrals/statistics')
  @ApiOperation({ summary: 'Get traditional referral system statistics' })
  @ApiResponse({ status: 200, description: 'Returns comprehensive traditional referral statistics' })
  async getTraditionalReferralStatistics() {
    return this.adminService.getTraditionalReferralStatistics();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Post('users')
  @ApiOperation({ summary: 'Create new user (Admin only)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can create users' })
  @ApiResponse({ status: 409, description: 'Username or email already exists' })
  async createUser(@Body() createUserDto: CreateUserDto, @Request() req) {
    try {
      return await this.adminService.createUser(createUserDto, req.user);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new HttpException({
          status: HttpStatus.CONFLICT,
          error: error.message,
          message: 'Username or email already exists'
        }, HttpStatus.CONFLICT);
      }
      
      if (error instanceof UnauthorizedException) {
        throw new HttpException({
          status: HttpStatus.UNAUTHORIZED,
          error: error.message,
          message: 'Only admin can create new users'
        }, HttpStatus.UNAUTHORIZED);
      }
      
      throw new HttpException({
        status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        error: error.message,
        message: 'Failed to create user'
      }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('users')
  @ApiOperation({ summary: 'Get list of admin users' })
  @ApiResponse({ status: 200, description: 'List of users' })
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('role') role?: 'admin' | 'member' | 'partner',
    @Query('search') search?: string
  ) {
    return await this.adminService.getUsers(page, limit, role, search);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('user-stats')
  @ApiOperation({ summary: 'Get user statistics' })
  @ApiResponse({ status: 200, description: 'User statistics' })
  async getUserStats() {
    return await this.adminService.getUserStats();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('users/:id')
  @ApiOperation({ summary: 'Update admin user (admin only, cannot update other admins)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: Partial<CreateUserDto>,
    @Request() req
  ) {
    return await this.adminService.updateUser(id, updateUserDto, req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete admin user (admin only, cannot delete other admins)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @Request() req
  ) {
    return await this.adminService.deleteUser(id, req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Post('swap-investors')
  @ApiOperation({ summary: 'Create new investor (Admin only)' })
  @ApiResponse({ status: 201, description: 'Investor created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can create investors' })
  @ApiResponse({ status: 409, description: 'Investor with this wallet address already exists' })
  async createInvestor(@Body() createInvestorDto: CreateInvestorDto, @Request() req) {
    return await this.adminService.createInvestor(createInvestorDto, req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('swap-investors')
  @ApiOperation({ summary: 'Get list of investors (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of investors retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can view investors' })
  async getInvestors(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
    @Query('search') search?: string
  ) {
    return await this.adminService.getInvestors(page, limit, search);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('swap-settings')
  @ApiOperation({ summary: 'Get swap settings (Admin only)' })
  @ApiResponse({ status: 200, description: 'Swap settings retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can view swap settings' })
  async getSwapSettings() {
    return await this.adminService.getSwapSettings();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('swap-settings')
  @ApiOperation({ summary: 'Update swap settings (Admin only)' })
  @ApiResponse({ status: 200, description: 'Swap settings updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can update swap settings' })
  async updateSwapSettings(
    @Body() updateSwapSettingDto: UpdateSwapSettingDto,
    @Request() req: any
  ) {
    return await this.adminService.updateSwapSettings(updateSwapSettingDto, req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('swap-investors/stats')
  @ApiOperation({ summary: 'Get swap investors statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Swap investors statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can view statistics' })
  async getSwapInvestorsStats() {
    return await this.adminService.getSwapInvestorsStats();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('swap-investor-rewards')
  @ApiOperation({ summary: 'Get list of swap investor rewards (Admin only)' })
  @ApiResponse({ status: 200, description: 'Swap investor rewards retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can view rewards' })
  async getSwapInvestorRewards(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
    @Query('search') search?: string,
    @Query('investor_id', new ParseIntPipe({ optional: true })) investor_id?: number,
    @Query('swap_order_id', new ParseIntPipe({ optional: true })) swap_order_id?: number
  ) {
    return await this.adminService.getSwapInvestorRewards(page, limit, search, investor_id, swap_order_id);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('airdrop-pools')
  @ApiOperation({ summary: 'Get airdrop pools list' })
  @ApiResponse({ status: 200, type: AirdropPoolListResponseDto })
  async getAirdropPools(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('originator_id', new ParseIntPipe({ optional: true })) originator_id?: number
  ): Promise<AirdropPoolListResponseDto> {
    return this.adminService.getAirdropPools(page, limit, search, status, originator_id);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('airdrop-pools/stats')
  @ApiOperation({ summary: 'Get airdrop pools statistics' })
  @ApiResponse({ status: 200, type: AirdropPoolStatsResponseDto })
  async getAirdropPoolsStats(): Promise<AirdropPoolStatsResponseDto> {
    return this.adminService.getAirdropPoolsStats();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('airdrop-pools/detail/:idOrSlug')
  @ApiOperation({ summary: 'Get airdrop pool detail with all transactions' })
  @ApiParam({
    name: 'idOrSlug',
    description: 'ID or slug of the pool (e.g., 1 or "my-airdrop-pool-1")',
    example: 'my-airdrop-pool-1'
  })
  @ApiResponse({ status: 200, type: AirdropPoolDetailResponseDto })
  async getAirdropPoolDetail(
    @Param('idOrSlug') idOrSlug: string
  ): Promise<AirdropPoolDetailResponseDto> {
    return this.adminService.getAirdropPoolDetailByIdOrSlug(idOrSlug);
  }

  @Get('airdrop-pools/leaderboard')
  @UseGuards(JwtAuthAdminGuard)
  @ApiOperation({ summary: 'Get airdrop pools staking leaderboard' })
  @ApiResponse({ status: 200, description: 'Pools leaderboard retrieved successfully', type: AirdropStakingLeaderboardResponseDto })
  async getAirdropPoolsStakingLeaderboard(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
    @Query('minVolume', new ParseIntPipe({ optional: true })) minVolume?: number,
    @Query('maxVolume', new ParseIntPipe({ optional: true })) maxVolume?: number
  ): Promise<AirdropStakingLeaderboardResponseDto> {
    return this.adminService.getAirdropPoolsStakingLeaderboard(page, limit, minVolume, maxVolume);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Post('airdrop-tokens')
  @ApiOperation({ summary: 'Create new airdrop token (Highest admin only)' })
  @ApiResponse({ status: 201, description: 'Airdrop token created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data or airdrop program already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can create airdrop tokens' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only highest admin role can create airdrop tokens' })
  async createAirdropToken(@Body() createAirdropTokenDto: CreateAirdropTokenDto, @Request() req) {
    return await this.airdropAdminService.createAirdropToken(createAirdropTokenDto, req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('airdrop-tokens')
  @ApiOperation({ summary: 'Get airdrop tokens list with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Airdrop tokens retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can view airdrop tokens' })
  async getAirdropTokens(@Query() getAirdropTokensDto: GetAirdropTokensDto) {
    return await this.airdropAdminService.getAirdropTokens(getAirdropTokensDto);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Post('airdrop-calculate')
  @ApiOperation({ summary: 'Calculate airdrop rewards for active tokens (Highest admin only)' })
  @ApiResponse({ status: 200, description: 'Airdrop rewards calculated successfully' })
  @ApiResponse({ status: 400, description: 'No active airdrop tokens found or invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can calculate airdrop rewards' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only highest admin role can calculate airdrop rewards' })
  async calculateAirdropRewards(@Body() airdropCalculateDto: AirdropCalculateDto, @Request() req) {
    return await this.airdropAdminService.calculateAirdropRewards(airdropCalculateDto, req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('airdrop-tokens/:id')
  @ApiOperation({ summary: 'Update airdrop token (Highest admin only)' })
  @ApiParam({
    name: 'id',
    description: 'ID of the airdrop token to update',
    example: 1
  })
  @ApiResponse({ status: 200, description: 'Airdrop token updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data or cannot update due to token status' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can update airdrop tokens' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only highest admin role can update airdrop tokens' })
  @ApiResponse({ status: 404, description: 'Airdrop token not found' })
  async updateAirdropToken(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAirdropTokenDto: UpdateAirdropTokenDto,
    @Request() req
  ) {
    return await this.airdropAdminService.updateAirdropToken(id, updateAirdropTokenDto, req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('airdrop-rewards')
  @ApiOperation({ summary: 'Get airdrop rewards with filtering and wallet information' })
  @ApiResponse({ status: 200, type: AirdropRewardsListResponseDto, description: 'Airdrop rewards retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page' })
  @ApiQuery({ name: 'token_mint', required: false, type: String, description: 'Filter by token mint address' })
  @ApiQuery({ name: 'alt_id', required: false, type: Number, description: 'Filter by token ID' })
  @ApiQuery({ name: 'status', required: false, enum: ['can_withdraw', 'withdrawn'], description: 'Filter by reward status' })
  @ApiQuery({ name: 'type', required: false, enum: ['1', '2'], description: 'Filter by reward type: 1 = TYPE_1 (volume-based), 2 = TYPE_2 (top pool)' })
  @ApiQuery({ name: 'sub_type', required: false, enum: ['leader_bonus', 'participation_share', 'top_pool_reward'], description: 'Filter by reward sub type: leader_bonus (10% Leader), participation_share (90% tham gia), top_pool_reward (TOP Pool)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by wallet address or email' })
  async getAirdropRewards(@Query() getAirdropRewardsDto: GetAirdropRewardsDto): Promise<AirdropRewardsListResponseDto> {
    return this.airdropAdminService.getAirdropRewards(getAirdropRewardsDto);
  }

  @Post('set-top-round')
  async setTopRound(@Body() setTopRoundDto: any, @Request() req) {
    return this.airdropAdminService.setTopRound(setTopRoundDto);
  }

  @Post('airdrop-withdraw-old')
  @ApiOperation({ summary: 'Process airdrop withdrawals for rewards with status can_withdraw' })
  @ApiResponse({ status: 200, description: 'Airdrop withdrawal process completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can process withdrawals' })
  @ApiResponse({ status: 500, description: 'Server error during withdrawal process' })
  async airdropWithdraw(@Request() req) {
    return this.airdropAdminService.processAirdropWithdraw();
  }

  @Post('airdrop-withdraw')
  @ApiOperation({ summary: 'Process airdrop withdrawals with batch optimization to minimize transaction fees' })
  @ApiResponse({ status: 200, description: 'Optimized airdrop withdrawal process completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can process withdrawals' })
  @ApiResponse({ status: 500, description: 'Server error during withdrawal process' })
  async airdropWithdrawOptimized(@Request() req) {
    return this.airdropAdminService.processAirdropWithdrawOptimized();
  }



  @Get('airdrop-withdraw/test-private-key')
  @UseGuards(JwtAuthAdminGuard)
  @ApiOperation({ summary: 'Test private key format for debugging' })
  @ApiResponse({ status: 200, description: 'Private key format analysis completed' })
  async testPrivateKeyFormat(@Request() req) {
    return this.airdropAdminService.testPrivateKeyFormat();
  }

  @Get('get-top-round')
  async getTopRound() {
    return this.airdropAdminService.getTopRound();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Post('airdrop-pools/send-mail-leaderboard')
  @ApiOperation({ summary: 'Send airdrop pools leaderboard email report' })
  @ApiResponse({ status: 200, description: 'Leaderboard email sent successfully', type: SendLeaderboardEmailResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can send leaderboard email' })
  @ApiResponse({ status: 500, description: 'Failed to send email' })
  async sendAirdropLeaderboardEmail(@Request() req: any): Promise<SendLeaderboardEmailResponseDto> {
    return this.adminService.sendAirdropLeaderboardEmail();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('airdrop-pools/scheduler-status')
  @ApiOperation({ summary: 'Get scheduler status and next run time' })
  @ApiResponse({ status: 200, description: 'Scheduler status retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can view scheduler status' })
  async getSchedulerStatus(@Request() req: any) {
    return this.adminService.getSchedulerStatus();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Post('airdrop-pools/test-scheduler')
  @ApiOperation({ summary: 'Test scheduler immediately (for debugging)' })
  @ApiResponse({ status: 200, description: 'Scheduler test completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can test scheduler' })
  async testScheduler(@Request() req: any) {
    return this.adminService.sendScheduledLeaderboardEmail();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('airdrop-pools/scheduler-lock-status')
  @ApiOperation({ summary: 'Get scheduler lock status to check if email is being sent' })
  @ApiResponse({ status: 200, description: 'Scheduler lock status retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can view lock status' })
  async getSchedulerLockStatus(@Request() req: any) {
    // Cần inject ScheduledTasksService vào AdminController
    return { message: 'Lock status endpoint - need to inject ScheduledTasksService' };
  }

  // ==================== BITTWORLD MANAGEMENT ====================

  @UseGuards(JwtAuthAdminGuard)
  @Post('bittworld-token')
  @ApiOperation({ summary: 'Create new Bittworld token (Admin only)' })
  @ApiResponse({ 
    status: 201, 
    description: 'Bittworld token created successfully', 
    type: CreateBittworldTokenResponseDto 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid input data or validation failed' 
  })
  @ApiResponse({ 
    status: 409, 
    description: 'Token with this address already exists' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Only admin can create tokens' 
  })
  async createBittworldToken(
    @Body() createTokenDto: CreateBittworldTokenDto,
    @Request() req: any
  ): Promise<CreateBittworldTokenResponseDto> {
    return await this.adminService.createBittworldToken(createTokenDto);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Put('bittworld-token/:id')
  @ApiOperation({ summary: 'Update existing Bittworld token (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'ID của token cần cập nhật',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Bittworld token updated successfully', 
    type: UpdateBittworldTokenResponseDto 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid input data or validation failed' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Token not found' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Only admin can update tokens' 
  })
  async updateBittworldToken(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTokenDto: UpdateBittworldTokenDto,
    @Request() req: any
  ): Promise<UpdateBittworldTokenResponseDto> {
    return await this.adminService.updateBittworldToken(id, updateTokenDto);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Delete('bittworld-token/:id')
  @ApiOperation({ summary: 'Delete Bittworld token (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'ID của token cần xóa',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Bittworld token deleted successfully', 
    type: DeleteBittworldTokenResponseDto 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Token not found' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Only admin can delete tokens' 
  })
  async deleteBittworldToken(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any
  ): Promise<DeleteBittworldTokenResponseDto> {
    return await this.adminService.deleteBittworldToken(id);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Post('bittworld-withdraw')
  @ApiOperation({ summary: 'Manually trigger Bittworld reward withdrawal (Admin only)' })
  @ApiResponse({ status: 200, description: 'Bittworld reward withdrawal process completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can trigger withdrawal' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only highest admin role can trigger withdrawal' })
  async triggerBittworldWithdraw(@Request() req: any): Promise<{
    success: boolean;
    message: string;
    processedRewards?: number;
    totalAmount?: number;
    timestamp: string;
  }> {
    return this.adminService.triggerBittworldWithdraw(req.user);
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('bittworld-rewards/statistics')
  @ApiOperation({ summary: 'Get Bittworld rewards statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Bittworld rewards statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can view statistics' })
  async getBittworldRewardsStats(): Promise<{
    overview: {
      totalRewards: number;
      totalAmountUSD: number;
      totalAmountSOL: number;
      pendingRewards: number;
      canWithdrawRewards: number;
      withdrawnRewards: number;
      averageRewardPerTransaction: number;
    };
  }> {
    return this.adminService.getBittworldRewardsStats();
  }

  @UseGuards(JwtAuthAdminGuard)
  @Get('bittworld-withdraws/history')
  @ApiOperation({ summary: 'Get Bittworld withdrawal history (Admin only)' })
  @ApiResponse({ status: 200, description: 'Bittworld withdrawal history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Only admin can view history' })
  async getBittworldWithdrawsHistory(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
    @Query('status') status?: 'pending' | 'success' | 'error' | 'cancel',
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
    @Query('search') search?: string
  ): Promise<{
    withdraws: Array<{
      bw_id: number;
      bw_reward_id: number;
      bw_amount_sol: number;
      bw_amount_usd: number;
      bw_address: string;
      bw_date: Date;
      bw_status: string;
      bw_tx_hash?: string;
      reward_info?: {
        br_id: number;
        br_amount_usd: number;
        br_date: Date;
      };
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    return this.adminService.getBittworldWithdrawsHistory(page, limit, status, fromDate, toDate, search);
  }
}
