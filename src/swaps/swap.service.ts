import { Injectable, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction, Keypair, SystemProgram } from '@solana/web3.js';
import { SwapOrder, SwapOrderType, SwapOrderStatus } from './entities/swap-order.entity';
import { SwapSettings } from './entities/swap-setting.entity';
import { SwapInvestors } from './entities/swap-investor.entity';
import { SwapInvestorReward, RewardStatus } from './entities/swap-investor-reward.entity';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { CreateSwapDto } from './dto/create-swap.dto';
import { ContributeCapitalDto, ContributionType } from './dto/contribute-capital.dto';
import { TOKEN_PROGRAM_ID, getMint, createMintToInstruction, createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';

import bs58 from 'bs58';
import axios from 'axios';

@Injectable()
export class SwapService {
  private readonly logger = new Logger(SwapService.name);
  private readonly connection: Connection;

  // Cache cho giá SOL
  private solPriceCache: { price: number; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 15 * 1000; // 15 giây

  // Token addresses
  private readonly SOL_MINT = 'So11111111111111111111111111111111111111112';
  private readonly USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

  // Authority keypair cho swap pool
  private readonly swapAuthorityKeypair: Keypair;

  constructor(
    @InjectRepository(SwapOrder)
    private swapOrderRepository: Repository<SwapOrder>,
    @InjectRepository(ListWallet)
    private listWalletRepository: Repository<ListWallet>,
    @InjectRepository(SwapSettings)
    private swapSettingsRepository: Repository<SwapSettings>,
    @InjectRepository(SwapInvestors)
    private swapInvestorsRepository: Repository<SwapInvestors>,
    @InjectRepository(SwapInvestorReward)
    private swapInvestorRewardRepository: Repository<SwapInvestorReward>,
    private configService: ConfigService,
  ) {
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL');
    if (!rpcUrl) {
      throw new InternalServerErrorException('SOLANA_RPC_URL is not configured');
    }
    this.connection = new Connection(rpcUrl);

    // Khởi tạo swap authority keypair
    const swapAuthorityPrivateKey = this.configService.get<string>('SWAP_AUTHORITY_PRIVATE_KEY');
    if (!swapAuthorityPrivateKey) {
      throw new InternalServerErrorException('SWAP_AUTHORITY_PRIVATE_KEY is not configured');
    }
    
    try {
      const decodedKey = bs58.decode(swapAuthorityPrivateKey);
      if (decodedKey.length !== 64) {
        this.logger.error(`Invalid swap authority key size: ${decodedKey.length} bytes`);
        throw new InternalServerErrorException('Invalid swap authority private key size');
      }
      this.swapAuthorityKeypair = Keypair.fromSecretKey(decodedKey);
    } catch (error) {
      this.logger.error(`Failed to create swap authority keypair: ${error.message}`);
      throw new InternalServerErrorException('Failed to initialize swap authority keypair');
    }
  }

  /**
   * Kiểm tra cache có hợp lệ không
   */
  private isCacheValid(): boolean {
    if (!this.solPriceCache) {
      return false;
    }
    const now = Date.now();
    return (now - this.solPriceCache.timestamp) < this.CACHE_DURATION;
  }


  /**
   * Lấy giá USD của SOL từ CoinGecko API với cache 15 giây
   */
  private async getSolPriceUSD(): Promise<number> {
    if (this.isCacheValid() && this.solPriceCache) {
      this.logger.debug(`Using cached SOL price: $${this.solPriceCache.price}`);
      return this.solPriceCache.price;
    }

    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const price = parseFloat(response.data.solana.usd);
      
      this.solPriceCache = {
        price: price,
        timestamp: Date.now()
      };
      
      this.logger.debug(`Updated SOL price cache: $${price}`);
      return price;
    } catch (error) {
      this.logger.error(`Error fetching SOL price: ${error.message}`);
      
      if (this.solPriceCache) {
        this.logger.warn(`Using stale cached SOL price: $${this.solPriceCache.price}`);
        return this.solPriceCache.price;
      }
      
      throw new BadRequestException('Failed to fetch SOL price');
    }
  }

  async createSwap(createSwapDto: CreateSwapDto, walletId: number): Promise<any> {
    try {
      // 1. Validate input
      if (createSwapDto.input_amount <= 0) {
        throw new BadRequestException('Input amount must be greater than 0');
      }

      // 2. Lấy thông tin wallet
      const wallet = await this.listWalletRepository.findOne({
        where: { wallet_id: walletId }
      });

      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      // 3. Tạo Keypair từ private_key của wallet
      let userKeypair: Keypair;
      try {
        // Parse wallet_private_key từ JSON format
        let privateKeyData: any;
        try {
          privateKeyData = JSON.parse(wallet.wallet_private_key);
        } catch (parseError) {
          this.logger.error(`Failed to parse wallet_private_key JSON: ${parseError.message}`);
          throw new BadRequestException('Invalid wallet private key format');
        }

        // Lấy Solana private key
        const solanaPrivateKey = privateKeyData.solana;
        if (!solanaPrivateKey) {
          throw new BadRequestException('Solana private key not found in wallet');
        }

        // Decode Solana private key
        const decodedKey = bs58.decode(solanaPrivateKey);
        if (decodedKey.length !== 64) {
          this.logger.error(`Invalid Solana key size: ${decodedKey.length} bytes`);
          throw new BadRequestException('Invalid Solana private key size');
        }
        userKeypair = Keypair.fromSecretKey(decodedKey);
      } catch (error) {
        this.logger.error(`Failed to create Solana keypair: ${error.message}`);
        throw new BadRequestException(`Failed to create keypair: ${error.message}`);
      }

      // 4. Lấy giá SOL hiện tại
      const solPriceUSD = await this.getSolPriceUSD();

      // 5. Lấy swap settings để lấy phí swap
      const swapSettings = await this.swapSettingsRepository.findOne({
        where: {},
        order: { swap_setting_id: 'DESC' }
      });

      if (!swapSettings) {
        throw new BadRequestException('Swap settings not found');
      }

      const swapFeePercent = Number(swapSettings.swap_fee_percent);

      // 6. Tính toán output amount và exchange rate (sau khi trừ phí)
      let outputAmount: number;
      let exchangeRate: number;
      let feeAmount: number;

      switch (createSwapDto.swap_type) {
        case SwapOrderType.USDT_TO_SOL:
          // USDT sang SOL: 1 USDT = 1/SOL_PRICE SOL
          exchangeRate = 1 / solPriceUSD;
          const rawOutputAmount = createSwapDto.input_amount * exchangeRate;
          
          // Tính phí swap
          feeAmount = rawOutputAmount * (swapFeePercent / 100);
          
          // Output amount sau khi trừ phí
          outputAmount = rawOutputAmount - feeAmount;
          break;
        
        case SwapOrderType.SOL_TO_USDT:
          // SOL sang USDT: 1 SOL = SOL_PRICE USDT
          exchangeRate = solPriceUSD;
          const rawOutputAmountSol = createSwapDto.input_amount * exchangeRate;
          
          // Tính phí swap
          feeAmount = rawOutputAmountSol * (swapFeePercent / 100);
          
          // Output amount sau khi trừ phí
          outputAmount = rawOutputAmountSol - feeAmount;
          break;
        
        default:
          throw new BadRequestException(`Unsupported swap type: ${createSwapDto.swap_type}`);
      }

      // 7. Tạo swap order với trạng thái PENDING
      const swapOrder = this.swapOrderRepository.create({
        wallet_id: walletId,
        swap_type: createSwapDto.swap_type,
        input_amount: createSwapDto.input_amount,
        output_amount: outputAmount,
        exchange_rate: exchangeRate,
        fee_amount: feeAmount,
        status: SwapOrderStatus.PENDING
      });

      const savedOrder = await this.swapOrderRepository.save(swapOrder);

      // 8. Kiểm tra balance của user và tự động điều chỉnh nếu cần
      let hasBalance = false;
      let adjustedInputAmount = createSwapDto.input_amount;

      switch (createSwapDto.swap_type) {
        case SwapOrderType.USDT_TO_SOL:
          // Kiểm tra balance USDT
          const usdtMint = new PublicKey(this.USDT_MINT);
          const tokenAccounts = await this.connection.getTokenAccountsByOwner(
            userKeypair.publicKey,
            { mint: usdtMint }
          );
          
          if (tokenAccounts.value.length > 0) {
            const userTokenAccount = tokenAccounts.value[0].pubkey;
            const tokenBalance = await this.connection.getTokenAccountBalance(userTokenAccount);
            hasBalance = (tokenBalance.value.uiAmount || 0) >= createSwapDto.input_amount;
          }
          break;
        
        case SwapOrderType.SOL_TO_USDT:
          // Kiểm tra balance SOL và tự động điều chỉnh nếu cần
          const balance = await this.connection.getBalance(userKeypair.publicKey);
          const balanceInSol = balance / 1e9; // Convert lamports to SOL
          const transactionFee = 0.00001; // ~0.00001 SOL cho phí transaction
          const requiredAmount = createSwapDto.input_amount + transactionFee;
          
          if (balanceInSol >= requiredAmount) {
            hasBalance = true;
          } else {
            // Tự động điều chỉnh số tiền SOL để trừ phí transaction
            const adjustedSolAmount = balanceInSol - transactionFee;
            if (adjustedSolAmount > 0) {
              adjustedInputAmount = adjustedSolAmount;
              hasBalance = true;
              this.logger.log(`Adjusted SOL swap amount from ${createSwapDto.input_amount} to ${adjustedSolAmount} SOL to account for transaction fee`);
            }
          }
          break;
      }

      if (!hasBalance) {
        savedOrder.status = SwapOrderStatus.FAILED;
        savedOrder.error_message = 'Insufficient balance';
        await this.swapOrderRepository.save(savedOrder);
        throw new BadRequestException('Insufficient balance');
      }

      // 9. Thực hiện swap transaction
      try {
        const transaction = new Transaction();

        switch (createSwapDto.swap_type) {
          case SwapOrderType.USDT_TO_SOL:
            // USDT sang SOL: User gửi USDT, nhận SOL
            
            const usdtMintUsdtToSol = new PublicKey(this.USDT_MINT);
            
            // Lấy Associated Token Account của user cho USDT
            const userUsdtAtaUsdtToSol = await getAssociatedTokenAddress(
              usdtMintUsdtToSol,
              userKeypair.publicKey
            );
            
            // Lấy Associated Token Account của pool cho USDT
            const poolUsdtAtaUsdtToSol = await getAssociatedTokenAddress(
              usdtMintUsdtToSol,
              this.swapAuthorityKeypair.publicKey
            );
            
            // Kiểm tra xem pool có ATA cho USDT chưa, nếu chưa thì tạo
            const poolUsdtAccountUsdtToSol = await this.connection.getAccountInfo(poolUsdtAtaUsdtToSol);
            if (!poolUsdtAccountUsdtToSol) {
              transaction.add(
                createAssociatedTokenAccountInstruction(
                  this.swapAuthorityKeypair.publicKey, // payer
                  poolUsdtAtaUsdtToSol, // associated token account
                  this.swapAuthorityKeypair.publicKey, // owner
                  usdtMintUsdtToSol // mint
                )
              );
            }
            
            // Gửi USDT từ user đến pool
            const inputUsdtAmount = Math.floor(createSwapDto.input_amount * 1e6); // USDT có 6 decimals
            transaction.add(
              createTransferInstruction(
                userUsdtAtaUsdtToSol, // from: user's USDT account
                poolUsdtAtaUsdtToSol, // to: pool's USDT account
                userKeypair.publicKey, // authority
                inputUsdtAmount // amount
              )
            );
            
            // Gửi SOL từ pool đến user
            const outputSolLamports = Math.floor(outputAmount * 1e9);
            transaction.add(
              SystemProgram.transfer({
                fromPubkey: this.swapAuthorityKeypair.publicKey,
                toPubkey: userKeypair.publicKey,
                lamports: outputSolLamports,
              })
            );
            
            this.logger.log(`USDT to SOL swap: User sent ${createSwapDto.input_amount} USDT, will receive ${outputAmount} SOL (fee: ${feeAmount} SOL, ${swapFeePercent}%)`);
            break;

          case SwapOrderType.SOL_TO_USDT:
            // SOL sang USDT: User gửi SOL, nhận USDT
            
            // Gửi SOL từ user đến pool
            const inputSolLamports = Math.floor(adjustedInputAmount * 1e9);
            transaction.add(
              SystemProgram.transfer({
                fromPubkey: userKeypair.publicKey,
                toPubkey: this.swapAuthorityKeypair.publicKey,
                lamports: inputSolLamports,
              })
            );

            // Gửi USDT từ pool về cho user
            const usdtMintSolToUsdt = new PublicKey(this.USDT_MINT);
            
            // Lấy Associated Token Account của user cho USDT
            const userUsdtAtaSolToUsdt = await getAssociatedTokenAddress(
              usdtMintSolToUsdt,
              userKeypair.publicKey
            );
            
            // Lấy Associated Token Account của pool cho USDT
            const poolUsdtAtaSolToUsdt = await getAssociatedTokenAddress(
              usdtMintSolToUsdt,
              this.swapAuthorityKeypair.publicKey
            );
            
            // Kiểm tra xem user có ATA cho USDT chưa, nếu chưa thì tạo
            const userUsdtAccountSolToUsdt = await this.connection.getAccountInfo(userUsdtAtaSolToUsdt);
            if (!userUsdtAccountSolToUsdt) {
              transaction.add(
                createAssociatedTokenAccountInstruction(
                  this.swapAuthorityKeypair.publicKey, // payer
                  userUsdtAtaSolToUsdt, // associated token account
                  userKeypair.publicKey, // owner
                  usdtMintSolToUsdt // mint
                )
              );
            }
            
            // Gửi USDT từ pool về user
            const outputUsdtAmount = Math.floor(outputAmount * 1e6); // USDT có 6 decimals
            transaction.add(
              createTransferInstruction(
                poolUsdtAtaSolToUsdt, // from: pool's USDT account
                userUsdtAtaSolToUsdt, // to: user's USDT account
                this.swapAuthorityKeypair.publicKey, // authority
                outputUsdtAmount // amount
              )
            );
            
            this.logger.log(`SOL to USDT swap: User sent ${adjustedInputAmount} SOL, will receive ${outputAmount} USDT (fee: ${feeAmount} USDT, ${swapFeePercent}%)`);
            
            break;
        }

        // Lấy blockhash và set fee payer
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userKeypair.publicKey;

        // Gửi và xác nhận transaction - cần cả user và authority ký
        let signers: Keypair[];
        switch (createSwapDto.swap_type) {
          case SwapOrderType.USDT_TO_SOL:
            // Cần cả user và authority ký:
            // - User ký để gửi USDT
            // - Authority ký để gửi SOL và tạo ATA (nếu cần)
            signers = [userKeypair, this.swapAuthorityKeypair];
            break;
          case SwapOrderType.SOL_TO_USDT:
            // Cần cả user và authority ký:
            // - User ký để gửi SOL
            // - Authority ký để gửi USDT và tạo ATA (nếu cần)
            signers = [userKeypair, this.swapAuthorityKeypair];
            break;
          default:
            signers = [userKeypair];
        }

        const txHash = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          signers,
          {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed'
          }
        );

        // 10. Cập nhật order thành COMPLETED
        savedOrder.status = SwapOrderStatus.COMPLETED;
        savedOrder.transaction_hash = txHash;
        await this.swapOrderRepository.save(savedOrder);

        this.logger.log(`Swap completed successfully: ${createSwapDto.swap_type}, Amount: ${createSwapDto.input_amount}, Output: ${outputAmount}, Fee: ${feeAmount} (${swapFeePercent}%), TX: ${txHash}`);

        // Gọi hàm phân phối phần thưởng cho nhà đầu tư (chạy ngầm)
        this.distributeInvestorRewards(savedOrder.swap_order_id).catch(error => {
          this.logger.error(`Failed to distribute investor rewards: ${error.message}`);
        });

        return {
          success: true,
          message: 'Swap order created successfully',
          data: {
            swap_order_id: savedOrder.swap_order_id,
            swap_type: savedOrder.swap_type,
            input_amount: savedOrder.input_amount,
            output_amount: savedOrder.output_amount,
            exchange_rate: savedOrder.exchange_rate,
            swap_fee_percent: swapFeePercent,
            fee_amount: feeAmount,
            status: savedOrder.status,
            transaction_hash: savedOrder.transaction_hash,
            error_message: savedOrder.error_message,
            created_at: savedOrder.created_at,
            updated_at: savedOrder.updated_at,
          },
        };

      } catch (error) {
        // 11. Xử lý lỗi và cập nhật order
        savedOrder.status = SwapOrderStatus.FAILED;
        savedOrder.error_message = error.message;
        await this.swapOrderRepository.save(savedOrder);

        this.logger.error(`Swap failed: ${error.message}`);

        const errorMessage = error.message || '';
        if (errorMessage.includes('insufficient lamports')) {
          throw new BadRequestException('Insufficient SOL for transaction fees');
        }
        if (errorMessage.includes('insufficient funds for rent')) {
          throw new BadRequestException('Insufficient SOL balance');
        }
        if (errorMessage.includes('insufficient balance')) {
          throw new BadRequestException('Insufficient token balance');
        }
        if (errorMessage.includes('insufficient funds')) {
          throw new BadRequestException('Insufficient funds');
        }
        if (errorMessage.includes('Attempt to debit an account but found no record of a prior credit')) {
          throw new BadRequestException('Insufficient SOL balance');
        }
        throw new BadRequestException(`Swap failed: ${errorMessage}`);
      }

    } catch (error) {
      this.logger.error(`Error creating swap: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  async getSwapOrder(swapOrderId: number, walletId: number): Promise<any> {
    const swapOrder = await this.swapOrderRepository.findOne({
      where: { swap_order_id: swapOrderId, wallet_id: walletId },
    });

    if (!swapOrder) {
      throw new BadRequestException('Swap order not found');
    }

    return {
      success: true,
      message: 'Swap order retrieved successfully',
      data: swapOrder,
    };
  }

  async getSwapHistory(walletId: number, limit: number = 20, offset: number = 0): Promise<any> {
    const swapHistory = await this.swapOrderRepository.find({
      where: { 
        wallet_id: walletId,
        status: SwapOrderStatus.COMPLETED
      },
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      success: true,
      message: 'Swap history retrieved successfully',
      data: swapHistory,
    };
  }

  async contributeCapital(contributeCapitalDto: ContributeCapitalDto, wallet_address: string): Promise<any> {
    try {
      // 1. Validate input
      if (contributeCapitalDto.amount <= 0) {
        throw new BadRequestException('Amount must be greater than 0');
      }

      // 2. Validate wallet address exists on Solana blockchain
      try {
        if (!wallet_address || typeof wallet_address !== 'string' || wallet_address.trim() === '') {
          throw new BadRequestException('Wallet address is required and must be a valid string');
        }

        // Kiểm tra format địa chỉ Solana
        new PublicKey(wallet_address);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException('Invalid wallet address format');
      }

      // 3. Lấy giá SOL hiện tại để tính USD
      const solPriceUSD = await this.getSolPriceUSD();

      // 4. Tìm nhà đầu tư
      const investor = await this.swapInvestorsRepository.findOne({
        where: { wallet_address: wallet_address }
      });

      if (!investor) {
        throw new BadRequestException('Investor not found. Please contact admin to register as an investor first.');
      }

      if (!investor.active) {
        throw new BadRequestException('Investor account is not active. Please contact admin.');
      }

      // 5. Tính toán và cập nhật số lượng token
      let newAmountSol = Number(investor.amount_sol);
      let newAmountUsdt = Number(investor.amount_usdt);
      let newAmountUsd = Number(investor.amount_usd);

      switch (contributeCapitalDto.contribution_type) {
        case ContributionType.SOL:
          newAmountSol += contributeCapitalDto.amount;
          newAmountUsd += contributeCapitalDto.amount * solPriceUSD;
          break;
        
        case ContributionType.USDT:
          newAmountUsdt += contributeCapitalDto.amount;
          newAmountUsd += contributeCapitalDto.amount; // 1 USDT = 1 USD
          break;
        
        default:
          throw new BadRequestException(`Unsupported contribution type: ${contributeCapitalDto.contribution_type}`);
      }

      // 6. Gửi token thực tế từ user wallet về exchange wallet
      const exchangeWalletAddress = this.swapAuthorityKeypair.publicKey.toBase58();

      let transactionSignature: string | null = null;

      try {
        if (contributeCapitalDto.contribution_type === ContributionType.SOL) {
          // Gửi SOL
          transactionSignature = await this.sendSolToExchange(
            wallet_address,
            exchangeWalletAddress,
            contributeCapitalDto.amount
          );
        } else if (contributeCapitalDto.contribution_type === ContributionType.USDT) {
          // Gửi USDT
          transactionSignature = await this.sendUsdtToExchange(
            wallet_address,
            exchangeWalletAddress,
            contributeCapitalDto.amount
          );
        }

        this.logger.log(`Token transfer successful. Signature: ${transactionSignature}`);
      } catch (transferError) {
        if (transferError.message.includes('insufficient lamports')) {
          throw new BadRequestException('Insufficient SOL for transaction fees');
        }
        if (transferError.message.includes('insufficient funds for rent')) {
          throw new BadRequestException('Insufficient SOL balance');
        }
        if (transferError.message.includes('insufficient balance')) {
          throw new BadRequestException('Insufficient token balance');
        }
        if (transferError.message.includes('insufficient funds')) {
          throw new BadRequestException('Insufficient funds');
        }
        if (transferError.message.includes('Attempt to debit an account but found no record of a prior credit')) {
          throw new BadRequestException('Insufficient SOL balance');
        }
        this.logger.error(`Token transfer failed: ${transferError.message}`);
        throw new BadRequestException(`Token transfer failed: ${transferError.message}`);
      }

      // 7. Cập nhật thông tin nhà đầu tư (chỉ khi transfer thành công)
      investor.amount_sol = newAmountSol;
      investor.amount_usdt = newAmountUsdt;
      investor.amount_usd = newAmountUsd;

      const savedInvestor = await this.swapInvestorsRepository.save(investor);

      this.logger.log(`Capital contribution: Investor ${wallet_address} contributed ${contributeCapitalDto.amount} ${contributeCapitalDto.contribution_type.toUpperCase()}`);

      return {
        success: true,
        message: 'Capital contribution successful',
        data: {
          swap_investor_id: savedInvestor.swap_investor_id,
          wallet_address: savedInvestor.wallet_address,
          coins: null, // Bỏ hết logic xử lý coins
          amount_sol: Number(savedInvestor.amount_sol),
          amount_usdt: Number(savedInvestor.amount_usdt),
          amount_usd: Number(savedInvestor.amount_usd),
          active: savedInvestor.active,
          created_at: savedInvestor.created_at,
          updated_at: savedInvestor.updated_at,
          transaction_signature: transactionSignature,
          contribution_type: contributeCapitalDto.contribution_type,
          contribution_amount: contributeCapitalDto.amount,
        },
      };

    } catch (error) {
      this.logger.error(`Error contributing capital: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Phân phối phần thưởng cho các nhà đầu tư dựa trên tỷ lệ đóng góp
   * Chạy ngầm sau khi swap thành công
   */
  private async distributeInvestorRewards(swapOrderId: number): Promise<void> {
    try {
      this.logger.log(`Starting investor rewards distribution for swap order ${swapOrderId}`);

      // 1. Lấy swap settings để lấy investor_share_percent
      const swapSettings = await this.swapSettingsRepository.findOne({
        where: {},
        order: { swap_setting_id: 'DESC' }
      });

      if (!swapSettings) {
        this.logger.error('Swap settings not found for investor rewards distribution');
        return;
      }

      const investorSharePercent = Number(swapSettings.investor_share_percent);

      // 2. Lấy thông tin swap order để tính giá trị USD
      const swapOrder = await this.swapOrderRepository.findOne({
        where: { swap_order_id: swapOrderId }
      });

      if (!swapOrder) {
        this.logger.error(`Swap order ${swapOrderId} not found for rewards distribution`);
        return;
      }

      // 3. Tính giá trị USD của giao dịch swap
      let swapOrderUSDValue: number;
      const solPriceUSD = await this.getSolPriceUSD();
      
      switch (swapOrder.swap_type) {
        case SwapOrderType.USDT_TO_SOL:
          // USDT sang SOL: input_amount là USDT, 1 USDT = 1 USD
          swapOrderUSDValue = Number(swapOrder.input_amount);
          break;
        
        case SwapOrderType.SOL_TO_USDT:
          // SOL sang USDT: input_amount là SOL, cần nhân với giá SOL
          swapOrderUSDValue = Number(swapOrder.input_amount) * solPriceUSD;
          break;
        
        default:
          this.logger.error(`Unsupported swap type: ${swapOrder.swap_type}`);
          return;
      }

      // 4. Lấy tất cả nhà đầu tư active
      const activeInvestors = await this.swapInvestorsRepository.find({
        where: { active: true }
      });

      if (activeInvestors.length === 0) {
        this.logger.log('No active investors found for rewards distribution');
        return;
      }

      // 3. Tính tổng USD của tất cả nhà đầu tư
      const totalUsdAmount = activeInvestors.reduce((sum, investor) => {
        return sum + Number(investor.amount_usd);
      }, 0);

      if (totalUsdAmount <= 0) {
        this.logger.log('Total USD amount is 0, no rewards to distribute');
        return;
      }

      // 4. Tính toán và phân phối phần thưởng cho từng nhà đầu tư
      const rewardPromises = activeInvestors.map(async (investor) => {
        const investorUsdAmount = Number(investor.amount_usd);
        
        if (investorUsdAmount <= 0) {
          return; // Bỏ qua nhà đầu tư không có đóng góp
        }

        // Công thức: (Số $ của nhà đầu tư / Tổng $ của tất cả nhà đầu tư) * investor_share_percent * Số $ khách hàng thực hiện swap
        const investorShare = (investorUsdAmount / totalUsdAmount) * (investorSharePercent / 100) * swapOrderUSDValue;
        
        if (investorShare <= 0) {
          return; // Bỏ qua nếu phần thưởng = 0
        }

        // Lấy giá SOL hiện tại để chuyển đổi USD sang SOL
        const solPriceUSD = await this.getSolPriceUSD();
        const rewardSolAmount = investorShare / solPriceUSD;

        // Tạo record phần thưởng với status PENDING
        const rewardRecord = this.swapInvestorRewardRepository.create({
          swap_order_id: swapOrderId,
          investor_id: investor.swap_investor_id,
          reward_sol_amount: rewardSolAmount,
          status: RewardStatus.PENDING
        });

        await this.swapInvestorRewardRepository.save(rewardRecord);

        this.logger.log(`Created reward record: ${rewardSolAmount} SOL (${investorShare} USD) for investor ${investor.wallet_address} (${investorUsdAmount} USD contribution, swap value: ${swapOrderUSDValue} USD)`);

        // Kiểm tra balance của pool trước khi gửi SOL
        try {
          const poolBalance = await this.connection.getBalance(this.swapAuthorityKeypair.publicKey);
          const requiredLamports = Math.floor(rewardSolAmount * 1e9); // Convert SOL to lamports
          
          if (poolBalance >= requiredLamports) {
            // Đủ balance, thực hiện gửi SOL
            await this.sendSolToInvestor(investor.wallet_address, rewardSolAmount, rewardRecord.swap_investor_reward_id);
          } else {
            // Không đủ balance, cập nhật status thành WAIT_BALANCE
            rewardRecord.status = RewardStatus.WAIT_BALANCE;
            rewardRecord.error_message = `Insufficient pool balance. Required: ${rewardSolAmount} SOL, Available: ${poolBalance / 1e9} SOL`;
            await this.swapInvestorRewardRepository.save(rewardRecord);
            
            this.logger.warn(`Insufficient pool balance for investor ${investor.wallet_address}. Required: ${rewardSolAmount} SOL, Available: ${poolBalance / 1e9} SOL`);
          }
        } catch (error) {
          // Lỗi khi kiểm tra balance, cập nhật status thành FAILED
          rewardRecord.status = RewardStatus.FAILED;
          rewardRecord.error_message = `Failed to check balance: ${error.message}`;
          await this.swapInvestorRewardRepository.save(rewardRecord);
          
          this.logger.error(`Failed to check balance for investor ${investor.wallet_address}: ${error.message}`);
        }
      });

      await Promise.all(rewardPromises);

      this.logger.log(`Completed investor rewards distribution for swap order ${swapOrderId}, total swap value: ${swapOrderUSDValue} USD`);

    } catch (error) {
      this.logger.error(`Error in distributeInvestorRewards: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lấy lịch sử trả thưởng đã được thực hiện
   */
  async getRewardHistory(limit: number = 20, offset: number = 0): Promise<any> {
    try {
      // Lấy dữ liệu đơn giản từ bảng swap_investor_rewards
      const rewards = await this.swapInvestorRewardRepository.find({
        order: { created_at: 'DESC' },
        take: limit,
        skip: offset,
      });

      // Tính tổng số records
      const totalRewards = await this.swapInvestorRewardRepository.count();

      return {
        success: true,
        message: 'Reward history retrieved successfully',
        data: {
          rewards: rewards,
          pagination: {
            limit,
            offset,
            total: totalRewards,
            has_more: (offset + limit) < totalRewards
          }
        }
      };

    } catch (error) {
      this.logger.error(`Error getting reward history: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Gửi SOL cho nhà đầu tư
   */
  private async sendSolToInvestor(walletAddress: string, solAmount: number, rewardId: number): Promise<void> {
    try {
      // Tạo transaction để gửi SOL
      const transaction = new Transaction();
      
      // Gửi SOL từ pool đến nhà đầu tư
      const lamports = Math.floor(solAmount * 1e9);
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.swapAuthorityKeypair.publicKey,
          toPubkey: new PublicKey(walletAddress),
          lamports: lamports,
        })
      );

      // Lấy blockhash và set fee payer
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.swapAuthorityKeypair.publicKey;

      // Gửi và xác nhận transaction
      const txHash = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.swapAuthorityKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed'
        }
      );

      // Cập nhật reward record thành PAID
      const rewardRecord = await this.swapInvestorRewardRepository.findOne({
        where: { swap_investor_reward_id: rewardId }
      });

      if (rewardRecord) {
        rewardRecord.status = RewardStatus.PAID;
        rewardRecord.transaction_hash = txHash;
        await this.swapInvestorRewardRepository.save(rewardRecord);
      }

      this.logger.log(`Successfully sent ${solAmount} SOL to investor ${walletAddress}, TX: ${txHash}`);

    } catch (error) {
      // Cập nhật reward record thành FAILED
      const rewardRecord = await this.swapInvestorRewardRepository.findOne({
        where: { swap_investor_reward_id: rewardId }
      });

      if (rewardRecord) {
        rewardRecord.status = RewardStatus.FAILED;
        rewardRecord.error_message = `Failed to send SOL: ${error.message}`;
        await this.swapInvestorRewardRepository.save(rewardRecord);
      }

      this.logger.error(`Failed to send ${solAmount} SOL to investor ${walletAddress}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gửi SOL từ user wallet về exchange wallet
   */
  private async sendSolToExchange(
    fromWalletAddress: string,
    toWalletAddress: string,
    solAmount: number
  ): Promise<string> {
    try {
      // Lấy thông tin wallet
      const userWallet = await this.listWalletRepository.findOne({
        where: { wallet_solana_address: fromWalletAddress }
      });

      if (!userWallet) {
        throw new BadRequestException('User wallet not found');
      }

      // Tạo Keypair từ private_key của wallet
      let userKeypair: Keypair;
      try {
        // Parse wallet_private_key từ JSON format
        let privateKeyData: any;
        try {
          privateKeyData = JSON.parse(userWallet.wallet_private_key);
        } catch (parseError) {
          this.logger.error(`Failed to parse wallet_private_key JSON: ${parseError.message}`);
          throw new BadRequestException('Invalid wallet private key format');
        }

        // Lấy Solana private key
        const solanaPrivateKey = privateKeyData.solana;
        if (!solanaPrivateKey) {
          throw new BadRequestException('Solana private key not found in wallet');
        }

        // Decode Solana private key
        const decodedKey = bs58.decode(solanaPrivateKey);
        if (decodedKey.length !== 64) {
          this.logger.error(`Invalid Solana key size: ${decodedKey.length} bytes`);
          throw new BadRequestException('Invalid Solana private key size');
        }
        userKeypair = Keypair.fromSecretKey(decodedKey);
      } catch (error) {
        this.logger.error(`Failed to create Solana keypair: ${error.message}`);
        throw new BadRequestException(`Failed to create keypair: ${error.message}`);
      }

      // Tạo transaction
      const transaction = new Transaction();
      
      // Chuyển SOL (lamports)
      const lamports = Math.floor(solAmount * 1e9);
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: userKeypair.publicKey,
          toPubkey: new PublicKey(toWalletAddress),
          lamports: lamports,
        })
      );

      // Lấy blockhash và set fee payer
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userKeypair.publicKey;

      // Gửi và xác nhận transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [userKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed'
        }
      );

      this.logger.log(`Successfully sent ${solAmount} SOL from ${fromWalletAddress} to ${toWalletAddress}, TX: ${signature}`);
      return signature;

    } catch (error) {
      this.logger.error(`Failed to send ${solAmount} SOL from ${fromWalletAddress} to ${toWalletAddress}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gửi USDT từ user wallet về exchange wallet
   */
  private async sendUsdtToExchange(
    fromWalletAddress: string,
    toWalletAddress: string,
    usdtAmount: number
  ): Promise<string> {
    try {
      // Lấy thông tin wallet
      const userWallet = await this.listWalletRepository.findOne({
        where: { wallet_solana_address: fromWalletAddress }
      });

      if (!userWallet) {
        throw new BadRequestException('User wallet not found');
      }

      // Tạo Keypair từ private_key của wallet
      let userKeypair: Keypair;
      try {
        // Parse wallet_private_key từ JSON format
        let privateKeyData: any;
        try {
          privateKeyData = JSON.parse(userWallet.wallet_private_key);
        } catch (parseError) {
          this.logger.error(`Failed to parse wallet_private_key JSON: ${parseError.message}`);
          throw new BadRequestException('Invalid wallet private key format');
        }

        // Lấy Solana private key
        const solanaPrivateKey = privateKeyData.solana;
        if (!solanaPrivateKey) {
          throw new BadRequestException('Solana private key not found in wallet');
        }

        // Decode Solana private key
        const decodedKey = bs58.decode(solanaPrivateKey);
        if (decodedKey.length !== 64) {
          this.logger.error(`Invalid Solana key size: ${decodedKey.length} bytes`);
          throw new BadRequestException('Invalid Solana private key size');
        }
        userKeypair = Keypair.fromSecretKey(decodedKey);
      } catch (error) {
        this.logger.error(`Failed to create Solana keypair: ${error.message}`);
        throw new BadRequestException(`Failed to create keypair: ${error.message}`);
      }

      // Lấy Associated Token Account của sender
      const senderAta = await getAssociatedTokenAddress(
        new PublicKey(this.USDT_MINT),
        userKeypair.publicKey
      );

      // Lấy Associated Token Account của receiver
      const receiverAta = await getAssociatedTokenAddress(
        new PublicKey(this.USDT_MINT),
        new PublicKey(toWalletAddress)
      );

      // Tạo transaction
      const transaction = new Transaction();

      // Kiểm tra xem receiver ATA có tồn tại không, nếu không thì tạo
      const receiverAtaInfo = await this.connection.getAccountInfo(receiverAta);
      if (!receiverAtaInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            userKeypair.publicKey,
            receiverAta,
            new PublicKey(toWalletAddress),
            new PublicKey(this.USDT_MINT)
          )
        );
      }

      // Chuyển USDT
      const usdtAmountRaw = Math.floor(usdtAmount * 1e6); // USDT có 6 decimals
      transaction.add(
        createTransferInstruction(
          senderAta,
          receiverAta,
          userKeypair.publicKey,
          usdtAmountRaw
        )
      );

      // Lấy blockhash và set fee payer
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userKeypair.publicKey;

      // Gửi và xác nhận transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [userKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed'
        }
      );

      this.logger.log(`Successfully sent ${usdtAmount} USDT from ${fromWalletAddress} to ${toWalletAddress}, TX: ${signature}`);
      return signature;

    } catch (error) {
      this.logger.error(`Failed to send ${usdtAmount} USDT from ${fromWalletAddress} to ${toWalletAddress}: ${error.message}`);
      throw error;
    }
  }
} 