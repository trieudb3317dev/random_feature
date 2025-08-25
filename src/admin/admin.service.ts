import { Injectable, NotFoundException, OnModuleInit, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SolanaListCategoriesToken, CategoryPrioritize, CategoryStatus } from '../solana/entities/solana-list-categories-token.entity';
import { CategoryResponseDto } from './dto/category-response.dto';
import { Setting } from './entities/setting.entity';
import { DEFAULT_SETTING, DEFAULT_USER_ADMIN, DEFAULT_REFERENT_SETTING, DEFAULT_REFERENT_LEVEL_REWARDS } from './constants';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserAdmin } from './entities/user-admin.entity';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { AdminRole } from './entities/user-admin.entity';
import { Response } from 'express';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { ReferentSetting } from '../referral/entities/referent-setting.entity';
import { TradingOrder } from '../trade/entities/trading-order.entity';
import { WalletReferent } from '../referral/entities/wallet-referent.entity';
import { ReferentLevelReward } from '../referral/entities/referent-level-rewards.entity';
import { BgRefService } from '../referral/bg-ref.service';
import { BgAffiliateNode } from '../referral/entities/bg-affiliate-node.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { SwapInvestors } from '../swaps/entities/swap-investor.entity';
import { CreateInvestorDto } from './dto/create-investor.dto';
import { PublicKey } from '@solana/web3.js';
import { SwapSettings } from '../swaps/entities/swap-setting.entity';
import { SwapInvestorReward } from '../swaps/entities/swap-investor-reward.entity';
import { SwapSettingDto, UpdateSwapSettingDto } from './dto/swap-setting.dto';
import { AirdropListPool, AirdropPoolStatus } from '../airdrops/entities/airdrop-list-pool.entity';
import { AirdropPoolJoin, AirdropPoolJoinStatus } from '../airdrops/entities/airdrop-pool-join.entity';
import { AirdropPoolResponseDto, AirdropPoolListResponseDto } from './dto/airdrop-pool-response.dto';
import { AirdropPoolStatsResponseDto } from './dto/airdrop-pool-stats-response.dto';
import { AirdropPoolDetailResponseDto, AirdropPoolTransactionDto, AirdropPoolMemberDto } from './dto/airdrop-pool-detail-response.dto';
import { AirdropStakingLeaderboardResponseDto } from './dto/airdrop-staking-leaderboard.dto';
import { BittworldsService } from '../bittworlds/services/bittworlds.service';
import { BittworldRewards } from '../bittworlds/entities/bittworld-rewards.entity';
import { BittworldWithdraw } from '../bittworlds/entities/bittworld-withdraws.entity';
import { BittworldToken } from '../bittworlds/entities/bittworld-token.entity';
import { SolanaTrackerService } from '../on-chain/solana-tracker.service';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { CreateBittworldTokenDto } from './dto/create-bittworld-token.dto';
import { BittworldTokenResponseDto, CreateBittworldTokenResponseDto } from './dto/bittworld-token-response.dto';
import { UpdateBittworldTokenDto } from './dto/update-bittworld-token.dto';
import { UpdateBittworldTokenResponseDto } from './dto/update-bittworld-token-response.dto';
import { DeleteBittworldTokenResponseDto } from './dto/delete-bittworld-token-response.dto';

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);
  
  constructor(
    @InjectRepository(UserAdmin)
    private userAdminRepository: Repository<UserAdmin>,
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
    @InjectRepository(SwapInvestors)
    private swapInvestorsRepository: Repository<SwapInvestors>,
    @InjectRepository(SwapSettings)
    private swapSettingsRepository: Repository<SwapSettings>,
    @InjectRepository(SwapInvestorReward)
    private swapInvestorRewardRepository: Repository<SwapInvestorReward>,
    private jwtService: JwtService,
    private bgRefService: BgRefService,
    @InjectRepository(SolanaListCategoriesToken)
    private categoriesRepository: Repository<SolanaListCategoriesToken>,
    @InjectRepository(ListWallet)
    private listWalletRepository: Repository<ListWallet>,
    @InjectRepository(ReferentSetting)
    private referentSettingRepository: Repository<ReferentSetting>,
    @InjectRepository(WalletReferent)
    private walletReferentRepository: Repository<WalletReferent>,
    @InjectRepository(TradingOrder)
    private tradingOrderRepository: Repository<TradingOrder>,
    @InjectRepository(ReferentLevelReward)
    private referentLevelRewardRepository: Repository<ReferentLevelReward>,
    @InjectRepository(AirdropListPool)
    private airdropListPoolRepository: Repository<AirdropListPool>,
    @InjectRepository(AirdropPoolJoin)
    private airdropPoolJoinRepository: Repository<AirdropPoolJoin>,
    private dataSource: DataSource,
    private bittworldsService: BittworldsService,
    @InjectRepository(BittworldRewards)
    private bittworldRewardsRepository: Repository<BittworldRewards>,
    @InjectRepository(BittworldWithdraw)
    private bittworldWithdrawRepository: Repository<BittworldWithdraw>,
    @InjectRepository(BittworldToken)
    private bittworldTokenRepository: Repository<BittworldToken>,
    private readonly solanaTrackerService: SolanaTrackerService,
    private readonly configService: ConfigService,
  ) {
    // Initialize swap settings on app start
    this.initializeSwapSettings();
  }

  async onModuleInit() {
    await this.initializeDefaultSetting();
    await this.initializeDefaultAdmin();
    await this.initializeDefaultReferentSetting();
    await this.initializeDefaultReferentLevelRewards();
    // Initialize swap settings when module starts
    await this.initializeSwapSettings();
  }

  private async initializeDefaultSetting() {
    const count = await this.settingRepository.count();
    
    if (count === 0) {
      // Nếu chưa có dữ liệu, tạo mới với giá trị mặc định
      const setting = new Setting();
      setting.appName = DEFAULT_SETTING.appName;
      setting.logo = DEFAULT_SETTING.logo;
      setting.telegramBot = DEFAULT_SETTING.telegramBot;
      await this.settingRepository.save(setting);
    } else if (count > 1) {
      // Nếu có nhiều hơn 1 bản ghi, xóa tất cả và tạo lại
      await this.settingRepository.clear();
      const setting = new Setting();
      setting.appName = DEFAULT_SETTING.appName;
      setting.logo = DEFAULT_SETTING.logo;
      setting.telegramBot = DEFAULT_SETTING.telegramBot;
      await this.settingRepository.save(setting);
    }
  }

  private async initializeDefaultAdmin() {
    const adminCount = await this.userAdminRepository.count();
    
    if (adminCount === 0) {
      const hashedPassword = await bcrypt.hash(DEFAULT_USER_ADMIN.password, 10);
      
      await this.userAdminRepository.save({
        username: DEFAULT_USER_ADMIN.username,
        email: DEFAULT_USER_ADMIN.email,
        password: hashedPassword,
        role: AdminRole.ADMIN
      });
    }
  }

  private async initializeDefaultReferentSetting() {
    const count = await this.referentSettingRepository.count();
    
    if (count === 0) {
      // If no settings exist, create one with default values
      const setting = new ReferentSetting();
      setting.rs_ref_level = DEFAULT_REFERENT_SETTING.rs_ref_level;
      await this.referentSettingRepository.save(setting);
    } else if (count > 1) {
      // If more than one setting exists, delete all and create a new one
      await this.referentSettingRepository.clear();
      const setting = new ReferentSetting();
      setting.rs_ref_level = DEFAULT_REFERENT_SETTING.rs_ref_level;
      await this.referentSettingRepository.save(setting);
    }
  }

  private async initializeDefaultReferentLevelRewards() {
    const count = await this.referentLevelRewardRepository.count();
    
    if (count === 0) {
      // Create rewards with unique IDs using the constant
      const rewards = DEFAULT_REFERENT_LEVEL_REWARDS.map((reward, index) => {
        const timestamp = new Date().getTime();
        const random = Math.floor(Math.random() * 1000);
        return {
          ...reward,
          rlr_id: timestamp % 10000 + random + index // Ensure unique IDs
        };
      });

      await this.referentLevelRewardRepository.save(rewards);
    } else if (count > DEFAULT_REFERENT_LEVEL_REWARDS.length) {
      // If more rewards exist than in the constant, delete all and create new ones
      await this.referentLevelRewardRepository.clear();
      await this.initializeDefaultReferentLevelRewards();
    }
  }

  async getSetting(): Promise<Setting> {
    const setting = await this.settingRepository.findOne({ where: {} });
    if (!setting) {
      throw new NotFoundException('Setting not found');
    }
    return setting;
  }

  async updateSetting(data: {
    appName?: string;
    logo?: string;
    telegramBot?: string;
  }): Promise<Setting> {
    const setting = await this.settingRepository.findOne({ where: {} });
    if (!setting) {
      throw new NotFoundException('Setting not found');
    }

    if (data.appName !== undefined) {
      setting.appName = data.appName;
    }
    if (data.logo !== undefined) {
      setting.logo = data.logo;
    }
    if (data.telegramBot !== undefined) {
      setting.telegramBot = data.telegramBot;
    }

    return this.settingRepository.save(setting);
  }

  async getAllCategories(
    page: number = 1,
    limit: number = 100,
    search?: string
  ): Promise<{ data: CategoryResponseDto[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    
    const queryBuilder = this.categoriesRepository.createQueryBuilder('category');

    if (search) {
      queryBuilder.where(
        '(category.slct_name ILIKE :search OR category.slct_slug ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    const [categories, total] = await queryBuilder
      .orderBy('category.slct_created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: categories,
      total,
      page,
      limit
    };
  }

  async createCategory(data: {
    slct_name: string;
    slct_slug?: string;
    slct_prioritize?: CategoryPrioritize;
    sltc_status?: CategoryStatus;
  }): Promise<CategoryResponseDto> {
    const category = this.categoriesRepository.create({
      slct_name: data.slct_name,
      slct_slug: data.slct_slug,
      slct_prioritize: data.slct_prioritize || CategoryPrioritize.NO,
      sltc_status: data.sltc_status || CategoryStatus.ACTIVE
    });

    return this.categoriesRepository.save(category);
  }

  async updateCategory(id: number, data: {
    slct_name?: string;
    slct_slug?: string;
    slct_prioritize?: CategoryPrioritize;
    sltc_status?: CategoryStatus;
  }): Promise<CategoryResponseDto> {
    const category = await this.categoriesRepository.findOne({ where: { slct_id: id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    if (data.slct_name !== undefined) {
      category.slct_name = data.slct_name;
    }
    if (data.slct_slug !== undefined) {
      category.slct_slug = data.slct_slug;
    }
    if (data.slct_prioritize !== undefined) {
      category.slct_prioritize = data.slct_prioritize;
    }
    if (data.sltc_status !== undefined) {
      category.sltc_status = data.sltc_status;
    }

    return this.categoriesRepository.save(category);
  }

  async deleteCategory(id: number): Promise<{ message: string }> {
    const category = await this.categoriesRepository.findOne({ where: { slct_id: id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    await this.categoriesRepository.remove(category);
    return { message: 'Category deleted successfully' };
  }

  async register(registerDto: RegisterDto): Promise<UserAdmin> {
    const { username, email, password, role } = registerDto;

    // Check if username or email already exists
    const existingUser = await this.userAdminRepository.findOne({
      where: [{ username }, { email }],
    });

    if (existingUser) {
      throw new ConflictException('Username or email already exists');
    }

    // If trying to register as ADMIN, check if admin already exists
    if (role === AdminRole.ADMIN) {
      const adminExists = await this.userAdminRepository.findOne({
        where: { role: AdminRole.ADMIN }
      });

      if (adminExists) {
        throw new ConflictException('Admin account already exists');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = this.userAdminRepository.create({
      username,
      email,
      password: hashedPassword,
      role,
    });

    return this.userAdminRepository.save(user);
  }

  async login(loginDto: LoginDto, response: Response): Promise<{ message: string }> {
    const { username, password } = loginDto;

    // Tìm user theo username hoặc email
    const user = await this.userAdminRepository.findOne({
      where: [
        { username },
        { email: username }
      ],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const payload = { 
      sub: user.id, 
      username: user.username,
      role: user.role 
    };
    const token = this.jwtService.sign(payload);

    // Set HTTP-only cookie
    response.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    return { message: 'Login successfully' };
  }

  async logout(response: Response): Promise<{ message: string }> {
    response.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none'
    });
    return { message: 'Logged out successfully' };
  }

  async validateUser(username: string): Promise<UserAdmin> {
    const user = await this.userAdminRepository.findOne({ where: { username } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async changePassword(username: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.userAdminRepository.findOne({ where: { username } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await this.userAdminRepository.save(user);

    return { message: 'Password changed successfully' };
  }

  async getListWallets(
    page: number = 1,
    limit: number = 100,
    search?: string,
    wallet_auth?: string,
    wallet_type?: 'main' | 'all',
    currentUser?: UserAdmin,
    isBittworld?: string,
    bittworld_uid?: string,
    bg_affiliate?: 'bg' | 'non_bg'
  ): Promise<{ data: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const skip = (page - 1) * limit;
    
    const queryBuilder = this.listWalletRepository.createQueryBuilder('wallet')
      .leftJoinAndSelect('wallet.wallet_auths', 'wallet_auths')
      .leftJoin('wallet_auths.wa_user', 'user_wallet')
      .select([
        'wallet.wallet_id',
        'wallet.wallet_solana_address',
        'wallet.wallet_eth_address',
        'wallet.wallet_auth',
        'wallet.wallet_stream',
        'wallet.wallet_status',
        'wallet.wallet_nick_name',
        'wallet.wallet_country',
        'wallet.wallet_code_ref',
        'wallet.isBittworld',
        'wallet.bittworld_uid',
        'wallet.referrer_bittworld_uid',
        'wallet_auths',
        'user_wallet.uw_id',
        'user_wallet.uw_email',
        'user_wallet.created_at'
      ]);

    // Build where conditions
    const whereConditions: string[] = [];
    const parameters: any = {};

    // Filter by isBittworld
    if (isBittworld !== undefined && isBittworld !== '') {
      const isBittworldBool = isBittworld.toLowerCase() === 'true';
      whereConditions.push('wallet.isBittworld = :isBittworld');
      parameters['isBittworld'] = isBittworldBool;
    }

    if (search) {
      whereConditions.push('(wallet.wallet_nick_name ILIKE :search OR CAST(wallet.wallet_id AS TEXT) ILIKE :search OR wallet.wallet_solana_address ILIKE :search OR wallet.bittworld_uid ILIKE :search OR user_wallet.uw_email ILIKE :search)');
      parameters['search'] = `%${search}%`;
    }

    if (wallet_auth) {
      whereConditions.push('wallet.wallet_auth = :wallet_auth');
      parameters['wallet_auth'] = wallet_auth;
    }

    // Filter by wallet type (main or all)
    if (wallet_type === 'main') {
      whereConditions.push('EXISTS (SELECT 1 FROM wallet_auth wa WHERE wa.wa_wallet_id = wallet.wallet_id AND wa.wa_type = \'main\')');
    }

    // Filter by bittworld_uid
    if (bittworld_uid !== undefined && bittworld_uid !== '') {
      if (bittworld_uid === 'has_uid') {
        // Những cái có bittworld_uid
        whereConditions.push('wallet.bittworld_uid IS NOT NULL AND wallet.bittworld_uid != \'\'');
      } else if (bittworld_uid === 'no_uid') {
        // Những cái không có bittworld_uid
        whereConditions.push('(wallet.bittworld_uid IS NULL OR wallet.bittworld_uid = \'\')');
      }
    }

    // Filter by BG affiliate status
    if (bg_affiliate) {
      if (bg_affiliate === 'bg') {
        // Chỉ lấy ví có trong BG affiliate system
        whereConditions.push('EXISTS (SELECT 1 FROM bg_affiliate_nodes ban WHERE ban.ban_wallet_id = wallet.wallet_id)');
      } else if (bg_affiliate === 'non_bg') {
        // Chỉ lấy ví không có trong BG affiliate system
        whereConditions.push('NOT EXISTS (SELECT 1 FROM bg_affiliate_nodes ban WHERE ban.ban_wallet_id = wallet.wallet_id)');
      }
      // Nếu bg_affiliate = 'all' hoặc giá trị khác, không thêm điều kiện lọc (lấy tất cả)
    }

    // Apply where conditions
    if (whereConditions.length > 0) {
      queryBuilder.where(whereConditions.join(' AND '), parameters);
    }

    const [wallets, total] = await queryBuilder
      .orderBy('user_wallet.created_at', 'DESC') // Sắp xếp theo ví mới nhất (ngày tạo user wallet mới nhất)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Transform wallets to include email
    const walletsWithEmail: any[] = wallets.map(wallet => {
      // Find the main wallet auth to get the associated user email
      const mainWalletAuth = wallet.wallet_auths?.find(auth => auth.wa_type === 'main');
      const userEmail = mainWalletAuth?.wa_user?.uw_email || null;
      
      return {
        ...wallet,
        email: userEmail
      };
    });

    return {
      data: walletsWithEmail,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async updateWalletAuth(id: number, wallet_auth: 'member' | 'master'): Promise<{ message: string }> {
    const wallet = await this.listWalletRepository.findOne({ where: { wallet_id: id } });
    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }

    wallet.wallet_auth = wallet_auth;
    await this.listWalletRepository.save(wallet);
    return { message: 'Wallet auth updated successfully' };
  }

  async getReferentSettings(): Promise<ReferentSetting> {
    const setting = await this.referentSettingRepository.findOne({
      where: {},
      order: {
        rs_id: 'DESC'
      }
    });

    if (!setting) {
      throw new NotFoundException('Referent setting not found');
    }

    return setting;
  }

  async updateReferentSettings(data: {
    rs_ref_level?: number;
  }): Promise<ReferentSetting> {
    const setting = await this.referentSettingRepository.findOne({
      where: {},
      order: {
        rs_id: 'DESC'
      }
    });

    if (!setting) {
      throw new NotFoundException('Referent setting not found');
    }

    if (data.rs_ref_level !== undefined) {
      // Xử lý max level theo yêu cầu
      let processedLevel = data.rs_ref_level;
      
      // Lấy trị tuyệt đối nếu là số âm
      if (processedLevel < 0) {
        processedLevel = Math.abs(processedLevel);
      }
      
      // Giới hạn tối đa = 7
      const MAX_REF_LEVEL = 7;
      if (processedLevel > MAX_REF_LEVEL) {
        processedLevel = MAX_REF_LEVEL;
      }
      
      // Đảm bảo tối thiểu = 1
      if (processedLevel < 1) {
        processedLevel = 1;
      }
      
      setting.rs_ref_level = processedLevel;
    }

    return this.referentSettingRepository.save(setting);
  }

  async getReferentLevelRewards(): Promise<ReferentLevelReward[]> {
    return this.referentLevelRewardRepository.find({
      order: {
        rlr_level: 'ASC'
      },
      take: 7
    });
  }

  async updateReferentLevelReward(id: number, percentage: number): Promise<ReferentLevelReward> {
    // Validate percentage
    if (percentage < 0 || percentage > 100) {
      throw new BadRequestException('Percentage must be between 0 and 100');
    }

    // Find the reward to update
    const reward = await this.referentLevelRewardRepository.findOne({
      where: { rlr_id: id }
    });

    if (!reward) {
      throw new NotFoundException(`Referent level reward with ID ${id} not found`);
    }

    // Get all rewards ordered by level
    const allRewards = await this.referentLevelRewardRepository.find({
      order: { rlr_level: 'ASC' }
    });

    // Find the index of current reward
    const currentIndex = allRewards.findIndex(r => r.rlr_id === id);

    // Check with previous level
    if (currentIndex > 0) {
      const previousReward = allRewards[currentIndex - 1];
      if (percentage >= previousReward.rlr_percentage) {
        throw new BadRequestException(
          `Percentage must be lower than previous level (${previousReward.rlr_level}: ${previousReward.rlr_percentage}%)`
        );
      }
    }

    // Check with next level
    if (currentIndex < allRewards.length - 1) {
      const nextReward = allRewards[currentIndex + 1];
      if (percentage <= nextReward.rlr_percentage) {
        throw new BadRequestException(
          `Percentage must be higher than next level (${nextReward.rlr_level}: ${nextReward.rlr_percentage}%)`
        );
      }
    }

    // Update the percentage
    reward.rlr_percentage = percentage;
    return this.referentLevelRewardRepository.save(reward);
  }

  async getWalletReferents(
    page: number = 1,
    limit: number = 100,
    search?: string
  ): Promise<{ data: WalletReferent[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    
    const queryBuilder = this.walletReferentRepository.createQueryBuilder('walletReferent')
      .leftJoinAndSelect('walletReferent.invitee', 'invitee')
      .leftJoinAndSelect('walletReferent.referent', 'referent')
      .leftJoinAndSelect('walletReferent.rewards', 'rewards')
      .select([
        'walletReferent',
        'invitee.wallet_id',
        'invitee.wallet_nick_name',
        'invitee.wallet_solana_address',
        'invitee.wallet_eth_address',
        'referent.wallet_id',
        'referent.wallet_nick_name',
        'referent.wallet_solana_address',
        'referent.wallet_eth_address',
        'rewards'
      ]);

    if (search) {
      queryBuilder.where(
        '(invitee.wallet_nick_name ILIKE :search OR ' +
        'referent.wallet_nick_name ILIKE :search OR ' +
        'CAST(walletReferent.wr_id AS TEXT) ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    const [referents, total] = await queryBuilder
      .orderBy('walletReferent.wr_id', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: referents,
      total,
      page,
      limit
    };
  }


  async getOrderHistory(page?: number, limit?: number, search?: string, status?: string, isBittworld?: string) {
    const qb = this.tradingOrderRepository.createQueryBuilder('o')
      .leftJoinAndSelect('o.wallet', 'wallet');

    // Tìm kiếm
    if (search) {
      qb.andWhere('(' +
        'o.order_id::text ILIKE :search OR ' +
        'o.order_token_name ILIKE :search OR ' +
        'o.order_token_address ILIKE :search OR ' +
        'wallet.wallet_solana_address ILIKE :search' +
      ')', { search: `%${search}%` });
    }

    // Lọc theo status, mặc định chỉ lấy executed
    if (status) {
      qb.andWhere('o.order_status = :status', { status });
    } else {
      qb.andWhere('o.order_status = :status', { status: 'executed' });
    }

    // Lọc theo isBittworld
    if (isBittworld !== undefined && isBittworld !== null) {
      const isBittworldBool = isBittworld === 'true' || isBittworld === '1';
      qb.andWhere('wallet.isBittworld = :isBittworld', { isBittworld: isBittworldBool });
    }

    // Phân trang
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 50;
    const offset = (pageNum - 1) * limitNum;
    qb.orderBy('o.order_created_at', 'DESC')
      .skip(offset)
      .take(limitNum);

    const [orders, total] = await qb.getManyAndCount();
    
    // Get unique token addresses from orders
    const uniqueTokenAddresses = [...new Set(orders
      .map(order => order.order_token_address)
      .filter(address => address))];

    // Get token info from Solana Tracker
    let trackerTokensData: any[] = [];
    if (uniqueTokenAddresses.length > 0) {
      try {
        const trackerResponse = await this.solanaTrackerService.getMultiTokensData(uniqueTokenAddresses);
        if (trackerResponse.success && trackerResponse.data) {
          trackerTokensData = trackerResponse.data;
        }
      } catch (error) {
        console.error('Error fetching from Solana Tracker:', error.message);
      }
    }

    const data = orders.map(order => {
      // Try to get token info from Solana Tracker
      const trackerToken = trackerTokensData.find((t: any) => t.address === order.order_token_address);
      
      // Determine token name - prioritize Solana Tracker data
      let tokenName = order.order_token_name;
      if (!tokenName || tokenName === 'Unknown Token' || tokenName === 'UNKNOWN') {
        if (trackerToken && (trackerToken.name || trackerToken.symbol)) {
          tokenName = trackerToken.name || trackerToken.symbol;
        } else if (order.order_token_address) {
          // Generate fallback name from address
          tokenName = `Token_${order.order_token_address.slice(0, 8)}`;
        }
      }

      return {
        order_id: order.order_id,
        walletId: order.order_wallet_id,
        solAddress: order.wallet?.wallet_solana_address || null,
        isBittworld: order.wallet?.isBittworld || false,
        bittworldUid: order.wallet?.isBittworld ? order.wallet?.bittworld_uid || null : null,
        order_trade_type: order.order_trade_type,
        order_token_address: order.order_token_address,
        order_token_name: tokenName,
        order_qlty: order.order_qlty,
        order_price: order.order_price,
        order_total_value: order.order_total_value,
        order_type: order.order_type,
        order_status: order.order_status,
        order_tx_hash: order.order_tx_hash,
        order_error_message: order.order_error_message,
        order_created_at: order.order_created_at,
        order_executed_at: order.order_executed_at
      };
    });
    
    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  async getOrderStats() {
    // Tổng số order
    const total = await this.tradingOrderRepository.count();
    // Tổng số order thành công
    const executed = await this.tradingOrderRepository.count({ where: { order_status: 'executed' } });
    // Ví giao dịch nhiều nhất
    const most = await this.tradingOrderRepository
      .createQueryBuilder('o')
      .select('o.order_wallet_id', 'walletId')
      .addSelect('COUNT(*)', 'orderCount')
      .leftJoin('o.wallet', 'wallet')
      .addSelect('wallet.wallet_solana_address', 'solAddress')
      .groupBy('o.order_wallet_id')
      .addGroupBy('wallet.wallet_solana_address')
      .orderBy('COUNT(*)', 'DESC')
      .limit(1)
      .getRawOne();
    return {
      total,
      executed,
      mostActiveWallet: most ? {
        walletId: Number(most.walletId),
        solAddress: most.solAddress,
        orderCount: Number(most.orderCount)
      } : null
    };
  }

  async getWalletStats() {
    const totalWallets = await this.listWalletRepository.count();
    return { totalWallets };
  }

  /**
   * Tạo BG affiliate mới
   */
  async createBgAffiliate(data: {
    walletId: number;
    totalCommissionPercent: number;
    batAlias: string;
  }, currentUser?: UserAdmin): Promise<{ message: string; treeId: number; totalCommissionPercent: number; batAlias: string }> {
    // Kiểm tra wallet có tồn tại không
    const wallet = await this.listWalletRepository.findOne({
      where: { wallet_id: data.walletId }
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${data.walletId} does not exist`);
    }

    // Check PARTNER role - only allow creating BG affiliate for wallets with isBittworld = true
    if (currentUser && currentUser.role === AdminRole.PARTNER) {
      if (!wallet.isBittworld) {
        throw new BadRequestException('PARTNER role can only create BG affiliate for wallets with isBittworld = true');
      }
    }

    // Check if wallet already has an affiliate tree (already a root BG)
    const existingTree = await this.bgRefService.getWalletBgAffiliateInfo(data.walletId);
    if (existingTree) {
      throw new BadRequestException('Wallet already has a BG affiliate tree, cannot create another one');
    }

    // Check if wallet belongs to another BG affiliate system
    const isInBgAffiliateSystem = await this.bgRefService.isWalletInBgAffiliateSystem(data.walletId);
    if (isInBgAffiliateSystem) {
      throw new BadRequestException('Wallet already belongs to another BG affiliate system, cannot grant BG permission');
    }

    // Check if commission percent is valid
    if (data.totalCommissionPercent < 0 || data.totalCommissionPercent > 100) {
      throw new BadRequestException('Commission percent must be between 0 and 100');
    }

    // Check if bat_alias is not empty
    if (!data.batAlias || data.batAlias.trim() === '') {
      throw new BadRequestException('batAlias cannot be empty');
    }

    // Tạo cây affiliate mới
    const tree = await this.bgRefService.createAffiliateTree(
      data.walletId,
      data.totalCommissionPercent,
      data.batAlias
    );

    return {
      message: 'BG affiliate created successfully',
      treeId: tree.bat_id,
      totalCommissionPercent: data.totalCommissionPercent,
      batAlias: tree.bat_alias
    };
  }

  /**
   * Admin cập nhật hoa hồng của root BG
   * Chỉ có thể cập nhật root BG và phải đảm bảo không ảnh hưởng đến tuyến dưới
   */
  async updateBgAffiliateCommission(data: {
    rootWalletId?: number;
    treeId?: number;
    newPercent: number;
    batAlias?: string;
  }, currentUser?: UserAdmin): Promise<{ 
    success: boolean;
    message: string;
    oldPercent: number;
    newPercent: number;
    minRequiredPercent: number | null;
    treeInfo: any;
  }> {
    // Check PARTNER role - only allow updating commission for wallets with isBittworld = true
    if (currentUser && currentUser.role === AdminRole.PARTNER) {
      let walletId: number;
      
      if (data.rootWalletId) {
        walletId = data.rootWalletId;
      } else if (data.treeId) {
        // Get root wallet ID from tree
        const tree = await this.bgRefService['bgAffiliateTreeRepository'].findOne({
          where: { bat_id: data.treeId }
        });
        if (!tree) {
          throw new NotFoundException('BG affiliate tree not found');
        }
        walletId = tree.bat_root_wallet_id;
      } else {
        throw new BadRequestException('Must provide rootWalletId or treeId');
      }

      // Check if wallet is Bittworld
      const wallet = await this.listWalletRepository.findOne({
        where: { wallet_id: walletId }
      });
      
      if (!wallet || !wallet.isBittworld) {
        throw new BadRequestException('PARTNER role can only update commission for wallets with isBittworld = true');
      }
    }

    // Update commission
    let result;
    if (data.rootWalletId) {
      result = await this.bgRefService.adminUpdateRootBgCommission(data.rootWalletId, data.newPercent);
    } else if (data.treeId) {
      result = await this.bgRefService.adminUpdateRootBgCommissionByTreeId(data.treeId, data.newPercent);
    } else {
      throw new BadRequestException('Must provide rootWalletId or treeId');
    }

    // Cập nhật alias nếu có
    if (data.batAlias) {
      const treeId = data.treeId || result.treeInfo.treeId;
      const tree = await this.bgRefService['bgAffiliateTreeRepository'].findOne({
        where: { bat_id: treeId }
      });
      if (tree) {
        // Cập nhật bat_alias trong bg_affiliate_trees
        tree.bat_alias = data.batAlias.trim();
        await this.bgRefService['bgAffiliateTreeRepository'].save(tree);
        result.treeInfo.bat_alias = tree.bat_alias;

        // Cập nhật bg_alias trong bg_affiliate_nodes (root node)
        const rootNode = await this.bgRefService['bgAffiliateNodeRepository'].findOne({
          where: { ban_wallet_id: tree.bat_root_wallet_id, ban_tree_id: treeId }
        });
        if (rootNode) {
          rootNode.bg_alias = data.batAlias.trim();
          await this.bgRefService['bgAffiliateNodeRepository'].save(rootNode);
        }
      }
    }

    return result;
  }

  /**
   * Lấy danh sách tất cả BG affiliate trees
   */
  async getAllBgAffiliateTrees(currentUser?: UserAdmin, isBittworld?: 'true' | 'false'): Promise<any[]> {
    const trees = await this.bgRefService.getAllBgAffiliateTrees();
    
    // Format dữ liệu để trả về với thông tin wallet
    let treesWithWalletInfo = await Promise.all(
      trees.map(async (tree) => {
        // Lấy thông tin root wallet
        const rootWallet = await this.listWalletRepository.findOne({
          where: { wallet_id: tree.bat_root_wallet_id },
          select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address', 'isBittworld', 'bittworld_uid']
        });

        // Tìm root node để lấy status
        const rootNode = tree.nodes?.find(node => node.ban_wallet_id === tree.bat_root_wallet_id);

        // Xây dựng cấu trúc cây để đếm total members
        const treeStructure = await this.buildHierarchicalTree(tree.bat_root_wallet_id, tree.nodes || []);

        return {
          treeId: tree.bat_id,
          rootWallet: rootWallet ? {
            walletId: rootWallet.wallet_id,
            solanaAddress: rootWallet.wallet_solana_address,
            nickName: rootWallet.wallet_nick_name,
            ethAddress: rootWallet.wallet_eth_address,
            isBittworld: rootWallet.isBittworld,
            bittworldUid: rootWallet.isBittworld ? rootWallet.bittworld_uid || null : null
          } : null,
          totalCommissionPercent: tree.bat_total_commission_percent,
          batAlias: tree.bat_alias,
          createdAt: tree.bat_created_at,
          nodeCount: tree.nodes?.length || 0,
          totalMembers: this.countTotalMembers(treeStructure),
          status: rootNode ? rootNode.ban_status : true
        };
      })
    );

    // Filter theo isBittworld nếu có
    if (isBittworld !== undefined) {
      const filterValue = isBittworld === 'true';
      treesWithWalletInfo = treesWithWalletInfo.filter(tree => 
        tree.rootWallet && tree.rootWallet.isBittworld === filterValue
      );
    }
    
    return treesWithWalletInfo;
  }

  /**
   * Lấy thông tin chi tiết BG affiliate tree theo wallet ID
   */
  async getBgAffiliateTreeByWallet(walletId: number): Promise<any> {
    // Kiểm tra wallet có tồn tại không
    const wallet = await this.listWalletRepository.findOne({
      where: { wallet_id: walletId }
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet với ID ${walletId} không tồn tại`);
    }

    // Lấy thông tin BG affiliate của wallet
    const bgAffiliateInfo = await this.bgRefService.getWalletBgAffiliateInfo(walletId);
    if (!bgAffiliateInfo) {
      throw new BadRequestException('Wallet không thuộc hệ thống BG affiliate');
    }

    // Lấy thông tin cây
    const tree = await this.bgRefService.getAffiliateTree(bgAffiliateInfo.treeId);
    
    // Lấy tất cả nodes trong cây (bao gồm cả status)
    const allNodes = await this.bgRefService['bgAffiliateNodeRepository'].find({
      where: { ban_tree_id: bgAffiliateInfo.treeId },
      order: { ban_effective_from: 'ASC' }
    });

    // Kiểm tra xem wallet có phải là root BG không
    const isRootBg = bgAffiliateInfo.parentWalletId === null;

    if (isRootBg) {
      // Nếu là root BG, lấy tất cả tuyến dưới
      return await this.getRootBgTreeStructure(walletId, tree, allNodes);
    } else {
      // Nếu là ví thường, lấy thông tin ví giới thiệu và tuyến dưới
      return await this.getMemberTreeStructure(walletId, bgAffiliateInfo, tree, allNodes);
    }
  }

  /**
   * Lấy cấu trúc cây cho root BG
   */
  private async getRootBgTreeStructure(rootWalletId: number, tree: any, allNodes: any[]): Promise<any> {
    // Lấy thông tin root wallet
    const rootWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: rootWalletId },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address', 'isBittworld', 'bittworld_uid']
    });

    // Tìm root node để lấy status
    const rootNode = allNodes.find(node => node.ban_wallet_id === rootWalletId);

    // Tạo cấu trúc cây phân theo nhánh
    const treeStructure = await this.buildHierarchicalTree(rootWalletId, allNodes);

    return {
      walletType: 'root_bg',
      currentWallet: rootWallet ? {
        walletId: rootWallet.wallet_id,
        solanaAddress: rootWallet.wallet_solana_address,
        nickName: rootWallet.wallet_nick_name,
        ethAddress: rootWallet.wallet_eth_address,
        isBittworld: rootWallet.isBittworld,
        bittworldUid: rootWallet.isBittworld ? rootWallet.bittworld_uid || null : null,
        status: rootNode ? rootNode.ban_status : true
      } : null,
      treeInfo: {
        treeId: tree.bat_id,
        totalCommissionPercent: tree.bat_total_commission_percent,
        batAlias: tree.bat_alias,
        createdAt: tree.bat_created_at
      },
      downlineStructure: treeStructure,
      totalMembers: this.countTotalMembers(treeStructure),
      activeMembers: this.countActiveMembers(treeStructure)
    };
  }

  /**
   * Lấy cấu trúc cây cho member thường
   */
  private async getMemberTreeStructure(memberWalletId: number, bgAffiliateInfo: any, tree: any, allNodes: any[]): Promise<any> {
    // Lấy thông tin member wallet
    const memberWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: memberWalletId },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address', 'isBittworld', 'bittworld_uid']
    });

    // Tìm member node để lấy status
    const memberNode = allNodes.find(node => node.ban_wallet_id === memberWalletId);

    // Lấy thông tin ví giới thiệu (parent)
    let referrerWallet: any = null;
    let referrerNode: any = null;
    if (bgAffiliateInfo.parentWalletId) {
      referrerWallet = await this.listWalletRepository.findOne({
        where: { wallet_id: bgAffiliateInfo.parentWalletId },
        select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address', 'isBittworld', 'bittworld_uid']
      });
      referrerNode = allNodes.find(node => node.ban_wallet_id === bgAffiliateInfo.parentWalletId);
    }

    // Tạo cấu trúc cây phân theo nhánh cho tuyến dưới của member
    const downlineStructure = await this.buildHierarchicalTree(memberWalletId, allNodes);

    return {
      walletType: 'member',
      currentWallet: memberWallet ? {
        walletId: memberWallet.wallet_id,
        solanaAddress: memberWallet.wallet_solana_address,
        nickName: memberWallet.wallet_nick_name,
        ethAddress: memberWallet.wallet_eth_address,
        isBittworld: memberWallet.isBittworld,
        bittworldUid: memberWallet.isBittworld ? memberWallet.bittworld_uid || null : null,
        status: memberNode ? memberNode.ban_status : true
      } : null,
      referrerInfo: referrerWallet ? {
        walletId: referrerWallet.wallet_id,
        solanaAddress: referrerWallet.wallet_solana_address,
        nickName: referrerWallet.wallet_nick_name,
        ethAddress: referrerWallet.wallet_eth_address,
        isBittworld: referrerWallet.isBittworld,
        bittworldUid: referrerWallet.isBittworld ? referrerWallet.bittworld_uid || null : null,
        commissionPercent: bgAffiliateInfo.commissionPercent,
        level: bgAffiliateInfo.level,
        status: referrerNode ? referrerNode.ban_status : true
      } : null,
      treeInfo: {
        treeId: tree.bat_id,
        totalCommissionPercent: tree.bat_total_commission_percent,
        batAlias: tree.bat_alias,
        createdAt: tree.bat_created_at
      },
      downlineStructure: downlineStructure,
      totalMembers: this.countTotalMembers(downlineStructure),
      activeMembers: this.countActiveMembers(downlineStructure)
    };
  }

  /**
   * Xây dựng cấu trúc cây phân theo nhánh
   */
  private async buildHierarchicalTree(parentWalletId: number, allNodes: any[]): Promise<any[]> {
    const children = allNodes.filter(node => node.ban_parent_wallet_id === parentWalletId);
    
    if (children.length === 0) {
      return [];
    }

    const hierarchicalStructure: any[] = [];

    for (const child of children) {
      // Lấy thông tin wallet
      const wallet = await this.listWalletRepository.findOne({
        where: { wallet_id: child.ban_wallet_id },
        select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address']
      });

      // Lấy thống kê cho node này
      const nodeStats = await this.getNodeStats(child.ban_wallet_id);

      const childNode = {
        nodeId: child.ban_id,
        walletId: child.ban_wallet_id,
        commissionPercent: child.ban_commission_percent,
        status: child.ban_status,
        effectiveFrom: child.ban_effective_from,
        totalVolume: nodeStats.totalVolume,
        totalTrans: nodeStats.totalTrans,
        walletInfo: wallet ? {
          nickName: wallet.wallet_nick_name,
          solanaAddress: wallet.wallet_solana_address,
          ethAddress: wallet.wallet_eth_address
        } : null,
        children: await this.buildHierarchicalTree(child.ban_wallet_id, allNodes)
      };

      hierarchicalStructure.push(childNode);
    }

    return hierarchicalStructure;
  }

  /**
   * Đếm tổng số thành viên trong cấu trúc cây
   */
  private countTotalMembers(treeStructure: any[]): number {
    let count = 0;
    
    for (const node of treeStructure) {
      count += 1; // Đếm node hiện tại
      count += this.countTotalMembers(node.children); // Đếm các node con
    }
    
    return count;
  }

  /**
   * Đếm số thành viên active trong cấu trúc cây
   */
  private countActiveMembers(treeStructure: any[]): number {
    let count = 0;
    
    for (const node of treeStructure) {
      if (node.status === true) {
        count += 1; // Đếm node active hiện tại
      }
      count += this.countActiveMembers(node.children); // Đếm các node con active
    }
    
    return count;
  }

  /**
   * Lấy thống kê cho một node
   */
  private async getNodeStats(nodeWalletId: number): Promise<{
    totalVolume: number;
    totalTrans: number;
  }> {
    // Lấy tổng khối lượng giao dịch và số giao dịch của node
    const volumeStats = await this.dataSource.createQueryBuilder()
      .select('COALESCE(SUM(orders.order_total_value), 0)', 'totalVolume')
      .addSelect('COUNT(orders.order_id)', 'totalTrans')
      .from('trading_orders', 'orders')
      .where('orders.order_wallet_id = :walletId', { walletId: nodeWalletId })
      .getRawOne();

    return {
      totalVolume: parseFloat(volumeStats?.totalVolume || '0'),
      totalTrans: parseInt(volumeStats?.totalTrans || '0')
    };
  }

  /**
   * Lấy thông tin chi tiết BG affiliate tree (giữ lại để tương thích)
   */
  async getBgAffiliateTreeDetail(treeId: number): Promise<any> {
    const tree = await this.bgRefService.getAffiliateTree(treeId);
    if (!tree) {
      throw new NotFoundException('Cây affiliate không tồn tại');
    }

    // Lấy thông tin chi tiết của từng node (chỉ lấy nodes active)
    const nodesWithDetails = await Promise.all(
      tree.nodes.filter(node => node.ban_status).map(async (node) => {
        const wallet = await this.listWalletRepository.findOne({
          where: { wallet_id: node.ban_wallet_id }
        });

        return {
          nodeId: node.ban_id,
          walletId: node.ban_wallet_id,
          parentWalletId: node.ban_parent_wallet_id,
          commissionPercent: node.ban_commission_percent,
          status: node.ban_status,
          effectiveFrom: node.ban_effective_from,
          walletInfo: wallet ? {
            nickName: wallet.wallet_nick_name,
            solanaAddress: wallet.wallet_solana_address,
            ethAddress: wallet.wallet_eth_address
          } : null
        };
      })
    );

    // Lấy thông tin root wallet
    const rootWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: tree.bat_root_wallet_id },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address']
    });

    return {
      treeId: tree.bat_id,
      rootWallet: rootWallet ? {
        walletId: rootWallet.wallet_id,
        solanaAddress: rootWallet.wallet_solana_address,
        nickName: rootWallet.wallet_nick_name,
        ethAddress: rootWallet.wallet_eth_address
      } : null,
      totalCommissionPercent: tree.bat_total_commission_percent,
      createdAt: tree.bat_created_at,
      nodes: nodesWithDetails
    };
  }

  /**
   * Lấy thống kê BG affiliate của wallet
   */
  async getWalletBgAffiliateStats(walletId: number): Promise<any> {
    return await this.bgRefService.getWalletBgAffiliateStats(walletId);
  }

  /**
   * Lấy thống kê tổng quan BG affiliate - tập trung vào phần thưởng
   */
  async getBgAffiliateOverview(): Promise<{
    totalTrees: number;
    totalMembers: number;
    totalCommissionDistributed: number;
    totalVolume: number;
    topEarners: Array<{
      walletId: number;
      nickName: string;
      solanaAddress: string;
      totalEarned: number;
    }>;
  }> {
    // Lấy tất cả trees
    const allTrees = await this.bgRefService.getAllBgAffiliateTrees();
    
    // Lấy tất cả commission rewards
    const allRewards = await this.bgRefService['bgAffiliateCommissionRewardRepository'].find();

    // Lấy tất cả nodes để đếm members
    const allNodes = await this.bgRefService['bgAffiliateNodeRepository'].find();
    const totalMembers = allNodes.filter(node => node.ban_parent_wallet_id !== null).length;

    // Tính tổng commission đã phân phối
    const totalCommissionDistributed = allRewards.reduce((sum, reward) => 
      sum + Number(reward.bacr_commission_amount), 0
    );

    // Tính tổng volume từ trading_orders
    const volumeStats = await this.dataSource.createQueryBuilder()
      .select('COALESCE(SUM(orders.order_total_value), 0)', 'totalVolume')
      .from('trading_orders', 'orders')
      .getRawOne();

    const totalVolume = parseFloat(volumeStats?.totalVolume || '0');

    // Tính top earners
    const walletEarnings = new Map();
    
    allRewards.forEach(reward => {
      const currentEarning = walletEarnings.get(reward.bacr_wallet_id) || 0;
      walletEarnings.set(reward.bacr_wallet_id, currentEarning + Number(reward.bacr_commission_amount));
    });

    const topEarners = await Promise.all(
      Array.from(walletEarnings.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(async ([walletId, totalEarned]) => {
          const wallet = await this.listWalletRepository.findOne({
            where: { wallet_id: walletId },
            select: ['wallet_id', 'wallet_nick_name', 'wallet_solana_address']
          });

          return {
            walletId: walletId,
            nickName: wallet?.wallet_nick_name || '',
            solanaAddress: wallet?.wallet_solana_address || '',
            totalEarned: Number(totalEarned.toFixed(5))
          };
        })
    );

    return {
      totalTrees: allTrees.length,
      totalMembers,
      totalCommissionDistributed: Number(totalCommissionDistributed.toFixed(5)),
      totalVolume: Number(totalVolume.toFixed(2)),
      topEarners
    };
  }

  /**
   * Lấy thống kê tổng quan cho dashboard
   */
  async getDashboardStatistics(): Promise<{
    wallets: {
      totalWallets: number;
      activeWallets: number;
      newWalletsToday: number;
      newWalletsThisWeek: number;
    };
    orders: {
      totalOrders: number;
      executedOrders: number;
      pendingOrders: number;
      totalVolume: number;
      averageOrderValue: number;
      mostActiveWallet: {
        walletId: number;
        nickName: string;
        solanaAddress: string;
        orderCount: number;
      } | null;
    };
    referrals: {
      traditionalReferrals: {
        totalRelations: number;
        totalRewards: number;
        totalWallets: number;
        totalVolume: number;
        averageRewardPerWallet: number;
      };
      bgAffiliate: {
        totalTrees: number;
        totalMembers: number;
        totalCommissionDistributed: number;
        totalVolume: number;
      };
    };
  }> {
    // ==================== WALLET STATISTICS ====================
    const totalWallets = await this.listWalletRepository.count();
    
    const activeWallets = await this.listWalletRepository.count({
      where: { wallet_status: true }
    });

    // Tính ví mới hôm nay và tuần này (giả định dựa trên wallet_id)
    // Vì không có timestamp, tạm thời đặt là 0
    const newWalletsToday = 0;
    const newWalletsThisWeek = 0;

    // ==================== ORDER STATISTICS ====================
    const totalOrders = await this.tradingOrderRepository.count();
    const executedOrders = await this.tradingOrderRepository.count({
      where: { order_status: 'executed' }
    });
    const pendingOrders = await this.tradingOrderRepository.count({
      where: { order_status: 'pending' }
    });

    // Tính tổng volume và average order value
    const orderStats = await this.dataSource.createQueryBuilder()
      .select('COALESCE(SUM(orders.order_total_value), 0)', 'totalVolume')
      .addSelect('COALESCE(AVG(orders.order_total_value), 0)', 'averageValue')
      .from('trading_orders', 'orders')
      .where('orders.order_status = :status', { status: 'executed' })
      .getRawOne();

    const totalVolume = parseFloat(orderStats?.totalVolume || '0');
    const averageOrderValue = parseFloat(orderStats?.averageValue || '0');

    // Tìm ví giao dịch nhiều nhất
    const mostActiveWallet = await this.tradingOrderRepository
      .createQueryBuilder('o')
      .select('o.order_wallet_id', 'walletId')
      .addSelect('COUNT(*)', 'orderCount')
      .leftJoin('o.wallet', 'wallet')
      .addSelect('wallet.wallet_nick_name', 'nickName')
      .addSelect('wallet.wallet_solana_address', 'solanaAddress')
      .groupBy('o.order_wallet_id')
      .addGroupBy('wallet.wallet_nick_name')
      .addGroupBy('wallet.wallet_solana_address')
      .orderBy('COUNT(*)', 'DESC')
      .limit(1)
      .getRawOne();

    // ==================== REFERRAL STATISTICS ====================
    
    // Traditional Referral Stats - sử dụng logic giống hệt getTraditionalReferralStatistics
    const traditionalReferrals = await this.walletReferentRepository.find({
      relations: ['invitee', 'referent', 'rewards']
    });

    const uniqueTraditionalWallets = new Set();
    const walletStats = new Map();

    traditionalReferrals.forEach(referral => {
      const inviteeId = referral.invitee.wallet_id;
      const referentId = referral.referent.wallet_id;
      
      uniqueTraditionalWallets.add(inviteeId);
      uniqueTraditionalWallets.add(referentId);

      // Tính reward cho referral này
      const referralReward = (referral.rewards || []).reduce((sum, reward) => {
        return sum + (parseFloat(String(reward.wrr_use_reward)) || 0);
      }, 0);

      // Cập nhật thống kê theo wallet
      if (!walletStats.has(inviteeId)) {
        walletStats.set(inviteeId, {
          walletId: inviteeId,
          totalInviteeReward: 0,
          totalReferrerReward: 0
        });
      }

      if (!walletStats.has(referentId)) {
        walletStats.set(referentId, {
          walletId: referentId,
          totalInviteeReward: 0,
          totalReferrerReward: 0
        });
      }

      const inviteeWallet = walletStats.get(inviteeId);
      const referentWallet = walletStats.get(referentId);

      // Cập nhật thống kê wallet
      inviteeWallet.totalInviteeReward += referralReward;
      referentWallet.totalReferrerReward += referralReward;
    });

    // Tính tổng phần thưởng của tất cả ví (giống hệt getTraditionalReferralStatistics)
    const walletArray = Array.from(walletStats.values());
    const totalTraditionalRewards = walletArray.reduce((sum, wallet) => {
      return sum + wallet.totalInviteeReward + wallet.totalReferrerReward;
    }, 0);

    // BG Affiliate Stats
    const bgAffiliateOverview = await this.getBgAffiliateOverview();

    // Tính volume cho traditional referrals
    const traditionalWalletsArray = Array.from(uniqueTraditionalWallets);
    let traditionalVolume = 0;
    
    if (traditionalWalletsArray.length > 0) {
      const traditionalVolumeStats = await this.dataSource.createQueryBuilder()
        .select('COALESCE(SUM(orders.order_total_value), 0)', 'totalVolume')
        .from('trading_orders', 'orders')
        .where('orders.order_wallet_id IN (:...walletIds)', { 
          walletIds: traditionalWalletsArray 
        })
        .andWhere('orders.order_status = :status', { status: 'executed' })
        .getRawOne();

      traditionalVolume = parseFloat(traditionalVolumeStats?.totalVolume || '0');
    }

    return {
      wallets: {
        totalWallets,
        activeWallets,
        newWalletsToday,
        newWalletsThisWeek
      },
      orders: {
        totalOrders,
        executedOrders,
        pendingOrders,
        totalVolume: Number(totalVolume.toFixed(2)),
        averageOrderValue: Number(averageOrderValue.toFixed(2)),
        mostActiveWallet: mostActiveWallet ? {
          walletId: Number(mostActiveWallet.walletId),
          nickName: mostActiveWallet.nickName || '',
          solanaAddress: mostActiveWallet.solanaAddress || '',
          orderCount: Number(mostActiveWallet.orderCount)
        } : null
      },
      referrals: {
        traditionalReferrals: {
          totalRelations: traditionalReferrals.length,
          totalRewards: Number(totalTraditionalRewards.toFixed(5)),
          totalWallets: uniqueTraditionalWallets.size,
          totalVolume: Number(traditionalVolume.toFixed(2)),
          averageRewardPerWallet: uniqueTraditionalWallets.size > 0 
            ? Number((totalTraditionalRewards / uniqueTraditionalWallets.size).toFixed(5)) 
            : 0
        },
        bgAffiliate: {
          totalTrees: bgAffiliateOverview.totalTrees,
          totalMembers: bgAffiliateOverview.totalMembers,
          totalCommissionDistributed: bgAffiliateOverview.totalCommissionDistributed,
          totalVolume: bgAffiliateOverview.totalVolume
        }
      }
    };
  }

  /**
   * Lấy thông tin wallet
   */
  async getWalletInfo(walletId: number): Promise<any> {
    const wallet = await this.listWalletRepository.findOne({
      where: { wallet_id: walletId }
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet với ID ${walletId} không tồn tại`);
    }

    return {
      walletId: wallet.wallet_id,
      nickName: wallet.wallet_nick_name,
      solanaAddress: wallet.wallet_solana_address,
      ethAddress: wallet.wallet_eth_address,
      auth: wallet.wallet_auth,
      status: wallet.wallet_status
    };
  }

  async createUser(createUserDto: CreateUserDto, currentUser: UserAdmin): Promise<{ message: string; user: any }> {
    // Kiểm tra quyền - chỉ admin mới được tạo user
    if (currentUser.role !== AdminRole.ADMIN) {
      throw new ForbiddenException('Only admin can create new users');
    }

    // Kiểm tra username và email đã tồn tại chưa
    const existingUser = await this.userAdminRepository.findOne({
      where: [
        { username: createUserDto.username },
        { email: createUserDto.email }
      ]
    });

    if (existingUser) {
      throw new ConflictException('Username or email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Tạo user mới
    const newUser = this.userAdminRepository.create({
      username: createUserDto.username,
      email: createUserDto.email,
      password: hashedPassword,
      role: createUserDto.role
    });

    const savedUser = await this.userAdminRepository.save(newUser);

    // Trả về thông tin user (không bao gồm password)
    const { password, ...userInfo } = savedUser;

    return {
      message: 'User created successfully',
      user: userInfo
    };
  }

  async getUsers(page: number = 1, limit: number = 20, role?: 'admin' | 'member' | 'partner', search?: string) {
    const query = this.userAdminRepository.createQueryBuilder('user')
      .select(['user.id', 'user.username', 'user.email', 'user.role', 'user.createdAt', 'user.updatedAt'])
      .orderBy('user.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (role) query.andWhere('user.role = :role', { role });
    if (search) query.andWhere('(user.username ILIKE :search OR user.email ILIKE :search)', { search: `%${search}%` });

    const [users, total] = await query.getManyAndCount();

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getUserStats() {
    // Tổng số user
    const total = await this.userAdminRepository.count();
    // Số user theo từng role
    const adminCount = await this.userAdminRepository.count({ where: { role: AdminRole.ADMIN } });
    const memberCount = await this.userAdminRepository.count({ where: { role: AdminRole.MEMBER } });
    const partnerCount = await this.userAdminRepository.count({ where: { role: AdminRole.PARTNER } });
    // Số user tạo mới 7 ngày gần nhất
    const recent = await this.userAdminRepository.createQueryBuilder('user')
      .where('user.createdAt >= NOW() - INTERVAL \'7 days\'')
      .getCount();
    return {
      total,
      byRole: {
        admin: adminCount,
        member: memberCount,
        partner: partnerCount
      },
      createdLast7Days: recent
    };
  }

  /**
   * Cập nhật trạng thái của BG affiliate node
   */
  async updateBgAffiliateNodeStatus(data: {
    walletId: number;
    status: boolean;
  }, currentUser?: UserAdmin): Promise<{ 
    success: boolean;
    message: string;
    walletId: number;
    oldStatus: boolean;
    newStatus: boolean;
    nodeInfo?: any;
  }> {
    // Kiểm tra wallet có tồn tại không
    const wallet = await this.listWalletRepository.findOne({
      where: { wallet_id: data.walletId }
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${data.walletId} does not exist`);
    }

    // Check PARTNER role - only allow updating status for wallets with isBittworld = true
    if (currentUser && currentUser.role === AdminRole.PARTNER) {
      if (!wallet.isBittworld) {
        throw new BadRequestException('PARTNER role can only update status for wallets with isBittworld = true');
      }
    }

    // Check if wallet belongs to BG affiliate system
    const bgAffiliateInfo = await this.bgRefService.getWalletBgAffiliateInfo(data.walletId);
    if (!bgAffiliateInfo) {
      throw new BadRequestException('Wallet does not belong to BG affiliate system');
    }

    // Get current node
    const node = await this.bgRefService['bgAffiliateNodeRepository'].findOne({
      where: { ban_wallet_id: data.walletId }
    });

    if (!node) {
      throw new NotFoundException('BG affiliate node not found');
    }

    const oldStatus = node.ban_status;

    // Cho phép cập nhật trạng thái của cả root BG và các node thường
    // Chỉ cảnh báo nếu đang tắt root BG
    if (!data.status && node.ban_parent_wallet_id === null) {
      // Cảnh báo nhưng vẫn cho phép thực hiện
      console.warn(`Warning: Admin is disabling root BG wallet ${data.walletId}`);
    }

    // Cập nhật trạng thái
    node.ban_status = data.status;
    await this.bgRefService['bgAffiliateNodeRepository'].save(node);

    // Lấy thông tin wallet để trả về
    const walletInfo = {
      walletId: wallet.wallet_id,
      nickName: wallet.wallet_nick_name,
      solanaAddress: wallet.wallet_solana_address,
      ethAddress: wallet.wallet_eth_address
    };

    const isRoot = node.ban_parent_wallet_id === null;
    const statusMessage = isRoot && !data.status 
      ? `Root BG status updated successfully: ${data.status ? 'Enabled' : 'Disabled'} (Warning: Root BG has been disabled)`
      : `BG affiliate node status updated successfully: ${data.status ? 'Enabled' : 'Disabled'}`;

    return {
      success: true,
      message: statusMessage,
      walletId: data.walletId,
      oldStatus,
      newStatus: data.status,
      nodeInfo: {
        ...walletInfo,
        treeId: bgAffiliateInfo.treeId,
        parentWalletId: bgAffiliateInfo.parentWalletId,
        commissionPercent: bgAffiliateInfo.commissionPercent,
        level: bgAffiliateInfo.level,
        isRoot: isRoot
      }
    };
  }

  // ==================== TRADITIONAL REFERRAL MANAGEMENT ====================

  /**
   * Lấy danh sách referral truyền thống với phân trang và tìm kiếm
   * Cấu trúc dữ liệu được tối ưu để nhóm theo wallet và hiển thị referral tree
   */
  async getTraditionalReferrals(
    page: number = 1,
    limit: number = 100,
    search?: string,
    level?: number
  ): Promise<{ 
    data: any[]; 
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    // Lấy tất cả dữ liệu referral trước để nhóm theo wallet
    const queryBuilder = this.walletReferentRepository.createQueryBuilder('referral')
      .leftJoinAndSelect('referral.invitee', 'invitee')
      .leftJoinAndSelect('referral.referent', 'referent')
      .leftJoinAndSelect('referral.rewards', 'rewards')
      .select([
        'referral.wr_id',
        'referral.wr_wallet_invitee',
        'referral.wr_wallet_referent',
        'referral.wr_wallet_level',
        'invitee.wallet_id',
        'invitee.wallet_nick_name',
        'invitee.wallet_solana_address',
        'invitee.wallet_eth_address',
        'invitee.wallet_code_ref',
        'referent.wallet_id',
        'referent.wallet_nick_name',
        'referent.wallet_solana_address',
        'referent.wallet_eth_address',
        'referent.wallet_code_ref',
        'rewards'
      ]);

    // Build where conditions
    const whereConditions: string[] = [];
    const parameters: any = {};

    // Không cần filter trong query vì sẽ filter sau khi nhóm theo wallet

    if (level) {
      whereConditions.push('referral.wr_wallet_level = :level');
      parameters['level'] = level;
    }

    // Apply where conditions
    if (whereConditions.length > 0) {
      queryBuilder.where(whereConditions.join(' AND '), parameters);
    }

    const allReferrals = await queryBuilder
      .orderBy('referral.wr_id', 'DESC')
      .getMany();

    // Nhóm dữ liệu theo wallet để tránh trùng lặp
    const walletMap = new Map();

    allReferrals.forEach(referral => {
      const totalReward = (referral.rewards || []).reduce((sum, reward) => {
        return sum + (parseFloat(String(reward.wrr_use_reward)) || 0);
      }, 0);

      const referralInfo = {
        referralId: referral.wr_id,
        level: referral.wr_wallet_level,
        totalReward: Number(totalReward.toFixed(5)),
        rewardCount: referral.rewards?.length || 0
      };

      // Xử lý invitee
      const inviteeId = referral.invitee.wallet_id;
      if (!walletMap.has(inviteeId)) {
        walletMap.set(inviteeId, {
          walletId: inviteeId,
          nickName: referral.invitee.wallet_nick_name,
          solanaAddress: referral.invitee.wallet_solana_address,
          ethAddress: referral.invitee.wallet_eth_address,
          refCode: referral.invitee.wallet_code_ref,
          asInvitee: [], // Các mối quan hệ khi wallet này được giới thiệu
          asReferrer: [] // Các mối quan hệ khi wallet này giới thiệu người khác
        });
      }

      // Xử lý referent
      const referentId = referral.referent.wallet_id;
      if (!walletMap.has(referentId)) {
        walletMap.set(referentId, {
          walletId: referentId,
          nickName: referral.referent.wallet_nick_name,
          solanaAddress: referral.referent.wallet_solana_address,
          ethAddress: referral.referent.wallet_eth_address,
          refCode: referral.referent.wallet_code_ref,
          asInvitee: [],
          asReferrer: []
        });
      }

      // Thêm thông tin referral vào wallet tương ứng
      const inviteeWallet = walletMap.get(inviteeId);
      const referentWallet = walletMap.get(referentId);

      // Thêm vào asInvitee của invitee
      inviteeWallet.asInvitee.push({
        ...referralInfo,
        referent: {
          walletId: referentId,
          nickName: referentWallet.nickName,
          solanaAddress: referentWallet.solanaAddress,
          ethAddress: referentWallet.ethAddress,
          refCode: referentWallet.refCode
        }
      });

      // Thêm vào asReferrer của referent
      referentWallet.asReferrer.push({
        ...referralInfo,
        invitee: {
          walletId: inviteeId,
          nickName: inviteeWallet.nickName,
          solanaAddress: inviteeWallet.solanaAddress,
          ethAddress: inviteeWallet.ethAddress,
          refCode: inviteeWallet.refCode
        }
      });
    });

    // Chuyển đổi Map thành Array và tính toán thống kê
    const allFormattedData = Array.from(walletMap.values()).map(wallet => {
      // Tính tổng reward khi là invitee
      const totalInviteeReward = wallet.asInvitee.reduce((sum, rel) => sum + rel.totalReward, 0);
      const totalInviteeCount = wallet.asInvitee.reduce((sum, rel) => sum + rel.rewardCount, 0);

      // Tính tổng reward khi là referrer
      const totalReferrerReward = wallet.asReferrer.reduce((sum, rel) => sum + rel.totalReward, 0);
      const totalReferrerCount = wallet.asReferrer.reduce((sum, rel) => sum + rel.rewardCount, 0);

      // Sắp xếp theo level
      wallet.asInvitee.sort((a, b) => a.level - b.level);
      wallet.asReferrer.sort((a, b) => a.level - b.level);

      return {
        walletId: wallet.walletId,
        nickName: wallet.nickName,
        solanaAddress: wallet.solanaAddress,
        ethAddress: wallet.ethAddress,
        refCode: wallet.refCode,
        stats: {
          totalInviteeReward: Number(totalInviteeReward.toFixed(5)),
          totalInviteeCount,
          totalReferrerReward: Number(totalReferrerReward.toFixed(5)),
          totalReferrerCount,
          totalReward: Number((totalInviteeReward + totalReferrerReward).toFixed(5))
        },
        asInvitee: wallet.asInvitee, // Các mối quan hệ khi được giới thiệu
        asReferrer: wallet.asReferrer // Các mối quan hệ khi giới thiệu người khác
      };
    });

    // Sắp xếp theo tổng reward giảm dần
    allFormattedData.sort((a, b) => b.stats.totalReward - a.stats.totalReward);

    // Lọc theo search nếu có - chỉ lấy wallet có solanaAddress khớp
    let filteredData = allFormattedData;
    if (search) {
      filteredData = allFormattedData.filter(wallet => 
        wallet.solanaAddress && wallet.solanaAddress.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Áp dụng phân trang cho dữ liệu đã được nhóm và lọc
    const total = filteredData.length;
    const skip = (page - 1) * limit;
    const formattedData = filteredData.slice(skip, skip + limit);

    return {
      data: formattedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Lấy thống kê tổng quan về hệ thống referral truyền thống
   */
  async getTraditionalReferralStatistics(): Promise<{
    overview: {
      totalWallets: number;
      totalReferralRelations: number;
      totalRewards: number;
      totalTransactions: number;
      averageRewardPerWallet: number;
      averageRewardPerTransaction: number;
    };
    byLevel: {
      [key: string]: {
        count: number;
        totalReward: number;
        averageReward: number;
        totalTransactions: number;
      };
    };
    topPerformers: {
      topReferrers: Array<{
        walletId: number;
        nickName: string;
        solanaAddress: string;
        totalReferrerReward: number;
        totalInvitees: number;
      }>;
      topInvitees: Array<{
        walletId: number;
        nickName: string;
        solanaAddress: string;
        totalInviteeReward: number;
        totalReferrers: number;
      }>;
    };
    recentActivity: {
      last7Days: {
        newReferrals: number;
        newRewards: number;
        totalRewardAmount: number;
      };
      last30Days: {
        newReferrals: number;
        newRewards: number;
        totalRewardAmount: number;
      };
    };
  }> {
    // Lấy tất cả dữ liệu referral
    const allReferrals = await this.walletReferentRepository.find({
      relations: ['invitee', 'referent', 'rewards']
    });

    // Tính toán tổng quan
    const uniqueWallets = new Set();
    let totalTransactions = 0;
    const levelStats: { [key: string]: { count: number; totalReward: number; totalTransactions: number } } = {};
    const walletStats = new Map();

    allReferrals.forEach(referral => {
      const inviteeId = referral.invitee.wallet_id;
      const referentId = referral.referent.wallet_id;
      const level = referral.wr_wallet_level;
      const levelKey = `level_${level}`;

      // Thêm vào danh sách unique wallets
      uniqueWallets.add(inviteeId);
      uniqueWallets.add(referentId);

      // Tính reward cho referral này
      const referralReward = (referral.rewards || []).reduce((sum, reward) => {
        return sum + (parseFloat(String(reward.wrr_use_reward)) || 0);
      }, 0);

      const transactionCount = referral.rewards?.length || 0;

      // Cập nhật thống kê theo level
      if (!levelStats[levelKey]) {
        levelStats[levelKey] = { count: 0, totalReward: 0, totalTransactions: 0 };
      }
      levelStats[levelKey].count++;
      levelStats[levelKey].totalReward += referralReward;
      levelStats[levelKey].totalTransactions += transactionCount;

      // Cập nhật tổng transactions
      totalTransactions += transactionCount;

      // Cập nhật thống kê theo wallet
      if (!walletStats.has(inviteeId)) {
        walletStats.set(inviteeId, {
          walletId: inviteeId,
          nickName: referral.invitee.wallet_nick_name,
          solanaAddress: referral.invitee.wallet_solana_address,
          totalInviteeReward: 0,
          totalReferrerReward: 0,
          inviteeCount: 0,
          referrerCount: 0
        });
      }

      if (!walletStats.has(referentId)) {
        walletStats.set(referentId, {
          walletId: referentId,
          nickName: referral.referent.wallet_nick_name,
          solanaAddress: referral.referent.wallet_solana_address,
          totalInviteeReward: 0,
          totalReferrerReward: 0,
          inviteeCount: 0,
          referrerCount: 0
        });
      }

      const inviteeWallet = walletStats.get(inviteeId);
      const referentWallet = walletStats.get(referentId);

      // Cập nhật thống kê wallet
      inviteeWallet.totalInviteeReward += referralReward;
      inviteeWallet.inviteeCount++;
      referentWallet.totalReferrerReward += referralReward;
      referentWallet.referrerCount++;
    });

    // Tính toán thống kê theo level
    const byLevel: { [key: string]: { count: number; totalReward: number; averageReward: number; totalTransactions: number } } = {};
    Object.keys(levelStats).forEach(levelKey => {
      const stats = levelStats[levelKey];
      byLevel[levelKey] = {
        count: stats.count,
        totalReward: Number(stats.totalReward.toFixed(5)),
        averageReward: stats.count > 0 ? Number((stats.totalReward / stats.count).toFixed(5)) : 0,
        totalTransactions: stats.totalTransactions
      };
    });

    // Tìm top performers
    const walletArray = Array.from(walletStats.values());
    
    // Tính tổng phần thưởng của tất cả ví
    const totalRewards = walletArray.reduce((sum, wallet) => {
      return sum + wallet.totalInviteeReward + wallet.totalReferrerReward;
    }, 0);
    
    const topReferrers = walletArray
      .filter(wallet => wallet.totalReferrerReward > 0)
      .sort((a, b) => b.totalReferrerReward - a.totalReferrerReward)
      .slice(0, 10)
      .map(wallet => ({
        walletId: wallet.walletId,
        nickName: wallet.nickName,
        solanaAddress: wallet.solanaAddress,
        totalReferrerReward: Number(wallet.totalReferrerReward.toFixed(5)),
        totalInvitees: wallet.referrerCount
      }));

    const topInvitees = walletArray
      .filter(wallet => wallet.totalInviteeReward > 0)
      .sort((a, b) => b.totalInviteeReward - a.totalInviteeReward)
      .slice(0, 10)
      .map(wallet => ({
        walletId: wallet.walletId,
        nickName: wallet.nickName,
        solanaAddress: wallet.solanaAddress,
        totalInviteeReward: Number(wallet.totalInviteeReward.toFixed(5)),
        totalReferrers: wallet.inviteeCount
      }));

    // Tính toán hoạt động gần đây (giả định dựa trên rewards)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Lấy rewards gần đây (giả định rewards có timestamp)
    const recentRewards = await this.walletReferentRepository
      .createQueryBuilder('referral')
      .leftJoinAndSelect('referral.rewards', 'rewards')
      .where('rewards.wrr_id IS NOT NULL')
      .getMany();

    let last7DaysRewards = 0;
    let last7DaysCount = 0;
    let last30DaysRewards = 0;
    let last30DaysCount = 0;

    recentRewards.forEach(referral => {
      referral.rewards.forEach(reward => {
        // Giả định reward có timestamp, nếu không có thì bỏ qua phần này
        const rewardAmount = parseFloat(String(reward.wrr_use_reward)) || 0;
        
        // Đếm tất cả rewards (vì không có timestamp)
        last7DaysRewards += rewardAmount;
        last7DaysCount++;
        last30DaysRewards += rewardAmount;
        last30DaysCount++;
      });
    });

    return {
      overview: {
        totalWallets: uniqueWallets.size,
        totalReferralRelations: allReferrals.length,
        totalRewards: Number(totalRewards.toFixed(5)),
        totalTransactions,
        averageRewardPerWallet: uniqueWallets.size > 0 ? Number((totalRewards / uniqueWallets.size).toFixed(5)) : 0,
        averageRewardPerTransaction: totalTransactions > 0 ? Number((totalRewards / totalTransactions).toFixed(5)) : 0
      },
      byLevel,
      topPerformers: {
        topReferrers,
        topInvitees
      },
      recentActivity: {
        last7Days: {
          newReferrals: 0, // Không có timestamp để tính
          newRewards: last7DaysCount,
          totalRewardAmount: Number(last7DaysRewards.toFixed(5))
        },
        last30Days: {
          newReferrals: 0, // Không có timestamp để tính
          newRewards: last30DaysCount,
          totalRewardAmount: Number(last30DaysRewards.toFixed(5))
        }
      }
    };
  }

  async updateUser(id: number, updateUserDto: Partial<{ username: string; email: string; password: string; role: string }>, currentUser: UserAdmin) {
    // Chỉ admin mới được cập nhật
    if (currentUser.role !== AdminRole.ADMIN) {
      throw new ForbiddenException('Only admin can update users');
    }
    // Không cho phép cập nhật admin khác
    const user = await this.userAdminRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === AdminRole.ADMIN && user.id !== currentUser.id) {
      throw new ForbiddenException('Cannot update another admin');
    }
    // Không cho phép đổi role thành admin nếu không phải chính mình
    if (updateUserDto.role === AdminRole.ADMIN && user.id !== currentUser.id) {
      throw new ForbiddenException('Cannot grant admin role to another user');
    }
    // Nếu có password thì hash lại
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    Object.assign(user, updateUserDto);
    await this.userAdminRepository.save(user);
    const { password, ...userInfo } = user;
    return { message: 'User updated successfully', user: userInfo };
  }

  async deleteUser(id: number, currentUser: UserAdmin) {
    if (currentUser.role !== AdminRole.ADMIN) {
      throw new ForbiddenException('Only admin can delete users');
    }
    const user = await this.userAdminRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === AdminRole.ADMIN) {
      throw new ForbiddenException('Cannot delete admin accounts');
    }
    await this.userAdminRepository.remove(user);
    return { message: 'User deleted successfully' };
  }

  // Create investor
  async createInvestor(createInvestorDto: CreateInvestorDto, currentUser: UserAdmin) {
    if (currentUser.role !== AdminRole.ADMIN) {
      throw new ForbiddenException('Only admin can create investors');
    }

    // Validate Solana wallet address
    try {
      new PublicKey(createInvestorDto.wallet_address);
    } catch (error) {
      throw new BadRequestException('Invalid Solana wallet address format');
    }

    // Kiểm tra xem investor đã tồn tại chưa
    const existingInvestor = await this.swapInvestorsRepository.findOne({
      where: { wallet_address: createInvestorDto.wallet_address }
    });

    if (existingInvestor) {
      throw new ConflictException('Investor with this wallet address already exists');
    }

    // Tạo investor mới
    const investor = this.swapInvestorsRepository.create({
      wallet_address: createInvestorDto.wallet_address,
      coins: [], // Mảng rỗng khi tạo mới
      amount_sol: 0,
      amount_usdt: 0,
      amount_usd: 0,
      active: true
    });

    const savedInvestor = await this.swapInvestorsRepository.save(investor);

    return {
      success: true,
      message: 'Investor created successfully',
      data: savedInvestor
    };
  }



  // Get investors list
  async getInvestors(
    page: number = 1,
    limit: number = 20,
    search?: string
  ) {
    const queryBuilder = this.swapInvestorsRepository.createQueryBuilder('investor');

    // Apply filters
    if (search) {
      queryBuilder.where('investor.wallet_address ILIKE :search', { search: `%${search}%` });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const offset = (page - 1) * limit;
    const investors = await queryBuilder
      .orderBy('investor.created_at', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    // Tính toán coins dựa trên amount_sol và amount_usdt
    const investorsWithCoins = investors.map(investor => {
      const coins: string[] = [];
      
      // Nếu có amount_sol > 0 thì thêm SOL
      if (Number(investor.amount_sol) > 0) {
        coins.push('SOL');
      }
      
      // Nếu có amount_usdt > 0 thì thêm USDT
      if (Number(investor.amount_usdt) > 0) {
        coins.push('USDT');
      }

      return {
        ...investor,
        coins: coins.length > 0 ? coins : null,
        amount_sol: Number(investor.amount_sol),
        amount_usdt: Number(investor.amount_usdt),
        amount_usd: Number(investor.amount_usd)
      };
    });

    return {
      success: true,
      message: 'Investors retrieved successfully',
      data: investorsWithCoins,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Initialize default swap settings if not exists
  async initializeSwapSettings() {
    const existingSettings = await this.swapSettingsRepository.findOne({
      where: {}
    });

    if (!existingSettings) {
      const defaultSettings = this.swapSettingsRepository.create({
        swap_fee_percent: 3.00, // 3% default fee
        investor_share_percent: 2.00 // 2% default share
      });
      
      await this.swapSettingsRepository.save(defaultSettings);
      console.log('✅ Swap settings initialized with default values');
    }
  }

  // Get swap settings
  async getSwapSettings() {
    const settings = await this.swapSettingsRepository.findOne({
      where: {},
      order: { created_at: 'DESC' }
    });

    if (!settings) {
      // Auto initialize if not exists
      await this.initializeSwapSettings();
      const newSettings = await this.swapSettingsRepository.findOne({
        where: {},
        order: { created_at: 'DESC' }
      });
      
      if (!newSettings) {
        throw new BadRequestException('Failed to initialize swap settings');
      }
      
      // Convert decimal strings to numbers
      const formattedSettings = {
        ...newSettings,
        swap_fee_percent: parseFloat(newSettings.swap_fee_percent.toString()),
        investor_share_percent: parseFloat(newSettings.investor_share_percent.toString())
      };
      
      return {
        success: true,
        message: 'Swap settings initialized and retrieved successfully',
        data: formattedSettings
      };
    }

    // Convert decimal strings to numbers
    const formattedSettings = {
      ...settings,
      swap_fee_percent: parseFloat(settings.swap_fee_percent.toString()),
      investor_share_percent: parseFloat(settings.investor_share_percent.toString())
    };

    return {
      success: true,
      message: 'Swap settings retrieved successfully',
      data: formattedSettings
    };
  }

  // Update swap settings
  async updateSwapSettings(updateSwapSettingDto: UpdateSwapSettingDto, currentUser?: UserAdmin) {
    // Kiểm tra quyền admin
    if (!currentUser || currentUser.role !== AdminRole.ADMIN) {
      throw new ForbiddenException('Only admin can update swap settings');
    }

    // Get current settings to validate
    const existingSettings = await this.swapSettingsRepository.findOne({
      where: {}
    });

    // Prepare the values to validate (use current values if not provided in update)
    const currentSwapFee = existingSettings ? parseFloat(existingSettings.swap_fee_percent.toString()) : 3.00;
    const currentInvestorShare = existingSettings ? parseFloat(existingSettings.investor_share_percent.toString()) : 2.00;
    
    const newSwapFee = updateSwapSettingDto.swap_fee_percent !== undefined ? updateSwapSettingDto.swap_fee_percent : currentSwapFee;
    const newInvestorShare = updateSwapSettingDto.investor_share_percent !== undefined ? updateSwapSettingDto.investor_share_percent : currentInvestorShare;

    // Validate that investor_share_percent is not greater than or equal to swap_fee_percent
    if (newInvestorShare >= newSwapFee) {
      throw new BadRequestException('Investor share percentage must be less than swap fee percentage');
    }

    if (!existingSettings) {
      // Auto initialize if not exists
      await this.initializeSwapSettings();
      const newSettings = await this.swapSettingsRepository.findOne({
        where: {}
      });
      
      if (!newSettings) {
        throw new BadRequestException('Failed to initialize swap settings');
      }
      
      // Update the newly created settings
      await this.swapSettingsRepository.update(
        { swap_setting_id: newSettings.swap_setting_id },
        updateSwapSettingDto
      );
      
      const updatedSettings = await this.swapSettingsRepository.findOne({
        where: { swap_setting_id: newSettings.swap_setting_id }
      });

      if (!updatedSettings) {
        throw new BadRequestException('Failed to retrieve updated settings');
      }

      // Convert decimal strings to numbers
      const formattedSettings = {
        ...updatedSettings,
        swap_fee_percent: parseFloat(updatedSettings.swap_fee_percent.toString()),
        investor_share_percent: parseFloat(updatedSettings.investor_share_percent.toString())
      };

      return {
        success: true,
        message: 'Swap settings initialized and updated successfully',
        data: formattedSettings
      };
    }

    await this.swapSettingsRepository.update(
      { swap_setting_id: existingSettings.swap_setting_id },
      updateSwapSettingDto
    );

    const updatedSettings = await this.swapSettingsRepository.findOne({
      where: { swap_setting_id: existingSettings.swap_setting_id }
    });

    if (!updatedSettings) {
      throw new BadRequestException('Failed to retrieve updated settings');
    }

    // Convert decimal strings to numbers
    const formattedSettings = {
      ...updatedSettings,
      swap_fee_percent: parseFloat(updatedSettings.swap_fee_percent.toString()),
      investor_share_percent: parseFloat(updatedSettings.investor_share_percent.toString())
    };

    return {
      success: true,
      message: 'Swap settings updated successfully',
      data: formattedSettings
    };
  }

  // Get swap investors statistics
  async getSwapInvestorsStats() {
    // Get total investors count
    const totalInvestors = await this.swapInvestorsRepository.count();

    // Get active investors count
    const activeInvestors = await this.swapInvestorsRepository.count({
      where: { active: true }
    });

    // Get total amount (sum of amount_usd)
    const totalAmountResult = await this.swapInvestorsRepository
      .createQueryBuilder('investor')
      .select('SUM(investor.amount_usd)', 'totalAmount')
      .getRawOne();

    const totalAmount = totalAmountResult?.totalAmount || 0;

    // Get current swap fee from settings
    const swapSettings = await this.swapSettingsRepository.findOne({
      where: {}
    });

    const swapFee = swapSettings ? parseFloat(swapSettings.swap_fee_percent.toString()) : 3.00;

    return {
      success: true,
      message: 'Swap investors statistics retrieved successfully',
      data: {
        totalInvestors,
        activeInvestors,
        totalAmount: parseFloat(totalAmount.toString()),
        swapFee
      }
    };
  }

  // Get swap investor rewards list
  async getSwapInvestorRewards(
    page: number = 1,
    limit: number = 20,
    search?: string,
    investor_id?: number,
    swap_order_id?: number
  ) {
    const queryBuilder = this.swapInvestorRewardRepository.createQueryBuilder('reward')
      .leftJoinAndSelect('reward.swapOrder', 'swapOrder')
      .leftJoin('swap_investors', 'investor', 'investor.swap_investor_id = reward.investor_id')
      .addSelect('investor.wallet_address', 'investor_wallet_address');

    // Apply filters
    if (search) {
      queryBuilder.andWhere('(investor.wallet_address ILIKE :search OR CAST(reward.investor_id AS TEXT) ILIKE :search)', { 
        search: `%${search}%` 
      });
    }

    if (investor_id) {
      queryBuilder.andWhere('reward.investor_id = :investor_id', { investor_id });
    }

    if (swap_order_id) {
      queryBuilder.andWhere('reward.swap_order_id = :swap_order_id', { swap_order_id });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const offset = (page - 1) * limit;
    const rewards = await queryBuilder
      .orderBy('reward.created_at', 'DESC')
      .skip(offset)
      .take(limit)
      .getRawAndEntities();

    // Format the response
    const formattedRewards = rewards.entities.map((reward, index) => {
      const rawData = rewards.raw[index];
      return {
        ...reward,
        investor_wallet_address: rawData.investor_wallet_address,
        reward_sol_amount: parseFloat(reward.reward_sol_amount.toString())
      };
    });

    return {
      success: true,
      message: 'Swap investor rewards retrieved successfully',
      data: formattedRewards,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getAirdropPools(
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: string,
    originator_id?: number
  ): Promise<AirdropPoolListResponseDto> {
    const queryBuilder = this.airdropListPoolRepository
      .createQueryBuilder('pool')
      .leftJoinAndSelect('pool.originator', 'originator');

    // Search by pool name, slug, or description
    if (search) {
      queryBuilder.andWhere(
        '(pool.alp_name ILIKE :search OR pool.alp_slug ILIKE :search OR pool.alp_describe ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Filter by status
    if (status) {
      queryBuilder.andWhere('pool.apl_status = :status', { status });
    }

    // Filter by originator
    if (originator_id) {
      queryBuilder.andWhere('pool.alp_originator = :originator_id', { originator_id });
    }

    const total = await queryBuilder.getCount();
    const totalPages = Math.ceil(total / limit);

    const pools = await queryBuilder
      .orderBy('pool.apl_creation_date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Transform data to match DTO with total volume calculation
    const transformedPools: AirdropPoolResponseDto[] = await Promise.all(pools.map(async pool => {
      // Calculate total volume: initial volume + total stake volume
      const allPoolStakes = await this.airdropPoolJoinRepository.find({
        where: {
          apj_pool_id: pool.alp_id,
          apj_status: AirdropPoolJoinStatus.ACTIVE
        }
      });

      // Calculate total stake volume
      const totalStakeVolume = allPoolStakes.reduce((sum, stake) => sum + Number(stake.apj_volume), 0);
      
      // Total volume = initial volume + total stake volume
      const apl_total_volume = Number(pool.apl_volume) + totalStakeVolume;

      // Calculate actual member count from stake records (including creator)
      const uniqueMembers = new Set<number>();
      
      // Add creator to member count (always included)
      uniqueMembers.add(pool.alp_originator);
      
      // Add all members from stake records (Set automatically handles duplicates)
      // If creator also exists in stake records, it will be deduplicated automatically
      for (const stake of allPoolStakes) {
        uniqueMembers.add(stake.apj_member);
      }
      
      const actualMemberCount = uniqueMembers.size;

      return {
        alp_id: pool.alp_id,
        alp_originator: pool.alp_originator,
        alp_name: pool.alp_name,
        alp_slug: pool.alp_slug,
        alp_describe: pool.alp_describe,
        alp_logo: pool.alp_logo,
        alp_member_num: actualMemberCount,
        apl_volume: Number(pool.apl_volume),
        apl_total_volume: apl_total_volume,
        apl_creation_date: pool.apl_creation_date,
        apl_end_date: pool.apl_end_date,
        apl_status: pool.apl_status,
        apl_hash: pool.apl_hash,
        originator: pool.originator ? {
          wallet_id: pool.originator.wallet_id,
          solana_address: pool.originator.wallet_solana_address,
          nick_name: pool.originator.wallet_nick_name,
          isBittworld: pool.originator.isBittworld,
          bittworldUid: pool.originator.isBittworld ? pool.originator.bittworld_uid || null : null
        } : undefined
      };
    }));

    return {
      data: transformedPools,
      total,
      page,
      limit,
      totalPages
    };
  }

  async getAirdropPoolsStats(): Promise<AirdropPoolStatsResponseDto> {
    // Get total pools count
    const totalPools = await this.airdropListPoolRepository.count();
    
    // Get active pools count
    const activePools = await this.airdropListPoolRepository.count({
      where: { apl_status: AirdropPoolStatus.ACTIVE }
    });

    // Get initial volume across all pools
    const totalStats = await this.airdropListPoolRepository
      .createQueryBuilder('pool')
      .select('SUM(pool.apl_volume)', 'initialVolume')
      .getRawOne();

    const initialVolume = parseFloat(totalStats?.initialVolume || '0');

    // Get total stake volume from airdrop_pool_joins table
    const stakeVolumeStats = await this.airdropPoolJoinRepository
      .createQueryBuilder('join')
      .select('SUM(join.apj_volume)', 'totalStakeVolume')
      .where('join.apj_status = :status', { status: AirdropPoolJoinStatus.ACTIVE })
      .getRawOne();

    const totalStakeVolume = parseFloat(stakeVolumeStats?.totalStakeVolume || '0');

    // Calculate actual total unique members count across all pools
    const allPools = await this.airdropListPoolRepository.find();
    const allUniqueMembers = new Set<number>();

    for (const pool of allPools) {
      // Get all stake records for this pool
      const allPoolStakes = await this.airdropPoolJoinRepository.find({
        where: {
          apj_pool_id: pool.alp_id,
          apj_status: AirdropPoolJoinStatus.ACTIVE
        }
      });

      // Add creator to unique members set (always included)
      allUniqueMembers.add(pool.alp_originator);
      
      // Add all members from stake records (Set automatically handles duplicates across pools)
      for (const stake of allPoolStakes) {
        allUniqueMembers.add(stake.apj_member);
      }
    }

    const totalMembers = allUniqueMembers.size;

    // Total volume = initial volume + total stake volume
    const totalVolume = initialVolume + totalStakeVolume;

    // Currently running pools (same as active pools)
    const currentlyRunning = activePools;

    return {
      totalPools,
      activePools,
      totalMembers,
      totalVolume,
      currentlyRunning
    };
  }

  async getAirdropPoolDetailByIdOrSlug(idOrSlug: string): Promise<AirdropPoolDetailResponseDto> {
    // Check if idOrSlug is numeric
    const isNumeric = !isNaN(Number(idOrSlug));
    
    let pool;
    if (isNumeric) {
      // Find by ID
      pool = await this.airdropListPoolRepository.findOne({
        where: { alp_id: parseInt(idOrSlug) }
      });
    } else {
      // Find by slug
      pool = await this.airdropListPoolRepository.findOne({
        where: { alp_slug: idOrSlug }
      });
    }

    if (!pool) {
      throw new NotFoundException(`Airdrop pool with ID/Slug ${idOrSlug} not found`);
    }

    // Get pool creator wallet information
    const creatorWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: pool.alp_originator },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address', 'isBittworld', 'bittworld_uid']
    });

    // Calculate total volume: initial volume + total stake volume
    const allPoolStakes = await this.airdropPoolJoinRepository.find({
      where: {
        apj_pool_id: pool.alp_id,
        apj_status: AirdropPoolJoinStatus.ACTIVE
      }
    });

    // Calculate total stake volume
    const totalStakeVolume = allPoolStakes.reduce((sum, stake) => sum + Number(stake.apj_volume), 0);
    
    // Total volume = initial volume + total stake volume
    const totalVolume = Number(pool.apl_volume) + totalStakeVolume;

    // Calculate actual member count from stake records (including creator)
    const uniqueMembers = new Set<number>();
    
    // Add creator to member count (always included)
    uniqueMembers.add(pool.alp_originator);
    
    // Add all members from stake records (Set automatically handles duplicates)
    // If creator also exists in stake records, it will be deduplicated automatically
    for (const stake of allPoolStakes) {
      uniqueMembers.add(stake.apj_member);
    }
    
    const actualMemberCount = uniqueMembers.size;

    // Get all transactions in the pool
    const transactions = await this.getAirdropPoolTransactions(pool.alp_id);

    // Get all members in the pool
    const members = await this.getAirdropPoolMembers(pool.alp_id);

    return {
      poolId: pool.alp_id,
      name: pool.alp_name,
      slug: pool.alp_slug,
      logo: pool.alp_logo,
      describe: pool.alp_describe,
      memberCount: actualMemberCount,
      totalVolume: totalVolume,
      creationDate: pool.apl_creation_date,
      endDate: pool.apl_end_date,
      status: pool.apl_status,
      transactionHash: pool.apl_hash,
      creatorAddress: creatorWallet?.wallet_solana_address || '',
      creatorIsBittworld: creatorWallet?.isBittworld || false,
      creatorBittworldUid: creatorWallet?.isBittworld ? creatorWallet?.bittworld_uid || null : null,
      members: members,
      transactions: transactions
    };
  }

  private async getAirdropPoolTransactions(poolId: number): Promise<AirdropPoolTransactionDto[]> {
    // Get all stake records of the pool with member information
    const allStakes = await this.airdropPoolJoinRepository.find({
      where: {
        apj_pool_id: poolId,
        apj_status: AirdropPoolJoinStatus.ACTIVE
      },
      relations: ['member']
    });

    // Get creator information
    const pool = await this.airdropListPoolRepository.findOne({
      where: { alp_id: poolId },
      relations: ['originator']
    });

    if (!pool) {
      throw new NotFoundException(`Pool with ID ${poolId} not found`);
    }

    const transactions: AirdropPoolTransactionDto[] = [];

    // Add creator's initial transaction (if pool is active)
    if (pool.apl_status === AirdropPoolStatus.ACTIVE && pool.originator) {
      transactions.push({
        transactionId: 0, // Special ID for creator's initial transaction
        memberId: pool.alp_originator,
        solanaAddress: pool.originator.wallet_solana_address,
        bittworldUid: pool.originator.bittworld_uid || null,
        nickname: pool.originator.wallet_nick_name || 'Creator',
        isCreator: true,
        stakeAmount: Number(pool.apl_volume),
        transactionDate: pool.apl_creation_date,
        status: pool.apl_status,
        transactionHash: pool.apl_hash
      });
    }

    // Add all member transactions
    for (const stake of allStakes) {
      if (stake.member) {
        transactions.push({
          transactionId: stake.apj_id,
          memberId: stake.apj_member,
          solanaAddress: stake.member.wallet_solana_address,
          bittworldUid: stake.member.bittworld_uid || null,
          nickname: stake.member.wallet_nick_name || 'Unknown',
          isCreator: false,
          stakeAmount: Number(stake.apj_volume),
          transactionDate: stake.apj_stake_date,
          status: stake.apj_status,
          transactionHash: stake.apj_hash
        });
      }
    }

    // Sort by transaction date (newest first)
    transactions.sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());

    return transactions;
  }

  async getAirdropPoolsStakingLeaderboard(
    page: number = 1,
    limit: number = 20,
    minVolume?: number,
    maxVolume?: number
  ): Promise<AirdropStakingLeaderboardResponseDto> {
    try {
      // Get all active pools
      const allPools = await this.airdropListPoolRepository
        .createQueryBuilder('pool')
        .leftJoinAndSelect('pool.originator', 'wallet')
        .where('pool.apl_status = :status', { status: AirdropPoolStatus.ACTIVE })
        .getMany();

      let allStakers: Array<{
        poolId: number;
        poolName: string;
        poolSlug: string;
        poolLogo?: string;
        totalPoolVolume: number;
        memberCount: number;
        status: AirdropPoolStatus;
        walletId: number;
        solanaAddress: string;
        nickName?: string;
        isBittworld: boolean;
        bittworldUid?: string | null;
        stakedVolume: number;
        percentageOfPool: number;
        isCreator: boolean;
        stakingDate: Date;
      }> = [];

      // Process each pool
      for (const pool of allPools) {
        // Get all stakes in this pool
        const poolStakes = await this.airdropPoolJoinRepository
          .createQueryBuilder('stake')
          .leftJoinAndSelect('stake.member', 'wallet')
          .where('stake.apj_pool_id = :poolId', { poolId: pool.alp_id })
          .andWhere('stake.apj_status = :status', { status: AirdropPoolJoinStatus.ACTIVE })
          .getMany();

        // Calculate total pool volume
        const totalStakeVolume = poolStakes.reduce((sum, stake) => sum + Number(stake.apj_volume), 0);
        const totalPoolVolume = Number(pool.apl_volume) + totalStakeVolume;

        // Calculate actual member count from stake records (including creator) - same logic as getAirdropPools
        const uniqueMembers = new Set<number>();
        
        // Add creator to member count (always included)
        uniqueMembers.add(pool.alp_originator);
        
        // Add all members from stake records (Set automatically handles duplicates)
        // If creator also exists in stake records, it will be deduplicated automatically
        for (const stake of poolStakes) {
          uniqueMembers.add(stake.apj_member);
        }
        
        const actualMemberCount = uniqueMembers.size;

        // Group stakes by wallet and calculate total volume per user (including creator)
        const userVolumes = new Map<number, {
          totalVolume: number;
          wallet: any;
          earliestStakeDate: Date;
          isCreator: boolean;
        }>();

        // Initialize creator volume if exists
        if (pool.originator) {
          userVolumes.set(pool.alp_originator, {
            totalVolume: Number(pool.apl_volume),
            wallet: pool.originator,
            earliestStakeDate: pool.apl_creation_date,
            isCreator: true
          });
        }

        // Process all stakes (including creator's additional stakes)
        for (const stake of poolStakes) {
          const wallet = stake.member;
          const walletId = stake.apj_member;
          const stakeVolume = Number(stake.apj_volume);
          const stakeDate = stake.apj_stake_date;

          if (userVolumes.has(walletId)) {
            // Update existing user - cộng dồn volume
            const existing = userVolumes.get(walletId)!;
            existing.totalVolume += stakeVolume;
            if (stakeDate < existing.earliestStakeDate) {
              existing.earliestStakeDate = stakeDate;
            }
          } else {
            // Add new user
            userVolumes.set(walletId, {
              totalVolume: stakeVolume,
              wallet: wallet,
              earliestStakeDate: stakeDate,
              isCreator: false
            });
          }
        }

        // Add all users from this pool to the main list
        for (const [walletId, userData] of userVolumes) {
          const wallet = userData.wallet;
          allStakers.push({
            poolId: pool.alp_id,
            poolName: pool.alp_name,
            poolSlug: pool.alp_slug,
            poolLogo: pool.alp_logo,
            totalPoolVolume,
            memberCount: actualMemberCount, // Use calculated member count instead of pool.alp_member_num
            status: pool.apl_status,
            walletId: walletId,
            solanaAddress: wallet?.wallet_solana_address || '',
            nickName: wallet?.wallet_nick_name,
            isBittworld: wallet?.isBittworld || false,
            bittworldUid: wallet?.isBittworld ? wallet?.bittworld_uid || null : null,
            stakedVolume: userData.totalVolume,
            percentageOfPool: totalPoolVolume > 0 ? (userData.totalVolume / totalPoolVolume) * 100 : 0,
            isCreator: userData.isCreator,
            stakingDate: userData.earliestStakeDate
          });
        }
      }

      // Sort all stakers by staked volume (descending)
      allStakers.sort((a, b) => b.stakedVolume - a.stakedVolume);

      // Filter by minimum volume if specified
      if (minVolume !== undefined && minVolume > 0) {
        allStakers = allStakers.filter(staker => staker.stakedVolume >= minVolume);
      }

      // Filter by maximum volume if specified
      if (maxVolume !== undefined && maxVolume > 0) {
        allStakers = allStakers.filter(staker => staker.stakedVolume <= maxVolume);
      }

      // Calculate pagination
      const total = allStakers.length;
      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedData = allStakers.slice(startIndex, endIndex);

      // Helper function to determine volume tier
      const getVolumeTier = (volume: number): string => {
        if (volume >= 30000000) return 'V7'; // Trên 30 triệu
        if (volume >= 20000000) return 'V6'; // 20-30 triệu
        if (volume >= 10000000) return 'V5'; // 10-20 triệu
        return 'V4'; // Dưới 10 triệu
      };

      // Transform to response format
      const rankedData = paginatedData.map((staker, index) => ({
        rank: startIndex + index + 1,
        poolId: staker.poolId,
        poolName: staker.poolName,
        poolSlug: staker.poolSlug,
        poolLogo: staker.poolLogo,
        totalPoolVolume: staker.totalPoolVolume,
        memberCount: staker.memberCount,
        status: staker.status,
        volumeTier: getVolumeTier(staker.stakedVolume),
        walletId: staker.walletId,
        solanaAddress: staker.solanaAddress,
        nickName: staker.nickName,
        isBittworld: staker.isBittworld,
        bittworldUid: staker.bittworldUid,
        stakedVolume: staker.stakedVolume,
        percentageOfPool: staker.percentageOfPool,
        isCreator: staker.isCreator,
        stakingDate: staker.stakingDate
      }));

      return {
        success: true,
        message: 'Pools leaderboard retrieved successfully',
        data: rankedData,
        total,
        page,
        limit,
        totalPages
      };

    } catch (error) {
      throw new Error(`Error getting pools staking leaderboard: ${error.message}`);
    }
  }

  private async getAirdropPoolMembers(poolId: number): Promise<AirdropPoolMemberDto[]> {
    // Get all stake records of the pool with member information
    const allStakes = await this.airdropPoolJoinRepository.find({
      where: {
        apj_pool_id: poolId,
        apj_status: AirdropPoolJoinStatus.ACTIVE
      },
      relations: ['member']
    });

    // Get creator information
    const pool = await this.airdropListPoolRepository.findOne({
      where: { alp_id: poolId },
      relations: ['originator']
    });

    if (!pool) {
      throw new NotFoundException(`Pool with ID ${poolId} not found`);
    }

    // Create map to group by member (solanaAddress)
    const memberMap = new Map<string, {
      memberId: number;
      solanaAddress: string;
      bittworldUid: string | null;
      nickname: string;
      isCreator: boolean;
      joinDate: Date;
      totalStaked: number;
      stakeCount: number;
      status: string;
    }>();

    // Add creator to map
    if (pool.originator) {
      memberMap.set(pool.originator.wallet_solana_address, {
        memberId: pool.alp_originator,
        solanaAddress: pool.originator.wallet_solana_address,
        bittworldUid: pool.originator.bittworld_uid || null,
        nickname: pool.originator.wallet_nick_name || 'Creator',
        isCreator: true,
        joinDate: pool.apl_creation_date,
        totalStaked: Number(pool.apl_volume), // Initial volume
        stakeCount: 0, // Will be updated later
        status: 'active'
      });
    }

    // Process stake records
    for (const stake of allStakes) {
      if (stake.member) {
        const solanaAddress = stake.member.wallet_solana_address;
        const existingMember = memberMap.get(solanaAddress);

        if (existingMember) {
          // Update existing member information
          existingMember.totalStaked += Number(stake.apj_volume);
          existingMember.stakeCount += 1;
          // Update join date if this stake is earlier
          if (stake.apj_stake_date < existingMember.joinDate) {
            existingMember.joinDate = stake.apj_stake_date;
          }
        } else {
          // Create new member
          memberMap.set(solanaAddress, {
            memberId: stake.apj_member,
            solanaAddress: solanaAddress,
            bittworldUid: stake.member.bittworld_uid || null,
            nickname: stake.member.wallet_nick_name || 'Unknown',
            isCreator: false,
            joinDate: stake.apj_stake_date,
            totalStaked: Number(stake.apj_volume),
            stakeCount: 1,
            status: stake.apj_status
          });
        }
      }
    }

    // Convert map to array
    let members = Array.from(memberMap.values());

    // Sort by total staked amount (descending) and creator first
    members.sort((a, b) => {
      // Creator always at the top
      if (a.isCreator && !b.isCreator) return -1;
      if (!a.isCreator && b.isCreator) return 1;

      // Then sort by total staked amount (descending)
      return b.totalStaked - a.totalStaked;
    });

    return members;
  }

   // ==================== BITTWORLD MANAGEMENT ====================

  /**
   * Trigger Bittworld reward withdrawal manually (Admin only)
   * Only highest admin role can trigger this action
   */
  async triggerBittworldWithdraw(currentUser: UserAdmin): Promise<{
    success: boolean;
    message: string;
    processedRewards?: number;
    totalAmount?: number;
    timestamp: string;
  }> {
    try {
      // Kiểm tra quyền - chỉ admin cao nhất mới được gọi
      if (currentUser.role !== AdminRole.ADMIN) {
        throw new ForbiddenException('Only admin with highest role can trigger Bittworld withdrawal');
      }

      // Gọi hàm trả hoa hồng Bittworld từ BittworldsService
      const result = await this.bittworldsService.manualAutoRewardBittworld();

      return {
        success: result.success,
        message: result.message,
        processedRewards: result.processedRewards,
        totalAmount: result.totalAmount,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      return {
        success: false,
        message: `Failed to trigger Bittworld withdrawal: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get Bittworld rewards statistics
   */
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
    try {
      // Get overview statistics
      const overviewQuery = this.bittworldRewardsRepository.createQueryBuilder('reward');
      
      const totalStats = await overviewQuery
        .select([
          'COUNT(*) as totalRewards',
          'SUM(COALESCE(reward.br_amount_usd, 0)) as totalAmountUSD',
          'SUM(COALESCE(reward.br_amount_sol, 0)) as totalAmountSOL',
          'AVG(COALESCE(reward.br_amount_usd, 0)) as averageRewardPerTransaction'
        ])
        .getRawOne();

      const statusStats = await this.bittworldRewardsRepository
        .createQueryBuilder('reward')
        .select('reward.br_status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('reward.br_status')
        .getRawMany();

      const statusCounts = {
        pending: 0,
        can_withdraw: 0,
        withdrawn: 0
      };

      statusStats.forEach(stat => {
        statusCounts[stat.status] = parseInt(stat.count);
      });

      const overview = {
        totalRewards: parseInt(totalStats.totalRewards) || 0,
        totalAmountUSD: parseFloat(totalStats.totalAmountUSD) || 0,
        totalAmountSOL: parseFloat(totalStats.totalAmountSOL) || 0,
        pendingRewards: statusCounts.pending,
        canWithdrawRewards: statusCounts.can_withdraw,
        withdrawnRewards: statusCounts.withdrawn,
        averageRewardPerTransaction: parseFloat(totalStats.averageRewardPerTransaction) || 0
      };

      return {
        overview
      };

    } catch (error) {
      throw new Error(`Failed to get Bittworld rewards statistics: ${error.message}`);
    }
  }

  /**
   * Get Bittworld withdrawal history
   */
  async getBittworldWithdrawsHistory(
    page: number = 1,
    limit: number = 20,
    status?: 'pending' | 'success' | 'error' | 'cancel',
    fromDate?: string,
    toDate?: string,
    search?: string
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
    try {
      // Build query for withdraws
      let query = this.bittworldWithdrawRepository
        .createQueryBuilder('withdraw')
        .leftJoinAndSelect('withdraw.reward', 'reward');

      // Apply filters
      if (status) {
        query.andWhere('withdraw.bw_status = :status', { status });
      }

      if (fromDate) {
        query.andWhere('withdraw.bw_date >= :fromDate', { fromDate: new Date(fromDate) });
      }

      if (toDate) {
        query.andWhere('withdraw.bw_date <= :toDate', { toDate: new Date(toDate) });
      }

      if (search) {
        query.andWhere('(withdraw.bw_id::text LIKE :search OR withdraw.bw_address LIKE :search OR withdraw.bw_amount_usd::text LIKE :search OR withdraw.bw_tx_hash LIKE :search)', {
          search: `%${search}%`
        });
      }

      // Get total count for pagination
      const total = await query.getCount();

      // Apply pagination
      const offset = (page - 1) * limit;
      query.skip(offset).take(limit).orderBy('withdraw.bw_date', 'DESC');

      // Get withdraws
      const withdraws = await query.getMany();

      const pagination = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };

      return {
        withdraws: withdraws.map(withdraw => ({
          bw_id: withdraw.bw_id,
          bw_reward_id: withdraw.bw_reward_id,
          bw_amount_sol: withdraw.bw_amount_sol,
          bw_amount_usd: withdraw.bw_amount_usd,
          bw_address: withdraw.bw_address,
          bw_date: withdraw.bw_date,
          bw_status: withdraw.bw_status,
          bw_tx_hash: withdraw.bw_tx_hash,
          reward_info: withdraw.reward ? {
            br_id: withdraw.reward.br_id,
            br_amount_usd: withdraw.reward.br_amount_usd,
            br_date: withdraw.reward.br_date
          } : undefined
        })),
        pagination
      };

    } catch (error) {
      throw new Error(`Failed to get Bittworld withdrawal history: ${error.message}`);
    }
  }

  /**
   * Thay đổi luồng BG - Thay đổi người giới thiệu tuyến trên
   * Cho phép admin thay đổi cấu trúc cây affiliate
   */
  async changeBgAffiliateFlow(data: {
    walletId: number;
    newParentWalletId: number;
  }, currentUser?: UserAdmin): Promise<{ 
    success: boolean;
    message: string;
    walletId: number;
    oldParentWalletId: number | null;
    newParentWalletId: number;
    treeChanges: {
      oldTreeId: number;
      newTreeId: number;
      affectedNodes: number;
    };
    nodeInfo: any;
  }> {
    // Kiểm tra wallet cần thay đổi có tồn tại không
    const targetWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: data.walletId }
    });

    if (!targetWallet) {
      throw new NotFoundException(`Wallet with ID ${data.walletId} does not exist`);
    }

    // Kiểm tra wallet cha mới có tồn tại không
    const newParentWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: data.newParentWalletId }
    });

    if (!newParentWallet) {
      throw new NotFoundException(`New parent wallet with ID ${data.newParentWalletId} does not exist`);
    }

    // Check PARTNER role - only allow changing flow for wallets with isBittworld = true
    if (currentUser && currentUser.role === AdminRole.PARTNER) {
      if (!targetWallet.isBittworld || !newParentWallet.isBittworld) {
        throw new BadRequestException('PARTNER role can only change flow for wallets with isBittworld = true');
      }
    }

    // Kiểm tra wallet cần thay đổi có trong BG affiliate system không
    const targetBgInfo = await this.bgRefService.getWalletBgAffiliateInfo(data.walletId);
    if (!targetBgInfo) {
      throw new BadRequestException('Target wallet does not belong to BG affiliate system');
    }

    // Kiểm tra wallet cha mới có trong BG affiliate system không
    const newParentBgInfo = await this.bgRefService.getWalletBgAffiliateInfo(data.newParentWalletId);
    if (!newParentBgInfo) {
      throw new BadRequestException('New parent wallet does not belong to BG affiliate system');
    }

    // Không cho phép thay đổi thành chính mình
    if (data.walletId === data.newParentWalletId) {
      throw new BadRequestException('Cannot set wallet as its own parent');
    }

    // Không cho phép tạo vòng lặp (circular reference)
    if (await this.wouldCreateCircularReference(data.walletId, data.newParentWalletId)) {
      throw new BadRequestException('This change would create a circular reference in the affiliate tree');
    }

    // Không cho phép thay đổi root BG
    if (targetBgInfo.parentWalletId === null) {
      throw new BadRequestException('Cannot change flow of root BG wallet');
    }

    // Không cho phép đặt root BG làm con của node khác
    // if (newParentBgInfo.parentWalletId === null && targetBgInfo.treeId !== newParentBgInfo.treeId) {
    //   throw new BadRequestException('Cannot move wallet to different tree under root BG');
    // }

    // Lấy thông tin node hiện tại
    const currentNode = await this.bgRefService['bgAffiliateNodeRepository'].findOne({
      where: { ban_wallet_id: data.walletId }
    });

    if (!currentNode) {
      throw new NotFoundException('BG affiliate node not found');
    }

    const oldParentWalletId = currentNode.ban_parent_wallet_id;
    const oldTreeId = targetBgInfo.treeId;

    // Kiểm tra xem wallet cha mới có phải là con của wallet cần thay đổi không
    if (await this.isDescendant(data.newParentWalletId, data.walletId)) {
      throw new BadRequestException('Cannot set descendant wallet as parent');
    }

    // Bắt đầu transaction để đảm bảo tính nhất quán
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Cập nhật parent của node hiện tại
      currentNode.ban_parent_wallet_id = data.newParentWalletId;
      currentNode.ban_tree_id = newParentBgInfo.treeId;
      
      await queryRunner.manager.save(currentNode);

      // 2. Cập nhật tất cả các node con (descendants) của wallet này
      const affectedNodes = await this.updateDescendantsTree(
        data.walletId, 
        newParentBgInfo.treeId, 
        queryRunner
      );

      // 3. Cập nhật commission percent nếu cần
      if (targetBgInfo.commissionPercent !== newParentBgInfo.commissionPercent) {
        // Cập nhật commission percent theo parent mới
        currentNode.ban_commission_percent = newParentBgInfo.commissionPercent;
        await queryRunner.manager.save(currentNode);
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Lấy thông tin cập nhật
      const updatedNodeInfo = await this.bgRefService.getWalletBgAffiliateInfo(data.walletId);

      return {
        success: true,
        message: `BG affiliate flow changed successfully. Wallet ${data.walletId} moved from tree ${oldTreeId} to tree ${newParentBgInfo.treeId}`,
        walletId: data.walletId,
        oldParentWalletId,
        newParentWalletId: data.newParentWalletId,
        treeChanges: {
          oldTreeId,
          newTreeId: newParentBgInfo.treeId,
          affectedNodes: affectedNodes.length
        },
        nodeInfo: {
          walletId: targetWallet.wallet_id,
          nickName: targetWallet.wallet_nick_name,
          solanaAddress: targetWallet.wallet_solana_address,
          oldParentWalletId,
          newParentWalletId: data.newParentWalletId,
          oldTreeId,
          newTreeId: newParentBgInfo.treeId,
          newCommissionPercent: currentNode.ban_commission_percent,
          affectedDescendants: affectedNodes.length,
          reason: 'Admin request'
        }
      };

    } catch (error) {
      // Rollback nếu có lỗi
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Giải phóng query runner
      await queryRunner.release();
    }
  }

  /**
   * Kiểm tra xem việc thay đổi có tạo ra vòng lặp không
   */
  private async wouldCreateCircularReference(walletId: number, newParentId: number): Promise<boolean> {
    // Kiểm tra xem newParentId có phải là con của walletId không
    return await this.isDescendant(newParentId, walletId);
  }

  /**
   * Kiểm tra xem một wallet có phải là con (descendant) của wallet khác không
   */
  private async isDescendant(potentialDescendantId: number, ancestorId: number): Promise<boolean> {
    if (potentialDescendantId === ancestorId) {
      return true;
    }

    const potentialDescendant = await this.bgRefService['bgAffiliateNodeRepository'].findOne({
      where: { ban_wallet_id: potentialDescendantId }
    });

    if (!potentialDescendant || !potentialDescendant.ban_parent_wallet_id) {
      return false;
    }

    return await this.isDescendant(potentialDescendant.ban_parent_wallet_id, ancestorId);
  }

  /**
   * Cập nhật tất cả các node con (descendants) khi thay đổi parent
   */
  private async updateDescendantsTree(
    walletId: number, 
    newTreeId: number, 
    queryRunner: any
  ): Promise<BgAffiliateNode[]> {
    const descendants = await this.bgRefService['bgAffiliateNodeRepository'].find({
      where: { ban_parent_wallet_id: walletId }
    });

    const updatedNodes: BgAffiliateNode[] = [];

    for (const descendant of descendants) {
      // Cập nhật tree_id
      descendant.ban_tree_id = newTreeId;
      
      await queryRunner.manager.save(descendant);
      updatedNodes.push(descendant);

      // Đệ quy cập nhật các node con của node này
      const childUpdatedNodes = await this.updateDescendantsTree(
        descendant.ban_wallet_id, 
        newTreeId, 
        queryRunner
      );
      
      updatedNodes.push(...childUpdatedNodes);
    }

    return updatedNodes;
  }

    /**
   * Gửi email leaderboard airdrop pools
   */
  async sendAirdropLeaderboardEmail(): Promise<{
    success: boolean;
    message: string;
    emailSent: boolean;
    recipients: string[];
    vip5Count: number;
    vip6Count: number;
    vip7Count: number;
  }> {
    try {
      const smtpHost = this.configService.get<string>('SMTP_HOST');
      const smtpPort = this.configService.get<number>('SMTP_PORT');
      const smtpUser = this.configService.get<string>('SMTP_USER');
      const smtpPass = this.configService.get<string>('SMTP_PASS');
      const emailNotify = this.configService.get<string>('EMAIL_NOTIFY');

      if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
        throw new Error('SMTP configuration is missing in environment variables');
      }

      if (!emailNotify) {
        throw new Error('EMAIL_NOTIFY is missing in environment variables');
      }

      // Parse email addresses từ EMAIL_NOTIFY (hỗ trợ dấu phẩy và khoảng trắng)
      const emailAddresses = this.parseEmailAddresses(emailNotify);
      
      if (emailAddresses.length === 0) {
        throw new Error('No valid email addresses found in EMAIL_NOTIFY');
      }

      // Lấy dữ liệu leaderboard cho từng VIP level
      const vip5Data = await this.getAirdropPoolsStakingLeaderboard(1, 100, 10000000, 19999999);
      const vip6Data = await this.getAirdropPoolsStakingLeaderboard(1, 100, 20000000, 29999999);
      const vip7Data = await this.getAirdropPoolsStakingLeaderboard(1, 100, 30000000);

      // Tạo nội dung email
      const emailContent = this.generateLeaderboardEmailContent(vip5Data, vip6Data, vip7Data);

      // Gửi email đến tất cả địa chỉ
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      // Gửi email đến từng địa chỉ riêng biệt để tracking tốt hơn
      const emailResults = await Promise.allSettled(
        emailAddresses.map(async (email) => {
          const mailOptions = {
            from: smtpUser,
            to: email,
            subject: 'Airdrop Pools Leaderboard Report',
            html: emailContent,
          };
          
          return await transporter.sendMail(mailOptions);
        })
      );

      // Đếm số email gửi thành công
      const successfulEmails = emailResults.filter(result => result.status === 'fulfilled').length;
      const failedEmails = emailResults.filter(result => result.status === 'rejected').length;

      if (successfulEmails === 0) {
        throw new Error('Failed to send email to any recipient');
      }

      const message = failedEmails > 0 
        ? `Leaderboard email sent successfully to ${successfulEmails} recipients, failed to ${failedEmails} recipients`
        : `Leaderboard email sent successfully to all ${successfulEmails} recipients`;

      return {
        success: true,
        message,
        emailSent: successfulEmails > 0,
        recipients: emailAddresses,
        vip5Count: vip5Data.data.length,
        vip6Count: vip6Data.data.length,
        vip7Count: vip7Data.data.length,
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to send leaderboard email: ${error.message}`,
        emailSent: false,
        recipients: [],
        vip5Count: 0,
        vip6Count: 0,
        vip7Count: 0,
      };
      }
    }

  /**
   * Parse email addresses từ chuỗi EMAIL_NOTIFY
   * Hỗ trợ format: email1@gmail.com,email2@gmail.com hoặc email1@gmail.com, email2@gmail.com
   */
  private parseEmailAddresses(emailNotify: string): string[] {
    if (!emailNotify || emailNotify.trim() === '') {
      return [];
    }

    // Tách theo dấu phẩy và loại bỏ khoảng trắng
    const emails = emailNotify
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0);

    // Validate email format cơ bản
    const validEmails = emails.filter(email => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    });

    return validEmails;
  }

  /**
   * Tạo nội dung email leaderboard
   */
  private generateLeaderboardEmailContent(
    vip5Data: any,
    vip6Data: any,
    vip7Data: any
  ): string {
    const formatNumber = (num: number): string => {
      return num.toLocaleString();
    };

    const generateVipTable = (data: any[], vipLevel: string): string => {
      if (data.length === 0) {
        return `<p><strong>VIP${vipLevel}</strong> 에 있는 사람들 정보</p>
                <p>데이터가 없습니다.</p>`;
      }

      let table = `
        <p><strong>VIP${vipLevel}</strong> 에 있는 사람들 정보</p>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">순위</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Bittworld UID</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">닉네임</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">BITT 스테이킹 수량</th>
            </tr>
          </thead>
          <tbody>`;

      data.forEach((item, index) => {
        const bittworldUid = item.bittworldUid || 'N/A';
        const nickName = item.nickName || 'Unknown';
        const stakedVolume = formatNumber(item.stakedVolume);

        table += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${index + 1}.</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${bittworldUid}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${nickName}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${stakedVolume}</td>
          </tr>`;
      });

      table += `
          </tbody>
        </table>`;

      return table;
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Airdrop Pools Leaderboard Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .container { max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; }
          .vip-section { margin-bottom: 30px; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
          th { background-color: #f2f2f2; font-weight: bold; }
          .summary { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Airdrop Pools Leaderboard Report</h1>
            <p>생성 시간: ${new Date().toLocaleString('ko-KR')}</p>
          </div>

          <div class="summary">
            <h3>📊 요약</h3>
            <p><strong>VIP5:</strong> ${vip5Data.data.length}명 (10,000,000 - 19,999,999 BITT)</p>
            <p><strong>VIP6:</strong> ${vip6Data.data.length}명 (20,000,000 - 29,999,999 BITT)</p>
            <p><strong>VIP7:</strong> ${vip7Data.data.length}명 (30,000,000+ BITT)</p>
          </div>

          <div class="vip-section">
            ${generateVipTable(vip5Data.data, '5')}
          </div>

          <div class="vip-section">
            ${generateVipTable(vip6Data.data, '6')}
          </div>

          <div class="vip-section">
            ${generateVipTable(vip7Data.data, '7')}
          </div>

          <div style="margin-top: 30px; padding: 15px; background-color: #f0f8ff; border-radius: 5px;">
            <p><em>이 이메일은 자동으로 생성되었습니다. 문의사항이 있으시면 관리자에게 연락해 주세요.</em></p>
          </div>
        </div>
      </body>
      </html>
    `;

    return htmlContent;
  }

  /**
   * Method để gọi từ scheduler - tự động gửi email leaderboard
   */
  async sendScheduledLeaderboardEmail(): Promise<void> {
    try {
      this.logger.log('🕐 Starting scheduled leaderboard email sending at 15:00 UTC...');
      
      const result = await this.sendAirdropLeaderboardEmail();
      
      if (result.success && result.emailSent) {
        this.logger.log(`✅ Scheduled leaderboard email sent successfully! VIP5: ${result.vip5Count}, VIP6: ${result.vip6Count}, VIP7: ${result.vip7Count}`);
        this.logger.log(`📧 Email sent to ${result.recipients.length} recipients: ${result.recipients.join(', ')}`);
      } else {
        this.logger.error(`❌ Failed to send scheduled leaderboard email: ${result.message}`);
      }
    } catch (error) {
      this.logger.error(`❌ Error in scheduled leaderboard email: ${error.message}`);
    }
  }

  /**
   * Lấy trạng thái scheduler và thời gian chạy tiếp theo
   */
  async getSchedulerStatus(): Promise<{
    schedulerActive: boolean;
    nextRunTime: string;
    cronExpression: string;
    timezone: string;
    lastRunTime?: string;
    description: string;
    debugInfo: {
      serverStartTime: string;
      currentTime: string;
      currentTimeUTC: string;
      timeUntilNextRun: string;
      nextRunDate: string;
    };
  }> {
    try {
      // Tính thời gian chạy tiếp theo (15:00 UTC mỗi ngày)
      const now = new Date();
      const nextRun = new Date();
      nextRun.setUTCHours(15, 0, 0, 0);
      
      // Nếu hôm nay đã qua 15:00, thì chạy vào ngày mai
      if (now.getUTCHours() > 15 || (now.getUTCHours() === 15 && now.getUTCMinutes() >= 0)) {
        nextRun.setUTCDate(nextRun.getUTCDate() + 1);
      }

      // Tính thời gian còn lại đến lần chạy tiếp theo
      const timeUntilNextRun = nextRun.getTime() - now.getTime();
      const hours = Math.floor(timeUntilNextRun / (1000 * 60 * 60));
      const minutes = Math.floor((timeUntilNextRun % (1000 * 60 * 60)) / (1000 * 60));

      return {
        schedulerActive: true,
        nextRunTime: nextRun.toISOString(),
        cronExpression: '0 15 * * *',
        timezone: 'UTC',
        description: 'Daily leaderboard email at 15:00 UTC (22:00 Vietnam time)',
        debugInfo: {
          serverStartTime: new Date(process.uptime() * 1000).toISOString(),
          currentTime: now.toISOString(),
          currentTimeUTC: now.toUTCString(),
          timeUntilNextRun: `${hours}h ${minutes}m`,
          nextRunDate: nextRun.toUTCString(),
        },
      };
    } catch (error) {
      this.logger.error(`Error getting scheduler status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Tạo token mới trong bảng bittworld_token
   * Kiểm tra chống trùng bt_address (bao gồm cả khoảng trắng)
   */
  async createBittworldToken(createTokenDto: CreateBittworldTokenDto): Promise<CreateBittworldTokenResponseDto> {
    try {
      // Kiểm tra chống trùng bt_address (loại bỏ khoảng trắng trước khi so sánh)
      const normalizedAddress = createTokenDto.bt_address.trim();
      
      // Kiểm tra xem địa chỉ đã tồn tại chưa (có thể có khoảng trắng)
      const existingToken = await this.bittworldTokenRepository
        .createQueryBuilder('token')
        .where('TRIM(token.bt_address) = :normalizedAddress', { normalizedAddress })
        .getOne();

      if (existingToken) {
        throw new ConflictException(`Token with address "${createTokenDto.bt_address}" already exists`);
      }

      // Tạo token mới
      const newToken = this.bittworldTokenRepository.create({
        bt_name: createTokenDto.bt_name.trim(),
        bt_symbol: createTokenDto.bt_symbol.trim(),
        bt_address: normalizedAddress, // Lưu địa chỉ đã được trim
        bt_logo_url: createTokenDto.bt_logo_url?.trim() || '',
        bt_status: createTokenDto.bt_status !== undefined ? createTokenDto.bt_status : true
      });

      // Lưu token vào database
      const savedToken = await this.bittworldTokenRepository.save(newToken);

      // Trả về response
      return {
        status: 201,
        message: 'Bittworld token created successfully',
        data: {
          bt_id: savedToken.bt_id,
          bt_name: savedToken.bt_name,
          bt_symbol: savedToken.bt_symbol,
          bt_address: savedToken.bt_address,
          bt_logo_url: savedToken.bt_logo_url,
          bt_status: savedToken.bt_status,
          created_at: savedToken.created_at,
          updated_at: savedToken.updated_at
        }
      };

    } catch (error) {
      this.logger.error(`Error creating Bittworld token: ${error.message}`);
      
      if (error instanceof ConflictException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to create Bittworld token: ${error.message}`);
    }
  }

  /**
   * Cập nhật token trong bảng bittworld_token
   * Không cho phép cập nhật bt_address
   */
  async updateBittworldToken(
    tokenId: number, 
    updateTokenDto: UpdateBittworldTokenDto
  ): Promise<UpdateBittworldTokenResponseDto> {
    try {
      // Kiểm tra token có tồn tại không
      const existingToken = await this.bittworldTokenRepository.findOne({
        where: { bt_id: tokenId }
      });

      if (!existingToken) {
        throw new NotFoundException(`Token with ID ${tokenId} not found`);
      }

      // Chuẩn bị dữ liệu cập nhật (chỉ các trường được cho phép)
      const updateData: Partial<BittworldToken> = {};
      
      if (updateTokenDto.bt_name !== undefined) {
        updateData.bt_name = updateTokenDto.bt_name.trim();
      }
      
      if (updateTokenDto.bt_symbol !== undefined) {
        updateData.bt_symbol = updateTokenDto.bt_symbol.trim();
      }
      
      if (updateTokenDto.bt_logo_url !== undefined) {
        updateData.bt_logo_url = updateTokenDto.bt_logo_url?.trim() || '';
      }
      
      if (updateTokenDto.bt_status !== undefined) {
        updateData.bt_status = updateTokenDto.bt_status;
      }

      // Cập nhật token
      await this.bittworldTokenRepository.update(
        { bt_id: tokenId },
        updateData
      );

      // Lấy token đã cập nhật
      const updatedToken = await this.bittworldTokenRepository.findOne({
        where: { bt_id: tokenId }
      });

      if (!updatedToken) {
        throw new NotFoundException(`Token with ID ${tokenId} not found after update`);
      }

      // Trả về response
      return {
        status: 200,
        message: 'Bittworld token updated successfully',
        data: {
          bt_id: updatedToken.bt_id,
          bt_name: updatedToken.bt_name,
          bt_symbol: updatedToken.bt_symbol,
          bt_address: updatedToken.bt_address,
          bt_logo_url: updatedToken.bt_logo_url,
          bt_status: updatedToken.bt_status,
          updated_at: updatedToken.updated_at
        }
      };

    } catch (error) {
      this.logger.error(`Error updating Bittworld token ${tokenId}: ${error.message}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to update Bittworld token: ${error.message}`);
    }
  }

  /**
   * Xóa token trong bảng bittworld_token
   */
  async deleteBittworldToken(tokenId: number): Promise<DeleteBittworldTokenResponseDto> {
    try {
      // Kiểm tra token có tồn tại không
      const existingToken = await this.bittworldTokenRepository.findOne({
        where: { bt_id: tokenId }
      });

      if (!existingToken) {
        throw new NotFoundException(`Token with ID ${tokenId} not found`);
      }

      // Lưu thông tin token trước khi xóa
      const deletedTokenId = existingToken.bt_id;
      const deletedAt = new Date();

      // Xóa token
      await this.bittworldTokenRepository.remove(existingToken);

      // Trả về response
      return {
        status: 200,
        message: 'Bittworld token deleted successfully',
        data: {
          deletedTokenId,
          deletedAt
        }
      };

    } catch (error) {
      this.logger.error(`Error deleting Bittworld token ${tokenId}: ${error.message}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to delete Bittworld token: ${error.message}`);
    }
  }
}
