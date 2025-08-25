import { Injectable, Logger, BadRequestException, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AirdropListPool, AirdropPoolStatus } from '../entities/airdrop-list-pool.entity';
import { AirdropPoolJoin, AirdropPoolJoinStatus } from '../entities/airdrop-pool-join.entity';
import { AirdropReward, AirdropRewardType, AirdropRewardSubType, AirdropRewardStatus } from '../entities/airdrop-reward.entity';

import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { CreatePoolDto } from '../dto/create-pool.dto';
import { StakePoolDto } from '../dto/join-pool.dto';
import { PoolInfoDto } from '../dto/get-pools-response.dto';
import { PoolDetailDto, MemberInfoDto } from '../dto/get-pool-detail-response.dto';
import { GetPoolDetailDto, SortField, SortOrder } from '../dto/get-pool-detail.dto';
import { PoolDetailTransactionsDto, TransactionInfoDto } from '../dto/get-pool-detail-transactions-response.dto';
import { GetPoolDetailTransactionsDto, TransactionSortField, TransactionSortOrder } from '../dto/get-pool-detail-transactions.dto';
import { GetPoolsDto, PoolSortField, PoolSortOrder, PoolFilterType } from '../dto/get-pools.dto';

import { SolanaService } from '../../solana/solana.service';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import bs58 from 'bs58';
import { RedisLockService } from '../../common/services/redis-lock.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { UpdatePoolDto } from '../dto/update-pool.dto';
import { GetRewardHistoryDto, RewardHistorySortField, RewardHistorySortOrder } from '../dto/get-reward-history.dto';

@Injectable()
export class AirdropsService {
    private readonly logger = new Logger(AirdropsService.name);
    private readonly MAX_RETRY_ATTEMPTS = 3;
    private readonly LOCK_TTL = 300; // 5 minutes

    constructor(
        @InjectRepository(AirdropListPool)
        private readonly airdropListPoolRepository: Repository<AirdropListPool>,
        @InjectRepository(AirdropPoolJoin)
        private readonly airdropPoolJoinRepository: Repository<AirdropPoolJoin>,
        @InjectRepository(AirdropReward)
        private readonly airdropRewardRepository: Repository<AirdropReward>,
        
        @InjectRepository(ListWallet)
        private readonly listWalletRepository: Repository<ListWallet>,
        private readonly configService: ConfigService,
        private readonly solanaService: SolanaService,
        @Inject('SOLANA_CONNECTION')
        private readonly connection: Connection,
        private readonly redisLockService: RedisLockService,
        private readonly cloudinaryService: CloudinaryService
    ) {}

    /**
     * Check if airdrop calculation is in progress
     */
    private async isAirdropCalculationInProgress(): Promise<boolean> {
        try {
            const lockKey = 'airdrop_calculation_global_lock';
            const currentLock = await this.redisLockService['redisService'].get(`lock:${lockKey}`);
            return !!currentLock;
        } catch (error) {
            this.logger.error('Error checking airdrop calculation lock:', error);
            return false;
        }
    }

    async createPool(walletId: number, createPoolDto: CreatePoolDto, logoFile?: Express.Multer.File) {
        // Check if airdrop calculation is in progress
        if (await this.isAirdropCalculationInProgress()) {
            throw new BadRequestException('Máy chủ đang quá tải, vui lòng thử lại sau...');
        }

        // Create lock key to prevent duplicate API calls
        const lockKey = `create_pool_${walletId}`;
        
        // Use withLock to automatically handle lock/release
        return await this.redisLockService.withLock(lockKey, async () => {
            // 1. Check minimum initial amount
            if (createPoolDto.initialAmount < 1000000) {
                throw new BadRequestException('Initial amount must be at least 1,000,000');
            }

            // 2. Check if there's any pending pool for this wallet
            const existingPendingPool = await this.airdropListPoolRepository.findOne({
                where: {
                    alp_originator: walletId,
                    apl_status: AirdropPoolStatus.PENDING
                }
            });

            if (existingPendingPool) {
                throw new BadRequestException('You already have a pool in creation process. Please wait for completion.');
            }

            // 3. Get wallet information
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet) {
                throw new BadRequestException('Wallet does not exist');
            }

            // 4. Check token X balance
            const mintTokenAirdrop = this.configService.get<string>('MINT_TOKEN_AIRDROP');
            if (!mintTokenAirdrop) {
                throw new HttpException('MINT_TOKEN_AIRDROP configuration does not exist', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            const tokenBalance = await this.solanaService.getTokenBalance(
                wallet.wallet_solana_address,
                mintTokenAirdrop
            );

            if (tokenBalance < createPoolDto.initialAmount) {
                throw new BadRequestException(`Insufficient token X balance. Current: ${tokenBalance}, Required: ${createPoolDto.initialAmount}`);
            }

            // 5. Check SOL balance and transfer fee if needed
            let solBalance = await this.solanaService.getBalance(wallet.wallet_solana_address);
            const minSolBalance = 0.001; // Tối thiểu 0.0003 SOL
            const transferAmount = 0.001; // Chuyển 0.0009 SOL

            if (solBalance < minSolBalance) {
                this.logger.log(`Insufficient SOL balance (${solBalance} SOL), need to transfer ${transferAmount} SOL to wallet ${wallet.wallet_solana_address}`);
                
                const supportFeePrivateKey = this.configService.get<string>('WALLET_SUP_FREE_PRIVATE_KEY');
                if (!supportFeePrivateKey) {
                    throw new HttpException('WALLET_SUP_FREE_PRIVATE_KEY configuration does not exist', HttpStatus.INTERNAL_SERVER_ERROR);
                }

                try {
                    const solTransferSignature = await this.transferSolForFee(supportFeePrivateKey, wallet.wallet_solana_address, transferAmount);
                    this.logger.log(`Successfully transferred ${transferAmount} SOL to wallet ${wallet.wallet_solana_address}, signature: ${solTransferSignature}`);
                    
                    // Wait for transaction to be confirmed
                    await this.waitForTransactionConfirmation(solTransferSignature);
                    
                    // Check SOL balance again after transfer
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s for balance update
                    solBalance = await this.solanaService.getBalance(wallet.wallet_solana_address);
                    
                    if (solBalance < minSolBalance) {
                        throw new Error(`SOL balance still insufficient after fee transfer. Current: ${solBalance} SOL`);
                    }
                    
                } catch (error) {
                    this.logger.error(`Error transferring SOL fee: ${error.message}`);
                    throw new BadRequestException('Cannot transfer SOL fee. Please try again later.');
                }
            }

            // 6. Process logo
            let logoUrl = createPoolDto.logo || '';
            
            if (logoFile) {
                try {
                    // Upload file to Cloudinary using CloudinaryService
                    logoUrl = await this.cloudinaryService.uploadAirdropLogo(logoFile);
                    this.logger.log(`Logo uploaded successfully: ${logoUrl}`);
                } catch (error) {
                    this.logger.error(`Error uploading logo: ${error.message}`);
                    throw new BadRequestException('Cannot upload logo. Please try again.');
                }
            }

            // 7. Create pool with pending status (temporarily without slug)
            const currentDate = new Date();
            const endDate = new Date(currentDate.getTime() + (365 * 24 * 60 * 60 * 1000)); // +365 days
            
            const newPool = this.airdropListPoolRepository.create({
                alp_originator: walletId,
                alp_name: createPoolDto.name,
                alp_slug: '', // Will be updated after getting ID
                alp_describe: createPoolDto.describe || '',
                alp_logo: logoUrl,
                alp_member_num: 0,
                apl_volume: createPoolDto.initialAmount,
                apl_creation_date: currentDate,
                apl_end_date: endDate,
                apl_status: AirdropPoolStatus.PENDING
            });

            const savedPool = await this.airdropListPoolRepository.save(newPool);

            // 8. Create slug with ID and update
            const slug = this.generateSlug(createPoolDto.name, savedPool.alp_id);
            await this.airdropListPoolRepository.update(
                { alp_id: savedPool.alp_id },
                { alp_slug: slug }
            );

            // 9. Execute token transfer transaction
            const walletBittAddress = this.configService.get<string>('WALLET_BITT');
            if (!walletBittAddress) {
                throw new HttpException('WALLET_BITT configuration does not exist', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            let transactionHash: string | null = null;
            let success = false;

            // Try transaction up to 3 times
            for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
                try {
                    this.logger.log(`Executing token transfer transaction attempt ${attempt} for pool ${savedPool.alp_id}`);
                    
                    // Check if any transaction has already been sent for this pool
                    const existingPool = await this.airdropListPoolRepository.findOne({
                        where: { alp_id: savedPool.alp_id }
                    });
                    
                    if (existingPool && existingPool.apl_hash) {
                        this.logger.log(`Pool ${savedPool.alp_id} already has transaction hash: ${existingPool.apl_hash}`);
                        transactionHash = existingPool.apl_hash;
                        success = true;
                        break;
                    }
                    
                    // Get token decimals and calculate correct amount
                    const adjustedAmount = await this.calculateTokenAmount(mintTokenAirdrop, createPoolDto.initialAmount);
                    
                    // Create unique transaction ID to avoid duplication
                    const transactionId = `pool_${savedPool.alp_id}_${Date.now()}_${Math.random()}`;
                    
                    transactionHash = await this.transferTokenToBittWallet(
                        wallet.wallet_private_key,
                        mintTokenAirdrop,
                        walletBittAddress,
                        adjustedAmount,
                        transactionId
                    );

                    // Wait for transaction to be confirmed
                    await this.waitForTransactionConfirmation(transactionHash);
                    this.logger.log(`BITT transaction confirmed: ${transactionHash}`);

                    success = true;
                    break;

                } catch (error) {
                    this.logger.error(`Attempt ${attempt} failed: ${error.message}`);
                    
                    if (attempt === this.MAX_RETRY_ATTEMPTS) {
                        this.logger.error(`Tried maximum ${this.MAX_RETRY_ATTEMPTS} times but still failed`);
                        break;
                    }
                    
                    // Wait 3 seconds before retrying
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

            // 10. Update pool status and transaction hash
            const finalStatus = success ? AirdropPoolStatus.ACTIVE : AirdropPoolStatus.ERROR;
            const updateData: any = { apl_status: finalStatus };
            
            if (success && transactionHash) {
                updateData.apl_hash = transactionHash;
            }
            
            await this.airdropListPoolRepository.update(
                { alp_id: savedPool.alp_id },
                updateData
            );

            // 11. Log final result
            if (success) {
                this.logger.log(`Pool ${savedPool.alp_id} created successfully with transaction hash: ${transactionHash}`);
            } else {
                this.logger.error(`Pool ${savedPool.alp_id} creation failed due to onchain transaction failure`);
            }

            if (success) {
                return {
                    success: true,
                    message: 'Pool created successfully',
                    data: {
                        poolId: savedPool.alp_id,
                        name: savedPool.alp_name,
                        slug: slug,
                        logo: logoUrl,
                        status: finalStatus,
                        initialAmount: createPoolDto.initialAmount,
                        transactionHash: transactionHash
                    }
                };
            } else {
                // Nếu onchain transaction fail, trả về error 400
                throw new BadRequestException({
                    success: false,
                    message: 'Pool creation failed due to onchain transaction',
                    data: {
                        poolId: savedPool.alp_id,
                        name: savedPool.alp_name,
                        slug: slug,
                        logo: logoUrl,
                        status: finalStatus,
                        initialAmount: createPoolDto.initialAmount,
                        transactionHash: transactionHash
                    }
                });
            }
        }, this.LOCK_TTL * 1000); // Convert to milliseconds
    }

    async updatePool(walletId: number, poolIdOrSlug: string, updatePoolDto: UpdatePoolDto, logoFile?: Express.Multer.File) {
        try {
            // 1. Find pool by ID or slug
            const isNumeric = !isNaN(Number(poolIdOrSlug));
            
            let pool;
            if (isNumeric) {
                // Find by ID
                pool = await this.airdropListPoolRepository.findOne({
                    where: { alp_id: parseInt(poolIdOrSlug) }
                });
            } else {
                // Find by slug
                pool = await this.airdropListPoolRepository.findOne({
                    where: { alp_slug: poolIdOrSlug }
                });
            }

            if (!pool) {
                throw new BadRequestException('Pool does not exist');
            }

            // 2. Check if user is the creator of the pool
            if (pool.alp_originator !== walletId) {
                throw new BadRequestException('Only the pool creator can update the pool');
            }

            // 3. Process logo if provided
            let logoUrl = updatePoolDto.logo;
            
            if (logoFile) {
                try {
                    // Upload file to Cloudinary using CloudinaryService
                    logoUrl = await this.cloudinaryService.uploadAirdropLogo(logoFile);
                    this.logger.log(`Logo uploaded successfully: ${logoUrl}`);
                } catch (error) {
                    this.logger.error(`Error uploading logo: ${error.message}`);
                    throw new BadRequestException('Cannot upload logo. Please try again.');
                }
            }

            // 4. Prepare update data (only update fields that are provided)
            const updateData: any = {};
            
            if (logoUrl !== undefined) {
                updateData.alp_logo = logoUrl;
            }
            
            if (updatePoolDto.describe !== undefined) {
                updateData.alp_describe = updatePoolDto.describe;
            }

            // 5. Update pool
            await this.airdropListPoolRepository.update(
                { alp_id: pool.alp_id },
                updateData
            );

            // 6. Get updated pool data
            const updatedPool = await this.airdropListPoolRepository.findOne({
                where: { alp_id: pool.alp_id }
            });

            if (!updatedPool) {
                throw new BadRequestException('Failed to update pool');
            }

            return {
                success: true,
                message: 'Pool updated successfully',
                data: {
                    poolId: updatedPool.alp_id,
                    name: updatedPool.alp_name,
                    slug: updatedPool.alp_slug,
                    logo: updatedPool.alp_logo,
                    describe: updatedPool.alp_describe,
                    status: updatedPool.apl_status
                }
            };

        } catch (error) {
            this.logger.error(`Error updating pool: ${error.message}`);
            throw error;
        }
    }

    async stakePool(walletId: number, stakePoolDto: StakePoolDto) {
        // Check if airdrop calculation is in progress
        if (await this.isAirdropCalculationInProgress()) {
            throw new BadRequestException('Máy chủ đang quá tải, vui lòng thử lại sau...');
        }

        // Create lock key to prevent duplicate API calls
        const lockKey = `stake_pool_${walletId}_${stakePoolDto.poolId}`;
        
        // Use withLock to automatically handle lock/release
        return await this.redisLockService.withLock(lockKey, async () => {
            this.logger.log(`Starting stake pool process for wallet ${walletId}, pool ${stakePoolDto.poolId}, amount ${stakePoolDto.stakeAmount}`);

            // 0. Validate stake amount
            if (!stakePoolDto.stakeAmount || stakePoolDto.stakeAmount <= 0) {
                throw new BadRequestException('Stake amount must be greater than 0');
            }

            // Check if stake amount is reasonable (not too large)
            if (stakePoolDto.stakeAmount > 1000000000) {
                throw new BadRequestException('Stake amount cannot exceed 1 billion tokens');
            }

            // 1. Check if pool exists and is active
            const pool = await this.airdropListPoolRepository.findOne({
                where: { alp_id: stakePoolDto.poolId }
            });

            if (!pool) {
                throw new BadRequestException('Pool does not exist');
            }

            if (pool.apl_status !== AirdropPoolStatus.ACTIVE) {
                throw new BadRequestException(`Pool is not in active status. Current status: ${pool.apl_status}`);
            }

            // 2. Check if user already has stake record in this pool
            const existingJoin = await this.airdropPoolJoinRepository.findOne({
                where: {
                    apj_pool_id: stakePoolDto.poolId,
                    apj_member: walletId
                }
            });

            // Check if user is the creator of this pool
            const isCreator = pool.alp_originator === walletId;

            // 3. Validate minimum stake amount based on user role
            if (isCreator && stakePoolDto.stakeAmount <= 0) {
                throw new BadRequestException('Stake amount must be greater than 0 for pool creator');
            }

            // 4. Get wallet information
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet) {
                throw new BadRequestException('Wallet does not exist');
            }



            // 5. Check token X balance (using same logic as createPool)
            const mintTokenAirdrop = this.configService.get<string>('MINT_TOKEN_AIRDROP');
            if (!mintTokenAirdrop) {
                throw new HttpException('MINT_TOKEN_AIRDROP configuration does not exist', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            const tokenBalance = await this.solanaService.getTokenBalance(
                wallet.wallet_solana_address,
                mintTokenAirdrop
            );

            // Calculate required raw units for stake (same as createPool logic)
            const adjustedStakeAmount = await this.calculateTokenAmount(mintTokenAirdrop, stakePoolDto.stakeAmount);
            
            // Compare raw balance with token amount (same logic as createPool)
            if (tokenBalance < stakePoolDto.stakeAmount) {
                throw new BadRequestException(`Insufficient token X balance. Current: ${tokenBalance}, Required: ${stakePoolDto.stakeAmount}`);
            }



            // 6. Check SOL balance and transfer fee if needed
            let solBalance = await this.solanaService.getBalance(wallet.wallet_solana_address);
            const minSolBalance = 0.001; // Tối thiểu 0.0003 SOL
            const transferAmount = 0.001; // Chuyển 0.0009 SOL

            if (solBalance < minSolBalance) {
                this.logger.log(`Insufficient SOL balance (${solBalance} SOL), need to transfer ${transferAmount} SOL to wallet ${wallet.wallet_solana_address}`);
                
                const supportFeePrivateKey = this.configService.get<string>('WALLET_SUP_FREE_PRIVATE_KEY');
                if (!supportFeePrivateKey) {
                    throw new HttpException('WALLET_SUP_FREE_PRIVATE_KEY configuration does not exist', HttpStatus.INTERNAL_SERVER_ERROR);
                }

                let solTransferSuccess = false;
                let solTransferSignature: string | null = null;

                // Try transferring SOL fee up to 3 times
                for (let solAttempt = 1; solAttempt <= this.MAX_RETRY_ATTEMPTS; solAttempt++) {
                    try {
                        this.logger.log(`Executing SOL fee transfer attempt ${solAttempt} for wallet ${wallet.wallet_solana_address}`);
                        
                        solTransferSignature = await this.transferSolForFee(supportFeePrivateKey, wallet.wallet_solana_address, transferAmount);
                        this.logger.log(`Successfully transferred ${transferAmount} SOL to wallet ${wallet.wallet_solana_address}, signature: ${solTransferSignature}`);
                        
                        // Wait for transaction to be confirmed
                        await this.waitForTransactionConfirmation(solTransferSignature);
                        this.logger.log(`SOL fee transaction confirmed: ${solTransferSignature}`);
                        
                        // Check SOL balance again after transfer
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s for balance update
                        solBalance = await this.solanaService.getBalance(wallet.wallet_solana_address);
                        
                        if (solBalance < minSolBalance) {
                            throw new Error(`SOL balance still insufficient after fee transfer. Current: ${solBalance} SOL`);
                        }
                        
                        solTransferSuccess = true;
                        break;
                        
                    } catch (error) {
                        this.logger.error(`SOL fee transfer attempt ${solAttempt} failed: ${error.message}`);
                        
                        if (solAttempt === this.MAX_RETRY_ATTEMPTS) {
                            this.logger.error(`Tried maximum ${this.MAX_RETRY_ATTEMPTS} SOL fee transfers but still failed`);
                            break;
                        }
                        
                        // Wait 2 seconds before retrying
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }

                if (!solTransferSuccess) {
                    throw new BadRequestException('Cannot transfer SOL fee after multiple attempts. Please try again later.');
                }
            }

            // 7. Create join record with pending status
            const currentDate = new Date();
            const stakeEndDate = new Date(currentDate.getTime() + (365 * 24 * 60 * 60 * 1000)); // +365 days
            
            const newJoin = this.airdropPoolJoinRepository.create({
                apj_pool_id: stakePoolDto.poolId,
                apj_member: walletId,
                apj_volume: stakePoolDto.stakeAmount,
                apj_stake_date: currentDate,
                apj_stake_end: stakeEndDate,
                apj_status: AirdropPoolJoinStatus.PENDING
            });

            const savedJoin = await this.airdropPoolJoinRepository.save(newJoin);

            // 7. Execute token transfer transaction
            const walletBittAddress = this.configService.get<string>('WALLET_BITT');
            if (!walletBittAddress) {
                throw new HttpException('WALLET_BITT configuration does not exist', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            let transactionHash: string | null = null;
            let success = false;

            // Try transaction up to 3 times
            for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
                try {
                    this.logger.log(`Executing stake token transaction attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS} for join ${savedJoin.apj_id}`);
                    
                    // Check if any transaction has already been sent for this join
                    const existingJoinRecord = await this.airdropPoolJoinRepository.findOne({
                        where: { apj_id: savedJoin.apj_id }
                    });
                    
                    if (existingJoinRecord && existingJoinRecord.apj_status === AirdropPoolJoinStatus.ACTIVE) {
                        this.logger.log(`Join ${savedJoin.apj_id} has already been processed successfully`);
                        transactionHash = 'already_processed';
                        success = true;
                        break;
                    }
                    
                    // Create unique transaction ID to avoid duplication
                    const transactionId = `stake_${savedJoin.apj_id}_${Date.now()}_${Math.random()}`;
                    
                    this.logger.debug(`Starting stake token transfer for join ${savedJoin.apj_id}`);
                    this.logger.debug(`Wallet: ${wallet.wallet_solana_address}`);
                    this.logger.debug(`Destination: ${walletBittAddress}`);
                    this.logger.debug(`Transaction ID: ${transactionId}`);
                    
                    // Use the already calculated adjusted amount
                    

                    
                    transactionHash = await this.transferTokenToBittWallet(
                        wallet.wallet_private_key,
                        mintTokenAirdrop,
                        walletBittAddress,
                        adjustedStakeAmount,
                        transactionId
                    );

                    this.logger.log(`Stake transaction sent with signature: ${transactionHash}, transactionId: ${transactionId}`);

                    // Wait for transaction to be confirmed
                    await this.waitForTransactionConfirmation(transactionHash);
                    this.logger.log(`Stake BITT transaction confirmed: ${transactionHash}`);

                    success = true;
                    break;

                } catch (error) {
                    this.logger.error(`Stake transaction attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS} failed: ${error.message}`);
                    
                    if (attempt === this.MAX_RETRY_ATTEMPTS) {
                        this.logger.error(`Tried maximum ${this.MAX_RETRY_ATTEMPTS} times but stake transaction still failed`);
                        break;
                    }
                    
                    this.logger.log(`Waiting 3 seconds before retry ${attempt + 1}...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

            // 8. Update join status and transaction hash
            const finalStatus = success ? AirdropPoolJoinStatus.ACTIVE : AirdropPoolJoinStatus.ERROR;
            const updateData: any = { apj_status: finalStatus };
            
            if (success && transactionHash && transactionHash !== 'already_processed') {
                updateData.apj_hash = transactionHash;
            }
            
            await this.airdropPoolJoinRepository.update(
                { apj_id: savedJoin.apj_id },
                updateData
            );

            // 9. Update pool member count and volume
            if (success) {
                // If user doesn't have stake record, increase member count
                const memberIncrement = existingJoin ? 0 : 1;
                
                await this.airdropListPoolRepository.update(
                    { alp_id: stakePoolDto.poolId },
                    {
                        alp_member_num: pool.alp_member_num + memberIncrement,
                        apl_volume: pool.apl_volume + stakePoolDto.stakeAmount
                    }
                );
            }

            // 10. Log final result
            if (success) {
                this.logger.log(`✅ Join ${savedJoin.apj_id} created successfully with transaction hash: ${transactionHash}`);
                this.logger.log(`📊 Pool ${stakePoolDto.poolId} updated: +${stakePoolDto.stakeAmount} tokens, member increment: ${existingJoin ? 0 : 1}`);
            } else {
                this.logger.error(`❌ Join ${savedJoin.apj_id} creation failed due to onchain transaction failure`);
                this.logger.error(`🔍 Final transaction hash: ${transactionHash}`);
            }

            const responseData = {
                joinId: savedJoin.apj_id,
                poolId: stakePoolDto.poolId,
                stakeAmount: stakePoolDto.stakeAmount,
                status: finalStatus,
                transactionHash: transactionHash === 'already_processed' ? null : transactionHash
            };

            this.logger.log(`🎯 Stake pool response:`, responseData);

            return {
                success: true,
                message: success ? 'Stake pool successful' : 'Stake pool failed due to onchain transaction',
                data: responseData
            };
        }, this.LOCK_TTL * 1000); // Convert to milliseconds
    }

    async getPools(walletId: number, query: GetPoolsDto = {}): Promise<PoolInfoDto[]> {
        try {
            // 1. Xác định filter type và trường sắp xếp với validation
            const filterType = query.filterType || PoolFilterType.ALL;
            const sortBy = query.sortBy || PoolSortField.CREATION_DATE;
            const sortOrder = query.sortOrder || PoolSortOrder.DESC;

            this.logger.log(`Filter: ${filterType}, Sort: ${sortBy}, Order: ${sortOrder}`);

            // 2. Tạo order object cho TypeORM
            let orderObject: any = {};
            switch (sortBy) {
                case PoolSortField.CREATION_DATE:
                    orderObject = { apl_creation_date: sortOrder.toUpperCase() };
                    break;
                case PoolSortField.NAME:
                    orderObject = { alp_name: sortOrder.toUpperCase() };
                    break;
                case PoolSortField.MEMBER_COUNT:
                    orderObject = { alp_member_num: sortOrder.toUpperCase() };
                    break;
                case PoolSortField.TOTAL_VOLUME:
                    orderObject = { apl_volume: sortOrder.toUpperCase() };
                    break;
                case PoolSortField.END_DATE:
                    orderObject = { apl_end_date: sortOrder.toUpperCase() };
                    break;
                default:
                    orderObject = { apl_creation_date: 'DESC' };
            }

            // 3. Xử lý filter và lấy pools
            let pools: AirdropListPool[] = [];

            switch (filterType) {
                case PoolFilterType.ALL:
                    // Lấy tất cả pools đang hoạt động
                    pools = await this.airdropListPoolRepository.find({
                        where: { apl_status: AirdropPoolStatus.ACTIVE },
                        order: orderObject
                    });
                    break;

                case PoolFilterType.CREATED:
                    // Chỉ lấy pools do user tạo
                    pools = await this.airdropListPoolRepository.find({
                        where: {
                            apl_status: AirdropPoolStatus.ACTIVE,
                            alp_originator: walletId
                        },
                        order: orderObject
                    });
                    break;

                case PoolFilterType.JOINED:
                    // Lấy pools mà user đã tham gia (không phải creator)
                    // Sử dụng JOIN để tối ưu performance
                    const joinedPools = await this.airdropListPoolRepository
                        .createQueryBuilder('pool')
                        .innerJoin('airdrop_pool_joins', 'join', 'join.apj_pool_id = pool.alp_id')
                        .where('pool.apl_status = :status', { status: AirdropPoolStatus.ACTIVE })
                        .andWhere('join.apj_member = :walletId', { walletId })
                        .andWhere('join.apj_status = :joinStatus', { joinStatus: AirdropPoolJoinStatus.ACTIVE })
                        .orderBy(`pool.${this.getOrderByField(sortBy)}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
                        .getMany();
                    
                    pools = joinedPools;
                    break;

                default:
                    // Fallback to ALL if filterType is invalid
                    this.logger.warn(`Invalid filterType: ${filterType}, falling back to ALL`);
                    pools = await this.airdropListPoolRepository.find({
                        where: { apl_status: AirdropPoolStatus.ACTIVE },
                        order: orderObject
                    });
                    break;
            }

            const poolsWithUserInfo: PoolInfoDto[] = [];

            for (const pool of pools) {
                // 2. Lấy thông tin ví khởi tạo pool
                const creatorWallet = await this.listWalletRepository.findOne({
                    where: { wallet_id: pool.alp_originator }
                });

                // 3. Kiểm tra xem user có phải là creator của pool không
                const isCreator = pool.alp_originator === walletId;

                // 4. Lấy thông tin stake của user trong pool này
                const userStakes = await this.airdropPoolJoinRepository.find({
                    where: {
                        apj_pool_id: pool.alp_id,
                        apj_member: walletId,
                        apj_status: AirdropPoolJoinStatus.ACTIVE
                    }
                });

                // 4. Tính tổng volume user đã stake
                let totalUserStaked = 0;
                if (userStakes.length > 0) {
                    totalUserStaked = userStakes.reduce((sum, stake) => sum + Number(stake.apj_volume), 0);
                }

                // 5. Nếu user là creator, cộng thêm volume ban đầu
                if (isCreator) {
                    totalUserStaked += Number(pool.apl_volume);
                }

                // 6. Tính tổng volume của pool (volume ban đầu + tổng volume stake)
                // Lấy tất cả stake records của pool này
                const allPoolStakes = await this.airdropPoolJoinRepository.find({
                    where: {
                        apj_pool_id: pool.alp_id,
                        apj_status: AirdropPoolJoinStatus.ACTIVE
                    }
                });

                // Tính tổng volume stake
                const totalStakeVolume = allPoolStakes.reduce((sum, stake) => sum + Number(stake.apj_volume), 0);
                
                // Tổng volume = volume ban đầu + tổng volume stake
                const totalPoolVolume = Number(pool.apl_volume) + totalStakeVolume;

                // 7. Tính round volume (chỉ tính cho active round - apl_round_end và apj_round_end = null)
                let roundPoolVolume = Number(pool.apl_volume);
                
                // Chỉ cộng volume ban đầu nếu pool chưa kết thúc round
                if (pool.apl_round_end !== null) {
                    roundPoolVolume = 0;
                }
                
                // Cộng volume từ các stake chưa kết thúc round
                const roundStakeVolume = allPoolStakes.reduce((sum, stake) => {
                    if (stake.apj_round_end === null) {
                        return sum + Number(stake.apj_volume);
                    }
                    return sum;
                }, 0);
                
                roundPoolVolume += roundStakeVolume;

                // 8. Tính số lượng member thực tế từ stake records (bao gồm creator)
                const uniqueMembers = new Set<number>();
                
                // Thêm creator vào member count (luôn được tính)
                uniqueMembers.add(pool.alp_originator);
                
                // Thêm tất cả members từ stake records (Set tự động loại trùng lặp)
                // Nếu creator cũng tồn tại trong stake records, sẽ được loại trùng lặp tự động
                for (const stake of allPoolStakes) {
                    uniqueMembers.add(stake.apj_member);
                }
                
                const actualMemberCount = uniqueMembers.size;

                // 9. Tạo thông tin pool với user info
                const poolInfo: PoolInfoDto = {
                    poolId: pool.alp_id,
                    name: pool.alp_name,
                    slug: pool.alp_slug,
                    logo: pool.alp_logo || '',
                    describe: pool.alp_describe || '',
                    memberCount: actualMemberCount,
                    totalVolume: totalPoolVolume,
                    roundVolume: roundPoolVolume,
                    creationDate: pool.apl_creation_date,
                    endDate: pool.apl_end_date,
                    status: pool.apl_status,
                    creatorAddress: creatorWallet?.wallet_solana_address || '',
                    creatorBittworldUid: creatorWallet?.bittworld_uid || null
                };

                // 10. Thêm thông tin stake của user nếu có
                if (userStakes.length > 0 || isCreator) {
                    // Lấy ngày stake đầu tiên hoặc ngày tạo pool
                    const firstStakeDate = userStakes.length > 0 
                        ? userStakes[0].apj_stake_date 
                        : pool.apl_creation_date;

                    poolInfo.userStakeInfo = {
                        isCreator: isCreator,
                        joinStatus: userStakes.length > 0 ? 'active' : 'creator',
                        joinDate: firstStakeDate,
                        totalStaked: totalUserStaked
                    };
                }

                poolsWithUserInfo.push(poolInfo);
            }

            return poolsWithUserInfo;

        } catch (error) {
            this.logger.error(`Error getting pools list: ${error.message}`);
            throw error;
        }
    }

    async getPoolDetailByIdOrSlug(idOrSlug: string, walletId: number, query: GetPoolDetailDto): Promise<PoolDetailDto> {
        try {
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
                throw new Error('Pool does not exist');
            }

            // Call getPoolDetail method with found poolId
            return await this.getPoolDetail(pool.alp_id, walletId, query);

        } catch (error) {
            this.logger.error(`Error getting pool detail by id or slug: ${error.message}`);
            throw error;
        }
    }

    async getPoolDetail(poolId: number, walletId: number, query: GetPoolDetailDto): Promise<PoolDetailDto> {
        try {
            // 1. Get pool information
            const pool = await this.airdropListPoolRepository.findOne({
                where: { alp_id: poolId }
            });

            if (!pool) {
                throw new Error('Pool does not exist');
            }

            // 2. Get pool creator wallet information
            const creatorWallet = await this.listWalletRepository.findOne({
                where: { wallet_id: pool.alp_originator }
            });

            // 3. Check if user is the creator of the pool
            const isCreator = pool.alp_originator === walletId;

            // 4. Get user stake information in this pool
            const userStakes = await this.airdropPoolJoinRepository.find({
                where: {
                    apj_pool_id: poolId,
                    apj_member: walletId,
                    apj_status: AirdropPoolJoinStatus.ACTIVE
                }
            });

            // 5. Calculate total volume user has staked and stake count
            let totalUserStaked = 0;
            let userStakeCount = 0;
            if (userStakes.length > 0) {
                totalUserStaked = userStakes.reduce((sum, stake) => sum + Number(stake.apj_volume), 0);
                userStakeCount = userStakes.length;
            }

            // 6. If user is creator, add initial volume
            if (isCreator) {
                totalUserStaked += Number(pool.apl_volume);
            }

            // 7. Calculate total volume: initial volume + total stake volume
            const allPoolStakes = await this.airdropPoolJoinRepository.find({
                where: {
                    apj_pool_id: poolId,
                    apj_status: AirdropPoolJoinStatus.ACTIVE
                }
            });

            // Calculate total stake volume
            const totalStakeVolume = allPoolStakes.reduce((sum, stake) => sum + Number(stake.apj_volume), 0);
            
            // Total volume = initial volume + total stake volume
            const totalPoolVolume = Number(pool.apl_volume) + totalStakeVolume;

            // 8. Calculate actual member count from stake records (including creator)
            const uniqueMembers = new Set<number>();
            
            // Add creator to member count (always included)
            uniqueMembers.add(pool.alp_originator);
            
            // Add all members from stake records (Set automatically handles duplicates)
            // If creator also exists in stake records, it will be deduplicated automatically
            for (const stake of allPoolStakes) {
                uniqueMembers.add(stake.apj_member);
            }
            
            const actualMemberCount = uniqueMembers.size;

            // 9. Create basic pool information
            const poolDetail: PoolDetailDto = {
                poolId: pool.alp_id,
                name: pool.alp_name,
                slug: pool.alp_slug,
                logo: pool.alp_logo || '',
                describe: pool.alp_describe || '',
                memberCount: actualMemberCount,
                totalVolume: totalPoolVolume,
                creationDate: pool.apl_creation_date,
                endDate: pool.apl_end_date,
                status: pool.apl_status,
                transactionHash: pool.apl_hash,
                creatorAddress: creatorWallet?.wallet_solana_address || '',
                creatorBittworldUid: creatorWallet?.bittworld_uid || null
            };

            // 10. Add user stake information if exists
            if (userStakes.length > 0 || isCreator) {
                const firstStakeDate = userStakes.length > 0 
                    ? userStakes[0].apj_stake_date 
                    : pool.apl_creation_date;

                poolDetail.userStakeInfo = {
                    isCreator: isCreator,
                    joinStatus: userStakes.length > 0 ? 'active' : 'creator',
                    joinDate: firstStakeDate,
                    totalStaked: totalUserStaked,
                    stakeCount: userStakeCount
                };
            }

            // 11. If user is creator, get all members list
            if (isCreator) {
                const members = await this.getPoolMembers(poolId, query);
                poolDetail.members = members;
            }

            return poolDetail;

        } catch (error) {
            this.logger.error(`Error getting pool detail: ${error.message}`);
            throw error;
        }
    }

    private async getPoolMembers(poolId: number, query: GetPoolDetailDto): Promise<MemberInfoDto[]> {
        try {
            // 1. Get all stake records of the pool
            const allStakes = await this.airdropPoolJoinRepository.find({
                where: {
                    apj_pool_id: poolId,
                    apj_status: AirdropPoolJoinStatus.ACTIVE
                },
                relations: ['member']
            });

            // 2. Get creator information
            const pool = await this.airdropListPoolRepository.findOne({
                where: { alp_id: poolId },
                relations: ['originator']
            });

            if (!pool) {
                throw new Error('Pool does not exist');
            }

            // 3. Create map to group by member
            const memberMap = new Map<number, {
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

            // 4. Add creator to map
            if (pool.originator) {
                memberMap.set(pool.alp_originator, {
                    memberId: pool.alp_originator,
                    solanaAddress: pool.originator.wallet_solana_address,
                    bittworldUid: pool.originator.bittworld_uid || null,
                    nickname: pool.originator.wallet_nick_name || 'Unknown',
                    isCreator: true,
                    joinDate: pool.apl_creation_date,
                    totalStaked: Number(pool.apl_volume), // Initial volume
                    stakeCount: 0, // Will be updated later
                    status: 'active'
                });
            }

            // 5. Process stake records
            for (const stake of allStakes) {
                const memberId = stake.apj_member;
                const existingMember = memberMap.get(memberId);

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
                    memberMap.set(memberId, {
                        memberId: memberId,
                        solanaAddress: stake.member?.wallet_solana_address || 'Unknown',
                        bittworldUid: stake.member?.bittworld_uid || null,
                        nickname: stake.member?.wallet_nick_name || 'Unknown',
                        isCreator: false,
                        joinDate: stake.apj_stake_date,
                        totalStaked: Number(stake.apj_volume),
                        stakeCount: 1,
                        status: stake.apj_status
                    });
                }
            }

            // 6. Convert map to array
            let members = Array.from(memberMap.values());

            // 7. Sort according to requirements
            const sortBy = query.sortBy || SortField.TOTAL_STAKED;
            const sortOrder = query.sortOrder || SortOrder.DESC;

            // Creator always at the top
            members.sort((a, b) => {
                // Creator always at the top
                if (a.isCreator && !b.isCreator) return -1;
                if (!a.isCreator && b.isCreator) return 1;

                // Sort by selected field
                let comparison = 0;
                switch (sortBy) {
                    case SortField.JOIN_DATE:
                        comparison = a.joinDate.getTime() - b.joinDate.getTime();
                        break;
                    case SortField.TOTAL_STAKED:
                        comparison = a.totalStaked - b.totalStaked;
                        break;
                    case SortField.STAKE_COUNT:
                        comparison = a.stakeCount - b.stakeCount;
                        break;
                    case SortField.MEMBER_ID:
                        comparison = a.memberId - b.memberId;
                        break;
                    default:
                        comparison = a.totalStaked - b.totalStaked;
                }

                return sortOrder === SortOrder.ASC ? comparison : -comparison;
            });

            return members;

        } catch (error) {
            this.logger.error(`Error getting members list: ${error.message}`);
            throw error;
        }
    }

    private async transferTokenToBittWallet(
        privateKey: string,
        tokenMint: string,
        destinationWallet: string,
        amount: number,
        transactionId?: string
    ): Promise<string> {
        try {

            
            // Decode private key
            const keypair = this.getKeypairFromPrivateKey(privateKey);
            
            // Create unique transaction to avoid duplication
            const uniqueId = transactionId || `${Date.now()}_${Math.random()}`;
            

            
            // Get or create token accounts
            const sourceTokenAccount = await this.getOrCreateATA(
                keypair,
                new PublicKey(tokenMint),
                keypair.publicKey
            );

            const destinationTokenAccount = await this.getOrCreateATA(
                keypair,
                new PublicKey(tokenMint),
                new PublicKey(destinationWallet)
            );

            // Get token info to understand the amount
            const tokenInfo = await this.getTokenInfo(tokenMint);

            // Kiểm tra mint thuộc program nào để sử dụng đúng instruction
            const accountInfo = await this.connection.getAccountInfo(new PublicKey(tokenMint));
            if (!accountInfo) {
                throw new Error(`Mint account does not exist: ${tokenMint}`);
            }
            
            const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
            const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
            
            let transferInstruction;
            
            if (accountInfo.owner.toString() === SPL_TOKEN_PROGRAM_ID) {
                // SPL Token Program
                const { createTransferInstruction } = require('@solana/spl-token');
                transferInstruction = createTransferInstruction(
                    sourceTokenAccount,
                    destinationTokenAccount,
                    keypair.publicKey,
                    amount
                );
            } else if (accountInfo.owner.toString() === TOKEN_2022_PROGRAM_ID) {
                // Token-2022 Program
                const { createTransferInstruction } = require('@solana/spl-token');
                transferInstruction = createTransferInstruction(
                    sourceTokenAccount,
                    destinationTokenAccount,
                    keypair.publicKey,
                    amount,
                    [],
                    new PublicKey(TOKEN_2022_PROGRAM_ID) // Sử dụng Token-2022 program ID
                );
            } else {
                throw new Error(`Unsupported token program: ${accountInfo.owner.toString()}`);
            }

            // Create and send transaction
            const transaction = new Transaction().add(transferInstruction);
            
            const latestBlockhash = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = latestBlockhash.blockhash;
            transaction.feePayer = keypair.publicKey;

            // Sign and send transaction
            transaction.sign(keypair);
            const signature = await this.connection.sendTransaction(transaction, [keypair]);
            
            this.logger.log(`BITT transaction sent with signature: ${signature}, transactionId: ${uniqueId}`);
            return signature;

        } catch (error) {
            this.logger.error(`Error transferring token: ${error.message}`);
            this.logger.error(`Error stack: ${error.stack}`);
            throw error;
        }
    }

    private async getTokenInfo(tokenMint: string): Promise<{ decimals: number; supply: number; mintAuthority: string | null }> {
        try {
            // Kiểm tra account info trước
            const accountInfo = await this.connection.getAccountInfo(new PublicKey(tokenMint));
            
            if (!accountInfo) {
                throw new BadRequestException(`Token mint address does not exist: ${tokenMint}`);
            }
            

            
            // Kiểm tra xem có phải SPL Token Program không
            const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
            const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
            
            if (accountInfo.owner.toString() === SPL_TOKEN_PROGRAM_ID) {
                // SPL Token Program
                const { getMint } = require('@solana/spl-token');
                const mintInfo = await getMint(this.connection, new PublicKey(tokenMint));
                
                
                
                return {
                    decimals: mintInfo.decimals,
                    supply: Number(mintInfo.supply),
                    mintAuthority: mintInfo.mintAuthority?.toString() || null
                };
            } else if (accountInfo.owner.toString() === TOKEN_2022_PROGRAM_ID) {
                // Token-2022 Program
                this.logger.warn(`Token mint ${tokenMint} is Token-2022. Using default decimals: 9`);
                
                // Thử lấy thông tin từ account data
                try {
                    // Token-2022 có cấu trúc tương tự SPL Token
                    const { MintLayout } = require('@solana/spl-token');
                    const mintInfo = MintLayout.decode(accountInfo.data);
                    

                    
                    return {
                        decimals: mintInfo.decimals,
                        supply: Number(mintInfo.supply),
                        mintAuthority: mintInfo.mintAuthority?.toString() || null
                    };
                } catch (decodeError) {
                    this.logger.warn(`Failed to decode Token-2022 mint data: ${decodeError.message}`);
                    
                    // Fallback: sử dụng decimals mặc định là 9
                    return {
                        decimals: 9,
                        supply: 0,
                        mintAuthority: null
                    };
                }
            } else {
                // Program khác (Metaplex, etc.)
                this.logger.warn(`Token mint ${tokenMint} is not owned by SPL Token or Token-2022 Program. Owner: ${accountInfo.owner.toString()}`);
                
                // Tạm thời sử dụng decimals mặc định là 9
                return {
                    decimals: 9,
                    supply: 0,
                    mintAuthority: null
                };
            }
            
        } catch (error) {
            this.logger.error(`Error getting token info: ${error.message}`);
            this.logger.error(`Error stack: ${error.stack}`);
            
            // Nếu là TokenInvalidAccountOwnerError, trả về lỗi rõ ràng hơn
            if (error.message.includes('TokenInvalidAccountOwnerError')) {
                throw new BadRequestException(`Invalid token mint address: ${tokenMint}. This address is not a valid SPL Token mint.`);
            }
            
            throw error;
        }
    }

    private async calculateTokenAmount(tokenMint: string, tokenAmount: number): Promise<number> {
        try {
            // Get token info including decimals
            const tokenInfo = await this.getTokenInfo(tokenMint);
            
            // Calculate raw units based on decimals
            const rawUnits = tokenAmount * Math.pow(10, tokenInfo.decimals);
            
            return rawUnits;
            
        } catch (error) {
            this.logger.error(`Error calculating token amount: ${error.message}`);
            throw error;
        }
    }

    private async getOrCreateATA(
        owner: any,
        mint: PublicKey,
        ownerAddress: PublicKey
    ): Promise<PublicKey> {
        try {

            
            // Kiểm tra mint thuộc program nào
            const accountInfo = await this.connection.getAccountInfo(mint);
            if (!accountInfo) {
                throw new Error(`Mint account does not exist: ${mint.toString()}`);
            }
            
            const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
            const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
            
            if (accountInfo.owner.toString() === SPL_TOKEN_PROGRAM_ID) {
                // SPL Token Program
                const { getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
                
                const tokenAccount = await getOrCreateAssociatedTokenAccount(
                    this.connection,
                    owner,
                    mint,
                    ownerAddress
                );
                

                return tokenAccount.address;
                
            } else if (accountInfo.owner.toString() === TOKEN_2022_PROGRAM_ID) {
                // Token-2022 Program
                this.logger.warn(`Using Token-2022 for mint: ${mint.toString()}`);
                
                // Tạm thời sử dụng SPL Token method với Token-2022 program ID
                try {
                    const { getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
                    
                    const tokenAccount = await getOrCreateAssociatedTokenAccount(
                        this.connection,
                        owner,
                        mint,
                        ownerAddress,
                        false,
                        new PublicKey(TOKEN_2022_PROGRAM_ID) // Sử dụng Token-2022 program ID
                    );
                    

                    return tokenAccount.address;
                } catch (error) {
                    this.logger.error(`Failed to create Token-2022 ATA: ${error.message}`);
                    
                    // Fallback: Sử dụng getAssociatedTokenAddress để lấy address
                    const { getAssociatedTokenAddress } = require('@solana/spl-token');
                    const ataAddress = await getAssociatedTokenAddress(
                        mint,
                        ownerAddress,
                        false,
                        new PublicKey(TOKEN_2022_PROGRAM_ID)
                    );
                    

                    return ataAddress;
                }
                
            } else {
                throw new Error(`Unsupported token program: ${accountInfo.owner.toString()}`);
            }
            
        } catch (error) {
            this.logger.error(`Error creating ATA: ${error.message}`);
            this.logger.error(`Error stack: ${error.stack}`);
            throw error;
        }
    }

    private getKeypairFromPrivateKey(privateKey: string): any {
        try {
            // First, try to parse as JSON (database format)
            let solanaPrivateKey: string;
            
            try {
                const privateKeyObj = JSON.parse(privateKey);
                if (privateKeyObj.solana) {
                    solanaPrivateKey = privateKeyObj.solana;
                    this.logger.debug(`Successfully extracted Solana private key from JSON format`);
                } else {
                    throw new Error('No solana private key found in JSON');
                }
            } catch (jsonError) {
                // If not JSON, assume it's already a Solana private key
                solanaPrivateKey = privateKey;
                this.logger.debug(`Using private key as direct Solana key (not JSON format)`);
            }

            // Validate and decode the Solana private key
            const decodedKey = bs58.decode(solanaPrivateKey);
            if (decodedKey.length !== 64) {
                throw new Error(`Invalid Solana private key length: ${decodedKey.length} bytes`);
            }


            return require('@solana/web3.js').Keypair.fromSecretKey(decodedKey);
        } catch (error) {
            this.logger.error(`Error parsing private key: ${error.message}`);
            this.logger.error(`Private key format (first 20 chars): ${privateKey.substring(0, 20)}...`);
            throw new Error(`Invalid private key format: ${error.message}`);
        }
    }

    private async transferSolForFee(
        fromPrivateKey: string,
        toAddress: string,
        amount: number
    ): Promise<string> {
        try {
            // Decode private key
            const keypair = this.getKeypairFromPrivateKey(fromPrivateKey);
            
            // Kiểm tra balance của wallet gửi
            const senderBalance = await this.connection.getBalance(keypair.publicKey);
            
            if (senderBalance < amount * LAMPORTS_PER_SOL) {
                throw new Error(`Insufficient SOL balance in sender wallet. Current: ${senderBalance / LAMPORTS_PER_SOL} SOL, Required: ${amount} SOL`);
            }
            
            // Create unique transaction to avoid duplication
            const uniqueId = Date.now() + Math.random();
            
            // Create transfer instruction
            const transferInstruction = SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: new PublicKey(toAddress),
                lamports: amount * LAMPORTS_PER_SOL
            });

            // Create and send transaction
            const transaction = new Transaction().add(transferInstruction);
            
            const latestBlockhash = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = latestBlockhash.blockhash;
            transaction.feePayer = keypair.publicKey;

            // Sign and send transaction
            transaction.sign(keypair);
            const signature = await this.connection.sendTransaction(transaction, [keypair]);
            
            this.logger.log(`SOL fee transaction sent with signature: ${signature}, uniqueId: ${uniqueId}`);
            return signature;

        } catch (error) {
            this.logger.error(`Error transferring SOL fee: ${error.message}`);
            throw error;
        }
    }

    private async waitForTransactionConfirmation(signature: string, maxRetries: number = 30): Promise<void> {
        let retries = 0;
        const retryDelay = 1000; // 1 giây

        while (retries < maxRetries) {
            try {
                // Kiểm tra trực tiếp từ Solana connection
                const signatureStatus = await this.connection.getSignatureStatus(signature, {
                    searchTransactionHistory: true
                });



                if (signatureStatus?.value?.err) {
                    throw new Error(`Transaction ${signature} đã thất bại: ${JSON.stringify(signatureStatus.value.err)}`);
                }

                if (signatureStatus?.value?.confirmationStatus === 'confirmed' || 
                    signatureStatus?.value?.confirmationStatus === 'finalized') {
                    this.logger.log(`Transaction ${signature} đã được confirm với status: ${signatureStatus.value.confirmationStatus}`);
                    return;
                }

                // Kiểm tra xem transaction có tồn tại trên blockchain không (đã được gửi thành công)
                if (signatureStatus?.value && !signatureStatus.value.err) {
                    this.logger.log(`Transaction ${signature} đã được gửi thành công, đang chờ confirm...`);
                }
                
                // Nếu vẫn pending, chờ và thử lại
                this.logger.log(`Transaction ${signature} vẫn pending, thử lại lần ${retries + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retries++;
                
            } catch (error) {
                this.logger.error(`Lỗi kiểm tra transaction status: ${error.message}`);
                retries++;
                
                if (retries >= maxRetries) {
                    throw new Error(`Không thể confirm transaction ${signature} sau ${maxRetries} lần thử`);
                }
                
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
        
        throw new Error(`Transaction ${signature} không được confirm trong thời gian chờ`);
    }

    private async checkTransactionExists(signature: string): Promise<boolean> {
        try {
            // Kiểm tra xem transaction có tồn tại trên blockchain không
            const signatureStatus = await this.connection.getSignatureStatus(signature, {
                searchTransactionHistory: true
            });

            // Nếu có signatureStatus và không có lỗi, transaction đã tồn tại
            return !!(signatureStatus?.value && !signatureStatus.value.err);
        } catch (error) {
            this.logger.error(`Error checking transaction existence: ${error.message}`);
            return false;
        }
    }

    private async checkWalletBalance(walletAddress: string, tokenMint: string, requiredAmount: number): Promise<{
        hasEnoughBalance: boolean;
        currentBalance: number;
        currentBalanceInTokens: number;
        requiredAmountInTokens: number;
        tokenInfo: { decimals: number; supply: number; mintAuthority: string | null };
    }> {
        try {
            // Get token info
            const tokenInfo = await this.getTokenInfo(tokenMint);
            
            // Get current balance
            const currentBalance = await this.solanaService.getTokenBalance(walletAddress, tokenMint);
            
            // Calculate amounts in tokens
            const currentBalanceInTokens = currentBalance / Math.pow(10, tokenInfo.decimals);
            const requiredAmountInTokens = requiredAmount / Math.pow(10, tokenInfo.decimals);
            
            // Check if enough balance
            const hasEnoughBalance = currentBalance >= requiredAmount;
            
            
            
            return {
                hasEnoughBalance,
                currentBalance,
                currentBalanceInTokens,
                requiredAmountInTokens,
                tokenInfo
            };
            
        } catch (error) {
            this.logger.error(`Error checking wallet balance: ${error.message}`);
            throw error;
        }
    }

    private async validateStakeAmount(walletAddress: string, tokenMint: string, stakeAmount: number): Promise<{
        isValid: boolean;
        currentBalance: number;
        currentBalanceInTokens: number;
        maxPossibleStake: number;
        suggestions: string[];
    }> {
        try {
            // Get token info first
            const tokenInfo = await this.getTokenInfo(tokenMint);
            const requiredRawUnits = stakeAmount * Math.pow(10, tokenInfo.decimals);
            
            const balanceCheck = await this.checkWalletBalance(walletAddress, tokenMint, requiredRawUnits);
            
            const maxPossibleStake = Math.floor(balanceCheck.currentBalanceInTokens);
            const suggestions: string[] = [];
            
            if (!balanceCheck.hasEnoughBalance) {
                if (maxPossibleStake >= 1) {
                    suggestions.push(`Try staking ${maxPossibleStake} tokens or less`);
                }
                suggestions.push('Transfer more tokens to your wallet');
                suggestions.push('Check your token balance on Solana explorer');
            }
            
            return {
                isValid: balanceCheck.hasEnoughBalance,
                currentBalance: balanceCheck.currentBalance,
                currentBalanceInTokens: balanceCheck.currentBalanceInTokens,
                maxPossibleStake,
                suggestions
            };
            
        } catch (error) {
            this.logger.error(`Error validating stake amount: ${error.message}`);
            throw error;
        }
    }

    async checkWalletBalanceForStake(walletId: number, stakeAmount: number = 1000000) {
        try {
            this.logger.log(`Checking wallet balance for stake: wallet ${walletId}, amount ${stakeAmount}`);

            // Get wallet information
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet) {
                throw new BadRequestException('Wallet does not exist');
            }

            // Get token mint
            const mintTokenAirdrop = this.configService.get<string>('MINT_TOKEN_AIRDROP');
            if (!mintTokenAirdrop) {
                throw new HttpException('MINT_TOKEN_AIRDROP configuration does not exist', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            // Validate stake amount
            const validation = await this.validateStakeAmount(wallet.wallet_solana_address, mintTokenAirdrop, stakeAmount);

            return {
                success: true,
                message: validation.isValid ? 'Balance check passed' : 'Insufficient balance',
                data: {
                    currentBalance: validation.currentBalance,
                    currentBalanceInTokens: validation.currentBalanceInTokens,
                    maxPossibleStake: validation.maxPossibleStake,
                    suggestions: validation.suggestions
                }
            };

        } catch (error) {
            this.logger.error(`Error checking wallet balance for stake: ${error.message}`);
            throw error;
        }
    }

    async suggestStakeAmount(walletId: number) {
        try {
            this.logger.log(`Getting stake suggestions for wallet ${walletId}`);

            // Get wallet information
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet) {
                throw new BadRequestException('Wallet does not exist');
            }

            // Get token mint
            const mintTokenAirdrop = this.configService.get<string>('MINT_TOKEN_AIRDROP');
            if (!mintTokenAirdrop) {
                throw new HttpException('MINT_TOKEN_AIRDROP configuration does not exist', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            // Get token balance and info
            const tokenBalance = await this.solanaService.getTokenBalance(wallet.wallet_solana_address, mintTokenAirdrop);
            const tokenInfo = await this.getTokenInfo(mintTokenAirdrop);
            const balanceInTokens = tokenBalance / Math.pow(10, tokenInfo.decimals);
            const maxPossibleStake = Math.floor(balanceInTokens);

            // Generate suggested amounts
            const suggestedAmounts: number[] = [];
            const suggestions: string[] = [];

            if (maxPossibleStake >= 0.001) {
                // Add common stake amounts
                if (maxPossibleStake >= 0.001) suggestedAmounts.push(0.001);
                if (maxPossibleStake >= 0.01) suggestedAmounts.push(0.01);
                if (maxPossibleStake >= 0.1) suggestedAmounts.push(0.1);
                if (maxPossibleStake >= 1) suggestedAmounts.push(1);
                if (maxPossibleStake >= 10) suggestedAmounts.push(10);
                if (maxPossibleStake >= 100) suggestedAmounts.push(100);
                if (maxPossibleStake >= 1000) suggestedAmounts.push(1000);
                if (maxPossibleStake >= 10000) suggestedAmounts.push(10000);
                if (maxPossibleStake >= 100000) suggestedAmounts.push(100000);
                if (maxPossibleStake >= 1000000) suggestedAmounts.push(1000000);
                
                // Add max possible stake
                if (!suggestedAmounts.includes(maxPossibleStake)) {
                    suggestedAmounts.push(maxPossibleStake);
                }

                suggestions.push(`You can stake up to ${maxPossibleStake} tokens`);
                suggestions.push('Choose from suggested amounts above');
            } else {
                suggestions.push(`You need at least 0.001 token to stake. Current balance: ${balanceInTokens.toFixed(tokenInfo.decimals)} tokens`);
                suggestions.push('Transfer more tokens to your wallet');
            }

            suggestions.push('Check your token balance on Solana explorer');

            return {
                success: true,
                message: maxPossibleStake >= 0.001 ? 'Stake suggestions available' : 'Insufficient balance for staking',
                data: {
                    currentBalance: tokenBalance,
                    currentBalanceInTokens: balanceInTokens,
                    maxPossibleStake: maxPossibleStake,
                    suggestedAmounts: suggestedAmounts,
                    suggestions: suggestions
                }
            };

        } catch (error) {
            this.logger.error(`Error getting stake suggestions: ${error.message}`);
            throw error;
        }
    }

    private generateSlug(name: string, id: number): string {
        const baseSlug = name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim()
            .replace(/^-+|-+$/g, '');
        
        return `${baseSlug}-${id}`;
    }

    private getOrderByField(sortBy: PoolSortField): string {
        switch (sortBy) {
            case PoolSortField.CREATION_DATE:
                return 'apl_creation_date';
            case PoolSortField.NAME:
                return 'alp_name';
            case PoolSortField.MEMBER_COUNT:
                return 'alp_member_num';
            case PoolSortField.TOTAL_VOLUME:
                return 'apl_volume';
            case PoolSortField.END_DATE:
                return 'apl_end_date';
            default:
                return 'apl_creation_date';
        }
    }

    async getPoolDetailTransactionsByIdOrSlug(idOrSlug: string, walletId: number, query: GetPoolDetailTransactionsDto): Promise<PoolDetailTransactionsDto> {
        try {
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
                throw new Error('Pool does not exist');
            }

            // Check if user is the creator or a member of the pool
            const isCreator = pool.alp_originator === walletId;
            
            if (!isCreator) {
                // Check if user is a member of this pool
                const memberStake = await this.airdropPoolJoinRepository.findOne({
                    where: {
                        apj_pool_id: pool.alp_id,
                        apj_member: walletId,
                        apj_status: AirdropPoolJoinStatus.ACTIVE
                    }
                });
                
                if (!memberStake) {
                    throw new BadRequestException('You can only view pool transactions if you are the creator or a member of this pool');
                }
            }

            // Call getPoolDetailTransactions method with found poolId
            return await this.getPoolDetailTransactions(pool.alp_id, walletId, query);

        } catch (error) {
            this.logger.error(`Error getting pool detail transactions by id or slug: ${error.message}`);
            throw error;
        }
    }

    async getPoolDetailTransactions(poolId: number, walletId: number, query: GetPoolDetailTransactionsDto): Promise<PoolDetailTransactionsDto> {
        try {
            // 1. Get pool information
            const pool = await this.airdropListPoolRepository.findOne({
                where: { alp_id: poolId }
            });

            if (!pool) {
                throw new Error('Pool does not exist');
            }

            // 2. Get pool creator wallet information
            const creatorWallet = await this.listWalletRepository.findOne({
                where: { wallet_id: pool.alp_originator }
            });

            // 3. Check if user is the creator of the pool
            const isCreator = pool.alp_originator === walletId;

            // 4. Get user stake information in this pool
            const userStakes = await this.airdropPoolJoinRepository.find({
                where: {
                    apj_pool_id: poolId,
                    apj_member: walletId,
                    apj_status: AirdropPoolJoinStatus.ACTIVE
                }
            });

            // 5. Calculate total volume user has staked and stake count
            let totalUserStaked = 0;
            let userStakeCount = 0;
            if (userStakes.length > 0) {
                totalUserStaked = userStakes.reduce((sum, stake) => sum + Number(stake.apj_volume), 0);
                userStakeCount = userStakes.length;
            }

            // 6. If user is creator, add initial volume
            if (isCreator) {
                totalUserStaked += Number(pool.apl_volume);
            }

            // 7. Calculate total volume: initial volume + total stake volume
            const allPoolStakes = await this.airdropPoolJoinRepository.find({
                where: {
                    apj_pool_id: poolId,
                    apj_status: AirdropPoolJoinStatus.ACTIVE
                }
            });

            // Calculate total stake volume
            const totalStakeVolume = allPoolStakes.reduce((sum, stake) => sum + Number(stake.apj_volume), 0);
            
            // Total volume = initial volume + total stake volume
            const totalPoolVolume = Number(pool.apl_volume) + totalStakeVolume;

            // 8. Calculate actual member count from stake records (including creator)
            const uniqueMembers = new Set<number>();
            
            // Add creator to member count (always included)
            uniqueMembers.add(pool.alp_originator);
            
            // Add all members from stake records (Set automatically handles duplicates)
            // If creator also exists in stake records, it will be deduplicated automatically
            for (const stake of allPoolStakes) {
                uniqueMembers.add(stake.apj_member);
            }
            
            const actualMemberCount = uniqueMembers.size;

            // 9. Create basic pool information
            const poolDetail: PoolDetailTransactionsDto = {
                poolId: pool.alp_id,
                name: pool.alp_name,
                slug: pool.alp_slug,
                logo: pool.alp_logo || '',
                describe: pool.alp_describe || '',
                memberCount: actualMemberCount,
                totalVolume: totalPoolVolume,
                creationDate: pool.apl_creation_date,
                endDate: pool.apl_end_date,
                status: pool.apl_status,
                transactionHash: pool.apl_hash,
                creatorAddress: creatorWallet?.wallet_solana_address || '',
                creatorBittworldUid: creatorWallet?.bittworld_uid || null,
                transactions: []
            };

            // 10. Add user stake information if exists
            if (userStakes.length > 0 || isCreator) {
                const firstStakeDate = userStakes.length > 0 
                    ? userStakes[0].apj_stake_date 
                    : pool.apl_creation_date;

                poolDetail.userStakeInfo = {
                    isCreator: isCreator,
                    joinStatus: userStakes.length > 0 ? 'active' : 'creator',
                    joinDate: firstStakeDate,
                    totalStaked: totalUserStaked,
                    stakeCount: userStakeCount
                };
            }

            // 11. Get all transactions in the pool
            const transactions = await this.getPoolTransactions(poolId, walletId, query);
            poolDetail.transactions = transactions;

            return poolDetail;

        } catch (error) {
            this.logger.error(`Error getting pool detail transactions: ${error.message}`);
            throw error;
        }
    }

    private async getPoolTransactions(poolId: number, requestingWalletId: number, query: GetPoolDetailTransactionsDto): Promise<TransactionInfoDto[]> {
        try {
            // 1. Get pool information first to check if requesting user is creator
            const pool = await this.airdropListPoolRepository.findOne({
                where: { alp_id: poolId },
                relations: ['originator']
            });

            if (!pool) {
                throw new Error('Pool does not exist');
            }

            const isCreator = pool.alp_originator === requestingWalletId;

            // 2. Get stake records based on user role
            let allStakes;
            if (isCreator) {
                // Creator can see all stakes
                allStakes = await this.airdropPoolJoinRepository.find({
                    where: {
                        apj_pool_id: poolId,
                        apj_status: AirdropPoolJoinStatus.ACTIVE
                    },
                    relations: ['member']
                });
            } else {
                // Member can only see their own stakes
                allStakes = await this.airdropPoolJoinRepository.find({
                    where: {
                        apj_pool_id: poolId,
                        apj_member: requestingWalletId,
                        apj_status: AirdropPoolJoinStatus.ACTIVE
                    },
                    relations: ['member']
                });
            }

            // 3. Create transactions list
            const transactions: TransactionInfoDto[] = [];

            // 4. Add creator's initial transaction (if pool is active and user can see it)
            if (pool.apl_status === AirdropPoolStatus.ACTIVE && pool.originator) {
                // Creator can always see their own initial transaction
                // Members can only see creator's transaction if they are the creator or if creator allows it
                if (isCreator) {
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
            }

            // 5. Add member transactions (filtered based on user role)
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

            // 6. Sort transactions based on query parameters
            const sortBy = query.sortBy || TransactionSortField.TRANSACTION_DATE;
            const sortOrder = query.sortOrder || TransactionSortOrder.DESC;

            transactions.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                switch (sortBy) {
                    case TransactionSortField.TRANSACTION_DATE:
                        aValue = new Date(a.transactionDate).getTime();
                        bValue = new Date(b.transactionDate).getTime();
                        break;
                    case TransactionSortField.STAKE_AMOUNT:
                        aValue = a.stakeAmount;
                        bValue = b.stakeAmount;
                        break;
                    case TransactionSortField.MEMBER_ID:
                        aValue = a.memberId;
                        bValue = b.memberId;
                        break;
                    case TransactionSortField.STATUS:
                        aValue = a.status;
                        bValue = b.status;
                        break;
                    default:
                        aValue = new Date(a.transactionDate).getTime();
                        bValue = new Date(b.transactionDate).getTime();
                }

                if (sortOrder === TransactionSortOrder.ASC) {
                    return aValue > bValue ? 1 : -1;
                } else {
                    return aValue < bValue ? 1 : -1;
                }
            });

            return transactions;

        } catch (error) {
            this.logger.error(`Error getting pool transactions: ${error.message}`);
            throw error;
        }
    }

    /**
     * Set top round configuration for airdrop rewards
     */

    /**
     * Get user's airdrop reward history with filtering and search
     */
    async getUserRewardHistory(walletId: number, query: GetRewardHistoryDto) {
        try {
            this.logger.log(`Getting reward history for wallet ${walletId} with filters: ${JSON.stringify(query)}`);

            // Validate wallet exists
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet) {
                throw new BadRequestException('Wallet not found');
            }

            // Build query with proper joins
            const queryBuilder = this.airdropRewardRepository
                .createQueryBuilder('reward')
                .leftJoin('reward.tokenAirdrop', 'token')
                .leftJoin('reward.wallet', 'rewardWallet')
                .leftJoin('rewardWallet.wallet_auths', 'walletAuth')
                .leftJoin('walletAuth.wa_user', 'userWallet')
                .where('reward.ar_wallet_id = :walletId', { walletId });

            // Apply filters
            if (query.type) {
                queryBuilder.andWhere('reward.ar_type = :type', { type: query.type });
            }

            if (query.sub_type) {
                queryBuilder.andWhere('reward.ar_sub_type = :subType', { subType: query.sub_type });
            }

            if (query.status) {
                queryBuilder.andWhere('reward.ar_status = :status', { status: query.status });
            }

            if (query.token_mint) {
                queryBuilder.andWhere('token.alt_token_mint = :tokenMint', { tokenMint: query.token_mint });
            }

            if (query.token_id) {
                queryBuilder.andWhere('reward.ar_token_airdrop_id = :tokenId', { tokenId: query.token_id });
            }

            if (query.search) {
                queryBuilder.andWhere(
                    '(token.alt_token_name ILIKE :search OR token.alt_token_mint ILIKE :search)',
                    { search: `%${query.search}%` }
                );
            }

            if (query.min_amount !== undefined) {
                queryBuilder.andWhere('reward.ar_amount >= :minAmount', { minAmount: query.min_amount });
            }

            if (query.max_amount !== undefined) {
                queryBuilder.andWhere('reward.ar_amount <= :maxAmount', { maxAmount: query.max_amount });
            }

            if (query.from_date) {
                queryBuilder.andWhere('reward.ar_date >= :fromDate', { fromDate: new Date(query.from_date) });
            }

            if (query.to_date) {
                queryBuilder.andWhere('reward.ar_date <= :toDate', { toDate: new Date(query.to_date) });
            }

            // Get total count for pagination
            const total = await queryBuilder.getCount();

            // Apply sorting
            const sortBy = query.sort_by || RewardHistorySortField.DATE;
            const sortOrder = query.sort_order || RewardHistorySortOrder.DESC;

            switch (sortBy) {
                case RewardHistorySortField.DATE:
                    queryBuilder.orderBy('reward.ar_date', sortOrder.toUpperCase() as 'ASC' | 'DESC');
                    break;
                case RewardHistorySortField.AMOUNT:
                    queryBuilder.orderBy('reward.ar_amount', sortOrder.toUpperCase() as 'ASC' | 'DESC');
                    break;
                case RewardHistorySortField.TYPE:
                    queryBuilder.orderBy('reward.ar_type', sortOrder.toUpperCase() as 'ASC' | 'DESC');
                    break;
                case RewardHistorySortField.STATUS:
                    queryBuilder.orderBy('reward.ar_status', sortOrder.toUpperCase() as 'ASC' | 'DESC');
                    break;
                default:
                    queryBuilder.orderBy('reward.ar_date', 'DESC');
            }

            // Apply pagination
            const page = query.page || 1;
            const limit = query.limit || 20;
            const offset = (page - 1) * limit;

            queryBuilder.offset(offset).limit(limit);

            // Select fields including wallet information
            queryBuilder.select([
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
                'token.alt_token_name',
                'token.alt_token_mint',
                'rewardWallet.bittworld_uid',
                'userWallet.uw_email'
            ]);

            // Execute query
            const rawRewards = await queryBuilder.getRawMany();

            // Transform results
            const rewards = rawRewards.map(reward => {
                const rewardDescription = this.getRewardDescription(reward.reward_ar_type, reward.reward_ar_sub_type);
                const formattedAmount = this.formatRewardAmount(reward.reward_ar_amount, reward.token_alt_token_name);

                return {
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
                    token_name: reward.token_alt_token_name,
                    token_mint: reward.token_alt_token_mint,
                    bittworld_uid: reward.rewardWallet_bittworld_uid,
                    email: reward.userWallet_uw_email,
                    pool_name: null, // TODO: Add pool information if needed
                    pool_slug: null, // TODO: Add pool information if needed
                    reward_description: rewardDescription,
                    formatted_amount: formattedAmount
                };
            });

            // Calculate statistics
            const stats = await this.calculateRewardStats(walletId, query);

            const totalPages = Math.ceil(total / limit);

            this.logger.log(`Retrieved ${rewards.length} reward history items for wallet ${walletId} (page ${page}/${totalPages}, total: ${total})`);

            return {
                success: true,
                message: 'Reward history retrieved successfully',
                data: {
                    rewards,
                    stats,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages
                    }
                }
            };

        } catch (error) {
            this.logger.error(`Error getting reward history for wallet ${walletId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculate reward statistics for a wallet
     */
    private async calculateRewardStats(walletId: number, query: GetRewardHistoryDto) {
        try {
            // Build stats query with same filters as main query
            const statsQueryBuilder = this.airdropRewardRepository
                .createQueryBuilder('reward')
                .leftJoin('reward.tokenAirdrop', 'token')
                .where('reward.ar_wallet_id = :walletId', { walletId });

            // Apply same filters as main query
            if (query.type) {
                statsQueryBuilder.andWhere('reward.ar_type = :type', { type: query.type });
            }

            if (query.sub_type) {
                statsQueryBuilder.andWhere('reward.ar_sub_type = :subType', { subType: query.sub_type });
            }

            if (query.status) {
                statsQueryBuilder.andWhere('reward.ar_status = :status', { status: query.status });
            }

            if (query.token_mint) {
                statsQueryBuilder.andWhere('token.alt_token_mint = :tokenMint', { tokenMint: query.token_mint });
            }

            if (query.token_id) {
                statsQueryBuilder.andWhere('reward.ar_token_airdrop_id = :tokenId', { tokenId: query.token_id });
            }

            if (query.search) {
                statsQueryBuilder.andWhere(
                    '(token.alt_token_name ILIKE :search OR token.alt_token_mint ILIKE :search)',
                    { search: `%${query.search}%` }
                );
            }

            if (query.min_amount !== undefined) {
                statsQueryBuilder.andWhere('reward.ar_amount >= :minAmount', { minAmount: query.min_amount });
            }

            if (query.max_amount !== undefined) {
                statsQueryBuilder.andWhere('reward.ar_amount <= :maxAmount', { maxAmount: query.max_amount });
            }

            if (query.from_date) {
                statsQueryBuilder.andWhere('reward.ar_date >= :fromDate', { fromDate: new Date(query.from_date) });
            }

            if (query.to_date) {
                statsQueryBuilder.andWhere('reward.ar_date <= :toDate', { toDate: new Date(query.to_date) });
            }

            // Get total stats
            const totalStats = await statsQueryBuilder
                .select([
                    'COUNT(*) as total_rewards',
                    'SUM(reward.ar_amount) as total_amount',
                    'SUM(CASE WHEN reward.ar_status = :canWithdraw THEN reward.ar_amount ELSE 0 END) as total_can_withdraw_amount',
                    'SUM(CASE WHEN reward.ar_status = :withdrawn THEN reward.ar_amount ELSE 0 END) as total_withdrawn_amount',
                    'COUNT(CASE WHEN reward.ar_status = :canWithdraw THEN 1 END) as can_withdraw_count',
                    'COUNT(CASE WHEN reward.ar_status = :withdrawn THEN 1 END) as withdrawn_count'
                ])
                .setParameter('canWithdraw', AirdropRewardStatus.CAN_WITHDRAW)
                .setParameter('withdrawn', AirdropRewardStatus.WITHDRAWN)
                .getRawOne();

            // Get breakdown by type
            const typeBreakdown = await statsQueryBuilder
                .select([
                    'reward.ar_type as type',
                    'COUNT(*) as count',
                    'SUM(reward.ar_amount) as total_amount'
                ])
                .groupBy('reward.ar_type')
                .getRawMany();

            // Get breakdown by sub_type
            const subTypeBreakdown = await statsQueryBuilder
                .select([
                    'reward.ar_sub_type as sub_type',
                    'COUNT(*) as count',
                    'SUM(reward.ar_amount) as total_amount'
                ])
                .groupBy('reward.ar_sub_type')
                .getRawMany();

            // Get breakdown by token
            const tokenBreakdown = await statsQueryBuilder
                .select([
                    'reward.ar_token_airdrop_id as token_id',
                    'token.alt_token_name as token_name',
                    'token.alt_token_mint as token_mint',
                    'COUNT(*) as count',
                    'SUM(reward.ar_amount) as total_amount'
                ])
                .groupBy('reward.ar_token_airdrop_id, token.alt_token_name, token.alt_token_mint')
                .getRawMany();

            // Format breakdown by type
            const breakdownByType: any = {};
            Object.values(AirdropRewardType).forEach(type => {
                breakdownByType[type] = { count: 0, total_amount: 0 };
            });
            typeBreakdown.forEach(item => {
                breakdownByType[item.type] = {
                    count: parseInt(item.count),
                    total_amount: parseFloat(item.total_amount || '0')
                };
            });

            // Format breakdown by sub_type
            const breakdownBySubType: any = {};
            Object.values(AirdropRewardSubType).forEach(subType => {
                breakdownBySubType[subType] = { count: 0, total_amount: 0 };
            });
            subTypeBreakdown.forEach(item => {
                if (item.sub_type) {
                    breakdownBySubType[item.sub_type] = {
                        count: parseInt(item.count),
                        total_amount: parseFloat(item.total_amount || '0')
                    };
                }
            });

            // Format breakdown by token
            const breakdownByToken = tokenBreakdown.map(item => ({
                token_id: parseInt(item.token_id),
                token_name: item.token_name,
                token_mint: item.token_mint,
                count: parseInt(item.count),
                total_amount: parseFloat(item.total_amount || '0')
            }));

            return {
                total_rewards: parseInt(totalStats.total_rewards || '0'),
                total_amount: parseFloat(totalStats.total_amount || '0'),
                total_can_withdraw_amount: parseFloat(totalStats.total_can_withdraw_amount || '0'),
                total_withdrawn_amount: parseFloat(totalStats.total_withdrawn_amount || '0'),
                can_withdraw_count: parseInt(totalStats.can_withdraw_count || '0'),
                withdrawn_count: parseInt(totalStats.withdrawn_count || '0'),
                breakdown_by_type: breakdownByType,
                breakdown_by_sub_type: breakdownBySubType,
                breakdown_by_token: breakdownByToken
            };

        } catch (error) {
            this.logger.error(`Error calculating reward stats for wallet ${walletId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get reward description based on type and sub_type
     */
    private getRewardDescription(type: AirdropRewardType, subType: AirdropRewardSubType | null): string {
        switch (type) {
            case AirdropRewardType.TYPE_1:
                switch (subType) {
                    case AirdropRewardSubType.LEADER_BONUS:
                        return 'Leader Bonus (10%)';
                    case AirdropRewardSubType.PARTICIPATION_SHARE:
                        return 'Participation Share (90%)';
                    default:
                        return 'Volume-based Reward';
                }
            case AirdropRewardType.TYPE_2:
                switch (subType) {
                    case AirdropRewardSubType.TOP_POOL_REWARD:
                        return 'TOP Pool Reward';
                    default:
                        return 'TOP Pool Reward';
                }
            default:
                return 'Airdrop Reward';
        }
    }

    /**
     * Format reward amount with token symbol
     */
    private formatRewardAmount(amount: number, tokenName: string): string {
        // Extract token symbol from token name (e.g., "MMP Token" -> "MMP")
        const tokenSymbol = tokenName.split(' ')[0];
        
        // Format amount with commas
        const formattedAmount = new Intl.NumberFormat('en-US').format(amount);
        
        return `${formattedAmount} ${tokenSymbol}`;
    }

} 