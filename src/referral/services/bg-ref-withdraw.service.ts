import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { WalletRefReward } from '../entities/wallet-ref-reward.entity';
import { BgAffiliateCommissionReward } from '../entities/bg-affiliate-commission-reward.entity';
import { RefWithdrawHistory, WithdrawStatus } from '../entities/ref-withdraw-history.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { SolanaPriceCacheService } from '../../solana/solana-price-cache.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisLockService } from '../../common/services/redis-lock.service';
import bs58 from 'bs58';

@Injectable()
export class BgRefWithdrawService {
  private readonly logger = new Logger(BgRefWithdrawService.name);
  private readonly connection: Connection;
  private readonly MIN_WITHDRAW_AMOUNT = 10; // Minimum $10 USD
  private readonly WITHDRAW_TIMEOUT_MINUTES = 30; // 30 minutes timeout

  constructor(
    @InjectRepository(WalletRefReward)
    private walletRefRewardRepository: Repository<WalletRefReward>,
    @InjectRepository(BgAffiliateCommissionReward)
    private bgAffiliateCommissionRewardRepository: Repository<BgAffiliateCommissionReward>,
    @InjectRepository(RefWithdrawHistory)
    private refWithdrawHistoryRepository: Repository<RefWithdrawHistory>,
    @InjectRepository(ListWallet)
    private listWalletRepository: Repository<ListWallet>,
    private configService: ConfigService,
    private solanaPriceCacheService: SolanaPriceCacheService,
    private redisLockService: RedisLockService,
    private dataSource: DataSource,
  ) {
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL');
    if (!rpcUrl) {
      throw new Error('SOLANA_RPC_URL is not configured');
    }
    this.connection = new Connection(rpcUrl);
  }

  /**
   * Create withdrawal request for BG affiliate rewards
   */
  async createWithdrawRequest(walletId: number): Promise<{
    success: boolean;
    message: string;
    withdrawId?: number;
    amountUSD?: number;
    amountSOL?: number;
    breakdown?: {
      walletRefRewardsUSD: number;
      bgAffiliateRewardsUSD: number;
    };
  }> {
    // Sử dụng Redis lock để đảm bảo chỉ một request được xử lý tại một thời điểm
    return this.redisLockService.withLock(
      `bg-ref-withdraw:${walletId}`,
      async () => {
        return await this.dataSource.transaction(async manager => {
          // 1. Kiểm tra xem wallet đã có yêu cầu rút tiền đang pending chưa
          const existingPendingWithdrawal = await manager.findOne(RefWithdrawHistory, {
            where: {
              rwh_wallet_id: walletId,
              rwh_status: WithdrawStatus.PENDING
            }
          });

          if (existingPendingWithdrawal) {
            return {
              success: false,
              message: `Bạn đã có yêu cầu rút tiền đang chờ xử lý (ID: ${existingPendingWithdrawal.rwh_id}). Vui lòng chờ hoặc hủy yêu cầu trước đó.`,
            };
          }

          // 2. Tìm tất cả wallet_ref_rewards chưa rút
          const walletRefRewards = await manager.find(WalletRefReward, {
            where: {
              wrr_withdraw_id: IsNull(),
              wrr_withdraw_status: false,
            },
            relations: ['referent'],
          });

          // Lọc rewards thuộc về wallet này (as referent)
          const walletRefRewardsForUser = walletRefRewards.filter(reward => 
            reward.referent?.wr_wallet_referent === walletId
          );

          // Tính tổng USD từ wallet_ref_rewards
          const walletRefRewardsUSD = walletRefRewardsForUser.reduce((sum, reward) => 
            sum + Number(reward.wrr_use_reward), 0
          );

          // 3. Tìm tất cả bg_affiliate_commission_rewards chưa rút
          const bgAffiliateRewards = await manager.find(BgAffiliateCommissionReward, {
            where: {
              bacr_wallet_id: walletId,
              bacr_withdraw_id: IsNull(),
              bacr_withdraw_status: false,
            },
          });

          // Tính tổng USD từ bg_affiliate_commission_rewards
          const bgAffiliateRewardsUSD = bgAffiliateRewards.reduce((sum, reward) => 
            sum + Number(reward.bacr_commission_amount), 0
          );

          // 4. Tính tổng số tiền có thể rút
          const totalAmountUSD = walletRefRewardsUSD + bgAffiliateRewardsUSD;

          if (totalAmountUSD < this.MIN_WITHDRAW_AMOUNT) {
            return {
              success: false,
              message: `Minimum withdrawal amount is $${this.MIN_WITHDRAW_AMOUNT}. Current available: $${totalAmountUSD.toFixed(2)}`,
            };
          }

          // 5. Get current SOL price
          const solPriceUSD = await this.solanaPriceCacheService.getSOLPriceInUSD();
          if (!solPriceUSD || solPriceUSD <= 0) {
            throw new Error('Failed to get SOL price');
          }

          // 6. Calculate SOL amount
          const amountSOL = totalAmountUSD / solPriceUSD;

          // 7. Get wallet info
          const wallet = await manager.findOne(ListWallet, {
            where: { wallet_id: walletId },
            select: ['wallet_solana_address']
          });

          if (!wallet) {
            throw new Error('Wallet not found');
          }

          // 8. Create withdrawal history record
          const withdrawHistory = manager.create(RefWithdrawHistory, {
            rwh_wallet_id: walletId,
            rwh_amount: amountSOL,
            rwh_amount_usd: totalAmountUSD, // Store USD equivalent for statistics
            rwh_status: WithdrawStatus.PENDING,
            rwh_date: new Date(Date.now() + this.WITHDRAW_TIMEOUT_MINUTES * 60 * 1000), // 30 minutes from now
          });

          const savedWithdrawHistory = await manager.save(RefWithdrawHistory, withdrawHistory);

          // 9. Update wallet_ref_rewards with withdraw ID
          if (walletRefRewardsForUser.length > 0) {
            await manager.update(
              WalletRefReward,
              { wrr_id: In(walletRefRewardsForUser.map(r => r.wrr_id)) },
              { wrr_withdraw_id: savedWithdrawHistory.rwh_id }
            );
          }

          // 10. Update bg_affiliate_commission_rewards with withdraw ID
          if (bgAffiliateRewards.length > 0) {
            await manager.update(
              BgAffiliateCommissionReward,
              { bacr_id: In(bgAffiliateRewards.map(r => r.bacr_id)) },
              { bacr_withdraw_id: savedWithdrawHistory.rwh_id }
            );
          }

          this.logger.log(`Created BG affiliate withdrawal request ${savedWithdrawHistory.rwh_id} for wallet ${walletId}: $${totalAmountUSD} USD (${amountSOL} SOL)`);

          return {
            success: true,
            message: 'BG affiliate withdrawal request created successfully',
            withdrawId: savedWithdrawHistory.rwh_id,
            amountUSD: totalAmountUSD,
            amountSOL: amountSOL,
            breakdown: {
              walletRefRewardsUSD,
              bgAffiliateRewardsUSD,
            },
          };
        });
      },
      30000 // 30 seconds timeout for lock
    );
  }

  /**
   * Cancel pending withdrawal request
   */
  async cancelWithdrawRequest(walletId: number, withdrawId: number): Promise<{
    success: boolean;
    message: string;
    withdrawId?: number;
    cancelledAt?: Date;
  }> {
    return this.redisLockService.withLock(
      `bg-ref-withdraw:${walletId}`,
      async () => {
        return await this.dataSource.transaction(async manager => {
          // 1. Kiểm tra withdrawal request tồn tại và thuộc về wallet này
          const withdrawal = await manager.findOne(RefWithdrawHistory, {
            where: {
              rwh_id: withdrawId,
              rwh_wallet_id: walletId,
              rwh_status: WithdrawStatus.PENDING
            }
          });

          if (!withdrawal) {
            return {
              success: false,
              message: 'Không tìm thấy yêu cầu rút tiền đang chờ xử lý hoặc yêu cầu không thuộc về bạn',
            };
          }

          // 2. Cập nhật status thành FAILED
          await manager.update(
            RefWithdrawHistory,
            { rwh_id: withdrawId },
            { rwh_status: WithdrawStatus.FAILED }
          );

          // 3. Reset withdraw_id cho tất cả rewards liên quan
          await manager.update(
            WalletRefReward,
            { wrr_withdraw_id: withdrawId },
            { wrr_withdraw_id: null }
          );

          await manager.update(
            BgAffiliateCommissionReward,
            { bacr_withdraw_id: withdrawId },
            { bacr_withdraw_id: null }
          );

          this.logger.log(`Cancelled BG affiliate withdrawal request ${withdrawId} for wallet ${walletId}`);

          return {
            success: true,
            message: 'Hủy yêu cầu rút tiền thành công',
            withdrawId: withdrawId,
            cancelledAt: new Date()
          };
        });
      },
      30000 // 30 seconds timeout for lock
    );
  }

  /**
   * Process pending withdrawals (called by cron job)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingWithdrawals() {
    try {
      const pendingWithdrawals = await this.refWithdrawHistoryRepository.find({
        where: { rwh_status: WithdrawStatus.PENDING },
      });

      for (const withdrawal of pendingWithdrawals) {
        await this.processWithdrawal(withdrawal);
      }

      // Process retry withdrawals - chỉ xử lý những withdrawal đã đến thời gian retry
      const retryWithdrawals = await this.refWithdrawHistoryRepository.find({
        where: { 
          rwh_status: WithdrawStatus.RETRY,
          rwh_next_retry_at: new Date() // Chỉ lấy những withdrawal đã đến thời gian retry
        },
      });

      for (const withdrawal of retryWithdrawals) {
        await this.processWithdrawal(withdrawal);
      }

    } catch (error) {
      this.logger.error(`Error processing pending withdrawals: ${error.message}`, error.stack);
    }
  }

  /**
   * Process individual withdrawal
   */
  private async processWithdrawal(withdrawal: RefWithdrawHistory): Promise<void> {
    try {
      // Check if withdrawal has expired
      if (withdrawal.rwh_status === WithdrawStatus.PENDING && 
          withdrawal.rwh_date < new Date()) {
        await this.handleFailedWithdrawal(withdrawal, 'Withdrawal timeout');
        return;
      }

      // Get wallet info
      const wallet = await this.listWalletRepository.findOne({
        where: { wallet_id: withdrawal.rwh_wallet_id },
        select: ['wallet_solana_address']
      });

      if (!wallet) {
        await this.handleFailedWithdrawal(withdrawal, 'Wallet not found');
        return;
      }

      // Get withdrawal wallet private key
      const withdrawalWalletPrivateKey = this.configService.get<string>('WALLET_WITHDRAW_REWARD');
      if (!withdrawalWalletPrivateKey) {
        this.logger.error('WALLET_WITHDRAW_REWARD private key not configured');
        return;
      }

      // Parse private key - try different formats
      let keypair: Keypair;
      try {
        // Try to parse as JSON first (like database format)
        const privateKeyObj = JSON.parse(withdrawalWalletPrivateKey);
        if (privateKeyObj.solana) {
          keypair = Keypair.fromSecretKey(bs58.decode(privateKeyObj.solana));
        } else {
          throw new Error('No solana private key found in JSON');
        }
      } catch (jsonError) {
        // If not JSON, try direct parsing using existing method
        try {
          keypair = this.parsePrivateKey(withdrawalWalletPrivateKey);
        } catch (parseError) {
          this.logger.error(`Failed to parse private key: ${parseError.message}`);
          return;
        }
      }

      // Kiểm tra xem transaction đã được gửi chưa
      if (withdrawal.rwh_hash) {
        // Nếu đã có signature, kiểm tra status trên blockchain
        const transactionStatus = await this.checkTransactionStatus(withdrawal.rwh_hash);
        
        if (transactionStatus.confirmed) {
          // Transaction đã được confirm, cập nhật status thành SUCCESS
          await this.handleSuccessfulWithdrawal(withdrawal);
          return;
        } else if (transactionStatus.finalized) {
          // Transaction đã được finalized, cập nhật status thành SUCCESS
          await this.handleSuccessfulWithdrawal(withdrawal);
          return;
        } else if (transactionStatus.pending) {
          // Transaction đang pending, chờ thêm
          this.logger.log(`Transaction ${withdrawal.rwh_hash} is still pending for withdrawal ${withdrawal.rwh_id}`);
          return;
        } else {
          // Transaction failed hoặc không tìm thấy, có thể retry
          this.logger.warn(`Transaction ${withdrawal.rwh_hash} failed or not found, will retry for withdrawal ${withdrawal.rwh_id}`);
        }
      }

      // Sử dụng Redis lock để đảm bảo chỉ một process xử lý withdrawal này tại một thời điểm
      return this.redisLockService.withLock(
        `withdrawal-processing:${withdrawal.rwh_id}`,
        async () => {
          // Kiểm tra lại status sau khi acquire lock
          const currentWithdrawal = await this.refWithdrawHistoryRepository.findOne({
            where: { rwh_id: withdrawal.rwh_id }
          });

          if (!currentWithdrawal || currentWithdrawal.rwh_status !== withdrawal.rwh_status) {
            this.logger.log(`Withdrawal ${withdrawal.rwh_id} status changed, skipping processing`);
            return;
          }

          // Send SOL to user wallet
          const result = await this.sendSOLToWallet(
            keypair,
            wallet.wallet_solana_address,
            withdrawal.rwh_amount
          );

          if (result.success && result.signature) {
            // Lưu signature ngay khi gửi transaction thành công
            await this.refWithdrawHistoryRepository.update(
              { rwh_id: withdrawal.rwh_id },
              { rwh_hash: result.signature }
            );

            // Kiểm tra confirmation
            const confirmationResult = await this.waitForTransactionConfirmation(result.signature);
            
            if (confirmationResult.success) {
              await this.handleSuccessfulWithdrawal(withdrawal);
            } else {
              // Transaction sent nhưng chưa confirm, sẽ retry sau
              await this.handleRetryWithdrawal(withdrawal);
            }
          } else {
            await this.handleRetryWithdrawal(withdrawal);
          }
        },
        60000 // 60 seconds timeout for processing lock
      );

    } catch (error) {
      this.logger.error(`Error processing withdrawal ${withdrawal.rwh_id}: ${error.message}`, error.stack);
      await this.handleRetryWithdrawal(withdrawal);
    }
  }

  /**
   * Check transaction status on blockchain
   */
  private async checkTransactionStatus(signature: string): Promise<{
    confirmed: boolean;
    finalized: boolean;
    pending: boolean;
    error?: string;
  }> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      
      if (!status.value) {
        return { confirmed: false, finalized: false, pending: false, error: 'Transaction not found' };
      }

      if (status.value.err) {
        return { confirmed: false, finalized: false, pending: false, error: status.value.err.toString() };
      }

      const confirmationStatus = status.value.confirmationStatus;
      
      return {
        confirmed: confirmationStatus === 'confirmed' || confirmationStatus === 'finalized',
        finalized: confirmationStatus === 'finalized',
        pending: confirmationStatus === 'processed' || confirmationStatus === 'confirmed'
      };
    } catch (error) {
      this.logger.error(`Error checking transaction status for ${signature}: ${error.message}`);
      return { confirmed: false, finalized: false, pending: false, error: error.message };
    }
  }

  /**
   * Wait for transaction confirmation with timeout
   */
  private async waitForTransactionConfirmation(signature: string, timeoutMs: number = 30000): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeoutMs) {
        const status = await this.checkTransactionStatus(signature);
        
        if (status.finalized) {
          return { success: true };
        }
        
        if (status.confirmed) {
          return { success: true };
        }
        
        if (status.error) {
          return { success: false, error: status.error };
        }
        
        // Wait 2 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      return { success: false, error: 'Transaction confirmation timeout' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse private key from various formats
   */
  private parsePrivateKey(privateKeyString: string): Keypair {
    try {
      // Try to parse as JSON array first
      const privateKeyArray = JSON.parse(privateKeyString);
      if (Array.isArray(privateKeyArray)) {
        return Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
      }
    } catch (jsonError) {
      // JSON parsing failed, continue to other formats
    }

    try {
      // Try as comma-separated string
      if (privateKeyString.includes(',')) {
        const privateKeyArray = privateKeyString.split(',').map(num => parseInt(num.trim()));
        return Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
      }
    } catch (commaError) {
      // Comma parsing failed, continue to other formats
    }

    try {
      // Try as base58 string (most common format for Solana private keys)
      return Keypair.fromSecretKey(
        new Uint8Array(Buffer.from(privateKeyString, 'base64'))
      );
    } catch (base58Error) {
      // Base64 parsing failed, try as base58
    }

    try {
      // Try as base58 string using bs58 library
      // This is the most common format for Solana private keys
      const decoded = bs58.decode(privateKeyString);
      return Keypair.fromSecretKey(new Uint8Array(decoded));
    } catch (bs58Error) {
      // bs58 parsing failed
    }

    // If all parsing methods fail, throw error
    throw new Error('Invalid private key format. Expected JSON array, comma-separated string, base64, or base58 string.');
  }

  /**
   * Send SOL to user wallet
   */
  private async sendSOLToWallet(
    fromKeypair: Keypair,
    toAddress: string,
    amountSOL: number
  ): Promise<{ success: boolean; signature?: string }> {
    try {
      const toPublicKey = new PublicKey(toAddress);

      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: toPublicKey,
          lamports: amountSOL * LAMPORTS_PER_SOL,
        })
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromKeypair.publicKey;

      // Sign and send transaction
      const signature = await this.connection.sendTransaction(transaction, [fromKeypair]);
      
      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        this.logger.error(`Transaction failed: ${confirmation.value.err}`);
        return { success: false };
      }

      this.logger.log(`Successfully sent ${amountSOL} SOL to ${toAddress}. Signature: ${signature}`);
      return { success: true, signature };

    } catch (error) {
      this.logger.error(`Error sending SOL: ${error.message}`, error.stack);
      return { success: false };
    }
  }

  /**
   * Handle successful withdrawal
   */
  private async handleSuccessfulWithdrawal(withdrawal: RefWithdrawHistory): Promise<void> {
    try {
      // Update withdrawal status
      await this.refWithdrawHistoryRepository.update(
        { rwh_id: withdrawal.rwh_id },
        { rwh_status: WithdrawStatus.SUCCESS }
      );

      // Update all related wallet_ref_rewards
      await this.walletRefRewardRepository.update(
        { wrr_withdraw_id: withdrawal.rwh_id },
        { wrr_withdraw_status: true }
      );

      // Update all related bg_affiliate_commission_rewards
      await this.bgAffiliateCommissionRewardRepository.update(
        { bacr_withdraw_id: withdrawal.rwh_id },
        { bacr_withdraw_status: true }
      );

      this.logger.log(`Withdrawal ${withdrawal.rwh_id} completed successfully`);

    } catch (error) {
      this.logger.error(`Error handling successful withdrawal: ${error.message}`, error.stack);
    }
  }

  /**
   * Handle failed withdrawal
   */
  private async handleFailedWithdrawal(withdrawal: RefWithdrawHistory, reason: string): Promise<void> {
    try {
      // Update withdrawal status
      await this.refWithdrawHistoryRepository.update(
        { rwh_id: withdrawal.rwh_id },
        { rwh_status: WithdrawStatus.FAILED }
      );

      // Reset withdraw_id for all related wallet_ref_rewards
      await this.walletRefRewardRepository.update(
        { wrr_withdraw_id: withdrawal.rwh_id },
        { wrr_withdraw_id: null }
      );

      // Reset withdraw_id for all related bg_affiliate_commission_rewards
      await this.bgAffiliateCommissionRewardRepository.update(
        { bacr_withdraw_id: withdrawal.rwh_id },
        { bacr_withdraw_id: null }
      );

      this.logger.warn(`Withdrawal ${withdrawal.rwh_id} failed: ${reason}`);

    } catch (error) {
      this.logger.error(`Error handling failed withdrawal: ${error.message}`, error.stack);
    }
  }

  /**
   * Handle retry withdrawal
   */
  private async handleRetryWithdrawal(withdrawal: RefWithdrawHistory): Promise<void> {
    try {
      // Kiểm tra số lần retry hiện tại
      const retryCount = withdrawal.rwh_retry_count || 0;
      const maxRetries = 5; // Giới hạn tối đa 5 lần retry
      
      if (retryCount >= maxRetries) {
        // Đã retry quá nhiều lần, mark as failed
        await this.handleFailedWithdrawal(withdrawal, `Exceeded maximum retry attempts (${maxRetries})`);
        return;
      }

      // Tính toán delay cho retry (exponential backoff)
      const baseDelay = 60000; // 1 phút
      const exponentialDelay = baseDelay * Math.pow(2, retryCount); // 1m, 2m, 4m, 8m, 16m
      const maxDelay = 300000; // Tối đa 5 phút
      const delay = Math.min(exponentialDelay, maxDelay);

      // Cập nhật retry count và schedule next retry
      await this.refWithdrawHistoryRepository.update(
        { rwh_id: withdrawal.rwh_id },
        { 
          rwh_status: WithdrawStatus.RETRY,
          rwh_retry_count: retryCount + 1,
          rwh_next_retry_at: new Date(Date.now() + delay)
        }
      );

      this.logger.log(`Withdrawal ${withdrawal.rwh_id} marked for retry (attempt ${retryCount + 1}/${maxRetries}) in ${delay/1000}s`);

    } catch (error) {
      this.logger.error(`Error handling retry withdrawal: ${error.message}`, error.stack);
    }
  }

  /**
   * Get withdrawal history for a wallet
   */
  async getWithdrawalHistory(walletId: number): Promise<RefWithdrawHistory[]> {
    return await this.refWithdrawHistoryRepository.find({
      where: { rwh_wallet_id: walletId },
      order: { rwh_date: 'DESC' }
    });
  }

  /**
   * Get available withdrawal amount for a wallet
   */
  async getAvailableWithdrawalAmount(walletId: number): Promise<{
    totalUSD: number;
    totalSOL: number;
    breakdown: {
      walletRefRewardsUSD: number;
      walletRefRewardsCount: number;
      bgAffiliateRewardsUSD: number;
      bgAffiliateRewardsCount: number;
    };
  }> {
    // Get wallet_ref_rewards
    const walletRefRewards = await this.walletRefRewardRepository.find({
      where: {
        wrr_withdraw_id: IsNull(),
        wrr_withdraw_status: false,
      },
      relations: ['referent'],
    });

    const walletRefRewardsForUser = walletRefRewards.filter(reward => 
      reward.referent?.wr_wallet_referent === walletId
    );

    const walletRefRewardsUSD = walletRefRewardsForUser.reduce((sum, reward) => 
      sum + Number(reward.wrr_use_reward), 0
    );

    // Get bg_affiliate_commission_rewards
    const bgAffiliateRewards = await this.bgAffiliateCommissionRewardRepository.find({
      where: {
        bacr_wallet_id: walletId,
        bacr_withdraw_id: IsNull(),
        bacr_withdraw_status: false,
      },
    });

    const bgAffiliateRewardsUSD = bgAffiliateRewards.reduce((sum, reward) => 
      sum + Number(reward.bacr_commission_amount), 0
    );

    const totalUSD = walletRefRewardsUSD + bgAffiliateRewardsUSD;

    const solPriceUSD = await this.solanaPriceCacheService.getSOLPriceInUSD();
    const totalSOL = solPriceUSD > 0 ? totalUSD / solPriceUSD : 0;

    return {
      totalUSD,
      totalSOL,
      breakdown: {
        walletRefRewardsUSD,
        walletRefRewardsCount: walletRefRewardsForUser.length,
        bgAffiliateRewardsUSD,
        bgAffiliateRewardsCount: bgAffiliateRewards.length,
      },
    };
  }

  /**
   * Get pending withdrawal for a wallet
   */
  async getPendingWithdrawal(walletId: number): Promise<{
    hasPendingWithdrawal: boolean;
    withdrawal?: {
      withdrawId: number;
      amountUSD: number;
      amountSOL: number;
      createdAt: Date;
      expiresAt: Date;
      breakdown: {
        walletRefRewardsUSD: number;
        bgAffiliateRewardsUSD: number;
      };
    };
  }> {
    const pendingWithdrawal = await this.refWithdrawHistoryRepository.findOne({
      where: {
        rwh_wallet_id: walletId,
        rwh_status: WithdrawStatus.PENDING
      }
    });

    if (!pendingWithdrawal) {
      return {
        hasPendingWithdrawal: false
      };
    }

    // Lấy thông tin breakdown từ rewards
    const walletRefRewards = await this.walletRefRewardRepository.find({
      where: {
        wrr_withdraw_id: pendingWithdrawal.rwh_id
      },
      relations: ['referent']
    });

    const bgAffiliateRewards = await this.bgAffiliateCommissionRewardRepository.find({
      where: {
        bacr_withdraw_id: pendingWithdrawal.rwh_id
      }
    });

    const walletRefRewardsUSD = walletRefRewards.reduce((sum, reward) => 
      sum + Number(reward.wrr_use_reward), 0
    );

    const bgAffiliateRewardsUSD = bgAffiliateRewards.reduce((sum, reward) => 
      sum + Number(reward.bacr_commission_amount), 0
    );

    return {
      hasPendingWithdrawal: true,
      withdrawal: {
        withdrawId: pendingWithdrawal.rwh_id,
        amountUSD: Number(pendingWithdrawal.rwh_amount_usd),
        amountSOL: Number(pendingWithdrawal.rwh_amount),
        createdAt: pendingWithdrawal.rwh_created_at,
        expiresAt: pendingWithdrawal.rwh_date,
        breakdown: {
          walletRefRewardsUSD,
          bgAffiliateRewardsUSD
        }
      }
    };
  }

  /**
   * Get transaction status for a withdrawal
   */
  async getTransactionStatus(walletId: number, withdrawId: number): Promise<{
    withdrawal?: {
      withdrawId: number;
      status: WithdrawStatus;
      amountUSD: number;
      amountSOL: number;
      createdAt: Date;
      retryCount: number;
      nextRetryAt?: Date;
    };
    transaction?: {
      signature?: string;
      confirmed: boolean;
      finalized: boolean;
      pending: boolean;
      error?: string;
      lastChecked: Date;
    };
  }> {
    // Kiểm tra withdrawal thuộc về wallet này
    const withdrawal = await this.refWithdrawHistoryRepository.findOne({
      where: {
        rwh_id: withdrawId,
        rwh_wallet_id: walletId
      }
    });

    if (!withdrawal) {
      throw new Error('Withdrawal not found or does not belong to this wallet');
    }

    const result: {
      withdrawal?: any;
      transaction?: any;
    } = {
      withdrawal: {
        withdrawId: withdrawal.rwh_id,
        status: withdrawal.rwh_status,
        amountUSD: Number(withdrawal.rwh_amount_usd),
        amountSOL: Number(withdrawal.rwh_amount),
        createdAt: withdrawal.rwh_created_at,
        retryCount: withdrawal.rwh_retry_count || 0,
        nextRetryAt: withdrawal.rwh_next_retry_at
      }
    };

    // Nếu có transaction signature, kiểm tra status trên blockchain
    if (withdrawal.rwh_hash) {
      const transactionStatus = await this.checkTransactionStatus(withdrawal.rwh_hash);
      
      result.transaction = {
        signature: withdrawal.rwh_hash,
        confirmed: transactionStatus.confirmed,
        finalized: transactionStatus.finalized,
        pending: transactionStatus.pending,
        error: transactionStatus.error,
        lastChecked: new Date()
      };
    }

    return result;
  }
} 