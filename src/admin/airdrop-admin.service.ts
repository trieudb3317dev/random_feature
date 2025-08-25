import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, MoreThan, In } from 'typeorm';
import { AirdropListToken, AirdropListTokenStatus } from '../airdrops/entities/airdrop-list-token.entity';
import { AirdropListPool, AirdropPoolStatus } from '../airdrops/entities/airdrop-list-pool.entity';
import { AirdropPoolJoin, AirdropPoolJoinStatus } from '../airdrops/entities/airdrop-pool-join.entity';
import { AirdropReward, AirdropRewardStatus, AirdropRewardType, AirdropRewardSubType } from '../airdrops/entities/airdrop-reward.entity';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { 
  createTransferInstruction, 
  createAssociatedTokenAccountInstruction, 
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { AirdropPoolRound, AirdropPoolRoundStatus } from '../airdrops/entities/airdrop-pool-round.entity';
import { AirdropRoundDetail } from '../airdrops/entities/airdrop-round-detail.entity';
import { AirdropTopRound } from '../airdrops/entities/airdrop-top-round.entity';
import { AirdropTopPools } from '../airdrops/entities/airdrop-top-pools.entity';
import { CreateAirdropTokenDto } from './dto/create-airdrop-token.dto';
import { UpdateAirdropTokenDto } from './dto/update-airdrop-token.dto';
import { GetAirdropTokensDto } from './dto/get-airdrop-tokens.dto';
import { AirdropCalculateDto } from './dto/airdrop-calculate.dto';
import { UserAdmin, AdminRole } from './entities/user-admin.entity';
import { RedisLockService } from '../common/services/redis-lock.service';
import { GetAirdropRewardsDto } from './dto/get-airdrop-rewards.dto';
import bs58 from 'bs58';

@Injectable()
export class AirdropAdminService {
  private readonly logger = new Logger(AirdropAdminService.name);
  private topPoolsDataForRound: Array<{
    atp_pool_id: number;
    atp_pool_round_id: number;
    atp_token_id: number;
    atp_num_top: number;
    atp_total_volume: number;
    atp_total_reward: number;
    apt_percent_reward: number;
  }> = [];

  constructor(
    @InjectRepository(AirdropListToken)
    private readonly airdropListTokenRepository: Repository<AirdropListToken>,
    @InjectRepository(AirdropListPool)
    private readonly airdropListPoolRepository: Repository<AirdropListPool>,
    @InjectRepository(AirdropPoolJoin)
    private readonly airdropPoolJoinRepository: Repository<AirdropPoolJoin>,
    @InjectRepository(AirdropReward)
    private readonly airdropRewardRepository: Repository<AirdropReward>,
    @InjectRepository(AirdropPoolRound)
    private readonly airdropPoolRoundRepository: Repository<AirdropPoolRound>,
    @InjectRepository(AirdropRoundDetail)
    private readonly airdropRoundDetailRepository: Repository<AirdropRoundDetail>,
    @InjectRepository(AirdropTopRound)
    private readonly airdropTopRoundRepository: Repository<AirdropTopRound>,
    @InjectRepository(AirdropTopPools)
    private readonly airdropTopPoolsRepository: Repository<AirdropTopPools>,
    private readonly redisLockService: RedisLockService,
  ) {}

  async createAirdropToken(createAirdropTokenDto: CreateAirdropTokenDto, currentUser: UserAdmin) {
    // Check if user has highest admin role
    if (currentUser.role !== AdminRole.ADMIN) {
      throw new ForbiddenException('Only highest admin role can create airdrop tokens');
    }

    const { token_name, token_mint, amount_round_1, amount_round_2 } = createAirdropTokenDto;

    // Check if token already exists with active or pause status in either round
    const existingToken = await this.airdropListTokenRepository.findOne({
      where: [
        {
          alt_token_mint: token_mint,
          alt_status_1: AirdropListTokenStatus.ACTIVE,
        },
        {
          alt_token_mint: token_mint,
          alt_status_1: AirdropListTokenStatus.PAUSE,
        },
        {
          alt_token_mint: token_mint,
          alt_status_2: AirdropListTokenStatus.ACTIVE,
        },
        {
          alt_token_mint: token_mint,
          alt_status_2: AirdropListTokenStatus.PAUSE,
        },
      ],
    });

    if (existingToken) {
      throw new BadRequestException('Airdrop program for this token already exists');
    }

    // Create new airdrop token
    const newAirdropToken = new AirdropListToken();
    newAirdropToken.alt_token_name = token_name;
    newAirdropToken.alt_token_mint = token_mint;
    newAirdropToken.alt_amount_airdrop_1 = amount_round_1;
    newAirdropToken.alt_status_1 = AirdropListTokenStatus.ACTIVE;

    // Handle round 2
    if (amount_round_2 && amount_round_2 > 0) {
      newAirdropToken.alt_amount_airdrop_2 = amount_round_2;
      newAirdropToken.alt_status_2 = AirdropListTokenStatus.ACTIVE;
    } else {
      newAirdropToken.alt_amount_airdrop_2 = null;
      newAirdropToken.alt_status_2 = AirdropListTokenStatus.CANCEL;
    }

    const savedToken = await this.airdropListTokenRepository.save(newAirdropToken);

    this.logger.log(`Created airdrop token: ${token_name} (${token_mint}) by admin: ${currentUser.username}`);

    return {
      success: true,
      message: 'Airdrop token created successfully',
      data: {
        alt_id: savedToken.alt_id,
        alt_token_name: savedToken.alt_token_name,
        alt_token_mint: savedToken.alt_token_mint,
        alt_amount_airdrop_1: savedToken.alt_amount_airdrop_1,
        alt_status_1: savedToken.alt_status_1,
        alt_amount_airdrop_2: savedToken.alt_amount_airdrop_2,
        alt_status_2: savedToken.alt_status_2,
      },
    };
  }

  async updateAirdropToken(tokenId: number, updateAirdropTokenDto: UpdateAirdropTokenDto, currentUser: UserAdmin) {
    // Check if user has highest admin role
    if (currentUser.role !== AdminRole.ADMIN) {
      throw new ForbiddenException('Only highest admin role can update airdrop tokens');
    }

    // Find the token
    const existingToken = await this.airdropListTokenRepository.findOne({
      where: { alt_id: tokenId }
    });

    if (!existingToken) {
      throw new NotFoundException('Airdrop token not found');
    }

    // Check if both rounds are ended or cancelled
    const isRound1Ended = existingToken.alt_status_1 === AirdropListTokenStatus.END || existingToken.alt_status_1 === AirdropListTokenStatus.CANCEL;
    const isRound2Ended = existingToken.alt_status_2 === AirdropListTokenStatus.END || existingToken.alt_status_2 === AirdropListTokenStatus.CANCEL;

    if (isRound1Ended && isRound2Ended) {
      throw new BadRequestException('Cannot update airdrop token when both rounds are ended or cancelled');
    }

    // Check if one round is ended and the other is cancelled
    if ((existingToken.alt_status_1 === AirdropListTokenStatus.END && existingToken.alt_status_2 === AirdropListTokenStatus.CANCEL) ||
        (existingToken.alt_status_1 === AirdropListTokenStatus.CANCEL && existingToken.alt_status_2 === AirdropListTokenStatus.END)) {
      throw new BadRequestException('Cannot update airdrop token when one round is ended and the other is cancelled');
    }

    const updateData: Partial<AirdropListToken> = {};

    // Handle round 1 updates
    if (existingToken.alt_status_1 === AirdropListTokenStatus.ACTIVE || existingToken.alt_status_1 === AirdropListTokenStatus.PAUSE) {
      // Can update token_name, token_mint, amount_round_1, and status_round_1
      if (updateAirdropTokenDto.token_name !== undefined) {
        updateData.alt_token_name = updateAirdropTokenDto.token_name;
      }
      if (updateAirdropTokenDto.token_mint !== undefined) {
        updateData.alt_token_mint = updateAirdropTokenDto.token_mint;
      }
      if (updateAirdropTokenDto.amount_round_1 !== undefined) {
        updateData.alt_amount_airdrop_1 = updateAirdropTokenDto.amount_round_1;
      }
      if (updateAirdropTokenDto.status_round_1 !== undefined) {
        updateData.alt_status_1 = updateAirdropTokenDto.status_round_1;
      }
    } else if (existingToken.alt_status_1 === AirdropListTokenStatus.END || existingToken.alt_status_1 === AirdropListTokenStatus.CANCEL) {
      // Can only update round 2
      if (updateAirdropTokenDto.token_name !== undefined || 
          updateAirdropTokenDto.token_mint !== undefined || 
          updateAirdropTokenDto.amount_round_1 !== undefined || 
          updateAirdropTokenDto.status_round_1 !== undefined) {
        throw new BadRequestException('Cannot update round 1 fields when round 1 is ended or cancelled');
      }
    }

    // Handle round 2 updates
    if (existingToken.alt_status_2 === AirdropListTokenStatus.ACTIVE || existingToken.alt_status_2 === AirdropListTokenStatus.PAUSE) {
      // Can update amount_round_2 and status_round_2
      if (updateAirdropTokenDto.amount_round_2 !== undefined) {
        updateData.alt_amount_airdrop_2 = updateAirdropTokenDto.amount_round_2;
      }
      if (updateAirdropTokenDto.status_round_2 !== undefined) {
        updateData.alt_status_2 = updateAirdropTokenDto.status_round_2;
      }
    } else if (existingToken.alt_status_2 === AirdropListTokenStatus.END || existingToken.alt_status_2 === AirdropListTokenStatus.CANCEL) {
      // Cannot update round 2
      if (updateAirdropTokenDto.amount_round_2 !== undefined || updateAirdropTokenDto.status_round_2 !== undefined) {
        throw new BadRequestException('Cannot update round 2 fields when round 2 is ended or cancelled');
      }
    }

    // If no updates to make, return current data
    if (Object.keys(updateData).length === 0) {
      return {
        success: true,
        message: 'No updates to apply',
        data: {
          alt_id: existingToken.alt_id,
          alt_token_name: existingToken.alt_token_name,
          alt_token_mint: existingToken.alt_token_mint,
          alt_amount_airdrop_1: existingToken.alt_amount_airdrop_1,
          alt_status_1: existingToken.alt_status_1,
          alt_amount_airdrop_2: existingToken.alt_amount_airdrop_2,
          alt_status_2: existingToken.alt_status_2,
        },
      };
    }

    // Update the token
    await this.airdropListTokenRepository.update({ alt_id: tokenId }, updateData);

    // Get the updated token
    const updatedToken = await this.airdropListTokenRepository.findOne({
      where: { alt_id: tokenId }
    });

    if (!updatedToken) {
      throw new NotFoundException('Failed to retrieve updated airdrop token');
    }

    this.logger.log(`Updated airdrop token: ${updatedToken.alt_token_name} (${updatedToken.alt_token_mint}) by admin: ${currentUser.username}`);

    return {
      success: true,
      message: 'Airdrop token updated successfully',
      data: {
        alt_id: updatedToken.alt_id,
        alt_token_name: updatedToken.alt_token_name,
        alt_token_mint: updatedToken.alt_token_mint,
        alt_amount_airdrop_1: updatedToken.alt_amount_airdrop_1,
        alt_status_1: updatedToken.alt_status_1,
        alt_amount_airdrop_2: updatedToken.alt_amount_airdrop_2,
        alt_status_2: updatedToken.alt_status_2,
      },
    };
  }

  async getAirdropTokens(getAirdropTokensDto: GetAirdropTokensDto) {
    const { page = 1, limit = 20, status_1, status_2, search } = getAirdropTokensDto;

    // Build query
    const queryBuilder = this.airdropListTokenRepository.createQueryBuilder('token');

    // Default filter: if no status_1 is provided, only show active or pause tokens
    if (!status_1) {
      queryBuilder.where('token.alt_status_1 IN (:...status1)', { 
        status1: [AirdropListTokenStatus.ACTIVE, AirdropListTokenStatus.PAUSE] 
      });
    } else {
      queryBuilder.where('token.alt_status_1 = :status1', { status1: status_1 });
    }

    // Add status_2 filter if provided
    if (status_2) {
      queryBuilder.andWhere('token.alt_status_2 = :status2', { status2: status_2 });
    }

    // Add search condition
    if (search) {
      queryBuilder.andWhere(
        '(LOWER(token.alt_token_name) LIKE LOWER(:search) OR LOWER(token.alt_token_mint) LIKE LOWER(:search))',
        { search: `%${search}%` }
      );
    }

    // Add ordering
    queryBuilder.orderBy('token.alt_id', 'DESC');

    // Add pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Execute query
    const [tokens, total] = await queryBuilder.getManyAndCount();

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);

    this.logger.log(`Retrieved ${tokens.length} airdrop tokens (page ${page}/${totalPages})`);

    return {
      success: true,
      message: 'Airdrop tokens retrieved successfully',
      data: tokens.map(token => ({
        alt_id: token.alt_id,
        alt_token_name: token.alt_token_name,
        alt_token_mint: token.alt_token_mint,
        alt_amount_airdrop_1: token.alt_amount_airdrop_1,
        alt_status_1: token.alt_status_1,
        alt_amount_airdrop_2: token.alt_amount_airdrop_2,
        alt_status_2: token.alt_status_2,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getAirdropRewards(getAirdropRewardsDto: GetAirdropRewardsDto) {
    const { page = 1, limit = 20, token_mint, alt_id, status = AirdropRewardStatus.CAN_WITHDRAW, search, type, sub_type } = getAirdropRewardsDto;

    const offset = (page - 1) * limit;

    // Build query with proper joins
        const queryBuilder = this.airdropRewardRepository
        .createQueryBuilder('reward')
        .leftJoin('reward.tokenAirdrop', 'token')
        .leftJoin('reward.wallet', 'wallet')
        .leftJoin('wallet.wallet_auths', 'walletAuth')
        .leftJoin('walletAuth.wa_user', 'userWallet')
        .select([
          'reward.ar_id',
          'reward.ar_token_airdrop_id',
          'reward.ar_wallet_id',
          'reward.ar_wallet_address',
          'reward.ar_amount',
          'reward.ar_type',
          'reward.ar_sub_type',
          'reward.ar_status',
          'reward.ar_hash',
          'reward.ar_date',
          'wallet.wallet_solana_address',
          'wallet.bittworld_uid',
          'userWallet.uw_email',
          'token.alt_token_name',
          'token.alt_token_mint'
        ])
      .where('reward.ar_status = :status', { status });

    // Add filters
    if (token_mint) {
      queryBuilder.andWhere('token.alt_token_mint = :token_mint', { token_mint });
    }

    if (alt_id) {
      queryBuilder.andWhere('reward.ar_token_airdrop_id = :alt_id', { alt_id });
    }

    if (type) {
      queryBuilder.andWhere('reward.ar_type = :type', { type });
    }

    if (sub_type) {
      queryBuilder.andWhere('reward.ar_sub_type = :sub_type', { sub_type });
    }

    if (search) {
      queryBuilder.andWhere(
        '(wallet.wallet_solana_address ILIKE :search OR userWallet.uw_email ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Get total count
    const totalQuery = queryBuilder.clone();
    const total = await totalQuery.getCount();

    // Get paginated results
    const rewards = await queryBuilder
      .orderBy('reward.ar_date', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany();

    // Transform results
    const transformedRewards = rewards.map(reward => ({
      ar_id: reward.reward_ar_id,
      ar_token_airdrop_id: reward.reward_ar_token_airdrop_id,
      ar_wallet_id: reward.reward_ar_wallet_id,
      ar_wallet_address: reward.reward_ar_wallet_address,
      ar_amount: reward.reward_ar_amount,
      ar_type: reward.reward_ar_type,
      ar_sub_type: reward.reward_ar_sub_type,
      ar_status: reward.reward_ar_status,
      ar_hash: reward.reward_ar_hash,
      ar_date: reward.reward_ar_date,
      wallet_solana_address: reward.wallet_wallet_solana_address,
      wallet_email: reward.userWallet_uw_email,
      bittworld_uid: reward.wallet_bittworld_uid,
      token_name: reward.token_alt_token_name,
      token_mint: reward.token_alt_token_mint
    }));

    const totalPages = Math.ceil(total / limit);

    this.logger.log(`Retrieved ${transformedRewards.length} airdrop rewards (page ${page}/${totalPages}, total: ${total})`);

    return {
      rewards: transformedRewards,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * Check if airdrop calculation is in progress
   */
  private async isAirdropCalculationInProgress(): Promise<boolean> {
    try {
      const lockKey = 'airdrop_calculation_global_lock';
      const currentLock = await this.redisLockService['redisService'].get(`lock:${lockKey}`);
      
      if (!currentLock) {
        return false;
      }

      // Redis will automatically handle TTL expiration, so we just need to check if the lock exists
      return true;
    } catch (error) {
      this.logger.error('Error checking airdrop calculation lock:', error);
      return false;
    }
  }

  /**
   * Acquire global lock for airdrop calculation
   */
  private async acquireAirdropCalculationLock(): Promise<string> {
    const lockKey = 'airdrop_calculation_global_lock';
    const lockId = Math.random().toString(36).substring(2);
    const timeout = 300; // 5 minutes timeout in seconds
    
    await this.redisLockService['redisService'].set(`lock:${lockKey}`, lockId, timeout);
    
    // Verify lock was acquired
    const currentLock = await this.redisLockService['redisService'].get(`lock:${lockKey}`);
    if (currentLock !== lockId) {
      throw new Error('Failed to acquire airdrop calculation lock');
    }
    
    this.logger.log(`Acquired airdrop calculation global lock: ${lockId}`);
    return lockId;
  }

  /**
   * Release global lock for airdrop calculation
   */
  private async releaseAirdropCalculationLock(lockId: string): Promise<void> {
    try {
      const lockKey = 'airdrop_calculation_global_lock';
      const currentLock = await this.redisLockService['redisService'].get(`lock:${lockKey}`);
      
      if (currentLock === lockId) {
        await this.redisLockService['redisService'].del(`lock:${lockKey}`);
        this.logger.log(`Released airdrop calculation global lock: ${lockId}`);
      }
    } catch (error) {
      this.logger.error('Error releasing airdrop calculation lock:', error);
    }
  }

  /**
   * Process active rounds before airdrop calculation
   * 1. Check if there's an active round
   * 2. If exists, update apj_round_end and apl_round_end for active pools/stakes
   * 3. Create airdrop_round_details records for active pools
   */
  private async processActiveRounds(): Promise<{
    hasActiveRound: boolean;
    activeRoundId?: number;
    processedPools: number;
    totalVolume: number;
  }> {
    this.logger.log('Starting active round processing...');

    // Step 1: Check if there's an active round
    const activeRound = await this.airdropPoolRoundRepository.findOne({
      where: { apr_status: AirdropPoolRoundStatus.ACTIVE }
    });

    if (!activeRound) {
      this.logger.log('No active round found, skipping round processing');
      return {
        hasActiveRound: false,
        processedPools: 0,
        totalVolume: 0
      };
    }

    this.logger.log(`Found active round: ${activeRound.apr_id} (Round ${activeRound.apr_num_round})`);

    const currentTime = new Date();
    let processedPools = 0;
    let totalVolume = 0;

    // Step 2: Get all active pools
    const activePools = await this.airdropListPoolRepository
      .createQueryBuilder('pool')
      .leftJoinAndSelect('pool.poolJoins', 'joins')
      .where('pool.apl_status = :status', { status: AirdropPoolStatus.ACTIVE })
      .getMany();

    this.logger.log(`Found ${activePools.length} active pools to process`);

    for (const pool of activePools) {
      let poolTotalVolume = 0;
      let hasUpdates = false;

      // Check if pool's apl_round_end is null (not processed yet)
      if (!pool.apl_round_end) {
        // Add initial pool volume only if apl_round_end is null
        poolTotalVolume += parseFloat(pool.apl_volume?.toString() || '0');
        
        // Update pool's apl_round_end
        await this.airdropListPoolRepository.update(
          { alp_id: pool.alp_id },
          { apl_round_end: currentTime }
        );
        
        hasUpdates = true;
        this.logger.log(`Updated pool ${pool.alp_id} apl_round_end to current time, added volume: ${pool.apl_volume}`);
      } else {
        this.logger.log(`Pool ${pool.alp_id} already has apl_round_end, skipping initial volume`);
      }

      // Process active stakes for this pool
      for (const join of pool.poolJoins) {
        if (join.apj_status === AirdropPoolJoinStatus.ACTIVE && !join.apj_round_end) {
          // Add stake volume only if apj_round_end is null
          const stakeVolume = parseFloat(join.apj_volume?.toString() || '0');
          poolTotalVolume += stakeVolume;
          
          // Update stake's apj_round_end
          await this.airdropPoolJoinRepository.update(
            { apj_id: join.apj_id },
            { apj_round_end: currentTime }
          );
          
          hasUpdates = true;
          this.logger.log(`Updated stake ${join.apj_id} apj_round_end to current time, added volume: ${stakeVolume}`);
        } else if (join.apj_status === AirdropPoolJoinStatus.ACTIVE && join.apj_round_end) {
          this.logger.log(`Stake ${join.apj_id} already has apj_round_end, skipping`);
        }
      }

      if (hasUpdates) {
        // Step 3: Check if round detail already exists for this pool and round
        const existingRoundDetail = await this.airdropRoundDetailRepository.findOne({
          where: {
            ard_pool_id: pool.alp_id,
            ard_round_id: activeRound.apr_id
          }
        });

        if (existingRoundDetail) {
          this.logger.log(`Round detail already exists for pool ${pool.alp_id} and round ${activeRound.apr_id}, skipping creation`);
        } else {
          // Create airdrop_round_details record for this pool
          const roundDetail = this.airdropRoundDetailRepository.create({
            ard_pool_id: pool.alp_id,
            ard_round_id: activeRound.apr_id,
            ard_total_volume: poolTotalVolume
          });

          await this.airdropRoundDetailRepository.save(roundDetail);
          
          this.logger.log(`Created round detail for pool ${pool.alp_id} with volume: ${poolTotalVolume}`);
        }
        
        totalVolume += poolTotalVolume;
        processedPools++;
      } else {
        this.logger.log(`Pool ${pool.alp_id} has no updates needed`);
      }
    }

    this.logger.log(`Round processing completed: ${processedPools} pools processed, total volume: ${totalVolume}`);

    return {
      hasActiveRound: true,
      activeRoundId: activeRound.apr_id,
      processedPools,
      totalVolume
    };
  }

  async calculateAirdropRewards(airdropCalculateDto: AirdropCalculateDto, currentUser: UserAdmin) {
    // Check if user has highest admin role
    if (currentUser.role !== AdminRole.ADMIN) {
      throw new ForbiddenException('Only highest admin role can calculate airdrop rewards');
    }

    // Step 1: Check if there are any active airdrop tokens or tokens with TYPE_2 rewards to calculate
    const activeTokens = await this.airdropListTokenRepository.find({
      where: [
        { alt_status_1: AirdropListTokenStatus.ACTIVE },
        // Also include tokens that have ended TYPE_1 but still have TYPE_2 rewards to calculate
        {
          alt_status_1: AirdropListTokenStatus.END,
          alt_status_2: AirdropListTokenStatus.ACTIVE,
          alt_amount_airdrop_2: MoreThan(0)
        }
      ]
    });

    if (activeTokens.length === 0) {
      throw new BadRequestException('No active airdrop tokens found');
    }

    this.logger.log(`Found ${activeTokens.length} active airdrop tokens`);

    // Step 0: Acquire global lock for airdrop calculation
    let lockId: string;
    try {
      lockId = await this.acquireAirdropCalculationLock();
      this.logger.log('Acquired global lock for airdrop calculation');
    } catch (error) {
      this.logger.error('Failed to acquire global lock for airdrop calculation:', error);
      throw new BadRequestException('Airdrop calculation is already in progress. Please try again later.');
    }

    try {
      // Step 0: Process active rounds before calculation (only if active tokens exist)
      this.logger.log('Starting airdrop calculation process...');
      const roundProcessingResult = await this.processActiveRounds();
      
      if (roundProcessingResult.hasActiveRound) {
        this.logger.log(`Active round processing completed: Round ${roundProcessingResult.activeRoundId}, ${roundProcessingResult.processedPools} pools processed, total volume: ${roundProcessingResult.totalVolume}`);
      } else {
        this.logger.log('No active round found, proceeding with normal calculation');
      }

      const results: Array<{
        token_id: number;
        token_name: string;
        status: string;
        message?: string;
        total_volume?: number;
        total_rewards_created?: number;
        total_reward_amount?: number;
      }> = [];

              // Process each active token
        for (const token of activeTokens) {
          this.logger.log(`Processing token: ${token.alt_token_name} (ID: ${token.alt_id})`);
          this.logger.log(`Token configuration: status_1=${token.alt_status_1}, status_2=${token.alt_status_2}, amount_1=${token.alt_amount_airdrop_1}, amount_2=${token.alt_amount_airdrop_2}`);

        // Check if TYPE_1 rewards already exist for this token (unless force recalculate)
        let shouldSkipType1 = false;
        if (!airdropCalculateDto.forceRecalculate) {
          const existingType1Rewards = await this.airdropRewardRepository.findOne({
            where: { 
              ar_token_airdrop_id: token.alt_id,
              ar_type: AirdropRewardType.TYPE_1
            }
          });

          if (existingType1Rewards) {
            this.logger.log(`TYPE_1 rewards already exist for token ${token.alt_token_name}, skipping TYPE_1 calculation...`);
            shouldSkipType1 = true;
          }
        }

        // Check if TYPE_2 rewards already exist for this token
        let shouldSkipType2 = false;
        if (!airdropCalculateDto.forceRecalculate) {
          const existingType2Rewards = await this.airdropRewardRepository.findOne({
            where: { 
              ar_token_airdrop_id: token.alt_id,
              ar_type: AirdropRewardType.TYPE_2
            }
          });

          if (existingType2Rewards) {
            this.logger.log(`TYPE_2 rewards already exist for token ${token.alt_token_name}, skipping TYPE_2 calculation...`);
            shouldSkipType2 = true;
          }
        }

        // If both types already exist, skip the token completely
        if (shouldSkipType1 && shouldSkipType2) {
          this.logger.log(`Both TYPE_1 and TYPE_2 rewards already exist for token ${token.alt_token_name}, skipping completely...`);
          results.push({
            token_id: token.alt_id,
            token_name: token.alt_token_name,
            status: 'skipped',
            message: 'Both TYPE_1 and TYPE_2 rewards already exist for this token'
          });
          continue;
        }



        // Step 2: Calculate total volume across all ACTIVE pools (M)
        // Only calculate volume-based rewards if TYPE_1 is still active and not already calculated
        let totalVolume = 0;
        let shouldCalculateType1 = token.alt_status_1 === AirdropListTokenStatus.ACTIVE && 
                                  token.alt_amount_airdrop_1 > 0 && 
                                  !shouldSkipType1;
        
        if (shouldCalculateType1) {
          const totalVolumeResult = await this.airdropListPoolRepository
            .createQueryBuilder('pool')
            .select('COALESCE(SUM(pool.apl_volume), 0)', 'totalPoolVolume')
            .where('pool.apl_status = :status', { status: AirdropPoolStatus.ACTIVE })
            .getRawOne();

          const totalStakeResult = await this.airdropPoolJoinRepository
            .createQueryBuilder('join')
            .select('COALESCE(SUM(join.apj_volume), 0)', 'totalStakeVolume')
            .where('join.apj_status = :status', { status: AirdropPoolJoinStatus.ACTIVE })
            .getRawOne();

          totalVolume = parseFloat(totalVolumeResult?.totalPoolVolume || '0') + parseFloat(totalStakeResult?.totalStakeVolume || '0');

          if (totalVolume === 0) {
            this.logger.log(`No volume found for token ${token.alt_token_name}, skipping TYPE_1 rewards...`);
          } else {
            this.logger.log(`Total volume for token ${token.alt_token_name}: ${totalVolume}`);
          }
        } else {
          this.logger.log(`Token ${token.alt_token_name} TYPE_1 is not active or has no amount, skipping volume calculation`);
        }

        // Step 3: Get all ACTIVE pools and their volumes (only if calculating TYPE_1)
        let pools: any[] = [];
        let rewardsToCreate: Array<{
          ar_token_airdrop_id: number;
          ar_wallet_id: number;
          ar_wallet_address: string;
          ar_amount: number;
          ar_type: AirdropRewardType;
          ar_sub_type?: AirdropRewardSubType;
          ar_status: AirdropRewardStatus;
          ar_hash: string | null;
        }> = [];

        if (shouldCalculateType1 && totalVolume > 0) {
          pools = await this.airdropListPoolRepository
            .createQueryBuilder('pool')
            .leftJoinAndSelect('pool.poolJoins', 'joins')
            .leftJoinAndSelect('pool.originator', 'originator')
            .where('pool.apl_status = :status', { status: AirdropPoolStatus.ACTIVE })
            .getMany();

                    this.logger.log(`Found ${pools.length} active pools to process for TYPE_1 rewards`);

          for (const pool of pools) {

          // Calculate pool's total volume (initial + ACTIVE stakes) - X
          const poolStakeVolume = pool.poolJoins
            .filter(join => join.apj_status === AirdropPoolJoinStatus.ACTIVE)
            .reduce((sum, join) => sum + parseFloat(join.apj_volume?.toString() || '0'), 0);
          const poolTotalVolume = parseFloat(pool.apl_volume?.toString() || '0') + poolStakeVolume;

          if (poolTotalVolume === 0) {
            this.logger.log(`Pool ${pool.alp_id} has no volume, skipping...`);
            continue;
          }

          // Calculate pool's percentage of total volume (X/M %)
          const poolPercentage = poolTotalVolume / totalVolume;
          
          // Calculate pool's reward amount (Y = 100.000.000 x X/M %)
          const poolRewardAmount = token.alt_amount_airdrop_1 * poolPercentage;

          // Step 4: Calculate rewards for pool creator (10% of pool reward)
          const creatorReward = poolRewardAmount * 0.1; // 10% x Y
          const remainingReward = poolRewardAmount * 0.9; // 90% x Y

          // Get all participants (creator + ACTIVE stakers)
          const participants = new Map<number, { wallet_id: number; wallet_address: string; total_volume: number }>();

          // Add creator to participants
          if (pool.originator) {
            const creatorStakeVolume = pool.poolJoins
              .filter(join => join.apj_member === pool.originator.wallet_id && join.apj_status === AirdropPoolJoinStatus.ACTIVE)
              .reduce((sum, join) => sum + parseFloat(join.apj_volume?.toString() || '0'), 0);
            
            const creatorTotalVolume = parseFloat(pool.apl_volume?.toString() || '0') + creatorStakeVolume;
            
            participants.set(pool.originator.wallet_id, {
              wallet_id: pool.originator.wallet_id,
              wallet_address: pool.originator.wallet_solana_address,
              total_volume: creatorTotalVolume
            });

            this.logger.log(`Added creator ${pool.originator.wallet_id} with total volume: ${creatorTotalVolume}`);
          }

          // Add all ACTIVE stakers to participants
          for (const join of pool.poolJoins) {
            if (join.apj_status === AirdropPoolJoinStatus.ACTIVE && !participants.has(join.apj_member)) {
              const stakerWallet = await this.airdropPoolJoinRepository
                .createQueryBuilder('join')
                .leftJoinAndSelect('join.member', 'wallet')
                .where('join.apj_member = :walletId', { walletId: join.apj_member })
                .getOne();

              if (stakerWallet?.member) {
                const stakerVolume = parseFloat(join.apj_volume?.toString() || '0');
                participants.set(join.apj_member, {
                  wallet_id: join.apj_member,
                  wallet_address: stakerWallet.member.wallet_solana_address,
                  total_volume: stakerVolume
                });

                this.logger.log(`Added active staker ${join.apj_member} with volume: ${stakerVolume}`);
              } else {
                this.logger.warn(`Active staker wallet ${join.apj_member} not found for pool ${pool.alp_id}`);
              }
            }
          }

          this.logger.log(`Total participants in pool ${pool.alp_id}: ${participants.size}`);

          // Calculate total volume of all participants
          const totalParticipantVolume = Array.from(participants.values()).reduce((sum, participant) => sum + participant.total_volume, 0);

          // Distribute rewards to each participant
          for (const [walletId, participant] of participants) {
            let participantReward = 0;

            if (pool.originator && walletId === pool.originator.wallet_id) {
              // Creator gets 10% + their share of the remaining 90%
              const creatorSharePercentage = participant.total_volume / poolTotalVolume;
              const creatorRemainingReward = remainingReward * creatorSharePercentage;
              participantReward = creatorReward + creatorRemainingReward;
              
                          this.logger.log(`Creator ${walletId} reward: ${creatorReward} (10%) + ${creatorRemainingReward} (90% share) = ${participantReward}`);
          } else {
            // Stakers get their share of the remaining 90%
            const stakerSharePercentage = participant.total_volume / poolTotalVolume;
            participantReward = remainingReward * stakerSharePercentage;
          }

            if (participantReward > 0) {
              // Tách riêng reward cho creator thành 2 records: leader_bonus và participation_share
              if (pool.originator && walletId === pool.originator.wallet_id) {
                // Record cho Leader Bonus (10%)
                if (creatorReward > 0) {
                  rewardsToCreate.push({
                    ar_token_airdrop_id: token.alt_id,
                    ar_wallet_id: walletId,
                    ar_wallet_address: participant.wallet_address,
                    ar_amount: creatorReward,
                    ar_type: AirdropRewardType.TYPE_1,
                    ar_sub_type: AirdropRewardSubType.LEADER_BONUS,
                    ar_status: AirdropRewardStatus.CAN_WITHDRAW,
                    ar_hash: null
                  });
                  this.logger.log(`Created LEADER_BONUS reward for creator ${walletId}: ${creatorReward} tokens`);
                }

                // Record cho Participation Share (90% share)
                const creatorRemainingReward = remainingReward * (participant.total_volume / poolTotalVolume);
                if (creatorRemainingReward > 0) {
                  rewardsToCreate.push({
                    ar_token_airdrop_id: token.alt_id,
                    ar_wallet_id: walletId,
                    ar_wallet_address: participant.wallet_address,
                    ar_amount: creatorRemainingReward,
                    ar_type: AirdropRewardType.TYPE_1,
                    ar_sub_type: AirdropRewardSubType.PARTICIPATION_SHARE,
                    ar_status: AirdropRewardStatus.CAN_WITHDRAW,
                    ar_hash: null
                  });
                  this.logger.log(`Created PARTICIPATION_SHARE reward for creator ${walletId}: ${creatorRemainingReward} tokens`);
                }
              } else {
                // Record cho Staker (90% share)
                rewardsToCreate.push({
                  ar_token_airdrop_id: token.alt_id,
                  ar_wallet_id: walletId,
                  ar_wallet_address: participant.wallet_address,
                  ar_amount: participantReward,
                  ar_type: AirdropRewardType.TYPE_1,
                  ar_sub_type: AirdropRewardSubType.PARTICIPATION_SHARE,
                  ar_status: AirdropRewardStatus.CAN_WITHDRAW,
                  ar_hash: null
                });
                this.logger.log(`Created PARTICIPATION_SHARE reward for staker ${walletId}: ${participantReward} tokens`);
              }
            }
          }

          // Verify pool calculation
          const poolTotalReward = rewardsToCreate
            .filter(reward => {
              // Check if this reward belongs to this pool by checking if the wallet is a participant
              return participants.has(reward.ar_wallet_id);
            })
            .reduce((sum, reward) => sum + reward.ar_amount, 0);

          this.logger.log(`Pool ${pool.alp_id} total reward distributed: ${poolTotalReward} (expected: ${poolRewardAmount})`);
          
          if (Math.abs(poolTotalReward - poolRewardAmount) > 0.01) {
            this.logger.warn(`Pool ${pool.alp_id} reward mismatch: calculated ${poolTotalReward} vs expected ${poolRewardAmount}`);
          }
        }
        } // Close the for loop

        // Step 6: Save TYPE_1 rewards to database (only if calculated)
        if (shouldCalculateType1 && rewardsToCreate.length > 0) {
          await this.airdropRewardRepository.save(rewardsToCreate);
          this.logger.log(`Created ${rewardsToCreate.length} TYPE_1 rewards for token ${token.alt_token_name}`);
        } else if (shouldCalculateType1) {
          this.logger.warn(`No TYPE_1 rewards created for token ${token.alt_token_name}`);
        }

        // Step 7: Update token status_1 to 'end' only if TYPE_1 was calculated
        if (shouldCalculateType1) {
          await this.airdropListTokenRepository.update(
            { alt_id: token.alt_id },
            { alt_status_1: AirdropListTokenStatus.END }
          );
          this.logger.log(`Updated token ${token.alt_token_name} (ID: ${token.alt_id}) status_1 to 'end'`);
        }

        // Step 8: Calculate and distribute alt_amount_airdrop_2 rewards for top pools
        // This will be calculated regardless of TYPE_1 status, but only if TYPE_2 not already calculated
        if (token.alt_amount_airdrop_2 && token.alt_amount_airdrop_2 > 0 && !shouldSkipType2) {
          try {
            const topPoolResult = await this.calculateTopPoolRewards(
              token.alt_id,
              token.alt_amount_airdrop_2,
              roundProcessingResult.activeRoundId
            );
            
            if (topPoolResult.rewards.length > 0) {
              await this.airdropRewardRepository.save(topPoolResult.rewards);
              
              // Store top pools data for later use
              if (!this.topPoolsDataForRound) {
                this.topPoolsDataForRound = [];
              }
              
              this.topPoolsDataForRound.push(...topPoolResult.topPoolsData);
              
              // Update token status_2 to 'end' after top pool rewards calculation
              await this.airdropListTokenRepository.update(
                { alt_id: token.alt_id },
                { alt_status_2: AirdropListTokenStatus.END }
              );
            }
          } catch (error) {
            this.logger.error(`Error calculating top pool rewards for token ${token.alt_token_name}:`, error);
            // Continue with the process even if top pool rewards fail
          }
        }

        // Verify total TYPE_1 calculation (only if TYPE_1 was calculated)
        if (shouldCalculateType1) {
          const totalRewardDistributed = rewardsToCreate.reduce((sum, reward) => sum + reward.ar_amount, 0);
          const expectedTotalReward = token.alt_amount_airdrop_1;

          this.logger.log(`Token ${token.alt_token_name} total TYPE_1 reward distributed: ${totalRewardDistributed} (expected: ${expectedTotalReward})`);

          if (Math.abs(totalRewardDistributed - expectedTotalReward) > 0.01) {
            this.logger.warn(`Token ${token.alt_token_name} total TYPE_1 reward mismatch: distributed ${totalRewardDistributed} vs expected ${expectedTotalReward}`);
          }
        }

        results.push({
          token_id: token.alt_id,
          token_name: token.alt_token_name,
          status: 'completed',
          total_volume: totalVolume,
          total_rewards_created: shouldCalculateType1 ? rewardsToCreate.length : 0,
          total_reward_amount: shouldCalculateType1 ? rewardsToCreate.reduce((sum, reward) => sum + reward.ar_amount, 0) : 0
        });
      }

      // Step 9: Update active round status to 'end' and create airdrop_top_pools records
      if (roundProcessingResult.hasActiveRound && roundProcessingResult.activeRoundId) {
        // Update round status to 'end'
        await this.airdropPoolRoundRepository.update(
          { apr_id: roundProcessingResult.activeRoundId },
          { apr_status: AirdropPoolRoundStatus.END }
        );
        
        // Create airdrop_top_pools records for all processed tokens
        await this.createAirdropTopPoolsRecords(
          roundProcessingResult.activeRoundId,
          activeTokens
        );
      }

      this.logger.log(`Airdrop calculation completed by admin: ${currentUser.username}`);

      return {
        success: true,
        message: 'Airdrop rewards calculated successfully',
        data: {
          processed_tokens: results.length,
          results: results
        }
      };
    } finally {
      // Release the global lock
      await this.releaseAirdropCalculationLock(lockId);
      this.logger.log('Released global lock for airdrop calculation');
    }
  }

  /**
   * Calculate and distribute rewards for top pools based on airdrop_top_round configuration
   * MODIFIED: Now calculates directly from active pools, not dependent on airdrop_round_details
   */
  private async calculateTopPoolRewards(
    tokenId: number,
    totalRewardAmount: number,
    activeRoundId?: number
  ): Promise<{
    rewards: AirdropReward[];
    topPoolsData: Array<{
      atp_pool_id: number;
      atp_pool_round_id: number;
      atp_token_id: number;
      atp_num_top: number;
      atp_total_volume: number;
      atp_total_reward: number;
      apt_percent_reward: number;
    }>;
  }> {
    try {
      // Step 1: Get top round configuration
      const topRoundConfig = await this.airdropTopRoundRepository.find({
        order: { atr_num_top: 'ASC' }
      });

      if (topRoundConfig.length === 0) {
        return { rewards: [], topPoolsData: [] };
      }

      // Step 2: Get top pools directly from active pools
      const topPoolsQuery = this.airdropListPoolRepository
        .createQueryBuilder('pool')
        .leftJoinAndSelect('pool.poolJoins', 'joins')
        .leftJoinAndSelect('pool.originator', 'originator')
        .select([
          'pool.alp_id',
          'pool.alp_name',
          'pool.apl_volume',
          'originator.wallet_id',
          'originator.wallet_solana_address'
        ])
        .addSelect('joins.apj_volume', 'stake_volume')
        .addSelect('joins.apj_status', 'stake_status')
        .where('pool.apl_status = :status', { status: AirdropPoolStatus.ACTIVE });

      const poolsWithStakes = await topPoolsQuery.getRawMany();

      if (poolsWithStakes.length === 0) {
        return { rewards: [], topPoolsData: [] };
      }

      // Calculate total volume for each pool
      const poolVolumes = new Map<number, {
        pool_id: number;
        pool_name: string;
        total_volume: number;
        originator_wallet_id: number;
        originator_wallet_address: string;
      }>();

      for (const poolData of poolsWithStakes) {
        const poolId = poolData.pool_alp_id;
        
        if (!poolVolumes.has(poolId)) {
          poolVolumes.set(poolId, {
            pool_id: poolId,
            pool_name: poolData.pool_alp_name,
            total_volume: parseFloat(poolData.pool_apl_volume || '0'),
            originator_wallet_id: poolData.originator_wallet_id,
            originator_wallet_address: poolData.originator_wallet_solana_address
          });
        }

        // Add stake volume if stake is active
        if (poolData.stake_status === AirdropPoolJoinStatus.ACTIVE) {
          const currentPool = poolVolumes.get(poolId)!;
          currentPool.total_volume += parseFloat(poolData.stake_volume || '0');
        }
      }

      // Sort pools by total volume (descending) and get top pools
      const sortedPools = Array.from(poolVolumes.values())
        .sort((a, b) => b.total_volume - a.total_volume)
        .slice(0, topRoundConfig.length);

      if (sortedPools.length === 0) {
        return { rewards: [], topPoolsData: [] };
      }

      // Step 3: Calculate rewards for each top pool
      const rewards: AirdropReward[] = [];
      const topPoolsData: Array<{
        atp_pool_id: number;
        atp_pool_round_id: number;
        atp_token_id: number;
        atp_num_top: number;
        atp_total_volume: number;
        atp_total_reward: number;
        apt_percent_reward: number;
      }> = [];
      let totalDistributedReward = 0;

      for (let i = 0; i < Math.min(topRoundConfig.length, sortedPools.length); i++) {
        const config = topRoundConfig[i];
        const pool = sortedPools[i];
        
        // Calculate reward amount based on percentage
        const rewardAmount = (totalRewardAmount * config.atr_percent) / 100;
        totalDistributedReward += rewardAmount;

        // Create reward for pool creator
        const reward = this.airdropRewardRepository.create({
          ar_token_airdrop_id: tokenId,
          ar_wallet_id: pool.originator_wallet_id,
          ar_wallet_address: pool.originator_wallet_address,
          ar_amount: rewardAmount,
          ar_type: AirdropRewardType.TYPE_2,
          ar_sub_type: AirdropRewardSubType.TOP_POOL_REWARD,
          ar_status: AirdropRewardStatus.CAN_WITHDRAW,
          ar_hash: null
        });

        rewards.push(reward);

        // Add to top pools data
        topPoolsData.push({
          atp_pool_id: pool.pool_id,
          atp_pool_round_id: activeRoundId || 0,
          atp_token_id: tokenId,
          atp_num_top: config.atr_num_top,
          atp_total_volume: pool.total_volume,
          atp_total_reward: rewardAmount,
          apt_percent_reward: config.atr_percent
        });
      }

      // Verify total distributed reward
      if (Math.abs(totalDistributedReward - totalRewardAmount) > 0.01) {
        this.logger.warn(`Top pool rewards total mismatch: distributed ${totalDistributedReward} vs expected ${totalRewardAmount}`);
      }

      return {
        rewards,
        topPoolsData
      };

    } catch (error) {
      this.logger.error(`Error in calculateTopPoolRewards: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current top round configuration
   */
  async getTopRound() {
    try {
      this.logger.log('Getting current top round configuration');

      // Get all top round configurations
      const topRounds = await this.airdropTopRoundRepository.find({
        order: { atr_num_top: 'ASC' }
      });

      if (topRounds.length === 0) {
        this.logger.log('No top round configuration found');
        return {
          success: true,
          message: 'No top round configuration found',
          data: {
            count_top: 0,
            top_rounds: []
          }
        };
      }

      this.logger.log(`Found ${topRounds.length} top round configurations`);

      // Format response
      const formattedTopRounds = topRounds.map(tr => ({
        atr_num_top: tr.atr_num_top,
        atr_percent: tr.atr_percent
      }));

      return {
        success: true,
        message: 'Top round configuration retrieved successfully',
        data: {
          count_top: topRounds.length,
          top_rounds: formattedTopRounds
        }
      };

    } catch (error) {
      this.logger.error(`Error getting top round configuration: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set top round configuration for airdrop rewards
   */
  async setTopRound(setTopRoundDto: any) {
    try {
      const { count_top, top_rounds } = setTopRoundDto;
      
      this.logger.log(`Setting top round configuration: count_top=${count_top}, top_rounds=${JSON.stringify(top_rounds)}`);

      // If count_top = 0, clear all records
      if (count_top === 0) {
        await this.airdropTopRoundRepository.clear();
        this.logger.log('Cleared all top round configurations');
        return { success: true, message: 'All top round configurations cleared' };
      }

      // Validate count_top
      if (count_top < 1 || count_top > 10) {
        throw new Error('count_top must be between 1 and 10');
      }

      // Validate top_rounds array
      if (!top_rounds || !Array.isArray(top_rounds) || top_rounds.length !== count_top) {
        throw new Error('top_rounds array length must match count_top');
      }

      let totalPercent = 0;
      const validatedTopRounds: Array<{ atr_num_top: number; atr_percent: number }> = [];

      for (const topRound of top_rounds) {
        // Validate sequential numbering
        if (topRound.atr_num_top !== validatedTopRounds.length + 1) {
          throw new Error(`atr_num_top must be sequential starting from 1`);
        }

        // Validate percentage range
        if (topRound.atr_percent <= 0 || topRound.atr_percent >= 100) {
          throw new Error(`atr_percent must be between 1 and 99 for top ${topRound.atr_num_top}`);
        }

        validatedTopRounds.push({
          atr_num_top: topRound.atr_num_top,
          atr_percent: topRound.atr_percent
        });

        totalPercent += topRound.atr_percent;
      }

      // Validate total percentage
      if (totalPercent > 100) {
        throw new Error(`Total percentage (${totalPercent}%) cannot exceed 100%`);
      }

      // Clear existing records
      await this.airdropTopRoundRepository.clear();
      this.logger.log('Cleared existing top round configurations');

      // Create new records
      const newTopRounds = validatedTopRounds.map(topRound => {
        const entity = new AirdropTopRound();
        entity.atr_num_top = topRound.atr_num_top;
        entity.atr_percent = topRound.atr_percent;
        return entity;
      });

      const savedTopRounds = await this.airdropTopRoundRepository.save(newTopRounds);
      
      this.logger.log(`Successfully created ${savedTopRounds.length} top round configurations`);

      return {
        success: true,
        message: 'Top round configuration updated successfully',
        data: {
          count_top: savedTopRounds.length,
          top_rounds: savedTopRounds.map(tr => ({
            atr_num_top: tr.atr_num_top,
            atr_percent: tr.atr_percent
          }))
        }
      };

    } catch (error) {
      this.logger.error(`Error setting top round configuration: ${error.message}`);
      throw error;
    }
  }



  /**
   * Process airdrop withdrawals for rewards with status 'withdraw'
   */
  async processAirdropWithdraw() {
    try {
      this.logger.log('Starting airdrop withdrawal process');

      // Get all rewards with status 'withdraw' 
      const withdrawRewards = await this.airdropRewardRepository.find({
        where: { ar_status: AirdropRewardStatus.CAN_WITHDRAW },
        relations: ['tokenAirdrop', 'wallet']
      });

      if (withdrawRewards.length === 0) {
        this.logger.log('No rewards found with status "withdraw"');
        return {
          success: true,
          message: 'No rewards to withdraw',
          processed: 0,
          total: 0
        };
      }

      this.logger.log(`Found ${withdrawRewards.length} rewards to withdraw`);

      let successCount = 0;
      let errorCount = 0;
      const results: any[] = [];

      // Process each reward
      for (const reward of withdrawRewards) {
        try {
          this.logger.log(`Processing withdrawal for reward ID: ${reward.ar_id}, wallet: ${reward.ar_wallet_address}, amount: ${reward.ar_amount}`);

          // Get token mint address
          const token = await this.airdropListTokenRepository.findOne({
            where: { alt_id: reward.ar_token_airdrop_id }
          });

          if (!token) {
            this.logger.error(`Token not found for reward ID: ${reward.ar_id}`);
            errorCount++;
            results.push({
              reward_id: reward.ar_id,
              status: 'error',
              error: 'Token not found'
            });
            continue;
          }

          // Process withdrawal transaction
          const withdrawalResult = await this.processSingleWithdrawal(
            reward,
            token.alt_token_mint,
            reward.ar_wallet_address,
            reward.ar_amount
          );

          if (withdrawalResult.success) {
            // Update reward status to 'withdrawn'
            await this.airdropRewardRepository.update(
              { ar_id: reward.ar_id },
              {
                ar_status: AirdropRewardStatus.WITHDRAWN,
                ar_hash: withdrawalResult.transactionHash
              }
            );

            successCount++;
            results.push({
              reward_id: reward.ar_id,
              status: 'success',
              transaction_hash: withdrawalResult.transactionHash,
              amount: reward.ar_amount
            });

            this.logger.log(`Successfully withdrew reward ID: ${reward.ar_id}, transaction: ${withdrawalResult.transactionHash}`);
          } else {
            errorCount++;
            results.push({
              reward_id: reward.ar_id,
              status: 'error',
              error: withdrawalResult.error
            });

            this.logger.error(`Failed to withdraw reward ID: ${reward.ar_id}: ${withdrawalResult.error}`);
          }

        } catch (error) {
          this.logger.error(`Error processing withdrawal for reward ID: ${reward.ar_id}: ${error.message}`);
          errorCount++;
          results.push({
            reward_id: reward.ar_id,
            status: 'error',
            error: error.message
          });
        }
      }

      this.logger.log(`Airdrop withdrawal process completed. Success: ${successCount}, Errors: ${errorCount}`);

      return {
        success: true,
        message: 'Airdrop withdrawal process completed',
        processed: withdrawRewards.length,
        success_count: successCount,
        error_count: errorCount,
        results
      };

    } catch (error) {
      this.logger.error(`Error in processAirdropWithdraw: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process single withdrawal transaction
   */
  private async processSingleWithdrawal(
    reward: AirdropReward,
    tokenMint: string,
    recipientAddress: string,
    amount: number
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      // Get withdraw wallet private key from environment
      const withdrawWalletPrivateKey = process.env.WALLET_WITHDRAW_REWARD;
      if (!withdrawWalletPrivateKey) {
        throw new Error('WALLET_WITHDRAW_REWARD environment variable not configured');
      }

      this.logger.log(`Processing withdrawal with private key format check...`);
      this.logger.log(`Private key length: ${withdrawWalletPrivateKey.length} characters`);
      this.logger.log(`Private key starts with: ${withdrawWalletPrivateKey.substring(0, 10)}...`);
      this.logger.log(`Private key ends with: ...${withdrawWalletPrivateKey.substring(withdrawWalletPrivateKey.length - 10)}`);

      // Parse private key with better error handling
      let privateKey: string;
      let keypair: Keypair;
      
      try {
        // First try: JSON format
        try {
          const parsed = JSON.parse(withdrawWalletPrivateKey);
          privateKey = parsed.solana || parsed.privateKey || withdrawWalletPrivateKey;
          this.logger.log(`Extracted private key from JSON format`);
        } catch {
          privateKey = withdrawWalletPrivateKey;
          this.logger.log(`Using private key as direct string (not JSON format)`);
        }

        // Validate private key length
        if (!privateKey || privateKey.trim().length === 0) {
          throw new Error('Private key is empty or whitespace only');
        }

        this.logger.log(`Attempting to parse private key with length: ${privateKey.length}`);

        // Try different private key formats
        try {
          // Format 1: Base58 string (64 bytes when decoded)
          const decodedKey = bs58.decode(privateKey);
          if (decodedKey.length === 64) {
            keypair = Keypair.fromSecretKey(decodedKey);
            this.logger.log(`Successfully parsed private key as base58 (64 bytes)`);
          } else {
            throw new Error(`Invalid base58 key length: ${decodedKey.length} bytes`);
          }
        } catch (base58Error) {
          // Format 2: Comma-separated numbers
          try {
            const numberArray = privateKey.split(',').map(Number);
            if (numberArray.length === 64) {
              keypair = Keypair.fromSecretKey(new Uint8Array(numberArray));
              this.logger.log(`Successfully parsed private key as comma-separated numbers (64 elements)`);
            } else {
              throw new Error(`Invalid number array length: ${numberArray.length} elements`);
            }
          } catch (numberArrayError) {
            // Format 3: Hex string
            try {
              if (privateKey.startsWith('0x')) {
                privateKey = privateKey.slice(2);
              }
              if (privateKey.length === 128) { // 64 bytes = 128 hex chars
                const hexArray = new Uint8Array(privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
                if (hexArray.length === 64) {
                  keypair = Keypair.fromSecretKey(hexArray);
                  this.logger.log(`Successfully parsed private key as hex string (64 bytes)`);
                } else {
                  throw new Error(`Invalid hex array length: ${hexArray.length} bytes`);
                }
              } else {
                throw new Error(`Invalid hex string length: ${privateKey.length} characters`);
              }
                         } catch (hexError) {
               // Final fallback: try to create keypair directly
               try {
                 this.logger.log(`Attempting final fallback: direct keypair creation`);
                 keypair = Keypair.fromSecretKey(new Uint8Array(64).fill(0)); // This will fail but give us better error
                 throw new Error(`All parsing methods failed. Please check private key format.`);
               } catch (finalError) {
                 throw new Error(`Failed to parse private key. Tried base58, comma-separated, hex, and direct creation. Original error: ${base58Error.message}`);
               }
             }
           }
         }
       } catch (parseError) {
         this.logger.error(`Private key parsing failed: ${parseError.message}`);
         this.logger.error(`Private key format (first 20 chars): ${withdrawWalletPrivateKey.substring(0, 20)}...`);
         this.logger.error(`Private key format (last 20 chars): ...${withdrawWalletPrivateKey.substring(withdrawWalletPrivateKey.length - 20)}`);
         this.logger.error(`Private key contains commas: ${withdrawWalletPrivateKey.includes(',')}`);
         this.logger.error(`Private key contains spaces: ${withdrawWalletPrivateKey.includes(' ')}`);
         throw new Error(`Invalid private key format: ${parseError.message}. Please check WALLET_WITHDRAW_REWARD environment variable.`);
       }

      // Get Solana connection
      const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

      // Get token mint info and determine program type
      const mintPublicKey = new PublicKey(tokenMint);
      this.logger.log(`Token mint public key: ${mintPublicKey.toString()}`);
      
      const { tokenInfo, programType } = await this.getTokenInfoAndProgramType(mintPublicKey);
      this.logger.log(`Token info: decimals=${tokenInfo.decimals}, symbol=${tokenInfo.symbol}, name=${tokenInfo.name}`);
      this.logger.log(`Processing withdrawal for token ${tokenMint} with program type: ${programType}`);

      // Calculate raw amount based on token decimals
      const rawAmount = amount * Math.pow(10, tokenInfo.decimals);
      this.logger.log(`Amount calculation: ${amount} * 10^${tokenInfo.decimals} = ${rawAmount} (raw)`);

      // Get or create ATA for sender (withdraw wallet) based on program type
      this.logger.log(`Getting/creating sender ATA for withdraw wallet: ${keypair.publicKey.toString()}`);
      const senderATA = await this.getOrCreateATA(
        mintPublicKey,
        keypair.publicKey,
        connection,
        programType,
        keypair
      );
      this.logger.log(`Sender ATA: ${senderATA.toString()}`);

      // Get recipient ATA address (don't create if it doesn't exist)
      const recipientATA = await getAssociatedTokenAddress(
        mintPublicKey,
        new PublicKey(recipientAddress),
        false,
        programType === 'spl-token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
      );
      
      this.logger.log(`Recipient ATA address: ${recipientATA.toString()}`);

      // Check if recipient ATA exists, if not create it using withdraw wallet
      this.logger.log(`Checking if recipient ATA exists...`);
      const recipientAccountInfo = await connection.getAccountInfo(recipientATA);
      if (!recipientAccountInfo) {
        this.logger.log(`Recipient ATA does not exist, creating it using withdraw wallet...`);
        
        const createRecipientAtaInstruction = createAssociatedTokenAccountInstruction(
          keypair.publicKey, // payer (withdraw wallet)
          recipientATA,       // ATA address
          new PublicKey(recipientAddress), // owner
          mintPublicKey,      // mint
          programType === 'spl-token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
        );

        const createAtaTransaction = new Transaction().add(createRecipientAtaInstruction);
        createAtaTransaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        createAtaTransaction.feePayer = keypair.publicKey;

        const createAtaSignature = await connection.sendTransaction(createAtaTransaction, [keypair]);
        await connection.confirmTransaction(createAtaSignature, 'confirmed');
        
        this.logger.log(`Created recipient ATA: ${recipientATA.toString()}`);
        
        // Wait for ATA to be fully initialized (Solana needs time to process)
        this.logger.log(`Waiting for ATA to be fully initialized...`);
        this.logger.log(`This is necessary because Solana needs time to process the ATA creation`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        // Verify ATA is properly initialized with retry
        let verifyAtaInfo: any = null;
        let verifyRetryCount = 0;
        const maxVerifyRetries = 5;
        
        while (verifyRetryCount < maxVerifyRetries && !verifyAtaInfo) {
          try {
            verifyAtaInfo = await connection.getAccountInfo(recipientATA);
                    if (verifyAtaInfo && verifyAtaInfo.data && verifyAtaInfo.data.length > 0) {
          this.logger.log(`Verified recipient ATA is properly initialized with size: ${verifyAtaInfo.data.length} bytes`);
          break;
        } else if (verifyAtaInfo) {
          this.logger.warn(`ATA exists but data length is ${verifyAtaInfo.data?.length || 0}, continuing verification...`);
        }
          } catch (error) {
            this.logger.warn(`Verification attempt ${verifyRetryCount + 1} failed: ${error.message}`);
          }
          
          verifyRetryCount++;
          if (verifyRetryCount < maxVerifyRetries) {
            this.logger.log(`Waiting additional 2 seconds before retry ${verifyRetryCount + 1}...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        if (!verifyAtaInfo) {
          throw new Error(`Failed to verify recipient ATA after ${maxVerifyRetries} attempts: ${recipientATA.toString()}`);
        }
      } else {
        // ATA exists, verify it's properly initialized
        this.logger.log(`Recipient ATA already exists: ${recipientATA.toString()}`);
        
        // Check if ATA is properly initialized (should have data)
        if (recipientAccountInfo.data && recipientAccountInfo.data.length > 0) {
          this.logger.log(`Recipient ATA is properly initialized with size: ${recipientAccountInfo.data.length} bytes`);
        } else {
          this.logger.warn(`Recipient ATA exists but has no data or empty data, this might cause transfer issues`);
          this.logger.log(`ATA data length: ${recipientAccountInfo.data?.length || 0}`);
        }
      }
      
      // Additional verification: ensure both ATAs are ready for transfer
      this.logger.log(`Final verification before transfer:`);
      this.logger.log(`- Sender ATA: ${senderATA.toString()}`);
      this.logger.log(`- Recipient ATA: ${recipientATA.toString()}`);
      this.logger.log(`- Token mint: ${tokenMint}`);
      this.logger.log(`- Amount to transfer: ${rawAmount} (raw), ${amount} (display)`);
      
      // Final check: ensure recipient ATA is ready for receiving tokens
      const finalRecipientCheck = await connection.getAccountInfo(recipientATA);
      if (!finalRecipientCheck || !finalRecipientCheck.data || finalRecipientCheck.data.length === 0) {
        throw new Error(`Recipient ATA is not ready for transfer. Data length: ${finalRecipientCheck?.data?.length || 0}`);
      }
      
      this.logger.log(`Recipient ATA is confirmed ready for transfer with data size: ${finalRecipientCheck.data.length} bytes`);

      // Check sender balance
      const senderBalance = await connection.getTokenAccountBalance(senderATA);
      this.logger.log(`Sender ATA balance: ${senderBalance.value.amount} (raw), ${parseFloat(senderBalance.value.amount) / Math.pow(10, tokenInfo.decimals)} (display)`);
      
      if (parseInt(senderBalance.value.amount) < rawAmount) {
        throw new Error(`Insufficient token balance. Required: ${rawAmount}, Available: ${senderBalance.value.amount}`);
      }

      // Check if withdraw wallet has enough SOL for all operations (ATA creation + transfer)
      const withdrawWalletBalance = await connection.getBalance(keypair.publicKey);
      const estimatedTotalFee = 0.0025; // Estimated total fee: 0.002 for ATA + 0.0005 for transfer (in SOL)
      
      this.logger.log(`Withdraw wallet SOL balance: ${withdrawWalletBalance / 1e9} SOL, Required: ${estimatedTotalFee} SOL`);
      
      if (withdrawWalletBalance < estimatedTotalFee * 1e9) { // Convert to lamports
        throw new Error(`Insufficient SOL balance for operations. Required: ${estimatedTotalFee} SOL, Available: ${withdrawWalletBalance / 1e9} SOL`);
      }

      // Create transfer instruction based on program type
      let transferInstruction;
      if (programType === 'spl-token-2022') {
        // Use SPL Token-2022 program
        this.logger.log(`Creating SPL Token-2022 transfer instruction`);
        transferInstruction = createTransferInstruction(
          senderATA,
          recipientATA,
          keypair.publicKey,
          rawAmount,
          [],
          TOKEN_2022_PROGRAM_ID
        );
      } else {
        // Use standard SPL Token program
        this.logger.log(`Creating standard SPL Token transfer instruction`);
        transferInstruction = createTransferInstruction(
          senderATA,
          recipientATA,
          keypair.publicKey,
          rawAmount
        );
      }
      
      this.logger.log(`Transfer instruction created successfully`);

      // Create transaction
      const transaction = new Transaction().add(transferInstruction);
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = keypair.publicKey;
      
      this.logger.log(`Transaction created with blockhash: ${transaction.recentBlockhash}`);

      // Sign and send transaction with retry mechanism
      let signature: string | undefined;
      let confirmation: any;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          this.logger.log(`Attempting transfer transaction (attempt ${retryCount + 1}/${maxRetries})`);
          
          signature = await connection.sendTransaction(transaction, [keypair]);
          
          // Wait for confirmation
          confirmation = await connection.confirmTransaction(signature, 'confirmed');
          
          if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
          }
          
          this.logger.log(`Transfer transaction successful on attempt ${retryCount + 1}`);
          break; // Success, exit retry loop
          
        } catch (error) {
          retryCount++;
          this.logger.warn(`Transfer attempt ${retryCount} failed: ${error.message}`);
          
          if (retryCount >= maxRetries) {
            throw new Error(`Transfer failed after ${maxRetries} attempts. Last error: ${error.message}`);
          }
          
                  // Wait before retry
        const waitTime = 1000 * retryCount; // Exponential backoff
        this.logger.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Get new blockhash for retry
        this.logger.log(`Getting new blockhash for retry...`);
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        this.logger.log(`New blockhash: ${transaction.recentBlockhash}`);
        }
      }
      
      // Ensure signature was obtained
      if (!signature) {
        throw new Error('Failed to obtain transaction signature after all retry attempts');
      }

      this.logger.log(`Withdrawal transaction successful: ${signature} for ${programType} token`);
      this.logger.log(`Transaction details:`);
      this.logger.log(`- Signature: ${signature}`);
      this.logger.log(`- From: ${senderATA.toString()}`);
      this.logger.log(`- To: ${recipientATA.toString()}`);
      this.logger.log(`- Amount: ${rawAmount} (raw), ${amount} (display)`);
      this.logger.log(`- Program: ${programType}`);

      return {
        success: true,
        transactionHash: signature
      };

    } catch (error) {
      this.logger.error(`Error in processSingleWithdrawal: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get token info and determine program type from Solana
   */
  private async getTokenInfoAndProgramType(mint: PublicKey): Promise<{ 
    tokenInfo: { decimals: number; symbol: string; name: string }; 
    programType: 'spl-token' | 'spl-token-2022' 
  }> {
    try {
      const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
      
      // Try to get token info
      const mintInfo = await connection.getParsedAccountInfo(mint);
      
      if (mintInfo.value?.data) {
        const parsedData = mintInfo.value.data as any;
        if (parsedData.parsed?.info) {
          // Determine program type based on owner
          const owner = mintInfo.value.owner.toString();
          const programType = owner === TOKEN_2022_PROGRAM_ID.toString() ? 'spl-token-2022' : 'spl-token';
          
          this.logger.log(`Token ${mint.toString()} uses program: ${programType} (owner: ${owner})`);
          
          return {
            tokenInfo: {
              decimals: parsedData.parsed.info.decimals,
              symbol: parsedData.parsed.info.symbol,
              name: parsedData.parsed.info.name
            },
            programType
          };
        }
      }

      // Fallback to default values and try to determine program type
      try {
        const accountInfo = await connection.getAccountInfo(mint);
        if (accountInfo) {
          const owner = accountInfo.owner.toString();
          const programType = owner === TOKEN_2022_PROGRAM_ID.toString() ? 'spl-token-2022' : 'spl-token';
          
          this.logger.log(`Token ${mint.toString()} uses program: ${programType} (owner: ${owner})`);
          
          return {
            tokenInfo: {
              decimals: 6,
              symbol: 'TOKEN',
              name: 'Unknown Token'
            },
            programType
          };
        }
      } catch (fallbackError) {
        this.logger.warn(`Could not determine program type for ${mint.toString()}: ${fallbackError.message}`);
      }

      // Default fallback
      this.logger.warn(`Using default SPL Token program for ${mint.toString()}`);
      return {
        tokenInfo: {
          decimals: 6,
          symbol: 'TOKEN',
          name: 'Unknown Token'
        },
        programType: 'spl-token'
      };
    } catch (error) {
      this.logger.warn(`Could not get token info for ${mint.toString()}, using defaults: ${error.message}`);
      return {
        tokenInfo: {
          decimals: 6,
          symbol: 'TOKEN',
          name: 'Unknown Token'
        },
        programType: 'spl-token'
      };
    }
  }

  /**
   * Get token info from Solana (legacy method for backward compatibility)
   */
  private async getTokenInfo(mint: PublicKey): Promise<{ decimals: number; symbol: string; name: string }> {
    const result = await this.getTokenInfoAndProgramType(mint);
    return result.tokenInfo;
  }

  /**
   * Get or create Associated Token Account
   */
  private async getOrCreateATA(
    mint: PublicKey,
    owner: PublicKey,
    connection: Connection,
    programType: 'spl-token' | 'spl-token-2022' = 'spl-token',
    keypair?: Keypair
  ): Promise<PublicKey> {
    try {
      // Determine program ID based on program type
      const programId = programType === 'spl-token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      
      this.logger.log(`Creating/getting ATA for ${programType} program: ${programId.toString()}`);

      // Try to get existing ATA
      const ata = await getAssociatedTokenAddress(mint, owner, false, programId);
      const accountInfo = await connection.getAccountInfo(ata);
      
      if (accountInfo) {
        this.logger.log(`ATA already exists: ${ata.toString()}`);
        return ata;
      }

      // Create ATA if it doesn't exist
      if (!keypair) {
        throw new Error('Keypair is required to create ATA');
      }

      // Note: SOL balance check is already done in the main withdrawal function
      // to avoid duplicate checks and optimize performance
      // This function will only be called when we have a valid keypair

      const createAtaInstruction = createAssociatedTokenAccountInstruction(
        owner,
        ata,
        owner,
        mint,
        programId
      );

      const transaction = new Transaction().add(createAtaInstruction);
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = owner;

      // Use the provided keypair to sign the transaction
      const signature = await connection.sendTransaction(transaction, [keypair]);
      await connection.confirmTransaction(signature, 'confirmed');

      this.logger.log(`Created new ATA: ${ata.toString()} for ${programType} program`);
      this.logger.log(`ATA creation transaction signature: ${signature}`);

      return ata;
    } catch (error) {
      this.logger.error(`Error creating ATA for ${programType} program: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create airdrop_top_pools records for the processed round
   */
  private async createAirdropTopPoolsRecords(
    roundId: number,
    activeTokens: AirdropListToken[]
  ): Promise<void> {
    try {
      if (this.topPoolsDataForRound.length === 0) {
        return;
      }

      // Create AirdropTopPools entities
      const topPoolsEntities = this.topPoolsDataForRound.map((data) => {
        const entity = new AirdropTopPools();
        entity.atp_pool_id = data.atp_pool_id;
        entity.atp_pool_round_id = data.atp_pool_round_id;
        entity.atp_token_id = data.atp_token_id;
        entity.atp_num_top = data.atp_num_top;
        entity.atp_total_volume = data.atp_total_volume;
        entity.atp_total_reward = data.atp_total_reward;
        entity.apt_percent_reward = data.apt_percent_reward;
        return entity;
      });

      // Save to database
      await this.airdropTopPoolsRepository.save(topPoolsEntities);

      // Clear the data for next round
      this.topPoolsDataForRound = [];

    } catch (error) {
      this.logger.error(`Error creating airdrop_top_pools records: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test private key format (for debugging)
   */
  public async testPrivateKeyFormat(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const withdrawWalletPrivateKey = process.env.WALLET_WITHDRAW_REWARD;
      if (!withdrawWalletPrivateKey) {
        return { success: false, message: 'WALLET_WITHDRAW_REWARD environment variable not configured' };
      }

      const details = {
        length: withdrawWalletPrivateKey.length,
        startsWith: withdrawWalletPrivateKey.substring(0, 10),
        endsWith: withdrawWalletPrivateKey.substring(withdrawWalletPrivateKey.length - 10),
        containsCommas: withdrawWalletPrivateKey.includes(','),
        containsBrackets: withdrawWalletPrivateKey.includes('[') || withdrawWalletPrivateKey.includes(']'),
        containsQuotes: withdrawWalletPrivateKey.includes('"') || withdrawWalletPrivateKey.includes("'"),
        isHex: /^[0-9a-fA-F]+$/.test(withdrawWalletPrivateKey),
        isBase58: /^[1-9A-HJ-NP-Za-km-z]+$/.test(withdrawWalletPrivateKey)
      };

      // Try to parse
      let parsedSuccessfully = false;
      let parseMethod = '';

      try {
        // Try JSON first
        const parsed = JSON.parse(withdrawWalletPrivateKey);
        if (parsed.solana || parsed.privateKey) {
          parsedSuccessfully = true;
          parseMethod = 'JSON format';
        }
      } catch {}

      if (!parsedSuccessfully) {
        try {
          // Try base58
          const decoded = bs58.decode(withdrawWalletPrivateKey);
          if (decoded.length === 64) {
            parsedSuccessfully = true;
            parseMethod = 'Base58 format';
          }
        } catch {}

        if (!parsedSuccessfully) {
          try {
            // Try comma-separated
            const numbers = withdrawWalletPrivateKey.split(',').map(Number);
            if (numbers.length === 64 && !numbers.some(isNaN)) {
              parsedSuccessfully = true;
              parseMethod = 'Comma-separated numbers';
            }
          } catch {}
        }
      }

      return {
        success: true,
        message: `Private key format analysis completed`,
        details: {
          ...details,
          parsedSuccessfully,
          parseMethod: parsedSuccessfully ? parseMethod : 'None'
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Error analyzing private key: ${error.message}`
      };
    }
  }

  /**
   * Process airdrop withdrawals with batch optimization
   * Groups rewards by token_mint and ar_sub_type to minimize transaction fees
   */
  async processAirdropWithdrawOptimized() {
    try {
      this.logger.log('Starting optimized airdrop withdrawal process');

      // Get all rewards with status 'can_withdraw' 
      const withdrawRewards = await this.airdropRewardRepository.find({
        where: { ar_status: AirdropRewardStatus.CAN_WITHDRAW },
        relations: ['tokenAirdrop', 'wallet']
      });

      if (withdrawRewards.length === 0) {
        this.logger.log('No rewards found with status "can_withdraw"');
        return {
          success: true,
          message: 'No rewards to withdraw',
          processed: 0,
          total: 0
        };
      }

      this.logger.log(`Found ${withdrawRewards.length} rewards to withdraw`);

      // Group rewards by token_mint and ar_sub_type for batch processing
      const groupedRewards = this.groupRewardsByTokenAndSubType(withdrawRewards);
      
      this.logger.log(`Grouped into ${Object.keys(groupedRewards).length} batches for optimization`);

      let successCount = 0;
      let errorCount = 0;
      const results: any[] = [];

      // Process each batch
      for (const [batchKey, rewards] of Object.entries(groupedRewards)) {
        try {
          this.logger.log(`Processing batch: ${batchKey} with ${rewards.length} rewards`);

          const batchResult = await this.processBatchWithdrawal(rewards);
          
          if (batchResult.success) {
            // Update all rewards in this batch
            const rewardIds = rewards.map(r => r.ar_id);
            await this.airdropRewardRepository.update(
              { ar_id: In(rewardIds) },
              {
                ar_status: AirdropRewardStatus.WITHDRAWN,
                ar_hash: batchResult.transactionHash
              }
            );

            successCount += rewards.length;
            results.push({
              batch_key: batchKey,
              status: 'success',
              transaction_hash: batchResult.transactionHash,
              rewards_count: rewards.length,
              total_amount: batchResult.totalAmount,
              fee_saved: batchResult.feeSaved
            });

            this.logger.log(`Successfully processed batch ${batchKey}: ${rewards.length} rewards, transaction: ${batchResult.transactionHash}`);
          } else {
            errorCount += rewards.length;
            results.push({
              batch_key: batchKey,
              status: 'error',
              error: batchResult.error,
              rewards_count: rewards.length
            });

            this.logger.error(`Failed to process batch ${batchKey}: ${batchResult.error}`);
          }

        } catch (error) {
          this.logger.error(`Error processing batch ${batchKey}: ${error.message}`);
          errorCount += rewards.length;
          results.push({
            batch_key: batchKey,
            status: 'error',
            error: error.message,
            rewards_count: rewards.length
          });
        }
      }

      this.logger.log(`Optimized airdrop withdrawal process completed. Success: ${successCount}, Errors: ${errorCount}`);

      return {
        success: true,
        message: 'Optimized airdrop withdrawal process completed',
        processed: withdrawRewards.length,
        success_count: successCount,
        error_count: errorCount,
        batches_processed: Object.keys(groupedRewards).length,
        results
      };

    } catch (error) {
      this.logger.error(`Error in processAirdropWithdrawOptimized: ${error.message}`);
      throw error;
    }
  }

  /**
   * Group rewards by token_mint, wallet_address and ar_sub_type for batch processing
   * This ensures each wallet receives separate transactions for different reward types
   */
  private groupRewardsByTokenAndSubType(rewards: AirdropReward[]): Record<string, AirdropReward[]> {
    const grouped: Record<string, AirdropReward[]> = {};

    for (const reward of rewards) {
      // Get token mint address
      const tokenMint = reward.tokenAirdrop?.alt_token_mint;
      if (!tokenMint) {
        this.logger.warn(`Reward ${reward.ar_id} has no token mint, skipping`);
        continue;
      }

      // Create batch key: tokenMint_walletAddress_subType
      // This groups rewards by token, wallet, and reward type
      const batchKey = `${tokenMint}_${reward.ar_wallet_address}_${reward.ar_sub_type || 'unknown'}`;
      
      if (!grouped[batchKey]) {
        grouped[batchKey] = [];
      }
      
      grouped[batchKey].push(reward);
    }

    // Log grouping results with detailed breakdown
    for (const [batchKey, batchRewards] of Object.entries(grouped)) {
      const totalAmount = batchRewards.reduce((sum, r) => sum + parseFloat(r.ar_amount.toString()), 0);
      const [tokenMint, walletAddress, subType] = batchKey.split('_');
      this.logger.log(`Batch ${batchKey}: ${batchRewards.length} rewards, wallet: ${walletAddress}, sub_type: ${subType}, total amount: ${totalAmount}`);
    }

    return grouped;
  }

  /**
   * Process batch withdrawal for rewards with same token, wallet and sub_type
   */
  private async processBatchWithdrawal(rewards: AirdropReward[]): Promise<{
    success: boolean;
    transactionHash?: string;
    error?: string;
    totalAmount?: number;
    feeSaved?: number;
  }> {
    try {
      if (rewards.length === 0) {
        return { success: false, error: 'No rewards to process' };
      }

      // All rewards should have same token, wallet and sub_type
      const firstReward = rewards[0];
      const tokenMint = firstReward.tokenAirdrop?.alt_token_mint;
      const walletAddress = firstReward.ar_wallet_address;
      const subType = firstReward.ar_sub_type;

      if (!tokenMint) {
        return { success: false, error: 'Token mint not found' };
      }

      this.logger.log(`Processing batch withdrawal for token: ${tokenMint}, wallet: ${walletAddress}, sub_type: ${subType}, rewards: ${rewards.length}`);

      // Since all rewards in this batch are for the same wallet and sub_type,
      // we can simply sum up all amounts
      const totalAmount = rewards.reduce((sum, reward) => sum + parseFloat(reward.ar_amount.toString()), 0);

      // Calculate fee savings
      const individualFee = 0.0005; // Estimated fee per individual transaction
      const batchFee = 0.0005; // Single transaction fee for the batch
      const feeSaved = (rewards.length * individualFee) - batchFee;

      this.logger.log(`Total amount for wallet ${walletAddress}: ${totalAmount}, Fee saved: ${feeSaved} SOL`);

      // Process single withdrawal to the wallet
      const batchResult = await this.processBatchTransfer(
        tokenMint,
        [{ address: walletAddress, amount: totalAmount }]
      );

      if (batchResult.success) {
        return {
          success: true,
          transactionHash: batchResult.transactionHash,
          totalAmount,
          feeSaved
        };
      } else {
        return {
          success: false,
          error: batchResult.error,
          totalAmount,
          feeSaved
        };
      }

    } catch (error) {
      this.logger.error(`Error in processBatchWithdrawal: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process batch transfer to recipients (now optimized for single recipient per batch)
   */
  private async processBatchTransfer(
    tokenMint: string,
    recipients: Array<{ address: string; amount: number }>
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      // Get withdraw wallet private key
      const withdrawWalletPrivateKey = process.env.WALLET_WITHDRAW_REWARD;
      if (!withdrawWalletPrivateKey) {
        throw new Error('WALLET_WITHDRAW_REWARD environment variable not configured');
      }

      // Parse keypair (reuse existing logic)
      const keypair = await this.parseKeypair(withdrawWalletPrivateKey);
      
      // Get Solana connection
      const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

      // Get token info and program type
      const mintPublicKey = new PublicKey(tokenMint);
      const { tokenInfo, programType } = await this.getTokenInfoAndProgramType(mintPublicKey);

      // Get sender ATA
      const senderATA = await this.getOrCreateATA(
        mintPublicKey,
        keypair.publicKey,
        connection,
        programType,
        keypair
      );

      // Check sender balance
      const senderBalance = await connection.getTokenAccountBalance(senderATA);
      const totalRawAmount = recipients.reduce((sum, r) => sum + (r.amount * Math.pow(10, tokenInfo.decimals)), 0);
      
      if (parseInt(senderBalance.value.amount) < totalRawAmount) {
        throw new Error(`Insufficient token balance. Required: ${totalRawAmount}, Available: ${senderBalance.value.amount}`);
      }

      // Check SOL balance for fees
      const withdrawWalletBalance = await connection.getBalance(keypair.publicKey);
      const estimatedFee = 0.0005 + (recipients.length * 0.0001); // Base fee + per recipient fee
      
      if (withdrawWalletBalance < estimatedFee * 1e9) {
        throw new Error(`Insufficient SOL balance for batch transfer. Required: ${estimatedFee} SOL, Available: ${withdrawWalletBalance / 1e9} SOL`);
      }

      // Create transaction with multiple transfer instructions
      const transaction = new Transaction();
      const programId = programType === 'spl-token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

      for (const recipient of recipients) {
        const recipientATA = await getAssociatedTokenAddress(
          mintPublicKey,
          new PublicKey(recipient.address),
          false,
          programId
        );

        // Check if recipient ATA exists, create if needed
        const recipientAccountInfo = await connection.getAccountInfo(recipientATA);
        if (!recipientAccountInfo) {
          const createAtaInstruction = createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            recipientATA,
            new PublicKey(recipient.address),
            mintPublicKey,
            programId
          );
          transaction.add(createAtaInstruction);
        }

        // Create transfer instruction
        const rawAmount = recipient.amount * Math.pow(10, tokenInfo.decimals);
        const transferInstruction = createTransferInstruction(
          senderATA,
          recipientATA,
          keypair.publicKey,
          rawAmount,
          [],
          programId
        );
        transaction.add(transferInstruction);
      }

      // Set transaction parameters
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = keypair.publicKey;

      // Send transaction with retry mechanism
      let signature: string | undefined;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          this.logger.log(`Attempting batch transfer (attempt ${retryCount + 1}/${maxRetries})`);
          
          signature = await connection.sendTransaction(transaction, [keypair]);
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');
          
          if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
          }
          
          this.logger.log(`Batch transfer successful on attempt ${retryCount + 1}`);
          break;
          
        } catch (error) {
          retryCount++;
          this.logger.warn(`Batch transfer attempt ${retryCount} failed: ${error.message}`);
          
          if (retryCount >= maxRetries) {
            throw new Error(`Batch transfer failed after ${maxRetries} attempts. Last error: ${error.message}`);
          }
          
          // Wait before retry and get new blockhash
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        }
      }

      if (!signature) {
        throw new Error('Failed to obtain transaction signature after all retry attempts');
      }

      this.logger.log(`Batch transfer successful: ${signature}`);
      this.logger.log(`Transferred to ${recipients.length} recipients, total amount: ${recipients.reduce((sum, r) => sum + r.amount, 0)}`);

      return {
        success: true,
        transactionHash: signature
      };

    } catch (error) {
      this.logger.error(`Error in processBatchTransfer: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse keypair from private key (extracted from existing logic)
   */
  private async parseKeypair(privateKeyString: string): Promise<Keypair> {
    let privateKey: string;
    let keypair: Keypair;
    
    try {
      // First try: JSON format
      try {
        const parsed = JSON.parse(privateKeyString);
        privateKey = parsed.solana || parsed.privateKey || privateKeyString;
      } catch {
        privateKey = privateKeyString;
      }

      // Validate private key length
      if (!privateKey || privateKey.trim().length === 0) {
        throw new Error('Private key is empty or whitespace only');
      }

      // Try different private key formats
      try {
        // Format 1: Base58 string
        const decodedKey = bs58.decode(privateKey);
        if (decodedKey.length === 64) {
          keypair = Keypair.fromSecretKey(decodedKey);
          return keypair;
        }
      } catch {}

      try {
        // Format 2: Comma-separated numbers
        const numberArray = privateKey.split(',').map(Number);
        if (numberArray.length === 64) {
          keypair = Keypair.fromSecretKey(new Uint8Array(numberArray));
          return keypair;
        }
      } catch {}

      try {
        // Format 3: Hex string
        let hexKey = privateKey;
        if (hexKey.startsWith('0x')) {
          hexKey = hexKey.slice(2);
        }
        if (hexKey.length === 128) {
          const hexArray = new Uint8Array(hexKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
          if (hexArray.length === 64) {
            keypair = Keypair.fromSecretKey(hexArray);
            return keypair;
          }
        }
      } catch {}

      throw new Error('Failed to parse private key in any supported format');

    } catch (error) {
      throw new Error(`Invalid private key format: ${error.message}`);
    }
  }
} 