import { Injectable, Inject, OnModuleInit, forwardRef, Logger } from '@nestjs/common';
import { Jupiter, TOKEN_LIST_URL } from '@jup-ag/core';
import { Connection, PublicKey, VersionedTransaction, Keypair, ParsedAccountData, TransactionInstruction, RpcResponseAndContext, SignatureResult } from '@solana/web3.js';
import { API_URLS } from '@raydium-io/raydium-sdk-v2';
import axios, { AxiosInstance } from 'axios';
import bs58 from 'bs58';
import * as jsbiOriginal from 'jsbi';
import { retry } from 'async';
import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { ConfigService } from '@nestjs/config';
import { Transaction } from '@solana/web3.js';
import * as http from 'http';
import * as https from 'https';
import { SystemProgram } from '@solana/web3.js';
import { InjectRepository } from '@nestjs/typeorm';
import { SolanaListToken } from './entities/solana-list-token.entity';
import { Repository } from 'typeorm';
import { SolanaWebSocketService } from './solana-websocket.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SolanaListPool } from './entities/solana-list-pool.entity';
import { SolanaListTokenRepository } from './repositories/solana-list-token.repository';
import { SolanaListPoolRepository } from './repositories/solana-list-pool.repository';
import { SwapResult } from './interfaces/swap-result.interface';
import { CacheService } from '../cache/cache.service';
import { PumpFunService } from '../pump-fun/pump-fun.service';
import { PumpFunSDK } from "pumpdotfun-sdk";
import { AnchorProvider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { PumpfunDexService } from '../pump-fun/pumpfun-dex.service';
import * as PumpSwapSdk from '@pump-fun/pump-swap-sdk';
import '@solana/spl-token-registry';
import { ComputeBudgetProgram } from '@solana/web3.js';

// Cập nhật interface cho options
interface SwapOptions {
    isForMaster?: boolean;
    autoAdjustAmount?: boolean;
    maxRetries?: number;
    tryIndirectRoutes?: boolean;
    useDex?: 'raydium' | 'jupiter' | 'pumpfun';
    priorityFee?: number; // Thêm trường này
}

interface RetryConfig {
    initialDeduction: number;    // Mức giảm ban đầu
    maxDeduction: number;        // Mức giảm tối đa
    deductionStep: number;       // Bước giảm
    initialSlippage: number;     // Slippage ban đầu
    maxSlippage: number;         // Slippage tối đa
    retryDelay: number;          // Thời gian chờ giữa các lần thử
}

// Add these interfaces before the class definition
interface JupiterQuoteResponse {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    outputDecimals: number;
    priceImpactPct: number;
    routePlan: Array<{
        swapInfo: {
            label: string;
            ammName: string;
            [key: string]: any;
        };
        [key: string]: any;
    }>;
    error?: string;
}

interface JupiterSwapResponse {
    swapTransaction: string;
    lastValidBlockHeight: number;
    error?: string;
}

@Injectable()
export class SmartRouteSolanaService implements OnModuleInit {
    private jupiter: Jupiter | null = null;
    private maxRetries = 5;
    private retryDelay = 5000; // 5 seconds
    private readonly axios: AxiosInstance;
    private JSBI: any;
    private tokenDecimalsCache: Map<string, number> = new Map();
    private currentSwapOptions: any = null;
    private jupiterInitPromise: Promise<void> | null = null;
    private isJupiterReady = false;

    constructor(
        @Inject('SOLANA_CONNECTION')
        private readonly connection: Connection,
        private readonly cacheService: CacheService,
        private readonly configService: ConfigService,
        @InjectRepository(SolanaListToken)
        private readonly solanaListTokenRepository: Repository<SolanaListToken>,
        @InjectRepository(SolanaListPool)
        private readonly solanaListPoolRepository: Repository<SolanaListPool>,
        @Inject(forwardRef(() => SolanaWebSocketService))
        private readonly solanaWebSocketService: SolanaWebSocketService,
        private readonly eventEmitter: EventEmitter2,
        @Inject('SolanaListTokenRepository') private readonly tokenRepository: SolanaListTokenRepository,
        @Inject('SolanaListPoolRepository') private readonly poolRepository: SolanaListPoolRepository,
        private readonly pumpFunService: PumpFunService,
        private readonly pumpfunDexService: PumpfunDexService
    ) {
        // Tạo instance axios với config
        this.axios = axios.create({
            timeout: 30000, // Tăng timeout lên 30s
            maxRedirects: 5,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Khởi tạo JSBI local
        this.JSBI = jsbiOriginal;
    }

    async onModuleInit() {
        try {
            // Kiểm tra JSBI
            if (!this.JSBI || typeof this.JSBI.BigInt !== 'function') {
                console.error('JSBI library not properly loaded during initialization');
                try {
                    const jsbiModule = await import('jsbi');
                    this.JSBI = jsbiModule.default;
                    console.log('JSBI re-imported successfully');
                } catch (importError) {
                    console.error('Failed to re-import JSBI:', importError);
                }
            } else {
                console.log('JSBI library loaded correctly');
            }

            // Khởi tạo Jupiter trong background
            this.jupiterInitPromise = this.initJupiterWithRetry();
            this.jupiterInitPromise.catch(error => {
                console.error('Background Jupiter initialization failed:', error);
            });
        } catch (error) {
            console.error('Error during SmartRouteSolanaService initialization:', error);
        }
    }

    async initJupiterWithRetry(attempt = 1) {
        try {
            console.log(`Initializing Jupiter (attempt ${attempt})...`);

            // Validate connection
            if (!this.connection) {
                throw new Error('Solana connection not initialized');
            }

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Jupiter initialization timeout')), 30000);
            });

            // Initialize Jupiter with latest recommended settings
            const jupiterPromise = Jupiter.load({
                connection: this.connection,
                cluster: 'mainnet-beta',
                user: undefined, // No user wallet needed for quote
                wrapUnwrapSOL: true,
                routeCacheDuration: 0, // Disable cache to always get fresh quotes
                restrictIntermediateTokens: false,
                shouldLoadSerumOpenOrders: false,
                marketUrl: 'https://quote-api.jup.ag/v6' // Use latest API version
            });

            this.jupiter = await Promise.race([jupiterPromise, timeoutPromise]) as Jupiter;

            // Validate Jupiter instance
            if (!this.jupiter) {
                throw new Error('Jupiter instance is null');
            }

            if (typeof this.jupiter.computeRoutes !== 'function') {
                throw new Error('Jupiter instance missing required methods');
            }

            // Test Jupiter with a simple route computation
            try {
                const testRoutes = await this.jupiter.computeRoutes({
                    inputMint: new PublicKey('So11111111111111111111111111111111111111112'),
                    outputMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
                    amount: this.JSBI.BigInt('1000000000'),
                    slippageBps: 50,
                    forceFetch: true, // Always fetch fresh quotes
                    onlyDirectRoutes: false,
                    filterTopNResult: 1 // Get only the best route
                });

                if (!testRoutes || !testRoutes.routesInfos) {
                    throw new Error('Jupiter route computation test failed');
                }
            } catch (testError) {
                console.error('Jupiter test route computation failed:', testError);
                throw new Error('Jupiter initialization validation failed');
            }

            console.log('Jupiter initialized successfully');
            this.isJupiterReady = true;
        } catch (error) {
            console.error(`Jupiter initialization failed (attempt ${attempt}):`, error);

            if (attempt < this.maxRetries) {
                const delay = this.retryDelay * attempt; // Exponential backoff
                console.log(`Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                await this.initJupiterWithRetry(attempt + 1);
            } else {
                this.jupiter = null;
                this.isJupiterReady = false;
                throw new Error('Failed to initialize Jupiter after all retries');
            }
        }
    }

    private async trySwapWithRetry(
        dex: 'raydium' | 'pumpfun',
        swapFn: Function,
        params: {
            privateKey: string,
            fromToken: string,
            toToken: string,
            amount: number,
            slippage: number
        },
        config?: Partial<RetryConfig>
    ): Promise<SwapResult> {
        const defaultConfig: RetryConfig = {
            initialDeduction: 0.001,  // Bắt đầu với 0.1%
            maxDeduction: 0.01,       // Tối đa 1%
            deductionStep: 0.001,     // Tăng 0.1% mỗi lần
            initialSlippage: params.slippage,
            maxSlippage: 50,          // Tối đa 50%
            retryDelay: 500
        };

        const finalConfig = { ...defaultConfig, ...config };
        let currentDeduction = finalConfig.initialDeduction;
        let currentSlippage = finalConfig.initialSlippage;

        while (currentDeduction <= finalConfig.maxDeduction) {
            try {
                const adjustedAmount = params.amount * (1 - currentDeduction);
                console.log(`Attempting ${dex} swap:
                    Amount: ${adjustedAmount} (${currentDeduction * 100}% reduced)
                    Slippage: ${currentSlippage}%`);

                const result = await swapFn({
                    ...params,
                    amount: adjustedAmount,
                    slippage: currentSlippage
                });

                return result;

            } catch (error) {
                console.log(`${dex} swap failed:`, error.message);

                // Phân tích lỗi để quyết định strategy
                if (this.isLiquidityError(error)) {
                    // Nếu là lỗi thanh khoản -> tăng mức giảm số lượng
                    currentDeduction += finalConfig.deductionStep;
                } else if (this.isSlippageError(error)) {
                    // Nếu là lỗi slippage -> tăng slippage
                    if (currentSlippage < finalConfig.maxSlippage) {
                        currentSlippage = Math.min(
                            currentSlippage * 1.5,
                            finalConfig.maxSlippage
                        );
                        continue;
                    }
                } else {
                    // Lỗi khác -> throw luôn
                    throw error;
                }

                if (currentDeduction > finalConfig.maxDeduction) {
                    throw new Error(`${dex} swap failed after all attempts`);
                }

                await new Promise(resolve => setTimeout(resolve, finalConfig.retryDelay));
            }
        }

        throw new Error(`${dex} swap failed after maximum deduction`);
    }

    private isSlippageError(error: any): boolean {
        const errorMsg = error.message.toLowerCase();
        return errorMsg.includes('slippage') ||
            errorMsg.includes('price impact') ||
            errorMsg.includes('price difference');
    }

    private async tryRaydiumSwapWithRetry(
        privateKey: string,
        fromToken: string,
        toToken: string,
        originalAmount: number,
        slippage: number
    ): Promise<SwapResult> {
        let currentDeduction = 0.0005; // Bắt đầu với 0.05%
        const maxDeduction = 0.01; // Tối đa 1%

        while (currentDeduction <= maxDeduction) {
            try {
                const adjustedAmount = originalAmount * (1 - currentDeduction);
                console.log(`Attempting Raydium swap with ${currentDeduction * 100}% deduction. Amount: ${adjustedAmount}`);

                // Gọi hàm swap Raydium với số lượng đã điều chỉnh
                const result = await this.swapWithRaydium(
                    privateKey,
                    fromToken,
                    toToken,
                    adjustedAmount,
                    slippage
                );

                return result;

            } catch (error) {
                // Nếu lỗi liên quan đến thanh khoản hoặc slippage
                if (error.message?.includes('INSUFFICIENT_LIQUIDITY') ||
                    error.message?.includes('SLIPPAGE_EXCEEDED')) {
                    console.log(`Attempt failed with ${currentDeduction * 100}% deduction:`, error.message);
                    currentDeduction += 0.0005;
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }

                // Nếu là lỗi khác thì throw luôn
                throw error;
            }
        }

        throw new Error('Failed to execute Raydium swap after all reduction attempts');
    }

    async smartSwap(
        privateKey: string,
        fromToken: string,
        toToken: string,
        amount: number,
        slippage: number,
        options?: any
    ): Promise<any> {
        try {
            this.currentSwapOptions = options || {};

            // Luôn thử Raydium trước với cơ chế retry
            try {
                console.log(`Attempting Raydium swap: ${amount} ${fromToken} -> ${toToken}`);
                const result = await this.tryRaydiumSwapWithRetry(
                    privateKey,
                    fromToken,
                    toToken,
                    amount,
                    slippage
                );
                return result;
            } catch (error) {
                console.error('Raydium swap failed:', error.message);

                // Chuyển sang Jupiter nếu Raydium thất bại
                // ... phần code Jupiter giữ nguyên ...
            }
        } catch (error) {
            console.error(`Smart swap failed for ${fromToken} to ${toToken}:`, error);
            throw error;
        }
    }

    // Kiểm tra lỗi có phải do thanh khoản không
    private isLiquidityError(error: any): boolean {
        const errorMsg = error.message.toLowerCase();
        const liquidityErrorKeywords = [
            'liquidity',
            'pool not found',
            'insufficient',
            'slippage',
            'not enough',
            'cannot find',
            'route not found'
        ];

        return liquidityErrorKeywords.some(keyword => errorMsg.includes(keyword));
    }

    // Kiểm tra token có phù hợp với Pump.fun không
    private isPumpFunCompatible(tokenAddress: string): boolean {
        // Khai báo mảng với kiểu dữ liệu string[]
        const pumpFunTokens: string[] = [/* danh sách token Pump.fun */];
        return pumpFunTokens.includes(tokenAddress);
    }

    async swapWithRaydium(
        privateKey: string,
        fromToken: string,
        toToken: string,
        amount: number,
        slippage: number,
        options: any = {}
    ): Promise<SwapResult> {
        console.log(`=== RAYDIUM SWAP START ===`);
        console.log(`Input: ${fromToken}`);
        console.log(`Output: ${toToken}`);
        console.log(`Amount: ${amount}`);
        console.log(`Slippage: ${slippage}%`);

        try {
            // Xử lý private key
            let solanaKey = privateKey;
            try {
                const parsedKey = JSON.parse(privateKey);
                if (parsedKey && parsedKey.solana) {
                    solanaKey = parsedKey.solana;
                }
            } catch (e) { }

            // Tạo keypair
            const owner = Keypair.fromSecretKey(bs58.decode(solanaKey));
            const walletAddress = owner.publicKey.toString();

            // Kiểm tra nếu là lệnh bán (không phải SOL)
            const isSell = fromToken !== "So11111111111111111111111111111111111111112";
            if (isSell) {
                try {
                    // Lấy số dư thực tế của token
                    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                        owner.publicKey,
                        { mint: new PublicKey(fromToken) }
                    );

                    if (tokenAccounts.value.length > 0) {
                        const tokenAccount = tokenAccounts.value[0];
                        const actualBalance = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;

                        if (actualBalance) {
                            // Nếu số lượng yêu cầu lớn hơn số dư thực tế, điều chỉnh lại
                            if (amount > actualBalance) {
                                console.log(`>>> Raydium: Adjusting amount from ${amount} to actual balance ${actualBalance}`);
                                amount = actualBalance * 0.999; // Giảm 0.1% để đảm bảo thành công
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`>>> Error checking token balance for Raydium: ${error.message}`);
                }
            }

            // Điều chỉnh số lượng nếu là bán tất cả (từ options của hàm gọi)
            const isForceAll = options?.force_sell_all || false;
            if (isForceAll) {
                amount = await this.adjustAmountForSellAll(
                    walletAddress,
                    fromToken,
                    amount,
                    true
                );
            }

            // Tìm pool phù hợp
            const pools = await this.solanaListPoolRepository.find({
                where: [
                    { slp_mint_a: fromToken, slp_mint_b: toToken },
                    { slp_mint_a: toToken, slp_mint_b: fromToken }
                ]
            });

            if (!pools || pools.length === 0) {
                throw new Error('No Raydium pool found for this token pair');
            }

            // Lấy pool đầu tiên (có thể thêm logic để chọn pool tốt nhất)
            const pool = pools[0];
            console.log(`Found Raydium pool: ${pool.slp_pool_id}`);

            // Chuẩn bị các địa chỉ token account
            const fromTokenATA = await this.getOrCreateATA(owner, new PublicKey(fromToken));
            const toTokenATA = await this.getOrCreateATA(owner, new PublicKey(toToken));

            // Tạo transaction
            const transaction = new Transaction();

            // Thêm instruction swap từ Raydium SDK
            // TODO: Implement actual Raydium swap instruction
            // This is a placeholder - you'll need to implement the actual swap instruction
            // using Raydium SDK or API
            const swapInstruction = new TransactionInstruction({
                programId: new PublicKey(pool.slp_pool_id),
                keys: [
                    { pubkey: owner.publicKey, isSigner: true, isWritable: true },
                    { pubkey: new PublicKey(fromTokenATA), isSigner: false, isWritable: true },
                    { pubkey: new PublicKey(toTokenATA), isSigner: false, isWritable: true },
                    { pubkey: new PublicKey(pool.slp_vault_a), isSigner: false, isWritable: true },
                    { pubkey: new PublicKey(pool.slp_vault_b), isSigner: false, isWritable: true },
                    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                ],
                data: Buffer.from([]) // TODO: Add actual swap instruction data
            });

            transaction.add(swapInstruction);

            // Thêm priority fee nếu có
            if (options.priorityFee) {
                const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
                    units: 300000 
                });
                // Chuyển đổi priority fee từ SOL sang microLamports (1 SOL = 1e9 lamports = 1e15 microLamports)
                const microLamports = Math.floor(options.priorityFee * 1e15);
                const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
                    microLamports: BigInt(microLamports)
                });
                transaction.add(modifyComputeUnits);
                transaction.add(addPriorityFee);
            }

            // Ký và gửi transaction
            const signature = await this.connection.sendTransaction(transaction, [owner], {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 3
            });

            // Đợi xác nhận transaction
            const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }

            console.log(`Transaction confirmed: ${signature}`);
            console.log(`=== RAYDIUM SWAP COMPLETED ===`);

            // TODO: Calculate actual output amount from transaction logs
            // For now, returning the input amount as output amount
            return {
                signature,
                dex: 'raydium',
                outputAmount: amount // This should be calculated from actual swap result
            };

        } catch (error) {
            console.error('Raydium swap failed:', error);
            throw new Error(`Raydium swap failed: ${error.message}`);
        }
    }

    private async getOrCreateATA(owner: Keypair, mint: PublicKey): Promise<string> {
        try {
            // Kiểm tra token accounts hiện có
            const accounts = await this.connection.getParsedTokenAccountsByOwner(
                owner.publicKey,
                { mint }
            );

            // Nếu đã có token account, trả về account đầu tiên
            if (accounts.value.length > 0) {
                return accounts.value[0].pubkey.toString();
            }

            // Nếu chưa có, tạo ATA mới
            console.log('Creating new ATA...');
            const ata = await this.createTokenAccount(owner, mint);
            console.log('ATA created:', ata);
            return ata;
        } catch (error) {
            console.error('Error in getOrCreateATA:', error);
            throw error;
        }
    }

    private async createTokenAccount(owner: Keypair, mint: PublicKey): Promise<string> {
        try {
            // Tạo transaction tạo token account
            const tx = new Transaction();

            // Thêm instruction tạo token account
            tx.add(
                this.createTokenAccountInstruction(
                    owner.publicKey,
                    mint
                )
            );

            // Gửi và xác nhận transaction
            const signature = await this.connection.sendTransaction(tx, [owner]);
            await this.connection.confirmTransaction(signature);

            // Lấy địa chỉ token account vừa tạo
            const accounts = await this.connection.getParsedTokenAccountsByOwner(
                owner.publicKey,
                { mint }
            );

            return accounts.value[0].pubkey.toString();
        } catch (error) {
            console.error('Error creating token account:', error);
            throw error;
        }
    }

    private createTokenAccountInstruction(owner: PublicKey, mint: PublicKey): TransactionInstruction {
        const ATA = PublicKey.findProgramAddressSync(
            [
                owner.toBuffer(),
                TOKEN_PROGRAM_ID.toBuffer(),
                mint.toBuffer(),
            ],
            ASSOCIATED_TOKEN_PROGRAM_ID
        )[0];

        return new TransactionInstruction({
            keys: [
                { pubkey: owner, isSigner: true, isWritable: true },    // payer
                { pubkey: ATA, isSigner: false, isWritable: true },     // ata
                { pubkey: owner, isSigner: false, isWritable: false },  // owner
                { pubkey: mint, isSigner: false, isWritable: false },   // mint
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            programId: ASSOCIATED_TOKEN_PROGRAM_ID,
            data: Buffer.from([1]) // Instruction index for create
        });
    }

    async swapWithJupiter(
        privateKey: string,
        fromToken: string,
        toToken: string,
        amount: number,
        slippage: number,
        options: any = {}
    ): Promise<SwapResult> {
        try {
            console.log(`=== JUPITER SWAP START ===`);
            console.log(`Input: ${fromToken}`);
            console.log(`Output: ${toToken}`);
            console.log(`Amount: ${amount}`);
            console.log(`Slippage: ${slippage}%`);

            // Xử lý private key
            let solanaKey = privateKey;
            try {
                const parsedKey = JSON.parse(privateKey);
                if (parsedKey && parsedKey.solana) {
                    solanaKey = parsedKey.solana;
                }
            } catch (e) { }

            // Tạo keypair
            const owner = Keypair.fromSecretKey(bs58.decode(solanaKey));
            const walletAddress = owner.publicKey.toString();

            // Điều chỉnh số lượng nếu là bán tất cả
            if (options?.force_sell_all) {
                amount = await this.adjustAmountForSellAll(
                    walletAddress,
                    fromToken,
                    amount,
                    true
                );
            }

            // 1. Get quote with retries
            const maxQuoteRetries = 3;
            let quoteResponse: JupiterQuoteResponse | null = null;
            let quoteError: Error | null = null;

            for (let i = 0; i < maxQuoteRetries; i++) {
                try {
                    const quoteParams = new URLSearchParams({
                        inputMint: fromToken,
                        outputMint: toToken,
                        amount: this.convertToLamports(amount, fromToken).toString(),
                        slippageBps: (slippage * 100).toString(),
                        onlyDirectRoutes: 'false',
                        asLegacyTransaction: 'false',
                        platformFeeBps: '0'
                    });

                    const response = await fetch(`https://quote-api.jup.ag/v6/quote?${quoteParams.toString()}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        signal: AbortSignal.timeout(10000) // 10s timeout
                    });

                    if (!response.ok) {
                        throw new Error(`Quote API returned ${response.status}: ${await response.text()}`);
                    }

                    quoteResponse = await response.json();
                    
                    if (!quoteResponse || quoteResponse.error) {
                        throw new Error(`Invalid quote response: ${quoteResponse?.error || 'Unknown error'}`);
                    }

                    // Validate required fields
                    if (!quoteResponse.outAmount || !quoteResponse.priceImpactPct || !quoteResponse.routePlan) {
                        throw new Error('Quote response missing required fields');
                    }

                    break; // Success, exit retry loop
                } catch (error) {
                    quoteError = error;
                    console.warn(`Quote attempt ${i + 1} failed:`, error);
                    if (i < maxQuoteRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                    }
                }
            }

            if (!quoteResponse) {
                throw new Error(`Failed to get quote after ${maxQuoteRetries} attempts: ${quoteError?.message}`);
            }

            // 2. Build swap transaction with retries
            const maxSwapRetries = 3;
            let swapResponse: JupiterSwapResponse | null = null;
            let swapError: Error | null = null;

            for (let i = 0; i < maxSwapRetries; i++) {
                try {
                    const response = await fetch('https://quote-api.jup.ag/v6/swap', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                            quoteResponse,
                            userPublicKey: walletAddress,
                            wrapUnwrapSOL: true,
                            computeUnitPriceMicroLamports: options.priorityFee ? 
                                Math.floor(options.priorityFee * 1e9) : undefined,
                            asLegacyTransaction: false,
                            useSharedAccounts: true,
                            destinationTokenAccount: undefined, // Let Jupiter create if needed
                            dynamicComputeUnitLimit: true
                        }),
                        signal: AbortSignal.timeout(15000) // 15s timeout
                    });

                    if (!response.ok) {
                        throw new Error(`Swap API returned ${response.status}: ${await response.text()}`);
                    }

                    swapResponse = await response.json();

                    if (!swapResponse || swapResponse.error) {
                        throw new Error(`Invalid swap response: ${swapResponse?.error || 'Unknown error'}`);
                    }

                    // Validate required fields
                    if (!swapResponse.swapTransaction || !swapResponse.lastValidBlockHeight) {
                        throw new Error('Swap response missing required fields');
                    }

                    break; // Success, exit retry loop
                } catch (error) {
                    swapError = error;
                    console.warn(`Swap attempt ${i + 1} failed:`, error);
                    if (i < maxSwapRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                    }
                }
            }

            if (!swapResponse) {
                throw new Error(`Failed to build swap transaction after ${maxSwapRetries} attempts: ${swapError?.message}`);
            }

            // 3. Deserialize and sign transaction
            const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
            let transaction: Transaction | VersionedTransaction;
            
            try {
                // Try versioned transaction first
                transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            } catch (error) {
                console.warn('Failed to deserialize as versioned transaction, trying legacy:', error);
                try {
                    transaction = Transaction.from(swapTransactionBuf);
                } catch (error) {
                    throw new Error(`Failed to deserialize transaction: ${error.message}`);
                }
            }

            // Sign transaction
            try {
                if (transaction instanceof VersionedTransaction) {
                    transaction.sign([owner]);
                } else {
                    transaction.sign(owner);
                }
            } catch (error) {
                throw new Error(`Failed to sign transaction: ${error.message}`);
            }

            // 4. Send transaction with retries
            const maxSendRetries = 3;
            let lastError;
            
            for (let i = 0; i < maxSendRetries; i++) {
                try {
                    const signature = await this.connection.sendRawTransaction(
                        transaction.serialize(),
                        {
                            skipPreflight: false,
                            preflightCommitment: 'confirmed',
                            maxRetries: 3
                        }
                    );

                    // Wait for confirmation with timeout
                    const confirmation = await Promise.race([
                        this.connection.confirmTransaction({
                            signature,
                            blockhash: swapResponse.lastValidBlockHeight.toString(),
                            lastValidBlockHeight: swapResponse.lastValidBlockHeight
                        }),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000)
                        )
                    ]) as RpcResponseAndContext<SignatureResult>;

                    if (confirmation.value.err) {
                        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
                    }

                    console.log(`Transaction confirmed: ${signature}`);
                    console.log(`=== JUPITER SWAP COMPLETED ===`);

                    return {
                        signature,
                        dex: 'jupiter',
                        outputAmount: Number(quoteResponse.outAmount) / Math.pow(10, quoteResponse.outputDecimals || 9),
                        priceImpact: quoteResponse.priceImpactPct,
                        route: {
                            marketInfos: quoteResponse.routePlan.map(info => ({
                                label: info.swapInfo.label || 'Unknown',
                                ammName: info.swapInfo.ammName || 'Unknown',
                                ...info
                            }))
                        }
                    };
                } catch (error) {
                    lastError = error;
                    console.warn(`Send attempt ${i + 1} failed:`, error);
                    if (i < maxSendRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                    }
                }
            }

            throw lastError || new Error('All swap attempts failed');

        } catch (error) {
            console.error('Jupiter swap failed:', error);
            throw new Error(`Jupiter swap failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Phương thức hỗ trợ để chuyển đổi số lượng token sang lamports
    private convertToLamports(amount: number, tokenAddress: string): string {
        // Nếu là SOL
        if (tokenAddress === 'So11111111111111111111111111111111111111112') {
            return (amount * 1e9).toString();
        }

        // Nếu là token khác, lấy decimals từ cache hoặc repository
        const decimals = this.tokenDecimalsCache.get(tokenAddress) || 9;
        return (amount * Math.pow(10, decimals)).toString();
    }

    // Phương thức hỗ trợ để lấy keypair từ private key
    private getKeypairFromPrivateKey(privateKey: string): Keypair {
        try {
            // Loại bỏ dấu ngoặc kép nếu có
            privateKey = privateKey.replace(/"/g, '');

            // Kiểm tra xem private key có phải là base58 không
            try {
                const decoded = bs58.decode(privateKey);
                if (decoded.length === 64) {
                    return Keypair.fromSecretKey(decoded);
                }
            } catch (e) {
                // Không phải base58, thử các định dạng khác
            }

            // Thử parse JSON
            try {
                const parsedKey = JSON.parse(privateKey);
                if (parsedKey && parsedKey.solana) {
                    return this.getKeypairFromPrivateKey(parsedKey.solana);
                }
            } catch (e) {
                // Không phải JSON
            }

            // Thử xem có phải là mảng số không
            if (privateKey.includes('[') && privateKey.includes(']')) {
                const cleanedKey = privateKey.replace(/[\[\]\s]/g, '');
                const numbers = cleanedKey.split(',').map(Number);
                if (numbers.length === 64) {
                    return Keypair.fromSecretKey(Uint8Array.from(numbers));
                }
            }

            throw new Error('Invalid private key format');
        } catch (error) {
            console.error('Error creating keypair from private key:', error);
            throw error;
        }
    }

    async getTokenPrice(tokenAddress: string): Promise<number> {
        try {
            await this.ensureJupiterReady();
            if (!this.jupiter) {
                throw new Error('Jupiter not initialized yet, please try again later.');
            }

            // Kiểm tra JSBI local
            if (!this.JSBI || typeof this.JSBI.BigInt !== 'function') {
                console.error('Local JSBI not available in getTokenPrice, trying to re-import');
                try {
                    const jsbiModule = await import('jsbi');
                    this.JSBI = jsbiModule.default;
                    console.log('JSBI re-imported successfully in getTokenPrice');
                } catch (importError) {
                    console.error('Failed to re-import JSBI in getTokenPrice:', importError);
                    return 0; // Return 0 instead of throwing error
                }
            }

            // Sử dụng JSBI local
            const jsbiAmount = this.JSBI.BigInt('1000000000');

            const routes = await this.jupiter.computeRoutes({
                inputMint: new PublicKey(tokenAddress),
                outputMint: new PublicKey('So11111111111111111111111111111111111111112'), // SOL
                amount: jsbiAmount,
                slippageBps: 50,
            });

            if (!routes.routesInfos.length) {
                console.log(`No routes found for token: ${tokenAddress}`);
                return 0;
            }

            return Number(routes.routesInfos[0].priceImpactPct);
        } catch (error) {
            console.error(`Error getting price for token ${tokenAddress}:`, error);
            return 0;
        }
    }

    public async getJupiterRoutes(params: any) {
        try {
            await this.ensureJupiterReady();

            // Tạo cache key từ params
            const cacheKey = `jupiter_routes:${params.inputMint.toString()}:${params.outputMint.toString()}:${params.amount.toString()}`;

            // Kiểm tra cache
            const cachedRoutes = await this.cacheService.get(cacheKey);
            if (cachedRoutes) {
                return JSON.parse(cachedRoutes as string);
            }

            if (!this.jupiter) {
                throw new Error('Jupiter not initialized yet, please try again later.');
            }

            // Kiểm tra JSBI local
            if (!this.JSBI || typeof this.JSBI.BigInt !== 'function') {
                console.error('Local JSBI not available in getJupiterRoutes, trying to re-import');
                try {
                    const jsbiModule = await import('jsbi');
                    this.JSBI = jsbiModule.default;
                    console.log('JSBI re-imported successfully in getJupiterRoutes');
                } catch (importError) {
                    console.error('Failed to re-import JSBI in getJupiterRoutes:', importError);
                    throw new Error('JSBI library not available, cannot compute routes');
                }
            }

            // Nếu params.amount là BigInt, chuyển sang JSBI
            if (params.amount && typeof params.amount === 'bigint') {
                params.amount = this.JSBI.BigInt(params.amount.toString());
            }

            const routes = await this.jupiter.computeRoutes(params);

            // Cache kết quả trong 30 giây
            if (routes && routes.routesInfos && routes.routesInfos.length > 0) {
                await this.cacheService.set(cacheKey, JSON.stringify(routes), 30);
            }

            return routes;
        } catch (error) {
            console.error('Error getting Jupiter routes:', error);
            throw error;
        }
    }

    private async getTokenDecimals(mint: string): Promise<number> {
        try {
            // Kiểm tra cache trong memory
            if (this.tokenDecimalsCache.has(mint)) {
                const cachedValue = this.tokenDecimalsCache.get(mint);
                // Ensure we don't return undefined
                if (cachedValue !== undefined) {
                    return cachedValue;
                }
            }

            // Kiểm tra cache trong Redis
            const cachedDecimals = await this.cacheService.get(`token_decimals:${mint}`);
            if (typeof cachedDecimals === 'number') {
                this.tokenDecimalsCache.set(mint, cachedDecimals);
                return cachedDecimals;
            }

            // Kiểm tra trong database
            const tokenInfo = await this.solanaListTokenRepository.findOne({
                where: { slt_address: mint }
            });

            if (tokenInfo) {
                const decimals = tokenInfo.slt_decimals;
                // Lưu vào cache
                this.tokenDecimalsCache.set(mint, decimals);
                await this.cacheService.set(`token_decimals:${mint}`, decimals, 86400); // Cache 1 ngày
                return decimals;
            }

            // Nếu không có trong database, lấy từ blockchain
            const tokenMintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mint));
            if (!tokenMintInfo.value) {
                throw new Error(`Token mint ${mint} not found`);
            }

            const parsedData = tokenMintInfo.value.data as any;
            const decimals = parsedData.parsed.info.decimals;

            // Lưu vào cache và database
            this.tokenDecimalsCache.set(mint, decimals);
            await this.cacheService.set(`token_decimals:${mint}`, decimals, 86400); // Cache 1 ngày

            return decimals;
        } catch (error) {
            console.error(`Error getting token decimals for ${mint}:`, error);
            throw error;
        }
    }

    // Thêm phương thức mới để swap qua token trung gian
    async swapViaIntermediateToken(
        privateKey: string,
        inputMint: string,
        outputMint: string,
        amountInSol: number,
        slippage: number
    ): Promise<SwapResult> {
        console.log(`=== INDIRECT SWAP START ===`);
        console.log(`Attempting swap via intermediate token: ${inputMint} -> [INTERMEDIATE] -> ${outputMint}`);

        // Danh sách các token trung gian phổ biến
        const INTERMEDIATE_TOKENS = [
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
            'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
            'So11111111111111111111111111111111111111112',  // SOL (Wrapped)
            'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So'   // mSOL
        ];

        // Loại bỏ input và output khỏi danh sách token trung gian
        const filteredTokens = INTERMEDIATE_TOKENS.filter(
            token => token !== inputMint && token !== outputMint
        );

        // Kiểm tra từng token trung gian
        for (const intermediateToken of filteredTokens) {
            try {
                console.log(`Trying route via ${intermediateToken}...`);

                // Kiểm tra route từ input đến token trung gian
                let hasRouteToIntermediate = false;
                try {
                    if (!this.jupiter) {
                        throw new Error('Jupiter not initialized yet, please try again later.');
                    }

                    const inputDecimals = await this.getTokenDecimals(inputMint);
                    const amountInLamports = Math.floor(amountInSol * Math.pow(10, inputDecimals));
                    const jsbiAmount = this.JSBI.BigInt(amountInLamports.toString());

                    const routesToIntermediate = await this.jupiter.computeRoutes({
                        inputMint: new PublicKey(inputMint),
                        outputMint: new PublicKey(intermediateToken),
                        amount: jsbiAmount,
                        slippageBps: slippage * 100,
                        forceFetch: true
                    });

                    if (routesToIntermediate.routesInfos.length > 0) {
                        hasRouteToIntermediate = true;
                        console.log(`Found route from ${inputMint} to ${intermediateToken}`);
                    } else {
                        console.log(`No route found from ${inputMint} to ${intermediateToken}`);
                        continue; // Thử token trung gian tiếp theo
                    }
                } catch (error) {
                    console.log(`Error checking route to ${intermediateToken}: ${error.message}`);
                    continue; // Thử token trung gian tiếp theo
                }

                // Kiểm tra route từ token trung gian đến output
                let hasRouteFromIntermediate = false;
                try {
                    const intermediateDecimals = await this.getTokenDecimals(intermediateToken);
                    // Giả định 1 đơn vị token trung gian để kiểm tra
                    const testAmount = this.JSBI.BigInt(Math.pow(10, intermediateDecimals).toString());

                    const routesFromIntermediate = await this.jupiter.computeRoutes({
                        inputMint: new PublicKey(intermediateToken),
                        outputMint: new PublicKey(outputMint),
                        amount: testAmount,
                        slippageBps: slippage * 100,
                        forceFetch: true
                    });

                    if (routesFromIntermediate.routesInfos.length > 0) {
                        hasRouteFromIntermediate = true;
                        console.log(`Found route from ${intermediateToken} to ${outputMint}`);
                    } else {
                        console.log(`No route found from ${intermediateToken} to ${outputMint}`);
                        continue; // Thử token trung gian tiếp theo
                    }
                } catch (error) {
                    console.log(`Error checking route from ${intermediateToken}: ${error.message}`);
                    continue; // Thử token trung gian tiếp theo
                }

                // Nếu có cả hai route, thực hiện swap
                if (hasRouteToIntermediate && hasRouteFromIntermediate) {
                    console.log(`Complete route found via ${intermediateToken}!`);

                    // Step 1: Swap từ input token sang token trung gian
                    console.log(`Step 1: Swapping ${amountInSol} ${inputMint} to ${intermediateToken}`);
                    const step1Signature = await this.swapWithJupiter(
                        privateKey,
                        inputMint,
                        intermediateToken,
                        amountInSol,
                        slippage
                    );

                    console.log(`Step 1 completed with signature: ${step1Signature}`);

                    // Đợi transaction hoàn thành
                    console.log(`Waiting for transaction to confirm...`);
                    const confirmationStatus = await this.connection.confirmTransaction(
                        typeof step1Signature === 'string' ? step1Signature : step1Signature.signature
                    );
                    console.log(`Transaction confirmed with status:`, confirmationStatus);

                    // Đợi thêm 2 giây để đảm bảo dữ liệu được cập nhật
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Lấy số dư token trung gian
                    const owner = Keypair.fromSecretKey(bs58.decode(privateKey.replace(/"/g, '')));
                    let intermediateBalance;

                    if (intermediateToken === 'So11111111111111111111111111111111111111112') {
                        // Nếu token trung gian là SOL
                        const solBalance = await this.connection.getBalance(owner.publicKey);
                        intermediateBalance = {
                            amount: solBalance.toString(),
                            uiAmount: solBalance / 1e9,
                            decimals: 9
                        };
                    } else {
                        // Nếu token trung gian là token khác
                        const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                            owner.publicKey,
                            { mint: new PublicKey(intermediateToken) }
                        );

                        if (tokenAccounts.value.length === 0) {
                            throw new Error(`No ${intermediateToken} account found after first swap`);
                        }

                        intermediateBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
                    }

                    console.log(`${intermediateToken} balance after step 1: ${intermediateBalance.uiAmount}`);

                    if (Number(intermediateBalance.amount) <= 0) {
                        throw new Error(`Insufficient ${intermediateToken} balance after first swap`);
                    }

                    // Step 2: Swap từ token trung gian sang output token
                    const swapAmount = intermediateBalance.uiAmount * 0.99; // Để lại 1% cho phí
                    console.log(`Step 2: Swapping ${swapAmount} ${intermediateToken} to ${outputMint}`);
                    const step2Signature = await this.swapWithJupiter(
                        privateKey,
                        intermediateToken,
                        outputMint,
                        swapAmount,
                        slippage
                    );

                    console.log(`Step 2 completed with signature: ${step2Signature}`);
                    console.log(`=== INDIRECT SWAP COMPLETED ===`);
                    return {
                        signature: step2Signature.signature,
                        dex: 'jupiter',
                        outputAmount: Number(step2Signature.outputAmount) / 1e9
                    };
                }
            } catch (error) {
                console.error(`Error during swap via ${intermediateToken}:`, error);
                // Tiếp tục thử token trung gian tiếp theo
            }
        }

        // Nếu không tìm thấy route qua bất kỳ token trung gian nào
        throw new Error(`No indirect route found between ${inputMint} and ${outputMint}`);
    }

    // Thêm phương thức kiểm tra token hợp lệ
    async validateToken(tokenMint: string): Promise<boolean> {
        try {
            // SOL is always valid
            if (tokenMint === "So11111111111111111111111111111111111111112") {
                return true;
            }

            // Kiểm tra cache trước
            const cachedValidation = await this.cacheService.get(`token_validation:${tokenMint}`);
            if (cachedValidation !== null) {
                return cachedValidation === 'true';
            }

            // Kiểm tra token có trong database không
            const tokenInfo = await this.solanaListTokenRepository.findOne({
                where: { slt_address: tokenMint }
            });

            if (tokenInfo) {
                await this.cacheService.set(`token_validation:${tokenMint}`, 'true', 3600); // Cache 1 giờ
                return true;
            }

            // Kiểm tra token có trên chain không
            try {
                const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(tokenMint));
                if (!mintInfo.value) {
                    await this.cacheService.set(`token_validation:${tokenMint}`, 'false', 3600);
                    throw new Error('Token mint account not found on chain');
                }

                // Kiểm tra account có phải là token mint không
                if (mintInfo.value.data instanceof Buffer) {
                    await this.cacheService.set(`token_validation:${tokenMint}`, 'false', 3600);
                    throw new Error('Token mint account data is not parsed');
                }

                const parsedData = mintInfo.value.data as ParsedAccountData;
                if (parsedData.program !== 'spl-token' || parsedData.parsed.type !== 'mint') {
                    await this.cacheService.set(`token_validation:${tokenMint}`, 'false', 3600);
                    throw new Error('Account is not a valid SPL token mint');
                }

                await this.cacheService.set(`token_validation:${tokenMint}`, 'true', 3600);

                // Theo dõi token này qua WebSocket
                await this.trackTokenLiquidity(tokenMint);

                return true;
            } catch (error) {
                await this.cacheService.set(`token_validation:${tokenMint}`, 'false', 3600);
                throw new Error(`Token validation failed: ${error.message}`);
            }
        } catch (error) {
            throw new Error(`Token validation failed: ${error.message}`);
        }
    }

    async trackTokenLiquidity(tokenMint: string) {
        try {
            // Kiểm tra cache trước
            const cachedLiquidity = await this.cacheService.get(`token_liquidity:${tokenMint}`);
            if (cachedLiquidity !== null) {
                return cachedLiquidity === 'true';
            }

            // Lấy thông tin pool chứa token này
            const pools = await this.solanaListPoolRepository.find();

            if (pools.length > 0) {
                // Theo dõi các pool chính để cập nhật thanh khoản
                for (const pool of pools) {
                    await this.solanaWebSocketService.trackAccountChanges(new PublicKey(pool.slp_pool_id));
                }

                // Lắng nghe sự kiện thay đổi pool để cập nhật cache
                this.eventEmitter.on('account.changed', async (data) => {
                    if (pools.some(p => p.slp_pool_id === data.account)) {
                        // Cập nhật cache thanh khoản
                        await this.cacheService.set(`token_liquidity:${tokenMint}`, 'true', 300);
                    }
                });

                // Kiểm tra thanh khoản hiện tại và cập nhật cache
                const hasLiquidity = await this.checkTokenLiquidity(tokenMint);
                await this.cacheService.set(`token_liquidity:${tokenMint}`, hasLiquidity ? 'true' : 'false', 300);

                return hasLiquidity;
            }

            // Nếu không có pool, giả định là không có thanh khoản
            await this.cacheService.set(`token_liquidity:${tokenMint}`, 'false', 300);
            return false;
        } catch (error) {
            console.error(`Error tracking token liquidity for ${tokenMint}:`, error);
            return false;
        }
    }

    async checkTokenLiquidity(tokenMint: string): Promise<boolean> {
        try {
            // Kiểm tra cache trước
            const cachedLiquidity = await this.cacheService.get(`token_liquidity:${tokenMint}`);
            if (cachedLiquidity !== null) {
                return cachedLiquidity === 'true';
            }

            // Kiểm tra token có tồn tại không
            try {
                const tokenInfo = await new PublicKey(tokenMint);
            } catch (error) {
                await this.cacheService.set(`token_liquidity:${tokenMint}`, 'false', 300);
                throw {
                    code: 'INVALID_TOKEN',
                    message: `Invalid token address: ${tokenMint}`,
                    details: { tokenAddress: tokenMint }
                };
            }

            // Kiểm tra thanh khoản trên Jupiter
            try {
                if (!this.jupiter) {
                    throw new Error('Jupiter not initialized yet, please try again later.');
                }

                const routes = await this.jupiter.computeRoutes({
                    inputMint: new PublicKey("So11111111111111111111111111111111111111112"), // SOL
                    outputMint: new PublicKey(tokenMint),
                    amount: this.JSBI.BigInt(1000000), // 0.001 SOL
                    slippageBps: 100, // 1% slippage
                    forceFetch: true
                });

                const hasLiquidity = routes.routesInfos.length > 0;

                // Cache kết quả
                await this.cacheService.set(`token_liquidity:${tokenMint}`, hasLiquidity ? 'true' : 'false', 300);

                if (hasLiquidity) {
                    console.log(`Token ${tokenMint} has liquidity (${routes.routesInfos.length} routes found)`);
                } else {
                    console.log(`No routes found for token ${tokenMint}`);
                }

                return hasLiquidity;
            } catch (error) {
                console.error(`Error checking liquidity for token ${tokenMint}:`, error);
                await this.cacheService.set(`token_liquidity:${tokenMint}`, 'false', 300);

                // Nếu lỗi liên quan đến route, coi như không có thanh khoản
                if (error.message?.includes('No routes found')) {
                    return false;
                }

                // Các lỗi khác, ném lại để xử lý ở cấp cao hơn
                throw error;
            }
        } catch (error) {
            console.error(`Error in checkTokenLiquidity:`, error);
            await this.cacheService.set(`token_liquidity:${tokenMint}`, 'false', 300);

            // Nếu lỗi đã được định dạng (có code), trả về nguyên vẹn
            if (error.code) {
                throw error;
            }

            // Nếu là lỗi thông thường, định dạng lại
            throw {
                code: 'LIQUIDITY_CHECK_ERROR',
                message: `Error checking liquidity: ${error.message}`,
                details: { originalError: error.message }
            };
        }
    }

    // Thêm phương thức getSwapQuote vào SmartRouteSolanaService
    async getSwapQuote(
        inputMint: string,
        outputMint: string,
        amount: number,
        slippage: number = 1
    ): Promise<{ inAmount: number; outAmount: number; } | null> {
        try {
            // Sử dụng Jupiter để lấy quote
            const routes = await this.getJupiterRoutes({
                inputMint: new PublicKey(inputMint),
                outputMint: new PublicKey(outputMint),
                amount: this.JSBI.BigInt((amount * 1e9).toString()),
                slippageBps: slippage * 100,
                onlyDirectRoutes: false
            });

            if (!routes.routesInfos.length) return null;

            const bestRoute = routes.routesInfos[0];
            return {
                inAmount: amount,
                outAmount: Number(bestRoute.outAmount) / 1e9
            };
        } catch (error) {
            console.error('Error getting swap quote:', error);
            return null;
        }
    }

    // Thêm hàm helper để kiểm tra và điều chỉnh số lượng token khi bán tất cả
    private async adjustAmountForSellAll(
        walletAddress: string,
        tokenMint: string,
        amount: number,
        isForceAll: boolean
    ): Promise<number> {
        if (!isForceAll || tokenMint === "So11111111111111111111111111111111111111112") {
            return amount; // Không điều chỉnh nếu không phải bán tất cả hoặc là SOL
        }

        try {
            // Tìm token account
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { mint: new PublicKey(tokenMint) }
            );

            if (tokenAccounts.value.length > 0) {
                const tokenAccount = tokenAccounts.value[0];
                const balance = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;

                if (balance) {
                    // Trả về toàn bộ số dư thực tế
                    console.log(`>>> Force sell all mode: Using full balance ${balance}`);
                    return balance;
                }
            }
        } catch (error) {
            console.warn(`Error adjusting amount for sell all: ${error.message}`);
        }

        return amount; // Trả về số lượng ban đầu nếu có lỗi
    }

    async swapWithPumpFun(
        privateKey: string,
        inputMint: string,
        outputMint: string,
        amount: number,
        slippage: number = 10,
        options: {
            denominatedInSol?: boolean;
            priorityFee?: number;
            pool?: 'pump' | 'raydium' | 'auto';
            force_sell_all?: boolean;
        } = {}
    ): Promise<SwapResult> {
        try {
            console.log(`=== PUMP FUN SWAP START ===`);
            console.log(`Input: ${inputMint}`);
            console.log(`Output: ${outputMint}`);
            console.log(`Amount: ${amount}`);
            console.log(`Slippage: ${slippage}%`);

            const isBuy = inputMint === "So11111111111111111111111111111111111111112";

            // Sử dụng PumpFunService với số lượng từ master transaction
            return await this.pumpFunService.swap(
                privateKey,
                inputMint,
                outputMint,
                amount,
                slippage,
                isBuy,
                options.force_sell_all
            );

        } catch (error) {
            console.error('Pump Fun swap failed:', error);
            throw new Error(`Pump Fun swap failed: ${error.message}`);
        }
    }

    // Thêm phương thức kiểm tra trạng thái Jupiter
    private async ensureJupiterReady(): Promise<void> {
        if (this.isJupiterReady) {
            return;
        }

        if (!this.jupiterInitPromise) {
            this.jupiterInitPromise = this.initJupiterWithRetry();
        }

        try {
            await this.jupiterInitPromise;
            this.isJupiterReady = true;
        } catch (error) {
            console.error('Failed to initialize Jupiter:', error);
            throw new Error('Jupiter is not ready. Please try again later.');
        }
    }

    /**
     * Swap qua DEX của PumpFun (dùng cho các token đã tốt nghiệp, không còn boiling curve)
     * TODO: Cập nhật endpoint và params thực tế nếu có tài liệu chính thức
     */
    async swapWithPumpFunDex(
        privateKey: string,
        inputMint: string,
        outputMint: string,
        amount: number,
        slippage: number = 10,
        options: {
            denominatedInSol?: boolean;
            priorityFee?: number;
            pool?: 'pump' | 'raydium' | 'auto';
            force_sell_all?: boolean;
        } = {}
    ): Promise<SwapResult> {
        try {
            // Kiểm tra pool tồn tại trước khi gọi swap
            const baseTokenMint = inputMint === "So11111111111111111111111111111111111111112" ? outputMint : inputMint;
            const poolExists = await this.pumpfunDexService.checkPoolExists(baseTokenMint);

            if (!poolExists) {
                console.log(`Không tìm thấy pool PumpFun DEX cho token ${baseTokenMint}, chuyển sang Jupiter`);
                return await this.swapWithJupiter(privateKey, inputMint, outputMint, amount, slippage, options);
            }

            // Xác định direction
            const isBuy = inputMint === "So11111111111111111111111111111111111111112";
            const direction = isBuy ? 0 : 1; // 0 = QuoteToBase (buy), 1 = BaseToQuote (sell)
            // Gọi service mới
            const result = await this.pumpfunDexService.swapDex({
                privateKey,
                inputMint,
                outputMint,
                amount,
                slippage,
                direction
            });
            return {
                signature: result.signature,
                dex: 'pumpfun-dex',
                outputAmount: result.outputAmount
            };
        } catch (error) {
            console.error('Pump Fun DEX swap via SDK failed:', error);

            // Kiểm tra lỗi NoPoolFound và fallback sang Jupiter
            if (error.message?.includes('NoPoolFound')) {
                console.log('Fallback từ PumpFun DEX sang Jupiter do không tìm thấy pool');
                try {
                    return await this.swapWithJupiter(privateKey, inputMint, outputMint, amount, slippage, options);
                } catch (jupiterError) {
                    console.error('Jupiter fallback cũng thất bại:', jupiterError);
                    throw new Error(`Không thể swap token: ${error.message}. Jupiter fallback: ${jupiterError.message}`);
                }
            }

            // Nếu không phải lỗi pool thì throw lỗi gốc
            throw new Error(`Pump Fun DEX swap via SDK failed: ${error.message}`);
        }
    }
} 