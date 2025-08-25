import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { WalletRefReward } from '../entities/wallet-ref-reward.entity';
import { RefWithdrawHistory, WithdrawStatus } from '../entities/ref-withdraw-history.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { SolanaPriceCacheService } from '../../solana/solana-price-cache.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import bs58 from 'bs58';

@Injectable()
export class ReferralWithdrawService {
  private readonly logger = new Logger(ReferralWithdrawService.name);
  private readonly connection: Connection;
  private readonly MIN_WITHDRAW_AMOUNT = 10; // Minimum $10 USD
  private readonly WITHDRAW_TIMEOUT_MINUTES = 30; // 30 minutes timeout

  constructor(
    @InjectRepository(WalletRefReward)
    private walletRefRewardRepository: Repository<WalletRefReward>,
    @InjectRepository(RefWithdrawHistory)
    private refWithdrawHistoryRepository: Repository<RefWithdrawHistory>,
    @InjectRepository(ListWallet)
    private listWalletRepository: Repository<ListWallet>,
    private configService: ConfigService,
    private solanaPriceCacheService: SolanaPriceCacheService,
  ) {
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL');
    if (!rpcUrl) {
      throw new Error('SOLANA_RPC_URL is not configured');
    }
    this.connection = new Connection(rpcUrl);
  }

  /**
   * Create withdrawal request for referral rewards
   */
  async createWithdrawRequest(walletId: number): Promise<{
    success: boolean;
    message: string;
    withdrawId?: number;
    amountUSD?: number;
    amountSOL?: number;
  }> {
    try {
      // Find all unredeemed rewards for the wallet
      const unredeemedRewards = await this.walletRefRewardRepository.find({
        where: {
          wrr_withdraw_id: IsNull(),
          wrr_withdraw_status: false,
        },
        relations: ['referent'],
      });

      // Filter rewards that belong to this wallet (as referent)
      const walletRewards = unredeemedRewards.filter(reward => 
        reward.referent?.wr_wallet_referent === walletId
      );

      if (walletRewards.length === 0) {
        return {
          success: false,
          message: 'No unredeemed rewards found for withdrawal',
        };
      }

      // Calculate total USD amount
      const totalAmountUSD = walletRewards.reduce((sum, reward) => 
        sum + Number(reward.wrr_use_reward), 0
      );

      if (totalAmountUSD < this.MIN_WITHDRAW_AMOUNT) {
        return {
          success: false,
          message: `Minimum withdrawal amount is $${this.MIN_WITHDRAW_AMOUNT}. Current available: $${totalAmountUSD.toFixed(2)}`,
        };
      }

      // Get current SOL price
      const solPriceUSD = await this.solanaPriceCacheService.getSOLPriceInUSD();
      if (!solPriceUSD || solPriceUSD <= 0) {
        throw new Error('Failed to get SOL price');
      }

      // Calculate SOL amount
      const amountSOL = totalAmountUSD / solPriceUSD;

      // Get wallet info
      const wallet = await this.listWalletRepository.findOne({
        where: { wallet_id: walletId },
        select: ['wallet_solana_address']
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Create withdrawal history record
      const withdrawHistory = this.refWithdrawHistoryRepository.create({
        rwh_wallet_id: walletId,
        rwh_amount: amountSOL,
        rwh_amount_usd: totalAmountUSD, // Store USD equivalent for statistics
        rwh_status: WithdrawStatus.PENDING,
        rwh_date: new Date(Date.now() + this.WITHDRAW_TIMEOUT_MINUTES * 60 * 1000), // 30 minutes from now
      });

      const savedWithdrawHistory = await this.refWithdrawHistoryRepository.save(withdrawHistory);

      // Update all rewards with the withdraw ID
      await this.walletRefRewardRepository.update(
        { wrr_id: In(walletRewards.map(r => r.wrr_id)) },
        { wrr_withdraw_id: savedWithdrawHistory.rwh_id }
      );

      this.logger.log(`Created withdrawal request ${savedWithdrawHistory.rwh_id} for wallet ${walletId}: $${totalAmountUSD} USD (${amountSOL} SOL)`);

      return {
        success: true,
        message: 'Withdrawal request created successfully',
        withdrawId: savedWithdrawHistory.rwh_id,
        amountUSD: totalAmountUSD,
        amountSOL: amountSOL,
      };

    } catch (error) {
      this.logger.error(`Error creating withdrawal request: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to create withdrawal request');
    }
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

      // Process retry withdrawals
      const retryWithdrawals = await this.refWithdrawHistoryRepository.find({
        where: { rwh_status: WithdrawStatus.RETRY },
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

      // Send SOL to user wallet
      const result = await this.sendSOLToWallet(
        withdrawalWalletPrivateKey,
        wallet.wallet_solana_address,
        withdrawal.rwh_amount
      );

      if (result.success) {
        // Update transaction hash
        await this.refWithdrawHistoryRepository.update(
          { rwh_id: withdrawal.rwh_id },
          { rwh_hash: result.signature }
        );
        await this.handleSuccessfulWithdrawal(withdrawal);
      } else {
        await this.handleRetryWithdrawal(withdrawal);
      }

    } catch (error) {
      this.logger.error(`Error processing withdrawal ${withdrawal.rwh_id}: ${error.message}`, error.stack);
      await this.handleRetryWithdrawal(withdrawal);
    }
  }

  /**
   * Send SOL to user wallet
   */
  private async sendSOLToWallet(
    fromPrivateKey: string,
    toAddress: string,
    amountSOL: number
  ): Promise<{ success: boolean; signature?: string }> {
    try {
      // Parse private key - try different formats
      let keypair: Keypair;
      try {
        // Try to parse as JSON first (like database format)
        const privateKeyObj = JSON.parse(fromPrivateKey);
        if (privateKeyObj.solana) {
          keypair = Keypair.fromSecretKey(bs58.decode(privateKeyObj.solana));
        } else {
          throw new Error('No solana private key found in JSON');
        }
      } catch (jsonError) {
        // If not JSON, try direct parsing
        try {
          const secretKey = this.parsePrivateKey(fromPrivateKey);
          keypair = Keypair.fromSecretKey(secretKey);
        } catch (parseError) {
          this.logger.error(`Failed to parse private key: ${parseError.message}`);
          return { success: false };
        }
      }

      const toPublicKey = new PublicKey(toAddress);

      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: toPublicKey,
          lamports: amountSOL * LAMPORTS_PER_SOL,
        })
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;

      // Sign and send transaction
      const signature = await this.connection.sendTransaction(transaction, [keypair]);
      
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

      // Update all related rewards
      await this.walletRefRewardRepository.update(
        { wrr_withdraw_id: withdrawal.rwh_id },
        { wrr_withdraw_status: true }
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

      // Reset withdraw_id for all related rewards
      await this.walletRefRewardRepository.update(
        { wrr_withdraw_id: withdrawal.rwh_id },
        { wrr_withdraw_id: null }
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
      // Update withdrawal status to retry
      await this.refWithdrawHistoryRepository.update(
        { rwh_id: withdrawal.rwh_id },
        { rwh_status: WithdrawStatus.RETRY }
      );

      this.logger.log(`Withdrawal ${withdrawal.rwh_id} marked for retry`);

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
   * Parse private key from different formats
   */
  private parsePrivateKey(privateKey: string): Uint8Array {
    try {
      // Try JSON array format
      const jsonArray = JSON.parse(privateKey);
      if (Array.isArray(jsonArray)) {
        return new Uint8Array(jsonArray);
      }
    } catch (error) {
      // Not JSON array, continue to next format
    }

    try {
      // Try comma-separated string
      if (privateKey.includes(',')) {
        const numbers = privateKey.split(',').map(num => parseInt(num.trim()));
        return new Uint8Array(numbers);
      }
    } catch (error) {
      // Not comma-separated, continue to next format
    }

    try {
      // Try base64
      const base64Decoded = Buffer.from(privateKey, 'base64');
      if (base64Decoded.length === 64) {
        return new Uint8Array(base64Decoded);
      }
    } catch (error) {
      // Not base64, continue to next format
    }

    try {
      // Try base58
      const base58Decoded = bs58.decode(privateKey);
      if (base58Decoded.length === 64) {
        return new Uint8Array(base58Decoded);
      }
    } catch (error) {
      // Not base58
    }

    throw new Error('Invalid private key format. Supported formats: JSON array, comma-separated string, base64, base58');
  }

  /**
   * Get available withdrawal amount for a wallet
   */
  async getAvailableWithdrawalAmount(walletId: number): Promise<{
    totalUSD: number;
    totalSOL: number;
    rewardCount: number;
  }> {
    const unredeemedRewards = await this.walletRefRewardRepository.find({
      where: {
        wrr_withdraw_id: IsNull(),
        wrr_withdraw_status: false,
      },
      relations: ['referent'],
    });

    const walletRewards = unredeemedRewards.filter(reward => 
      reward.referent?.wr_wallet_referent === walletId
    );

    const totalUSD = walletRewards.reduce((sum, reward) => 
      sum + Number(reward.wrr_use_reward), 0
    );

    const solPriceUSD = await this.solanaPriceCacheService.getSOLPriceInUSD();
    const totalSOL = solPriceUSD > 0 ? totalUSD / solPriceUSD : 0;

    return {
      totalUSD,
      totalSOL,
      rewardCount: walletRewards.length,
    };
  }
} 