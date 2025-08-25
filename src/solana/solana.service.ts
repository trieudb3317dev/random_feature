import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { Connection, PublicKey, Transaction, Keypair, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { TokenListProvider } from '@solana/spl-token-registry';
import { Jupiter } from '@jup-ag/core';
import bs58 from 'bs58';
import JSBI from 'jsbi';
import { SmartRouteSolanaService } from './smart-route-solana.service';
import axios from 'axios';
import { API_URLS } from '@raydium-io/raydium-sdk-v2';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolanaListToken } from './entities/solana-list-token.entity';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaListPool } from './entities/solana-list-pool.entity';
import { SolanaWebSocketService } from './solana-websocket.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '../cache/cache.service';
import { ConfigService } from '@nestjs/config';
import { SwapResult } from './interfaces/swap-result.interface';
import * as fs from 'fs/promises';
import { TokenProgram } from './entities/solana-list-token.entity';
import { SolanaPriceCacheService } from './solana-price-cache.service';
import { SolanaListCategoriesToken } from './entities/solana-list-categories-token.entity';
import { SolanaTokenJoinCategory, JoinCategoryStatus } from './entities/solana-token-join-category.entity';
import { SolanaListCategoriesTokenRepository } from './repositories/solana-list-categories-token.repository';
import { SolanaTokenJoinCategoryRepository } from './repositories/solana-token-join-category.repository';
import { SolanaCacheService } from './solana-cache.service';
import { TokenPriceResponseDto } from './dto/token-price.dto';
import { AccountLayout, MintLayout } from '@solana/spl-token';
import { SolanaTrackerService } from 'src/on-chain/solana-tracker.service';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { v2 as cloudinary } from 'cloudinary';
import { SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getAssociatedTokenAddress, createAssociatedTokenAccount, ASSOCIATED_TOKEN_PROGRAM_ID } from '@project-serum/associated-token';


interface RaydiumPool {
    slp_pool_id: string;
    slp_mint_program_id_a: string;
    slp_mint_program_id_b: string;
    slp_mint_a: string;
    slp_mint_b: string;
    slp_vault_a: string;
    slp_vault_b: string;
    slp_mint_decimals_a: number;
    slp_mint_decimals_b: number;
    slp_config_id: string;
    slp_config_index: number;
    slp_config_protocol_fee_rate: number;
    slp_config_trade_fee_rate: number;
    slp_config_tick_spacing: number;
    slp_config_fund_fee_rate: number;
    slp_source: string;
    created_at: Date;
    updated_at: Date;
}

interface TokenInfo {
    name: string;
    symbol: string;
    decimals: number;
    logoURI: string | null;
    address: string;
    verified: boolean;
}

interface TokenPriceResponse {
    priceUSD: number;
    priceSOL: number;
    error?: string;
}

@Injectable()
export class SolanaService {
    private readonly logger = new Logger(SolanaService.name);
    public readonly CACHE_TTL = {
        DEFAULT: 86400000, // 1 day
        FALLBACK: 10000,   // 10 seconds
        STABLE: 2592000000, // 30 days
        TOKEN_INFO: 3600, // 1 hour for token info
    };
    private readonly SOL_MINT = 'So11111111111111111111111111111111111111112';
    private readonly USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    private readonly DEFAULT_PLATFORM_WALLET = '3wLs323SvtV9iD5HWTtJHGFdmRVGv4xDq3LXKRBdciE2';
    private readonly PLATFORM_WALLET: string;

    constructor(
        @Inject(forwardRef(() => SmartRouteSolanaService))
        private readonly smartRouteSolanaService: SmartRouteSolanaService,
        @InjectRepository(SolanaListToken)
        private readonly solanaTokenRepository: Repository<SolanaListToken>,
        @InjectRepository(SolanaListPool)
        private readonly solanaListPoolRepository: Repository<SolanaListPool>,
        @InjectRepository(SolanaListCategoriesToken)
        private readonly solanaListCategoriesTokenRepository: Repository<SolanaListCategoriesToken>,
        @InjectRepository(SolanaTokenJoinCategory)
        private readonly solanaTokenJoinCategoryRepository: Repository<SolanaTokenJoinCategory>,
        private readonly solanaWebSocketService: SolanaWebSocketService,
        private readonly eventEmitter: EventEmitter2,
        private readonly cacheService: CacheService,
        private readonly configService: ConfigService,
        @Inject(forwardRef(() => SolanaPriceCacheService))
        private readonly solanaPriceCacheService: SolanaPriceCacheService,
        private readonly solanaCacheService: SolanaCacheService,
        @Inject('SOLANA_CONNECTION')
        private readonly connection: Connection,
        private readonly solanaTrackerService: SolanaTrackerService
    ) {
        // Lấy địa chỉ ví phí từ biến môi trường, nếu không có thì dùng địa chỉ mặc định
        const walletFee = this.configService.get<string>('WALLET_FEE');
        this.PLATFORM_WALLET = walletFee || this.DEFAULT_PLATFORM_WALLET;
        
        this.logger.log(`Using platform wallet address: ${this.PLATFORM_WALLET}`);
        if (!walletFee) {
            this.logger.warn('WALLET_FEE environment variable is not set, using default wallet address');
        }

        // Configure Cloudinary
        cloudinary.config({
            cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
            api_key: this.configService.get('CLOUDINARY_API_KEY'),
            api_secret: this.configService.get('CLOUDINARY_API_SECRET')
        });

        // Lắng nghe sự kiện thay đổi số dư và cập nhật Redis cache
        this.eventEmitter.on('account.balance.changed', async (data) => {
            await this.updateBalanceCache(data.account, data.balance);
        });

        // Lắng nghe sự kiện trạng thái giao dịch
        this.eventEmitter.on('transaction.status', (data) => {
            this.cacheService.set(`tx_status:${data.signature}`, data.status, 300);
        });
    }

    // Hàm cập nhật cache thống nhất
    public async updateBalanceCache(address: string, balance: number, ttl: number = this.CACHE_TTL.DEFAULT): Promise<void> {
        const solBalance = balance / LAMPORTS_PER_SOL;
        await this.cacheService.set(
            `sol_balance:${address}`,
            solBalance.toString(),
            ttl / 1000 // Convert milliseconds to seconds
        );
        this.logger.debug(`Updated balance cache for ${address} with TTL ${ttl}ms`);
    }

    // Hàm lấy số dư chính
    async getBalance(address: string): Promise<number> {
        try {
            // Lấy số dư từ chain trước
            const publicKey = new PublicKey(address);
            const balance = await this.connection.getBalance(publicKey);
            const solBalance = balance / LAMPORTS_PER_SOL;

            // Cập nhật cache với số dư mới nhất
            await this.cacheService.set(
                `sol_balance:${address}`,
                solBalance.toString(),
                30 // TTL 30 seconds
            );

            // Bắt đầu theo dõi thay đổi
            await this.solanaWebSocketService.trackAccountBalance(publicKey);

            return solBalance;
        } catch (error) {
            this.logger.error(`Error getting balance for ${address}:`, error);

            // Nếu lỗi, thử lấy từ cache
            const cachedBalance = await this.cacheService.get(`sol_balance:${address}`);
            return cachedBalance ? parseFloat(cachedBalance as string) : 0;
        }
    }

    async getBalanceInUSD(address: string): Promise<number> {
        try {
            const solBalance = await this.getBalance(address);
            const solPrice = await this.solanaPriceCacheService.getSOLPriceInUSD();
            return solBalance * solPrice;
        } catch (error) {
            this.logger.error(`Error getting SOL balance in USD for ${address}:`, error);
            return 0;
        }
    }

    // Hàm lấy số dư với retry
    private async getBalanceWithRetry(address: string, maxRetries = 3): Promise<number> {
        let lastError: Error = new Error('Failed to get balance after all retries');

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await this.getBalance(address);
            } catch (error) {
                lastError = error;
                this.logger.warn(`Attempt ${i + 1} failed for ${address}:`, error);
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
            }
        }

        throw lastError;
    }

    // Hàm xóa cache
    public async clearBalanceCache(address: string): Promise<void> {
        await this.cacheService.del(`sol_balance:${address}`);
    }

    // Hàm theo dõi thay đổi số dư
    private async monitorBalanceChanges(address: string): Promise<void> {
        try {
            const publicKey = new PublicKey(address);
            const initialBalance = await this.getBalance(address);

            this.logger.log(`Initial balance for ${address}: ${initialBalance} SOL`);

            // Theo dõi thay đổi
            this.eventEmitter.on('account.balance.changed', async (data) => {
                if (data.account === address) {
                    const newBalance = data.balance / LAMPORTS_PER_SOL;
                    this.logger.log(`Balance changed for ${address}: ${newBalance} SOL`);
                }
            });
        } catch (error) {
            this.logger.error(`Error monitoring balance for ${address}:`, error);
        }
    }

    getConnection(): Connection {
        return this.connection;
    }

    async getTokenPrice(tokenMint: string): Promise<number> {
        try {
            // Kiểm tra cache trước
            const cachedPrice = await this.cacheService.get(`token_price:${tokenMint}`);
            if (cachedPrice) {
                return parseFloat(cachedPrice as string);
            }

            const { data } = await axios.get(`${API_URLS.SWAP_HOST}/price`, {
                params: {
                    inputMint: tokenMint,
                    outputMint: this.SOL_MINT,
                    amount: "1000000000" // 1 token
                }
            });

            if (!data?.success) {
                throw new Error(`Failed to get price for token ${tokenMint}`);
            }

            const price = parseFloat(data.data.price);

            // Cache giá trong 30 giây
            await this.cacheService.set(`token_price:${tokenMint}`, price.toString(), 30);

            // Theo dõi giá token qua WebSocket
            await this.trackTokenPrice(tokenMint);

            return price;
        } catch (error) {
            console.error(`Error getting token price:`, error);
            throw error;
        }
    }

    async getTokenBalance(walletAddress: string, tokenAddress: string): Promise<number> {
        console.log(`Calling getTokenBalance with: wallet=${walletAddress}, token=${tokenAddress}`);

        try {
            // Làm sạch địa chỉ
            const cleanWalletAddress = walletAddress.trim();

            // Nếu tokenAddress là 'SOL', lấy số dư SOL
            if (tokenAddress === 'SOL' || tokenAddress === 'So11111111111111111111111111111111111111112') {
                console.log(`Getting SOL balance for: ${cleanWalletAddress}`);

                // Tạo PublicKey từ địa chỉ đã làm sạch
                const publicKey = new PublicKey(cleanWalletAddress);
                const balance = await this.connection.getBalance(publicKey);
                return balance / LAMPORTS_PER_SOL;
            } else {
                // Xử lý token khác SOL
                console.log(`Getting token balance for: ${cleanWalletAddress}, token: ${tokenAddress}`);

                const walletPublicKey = new PublicKey(cleanWalletAddress);
                const tokenPublicKey = new PublicKey(tokenAddress);

                // Tìm token account
                const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                    walletPublicKey,
                    { mint: tokenPublicKey }
                );

                // Nếu không có token account, trả về 0
                if (tokenAccounts.value.length === 0) {
                    console.log(`No token accounts found for ${tokenAddress}`);
                    return 0;
                }

                // Lấy số dư từ token account đầu tiên
                const tokenAccount = tokenAccounts.value[0];
                const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;

                return tokenAmount.uiAmount || 0;
            }
        } catch (error) {
            console.error(`Error in getTokenBalance: ${error.message}`);
            // Ghi log chi tiết lỗi
            if (error.message.includes('Non-base58 character')) {
                console.error('Địa chỉ không hợp lệ, kiểm tra từng ký tự:');
                for (let i = 0; i < walletAddress.length; i++) {
                    const char = walletAddress[i];
                    const code = walletAddress.charCodeAt(i);
                    console.error(`Vị trí ${i}: '${char}' (mã ${code})`);
                }
            }
            return 0; // Trả về 0 khi có lỗi
        }
    }

    async analyzeTransaction(txHash: string) {
        try {
            const tx = await this.connection.getParsedTransaction(txHash, {
                maxSupportedTransactionVersion: 0
            });

            if (!tx || !tx.meta) {
                console.log(`Invalid transaction: ${txHash}`);
                return { inputMint: undefined, outputMint: undefined };
            }

            const preBalances = tx.meta.preTokenBalances || [];
            const postBalances = tx.meta.postTokenBalances || [];

            let inputMint, outputMint;

            // Tìm token bị giảm số lượng (input token)
            for (const pre of preBalances) {
                const post = postBalances.find(p => p.mint === pre.mint);
                if (post && Number(pre.uiTokenAmount.amount) > Number(post.uiTokenAmount.amount)) {
                    inputMint = pre.mint;
                    break;
                }
            }

            // Tìm token tăng số lượng (output token)
            for (const post of postBalances) {
                const pre = preBalances.find(p => p.mint === post.mint);
                if (!pre || Number(post.uiTokenAmount.amount) > Number(pre?.uiTokenAmount.amount || 0)) {
                    // Kiểm tra để đảm bảo output khác input
                    if (post.mint !== inputMint) {
                        outputMint = post.mint;
                        break;
                    }
                }
            }

            if (inputMint === outputMint) {
                console.log(`Warning: Same input/output token detected: ${inputMint}`);
                return { inputMint: undefined, outputMint: undefined };
            }

            return {
                status: tx.meta.err ? 'error' : 'success',
                inputMint,
                outputMint,
                inputAmount: preBalances.length > 0 ? Number(preBalances[0].uiTokenAmount.uiAmount) : 0,
                outputAmount: postBalances.length > 0 ? Number(postBalances[0].uiTokenAmount.uiAmount) : 0,
                fee: tx.meta.fee / 1e9,
                timestamp: tx.blockTime,
                signature: txHash
            };
        } catch (error) {
            console.error('Error analyzing transaction:', error);
            return { inputMint: undefined, outputMint: undefined };
        }
    }

    async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
        try {
            // Check cache first
            const cachedInfo = await this.solanaCacheService.getTokenInfo(tokenAddress);
            if (cachedInfo) {
                return cachedInfo;
            }

            // If not in cache, fetch from Jupiter API
            const response = await axios.get(`https://token.jup.ag/strict`);
            const tokenList = response.data;
            const tokenInfo = tokenList.find(token => token.address === tokenAddress);

            if (tokenInfo) {
                // Cache the result
                await this.solanaCacheService.setTokenInfo(tokenAddress, tokenInfo);
                return tokenInfo;
            }

            // If not found in Jupiter, try other sources
            const tokenInfoFromRegistry = await this.getTokenInfoFromRegistry(tokenAddress);
            if (tokenInfoFromRegistry) {
                await this.solanaCacheService.setTokenInfo(tokenAddress, tokenInfoFromRegistry);
                return tokenInfoFromRegistry;
            }

            // Return default info if not found anywhere
            return {
                name: 'Unknown Token',
                symbol: 'UNKNOWN',
                decimals: 9,
                logoURI: null,
                address: tokenAddress,
                verified: false
            };
        } catch (error) {
            this.logger.error(`Error getting token info: ${error.message}`, error.stack);
            throw error;
        }
    }


    private async getTokenInfoFromRegistry(tokenAddress: string): Promise<TokenInfo | null> {
        try {
            const response = await axios.get(`https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json`);
            const tokenList = response.data.tokens;
            const tokenInfo = tokenList.find(token => token.address === tokenAddress);
            return tokenInfo || null;
        } catch (error) {
            this.logger.warn(`Failed to get token info from registry: ${error.message}`);
            return null;
        }
    }

    async swapTokenOnSolana(privateKey: string, fromToken: string, toToken: string, amount: number, slippage: number, options: any = {}): Promise<SwapResult> {
        try {
            // Kiểm tra nếu useDex được chỉ định cụ thể, sử dụng DEX đó
            if (options.useDex) {
                console.log(`>>> Using specified DEX: ${options.useDex}`);

                // Gọi trực tiếp dịch vụ tương ứng với DEX đã chỉ định
                if (options.useDex === 'pumpfun') {
                    return await this.smartRouteSolanaService.swapWithPumpFun(
                        privateKey,
                        fromToken,
                        toToken,
                        amount,
                        slippage,
                        options
                    );
                } else if (options.useDex === 'raydium') {
                    return await this.smartRouteSolanaService.swapWithRaydium(
                        privateKey,
                        fromToken,
                        toToken,
                        amount,
                        slippage,
                        options
                    );
                } else if (options.useDex === 'jupiter') {
                    return await this.smartRouteSolanaService.swapWithJupiter(
                        privateKey,
                        fromToken,
                        toToken,
                        amount,
                        slippage,
                        options
                    );
                }
                // Nếu useDex không hợp lệ, tiếp tục với logic hiện tại
                console.log(`>>> Invalid useDex value: ${options.useDex}, falling back to automatic selection`);
            }

            // Xác định token cần kiểm tra (không phải SOL)
            const tokenToCheck = fromToken === 'So11111111111111111111111111111111111111112' ? toToken : fromToken;

            // Kiểm tra xem token có phải là meme coin hoặc token thanh khoản thấp không
            const isMemeToken = await this.isMemeCoin(tokenToCheck);
            const liquidityInfo = await this.checkTokenLiquidity(tokenToCheck);
            const isLowLiquidityToken = liquidityInfo.liquidityUsd < 50000;

            // Lệnh bán tất cả các meme coin hoặc token thanh khoản thấp nên ưu tiên sử dụng PumpFun
            if ((isMemeToken || isLowLiquidityToken) && options.force_sell_all &&
                fromToken !== 'So11111111111111111111111111111111111111112') {
                console.log(`>>> Using PumpFun for force selling all tokens (${tokenToCheck})`);
                return await this.smartRouteSolanaService.swapWithPumpFun(
                    privateKey,
                    fromToken,
                    toToken,
                    amount,
                    slippage,
                    {
                        ...options,
                        force_sell_all: true,
                        priorityFee: 0.00002 // Tăng phí ưu tiên để đảm bảo giao dịch được xử lý nhanh
                    }
                );
            }

            // Kiểm tra xem có phải là token PumpFun không
            const isPumpFunToken = await this.isPumpFunToken(tokenToCheck);
            if (isPumpFunToken) {
                console.log(`>>> Token ${tokenToCheck} is a PumpFun token, using PumpFun for swap`);
                try {
                    return await this.smartRouteSolanaService.swapWithPumpFun(
                        privateKey,
                        fromToken,
                        toToken,
                        amount,
                        slippage,
                        options
                    );
                } catch (error) {
                    const errMsg = error.message?.toLowerCase() || '';
                    if (
                        errMsg.includes('boiling curve') ||
                        errMsg.includes('bonding curve') ||
                        errMsg.includes('graduated') ||
                        errMsg.includes('not found curve')
                    ) {
                        try {
                            console.log('>>> Trying PumpFun DEX fallback for graduated token...');
                            return await this.smartRouteSolanaService.swapWithPumpFunDex(
                                privateKey,
                                fromToken,
                                toToken,
                                amount,
                                slippage,
                                options
                            );
                        } catch (dexError) {
                            // Kiểm tra lỗi pool không tồn tại
                            if (dexError.message?.includes('NoPoolFound') ||
                                dexError.message?.includes('Không tìm thấy pool') ||
                                dexError.message?.includes('Pool không tồn tại')) {
                                console.log('>>> PumpFun DEX không có pool cho token này, chuyển sang Jupiter');
                            } else {
                                console.error('>>> PumpFun DEX swap failed:', dexError.message);
                            }

                            // Thử Jupiter như một phương án cuối cùng
                            return await this.smartRouteSolanaService.swapWithJupiter(
                                privateKey,
                                fromToken,
                                toToken,
                                amount,
                                slippage,
                                options
                            );
                        }
                    } else {
                        // Nếu lỗi khác, thử Jupiter như cũ
                        return await this.smartRouteSolanaService.swapWithJupiter(
                            privateKey,
                            fromToken,
                            toToken,
                            amount,
                            slippage,
                            options
                        );
                    }
                }
            } else {
                // Kiểm tra xem token có phải là meme coin không
                const isMemeCoin = await this.isMemeCoin(tokenToCheck);
                console.log(`>>> Token ${tokenToCheck} is ${isMemeCoin ? 'a meme coin' : 'not a meme coin'}`);

                // Nếu là meme coin, ưu tiên PumpFun
                if (isMemeCoin) {
                    console.log(`>>> Using PumpFun for meme coin ${tokenToCheck}`);
                    try {
                        return await this.smartRouteSolanaService.swapWithPumpFun(
                            privateKey,
                            fromToken,
                            toToken,
                            amount,
                            slippage,
                            options
                        );
                    } catch (error) {
                        const errMsg = error.message?.toLowerCase() || '';
                        if (
                            errMsg.includes('boiling curve') ||
                            errMsg.includes('bonding curve') ||
                            errMsg.includes('graduated') ||
                            errMsg.includes('not found curve')
                        ) {
                            try {
                                console.log('>>> Trying PumpFun DEX fallback for graduated token...');
                                return await this.smartRouteSolanaService.swapWithPumpFunDex(
                                    privateKey,
                                    fromToken,
                                    toToken,
                                    amount,
                                    slippage,
                                    options
                                );
                            } catch (dexError) {
                                // Kiểm tra lỗi pool không tồn tại
                                if (dexError.message?.includes('NoPoolFound') ||
                                    dexError.message?.includes('Không tìm thấy pool') ||
                                    dexError.message?.includes('Pool không tồn tại')) {
                                    console.log('>>> PumpFun DEX không có pool cho token này, chuyển sang Jupiter');
                                } else {
                                    console.error('>>> PumpFun DEX swap failed:', dexError.message);
                                }

                                // Thử Jupiter như một phương án cuối cùng
                                return await this.smartRouteSolanaService.swapWithJupiter(
                                    privateKey,
                                    fromToken,
                                    toToken,
                                    amount,
                                    slippage,
                                    options
                                );
                            }
                        } else {
                            // Nếu lỗi khác, thử Jupiter như cũ
                            return await this.smartRouteSolanaService.swapWithJupiter(
                                privateKey,
                                fromToken,
                                toToken,
                                amount,
                                slippage,
                                options
                            );
                        }
                    }
                }
            }

            // Nếu không phải meme coin, thử Raydium và Jupiter với tăng phí dần
            console.log(`>>> Using optimized strategy for non-meme coin ${tokenToCheck}`);

            // Thử Raydium trước với 3 mức phí
            const priorityFeeBase = options.priorityFee || 0.000005;
            const priorityFees = [
                priorityFeeBase,
                priorityFeeBase * 2,
                priorityFeeBase * 4
            ];

            // Thử Raydium với 3 mức phí
            for (let i = 0; i < priorityFees.length; i++) {
                try {
                    console.log(`>>> Trying Raydium with priority fee ${priorityFees[i]} (attempt ${i + 1}/3)`);
                    return await this.smartRouteSolanaService.swapWithRaydium(
                        privateKey,
                        fromToken,
                        toToken,
                        amount,
                        slippage,
                        { ...options, priorityFee: priorityFees[i] }
                    );
                } catch (error) {
                    console.error(`>>> Raydium swap failed (attempt ${i + 1}/3): ${error.message}`);
                    // Đợi một chút trước khi thử lại
                    if (i < priorityFees.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }

            // Nếu Raydium thất bại, thử Jupiter với 3 mức phí
            for (let i = 0; i < priorityFees.length; i++) {
                try {
                    console.log(`>>> Trying Jupiter with priority fee ${priorityFees[i]} (attempt ${i + 1}/3)`);
                    return await this.smartRouteSolanaService.swapWithJupiter(
                        privateKey,
                        fromToken,
                        toToken,
                        amount,
                        slippage,
                        { ...options, priorityFee: priorityFees[i] }
                    );
                } catch (error) {
                    console.error(`>>> Jupiter swap failed (attempt ${i + 1}/3): ${error.message}`);
                    // Đợi một chút trước khi thử lại
                    if (i < priorityFees.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }

            // Nếu cả Raydium và Jupiter đều thất bại, thử PumpFun như phương án cuối cùng
            console.log(`>>> All Raydium and Jupiter attempts failed, trying PumpFun as last resort`);
            return await this.smartRouteSolanaService.swapWithPumpFun(
                privateKey,
                fromToken,
                toToken,
                amount,
                slippage,
                options
            );
        } catch (error) {
            console.error(`>>> All swap attempts failed: ${error.message}`);
            throw error;
        }
    }

    async executeTrade({ tokenAddress, quantity, price, tradeType, privateKey }: {
        tokenAddress: string,
        quantity: number,
        price: number,
        tradeType: 'buy' | 'sell',
        privateKey: string
    }) {
        try {
            const { data } = await axios.get(`${API_URLS.SWAP_HOST}/price`, {
                params: {
                    inputMint: tokenAddress,
                    outputMint: this.SOL_MINT,
                    amount: (quantity * price * 1e9).toString()
                }
            });

            const { data: jupiterQuote } = await axios.get('https://api.jup.ag/price/v2', {
                params: {
                    ids: [tokenAddress]
                }
            });

            const bestRoute = this.getBestRoute(data.data, jupiterQuote.data[tokenAddress]);

            const txResult = await this.smartRouteSolanaService.smartSwap(
                privateKey,
                tokenAddress,
                this.SOL_MINT,
                quantity * price,
                bestRoute.priceImpact,
                {
                    isForMaster: true,
                    autoAdjustAmount: true,
                    maxRetries: 3,
                    tryIndirectRoutes: true
                }
            );

            return {
                success: true,
                txId: txResult,
                executedPrice: bestRoute.price,
                route: bestRoute.source
            };
        } catch (error) {
            console.error('Trade execution failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    private getBestRoute(raydiumQuote: any, jupiterQuote: any) {
        if (!raydiumQuote && !jupiterQuote) {
            throw new Error('No available routes for trade');
        }

        if (!raydiumQuote) return jupiterQuote;
        if (!jupiterQuote) return raydiumQuote;

        // Chọn route có price impact thấp hơn
        return raydiumQuote.priceImpact < jupiterQuote.priceImpact
            ? raydiumQuote
            : jupiterQuote;
    }

    async getPriceHistory(tokenAddress: string, interval: string): Promise<number[]> {
        try {
            // Implement price history fetching logic here
            // For example, from your price feed service or external API
            const prices = await this.fetchPriceHistory(tokenAddress, interval);
            return prices;
        } catch (error) {
            console.error('Error fetching price history:', error);
            return [];
        }
    }

    private async fetchPriceHistory(tokenAddress: string, interval: string): Promise<number[]> {
        // Mock implementation - replace with actual price fetching logic
        return [100, 101, 99, 102, 101]; // Last 5 prices
    }

    // Thêm phương thức public để convert IPFS URL
    public convertIPFSUrlPublic(url: string): string {
        if (!url) return url;
        return url.replace('https://cf-ipfs.com/ipfs/', 'https://ipfs.io/ipfs/');
    }

    // Thêm hàm helper để convert IPFS URL
    private convertIPFSUrl(url: string): string {
        if (!url) return url;
        return url.replace('https://cf-ipfs.com/ipfs/', 'https://ipfs.io/ipfs/');
    }

    async fetchAndSaveJupiterTokens(isUpdate: boolean = true) {
        try {
            const { data: jupiterTokens } = await axios.get('https://token.jup.ag/all');
            let processedCount = 0;

            for (const token of jupiterTokens) {
                try {
                    // Convert IPFS URL nếu cần
                    const logoUrl = this.convertIPFSUrl(token.logoURI);

                    // Kiểm tra token có hợp lệ không
                    const isInvalidToken = !token.name?.trim() ||
                        !token.symbol?.trim() ||
                        !logoUrl?.trim();

                    // Kiểm tra token đã tồn tại chưa
                    const existingToken = await this.solanaTokenRepository.findOne({
                        where: { slt_address: token.address }
                    });

                    if (existingToken) {
                        // Nếu token đã tồn tại và isUpdate = false thì bỏ qua
                        if (!isUpdate) {
                            continue;
                        }

                        // Nếu token không hợp lệ thì xóa khỏi database
                        if (isInvalidToken) {
                            await this.solanaTokenRepository.delete(existingToken.slt_id);
                            continue;
                        }

                        // Nếu token hợp lệ thì cập nhật thông tin
                        const tokenData = {
                            slt_name: token.name.trim(),
                            slt_symbol: token.symbol.trim(),
                            slt_decimals: token.decimals,
                            slt_logo_url: logoUrl.trim(),
                            slt_coingecko_id: token.extensions?.coingeckoId || null,
                            slt_is_verified: true,
                        };

                        await this.solanaTokenRepository.update(
                            { slt_id: existingToken.slt_id },
                            tokenData
                        );
                    } else {
                        // Nếu token chưa tồn tại và không hợp lệ thì bỏ qua
                        if (isInvalidToken) {
                            continue;
                        }

                        // Nếu token hợp lệ thì thêm mới
                        await this.solanaTokenRepository.save({
                            slt_name: token.name.trim(),
                            slt_symbol: token.symbol.trim(),
                            slt_address: token.address,
                            slt_decimals: token.decimals,
                            slt_logo_url: logoUrl.trim(),
                            slt_coingecko_id: token.extensions?.coingeckoId || null,
                            slt_is_verified: true,
                        });
                    }

                    processedCount++;
                } catch (tokenError) {
                    console.error(`Error processing token ${token.address}:`, tokenError);
                }
            }

            return {
                success: true,
                message: `Successfully processed ${processedCount} tokens`,
                totalTokens: jupiterTokens.length
            };

        } catch (error) {
            console.error('Error fetching and saving Jupiter tokens:', error);
            throw new Error(`Failed to fetch and save Jupiter tokens: ${error.message}`);
        }
    }

    async fetchAndSaveRaydiumPools(isUpdate: boolean = true) {
        try {
            this.logger.log('Fetching Raydium pools...');

            const response = await axios.get('https://api.raydium.io/v2/ammV3/ammPools');
            const pools = response.data.data;

            // Prepare batch insert data
            const poolsToInsert: RaydiumPool[] = pools.map(pool => ({
                slp_pool_id: pool.id,
                slp_mint_program_id_a: pool.mintProgramIdA,
                slp_mint_program_id_b: pool.mintProgramIdB,
                slp_mint_a: pool.mintA,
                slp_mint_b: pool.mintB,
                slp_vault_a: pool.vaultA,
                slp_vault_b: pool.vaultB,
                slp_mint_decimals_a: pool.mintDecimalsA,
                slp_mint_decimals_b: pool.mintDecimalsB,
                slp_config_id: pool.ammConfig.id,
                slp_config_index: pool.ammConfig.index,
                slp_config_protocol_fee_rate: pool.ammConfig.protocolFeeRate,
                slp_config_trade_fee_rate: pool.ammConfig.tradeFeeRate,
                slp_config_tick_spacing: pool.ammConfig.tickSpacing,
                slp_config_fund_fee_rate: pool.ammConfig.fundFeeRate,
                slp_source: 'raydium',
                created_at: new Date(),
                updated_at: new Date()
            }));

            let insertedCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;

            // Xử lý từng pool một
            for (const poolData of poolsToInsert) {
                // Kiểm tra xem pool đã tồn tại chưa
                const existingPool = await this.solanaListPoolRepository.findOne({
                    where: { slp_pool_id: poolData.slp_pool_id }
                });

                if (existingPool) {
                    // Nếu pool đã tồn tại
                    if (isUpdate) {
                        // Nếu isUpdate = true thì cập nhật thông tin
                        await this.solanaListPoolRepository.update(
                            { slp_id: existingPool.slp_id },
                            {
                                slp_mint_program_id_a: poolData.slp_mint_program_id_a,
                                slp_mint_program_id_b: poolData.slp_mint_program_id_b,
                                slp_mint_a: poolData.slp_mint_a,
                                slp_mint_b: poolData.slp_mint_b,
                                slp_vault_a: poolData.slp_vault_a,
                                slp_vault_b: poolData.slp_vault_b,
                                slp_mint_decimals_a: poolData.slp_mint_decimals_a,
                                slp_mint_decimals_b: poolData.slp_mint_decimals_b,
                                slp_config_id: poolData.slp_config_id,
                                slp_config_index: poolData.slp_config_index,
                                slp_config_protocol_fee_rate: poolData.slp_config_protocol_fee_rate,
                                slp_config_trade_fee_rate: poolData.slp_config_trade_fee_rate,
                                slp_config_tick_spacing: poolData.slp_config_tick_spacing,
                                slp_config_fund_fee_rate: poolData.slp_config_fund_fee_rate,
                                slp_source: poolData.slp_source,
                                updated_at: new Date()
                            }
                        );
                        updatedCount++;
                    } else {
                        // Nếu isUpdate = false thì bỏ qua
                        skippedCount++;
                    }
                } else {
                    // Nếu pool chưa tồn tại thì tạo mới
                    await this.solanaListPoolRepository.save(poolData);
                    insertedCount++;
                }

                // Log tiến trình sau mỗi 100 pools
                if ((insertedCount + updatedCount + skippedCount) % 100 === 0) {
                    this.logger.log(`Processed ${insertedCount + updatedCount + skippedCount}/${poolsToInsert.length} pools`);
                }
            }

            this.logger.log(`Completed processing ${poolsToInsert.length} Raydium pools:`);
            this.logger.log(`- Inserted: ${insertedCount}`);
            this.logger.log(`- Updated: ${updatedCount}`);
            this.logger.log(`- Skipped: ${skippedCount}`);

            return true;
        } catch (error) {
            this.logger.error('Error fetching Raydium pools:', error);
            throw new Error('Failed to fetch and save Raydium pools');
        }
    }

    async checkTransactionStatus(txHash: string): Promise<'confirmed' | 'finalized' | 'failed' | 'pending'> {
        try {
            // Kiểm tra cache trước
            const cachedStatus = await this.cacheService.get(`tx_status:${txHash}`);
            if (cachedStatus) {
                return cachedStatus as 'confirmed' | 'finalized' | 'failed' | 'pending';
            }

            // Đăng ký theo dõi trạng thái giao dịch qua WebSocket
            await this.solanaWebSocketService.trackTransactionStatus(txHash);

            // Lấy trạng thái hiện tại qua RPC (chỉ lần đầu)
            const connection = this.getConnection();
            const signature = await connection.getSignatureStatus(txHash, {
                searchTransactionHistory: true
            });

            let status: 'confirmed' | 'finalized' | 'failed' | 'pending' = 'pending';

            if (!signature || !signature.value) {
                status = 'pending';
            } else if (signature.value.err) {
                status = 'failed';
            } else if (signature.value.confirmationStatus === 'confirmed') {
                status = 'confirmed';
            } else if (signature.value.confirmationStatus === 'finalized') {
                status = 'finalized';
            }

            // Lưu vào cache
            await this.cacheService.set(`tx_status:${txHash}`, status, 300);

            return status;
        } catch (error) {
            console.error('Error checking transaction status:', error);
            return 'pending';
        }
    }

    async trackTokenPrice(tokenMint: string) {
        try {
            // Lấy thông tin pool chứa token này
            const pools = await this.solanaListPoolRepository.find({
                where: [
                    { slp_mint_a: tokenMint },
                    { slp_mint_b: tokenMint }
                ],
                take: 5
            });

            if (pools.length > 0) {
                // Theo dõi các pool chính để cập nhật giá
                for (const pool of pools) {
                    await this.solanaWebSocketService.trackAccountChanges(new PublicKey(pool.slp_pool_id));
                }

                // Lắng nghe sự kiện thay đổi pool để cập nhật cache
                this.eventEmitter.on('account.changed', async (data) => {
                    if (pools.some(p => p.slp_pool_id === data.account)) {
                        // Cập nhật giá token
                        try {
                            const price = await this.getTokenPrice(tokenMint);
                            await this.cacheService.set(`token_price:${tokenMint}`, price.toString(), 30);
                        } catch (error) {
                            console.error(`Error updating token price for ${tokenMint}:`, error);
                        }
                    }
                });
            }

            return true;
        } catch (error) {
            console.error(`Error tracking token price for ${tokenMint}:`, error);
            return false;
        }
    }

    async getPoolsForToken(tokenAddress: string) {
        // Tìm các pool chứa token này
        return this.solanaListPoolRepository.find({
            where: [
                { slp_mint_a: tokenAddress },
                { slp_mint_b: tokenAddress }
            ],
            take: 5 // Giới hạn số lượng pool để tránh quá tải
        });
    }

    getWebSocketService() {
        return this.solanaWebSocketService;
    }

    // Thêm phương thức proxy
    async trackAccountChanges(publicKey: PublicKey) {
        return this.solanaWebSocketService.trackAccountChanges(publicKey);
    }

    async getTransaction(signature: string) {
        try {
            const transaction = await this.connection.getTransaction(signature, {
                maxSupportedTransactionVersion: 0
            });
            return transaction;
        } catch (error) {
            this.logger.error(`Error getting transaction ${signature}:`, error);
            return null;
        }
    }

    private async getReceivedAmountFromTransaction(
        signature: string,
        tokenAddress: string
    ): Promise<number | null> {
        try {
            // Lấy thông tin transaction từ blockchain
            const rpcUrl = this.configService.get('SOLANA_RPC_URL');
            if (!rpcUrl) {
                throw new Error('SOLANA_RPC_URL is not defined in configuration');
            }
            const connection = new Connection(rpcUrl);
            const transaction = await connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });

            if (!transaction) {
                return null;
            }

            // Phân tích transaction để lấy số lượng token nhận được
            // Logic phân tích sẽ phụ thuộc vào cấu trúc của transaction
            // và DEX được sử dụng

            // Đây chỉ là ví dụ, cần điều chỉnh theo cấu trúc thực tế
            const postTokenBalances = transaction.meta?.postTokenBalances || [];
            const preTokenBalances = transaction.meta?.preTokenBalances || [];

            // Tìm balance của token đích
            const postBalance = postTokenBalances.find(
                balance => balance.mint === tokenAddress
            );

            const preBalance = preTokenBalances.find(
                balance => balance.mint === tokenAddress
            );

            if (postBalance && preBalance) {
                const diff = (postBalance.uiTokenAmount.uiAmount || 0) -
                    (preBalance.uiTokenAmount.uiAmount || 0);
                return diff > 0 ? diff : null;
            }

            return null;
        } catch (error) {
            console.error('Error parsing transaction:', error);
            return null;
        }
    }

    // Thêm phương thức kiểm tra token có thể giao dịch không
    async isTokenTradable(tokenAddress: string): Promise<boolean> {
        try {
            // Kiểm tra token có trong pool nào không
            const pools = await this.solanaListPoolRepository.find({
                where: [
                    { slp_mint_a: tokenAddress },
                    { slp_mint_b: tokenAddress }
                ],
                take: 1
            });

            return pools.length > 0;
        } catch (error) {
            console.error('Error checking token tradability:', error);
            return false;
        }
    }

    // Thêm phương thức lấy giá token so với SOL
    async getTokenPriceInSol(tokenAddress: string): Promise<number | null> {
        try {
            // Kiểm tra cache trước
            const cacheKey = `token_price_sol:${tokenAddress}`;
            const cachedPrice = await this.cacheService.get(cacheKey);
            if (cachedPrice) {
                return parseFloat(cachedPrice as string);
            }

            // Nếu là SOL, giá = 1
            if (tokenAddress === 'So11111111111111111111111111111111111111112') {
                return 1;
            }

            // Phương pháp 1: Sử dụng pool trực tiếp
            // Tìm pool SOL-TOKEN
            const pool = await this.solanaListPoolRepository.findOne({
                where: [
                    { slp_mint_a: tokenAddress, slp_mint_b: 'So11111111111111111111111111111111111111112' },
                    { slp_mint_a: 'So11111111111111111111111111111111111111112', slp_mint_b: tokenAddress }
                ]
            });

            if (pool) {
                console.log(`Found pool for ${tokenAddress} but cannot calculate price directly. Using alternative methods.`);
            }

            // Phương pháp 2: Sử dụng giá USD
            const tokenPriceInUsd = await this.getTokenPrice(tokenAddress);
            const solPriceInUsd = await this.getTokenPrice('So11111111111111111111111111111111111111112');

            if (tokenPriceInUsd && solPriceInUsd && solPriceInUsd > 0) {
                const priceInSol = tokenPriceInUsd / solPriceInUsd;

                // Lưu vào cache
                await this.cacheService.set(cacheKey, priceInSol.toString(), 300); // 5 phút
                return priceInSol;
            }

            // Phương pháp 3: Sử dụng Jupiter để lấy tỷ giá
            try {
                const routes = await this.smartRouteSolanaService.getJupiterRoutes({
                    inputMint: new PublicKey(tokenAddress),
                    outputMint: new PublicKey('So11111111111111111111111111111111111111112'),
                    amount: JSBI.BigInt(1e9), // 1 token
                    slippageBps: 100,
                    onlyDirectRoutes: false
                });

                if (routes && routes.routesInfos.length > 0) {
                    const bestRoute = routes.routesInfos[0];
                    const priceInSol = Number(bestRoute.outAmount) / 1e9;

                    // Lưu vào cache
                    await this.cacheService.set(cacheKey, priceInSol.toString(), 300);
                    return priceInSol;
                }
            } catch (error) {
                console.error('Error getting price from Jupiter:', error);
            }

            return null;
        } catch (error) {
            console.error('Error getting token price in SOL:', error);
            return null;
        }
    }

    // Thêm phương thức để kiểm tra xem token có phải là meme coin không
    async isMemeCoin(tokenAddress: string): Promise<boolean> {
        try {
            // Lấy thông tin token từ database
            const token = await this.solanaTokenRepository.findOne({
                where: { slt_address: tokenAddress }
            });

            if (!token) {
                return false;
            }

            // 1. Kiểm tra tên và symbol của token
            const memeKeywords = [
                'pepe', 'doge', 'shib', 'inu', 'elon', 'moon',
                'wojak', 'bonk', 'cat', 'chad', 'ape', 'monkey',
                'meme', 'pump', 'dump', 'safe', 'baby', 'rocket',
                'cum', 'shit', 'poo', 'cock', 'balls'
            ];

            const tokenName = token.slt_name?.toLowerCase() || '';
            const tokenSymbol = token.slt_symbol?.toLowerCase() || '';

            // Nếu tên hoặc symbol chứa từ khóa meme
            if (memeKeywords.some(keyword =>
                tokenName.includes(keyword) ||
                tokenSymbol.includes(keyword)
            )) {
                return true;
            }

            // 2. Kiểm tra category của token
            const tokenCategories = await this.solanaTokenJoinCategoryRepository.find({
                where: { stjc_token_id: token.slt_id },
                relations: ['category']
            });

            // Nếu token thuộc category meme
            if (tokenCategories.some(tc =>
                tc.category?.slct_name?.toLowerCase().includes('meme') ||
                tc.category?.slct_slug?.toLowerCase().includes('meme')
            )) {
                return true;
            }

            // 3. Kiểm tra thanh khoản
            const { liquidityUsd } = await this.checkTokenLiquidity(tokenAddress);
            if (liquidityUsd < 50000) { // Thanh khoản thấp (dưới $50k) thường là dấu hiệu của meme coin
                return true;
            }

            return false;

        } catch (error) {
            this.logger.error(`Error checking meme coin status for ${tokenAddress}:`, error);
            return false;
        }
    }

    // Kiểm tra thanh khoản của token
    async checkTokenLiquidity(tokenAddress: string): Promise<{ liquidityUsd: number, hasPools: boolean }> {
        try {
            // Kiểm tra cache
            const cacheKey = `token_liquidity:${tokenAddress}`;
            const cachedResult = await this.cacheService.get(cacheKey);
            if (cachedResult) {
                return JSON.parse(cachedResult as string);
            }

            // Tìm các pool chứa token này
            const pools = await this.solanaListPoolRepository.find({
                where: [
                    { slp_mint_a: tokenAddress },
                    { slp_mint_b: tokenAddress }
                ]
            });

            if (!pools || pools.length === 0) {
                const result = { liquidityUsd: 0, hasPools: false };
                await this.cacheService.set(cacheKey, JSON.stringify(result), 1800); // 30 phút
                return result;
            }

            // Tính tổng thanh khoản
            let totalLiquidityUsd = 0;

            for (const pool of pools) {
                // Lấy giá token trong USD
                let tokenPrice = 0;

                if (pool.slp_mint_a === tokenAddress) {
                    tokenPrice = await this.getTokenPrice(tokenAddress);
                    if (tokenPrice && pool.slp_reserve_a) {
                        totalLiquidityUsd += tokenPrice * pool.slp_reserve_a * 2; // x2 vì pool có cả 2 bên
                    }
                } else {
                    tokenPrice = await this.getTokenPrice(tokenAddress);
                    if (tokenPrice && pool.slp_reserve_b) {
                        totalLiquidityUsd += tokenPrice * pool.slp_reserve_b * 2;
                    }
                }
            }

            const result = {
                liquidityUsd: totalLiquidityUsd,
                hasPools: pools.length > 0
            };

            await this.cacheService.set(cacheKey, JSON.stringify(result), 1800); // 30 phút
            return result;
        } catch (error) {
            console.error(`Error checking liquidity for token ${tokenAddress}:`, error);
            return { liquidityUsd: 0, hasPools: false };
        }
    }

    // Kiểm tra token có trên PumpFun không
    async isPumpFunToken(tokenAddress: string): Promise<boolean> {
        try {
            // Kiểm tra cache
            const cacheKey = `is_pumpfun_token:${tokenAddress}`;
            const cachedResult = await this.cacheService.get(cacheKey);
            if (cachedResult !== null) {
                return cachedResult === 'true';
            }

            // Kiểm tra token address có chứa "pump" không
            if (tokenAddress.toLowerCase().includes('pump')) {
                await this.cacheService.set(cacheKey, 'true', 86400); // 24 giờ
                return true;
            }

            // Thử gọi API của PumpFun để kiểm tra token
            try {
                const pumpPortalUrl = this.configService.get<string>('PUMP_PORTAL_API_URL', 'https://pumpportal.fun/api');
                const response = await fetch(`${pumpPortalUrl}/token-info?mint=${tokenAddress}`);

                if (response.ok) {
                    const data = await response.json();
                    const isPumpFunToken = !!data.token;
                    await this.cacheService.set(cacheKey, isPumpFunToken.toString(), 86400); // 24 giờ
                    return isPumpFunToken;
                }
            } catch (error) {
                console.error(`Error checking if ${tokenAddress} is a PumpFun token:`, error);
            }

            // Mặc định không phải token PumpFun
            await this.cacheService.set(cacheKey, 'false', 3600); // 1 giờ
            return false;
        } catch (error) {
            console.error(`Error checking if ${tokenAddress} is a PumpFun token:`, error);
            return false;
        }
    }

    private async generateDeterministicPumpAddress(seed: string): Promise<{ keypair: Keypair; address: string } | null> {
        try {
            // Create a deterministic seed from the input
            const seedBuffer = Buffer.from(seed);
            const hash = await crypto.subtle.digest('SHA-256', seedBuffer);
            const hashArray = new Uint8Array(hash);

            // Use the hash to create a keypair
            const keypair = Keypair.fromSeed(hashArray.slice(0, 32));
            const address = keypair.publicKey.toBase58();

            // Check if address ends with 'pump'
            if (address.endsWith('pump') && address.length === 44) {
                return { keypair, address };
            }

            return null;
        } catch (error) {
            this.logger.error(`Error generating deterministic address: ${error.message}`);
            return null;
        }
    }

    async createTokenPumpfun(
        privateKey: string,
        publicKey: string,
        tokenData: {
            name: string;
            symbol: string;
            description?: string;
            twitter?: string;
            telegram?: string;
            website?: string;
            showName?: boolean;
            amount?: number;
            slippage?: number;
            priorityFee?: number;
        },
        imageFile?: any,
        wallet_id?: number,
        category_list?: number[]
    ) {
        try {
            // Validate public key
            if (!publicKey || !publicKey.trim()) {
                return {
                    status: 400,
                    message: 'Public key is required'
                };
            }

            // Validate public key format
            try {
                new PublicKey(publicKey);
            } catch (error) {
                return {
                    status: 400,
                    message: 'Invalid public key format'
                };
            }

            // Check SOL balance before proceeding
            const balance = await this.getBalance(publicKey);
            const requiredBalance = 0.025; // Reduced minimum required SOL balance
            if (balance < requiredBalance) {
                return {
                    status: 400,
                    message: `Insufficient SOL balance. Required: ${requiredBalance} SOL, Current: ${balance} SOL. This amount covers token creation, metadata storage, and transaction fees.`
                };
            }

            // Generate a random keypair for the token mint
            const mintKeypair = Keypair.generate();
            const mintAddress = mintKeypair.publicKey.toBase58();

            // Set default values if not provided
            const slippage = tokenData.slippage || 10;
            const priorityFee = tokenData.priorityFee || 0.0005;
            const showName = tokenData.showName !== undefined ? tokenData.showName : true;
            const amount = tokenData.amount || 0;

            // Create FormData for uploading token metadata
            const formData = new FormData();

            // If image file is provided, add it to the form data
            if (imageFile) {
                // Append the file buffer directly to FormData with proper options
                formData.append("file", imageFile.buffer, {
                    filename: imageFile.originalname,
                    contentType: imageFile.mimetype,
                    knownLength: imageFile.buffer.length
                });
            } else {
                return {
                    status: 400,
                    message: 'Token image is required',
                };
            }

            // Add other metadata
            formData.append("name", tokenData.name);
            formData.append("symbol", tokenData.symbol);
            formData.append("description", tokenData.description || `${tokenData.name} token on Solana`);

            if (tokenData.twitter) {
                formData.append("twitter", tokenData.twitter);
            }

            if (tokenData.telegram) {
                formData.append("telegram", tokenData.telegram);
            }

            if (tokenData.website) {
                formData.append("website", tokenData.website);
            }

            formData.append("showName", showName.toString());

            // Create IPFS metadata storage using axios instead of fetch
            const metadataResponse = await axios.post("https://pump.fun/api/ipfs", formData, {
                headers: {
                    ...formData.getHeaders(),
                },
            });

            if (metadataResponse.status !== 200 || !metadataResponse.data) {
                return {
                    status: metadataResponse.status,
                    message: `Error creating IPFS metadata: ${metadataResponse.statusText}`,
                };
            }

            const metadataResponseJSON = metadataResponse.data;

            // Get the create transaction
            const response = await axios.post(`https://pumpportal.fun/api/trade-local`, {
                "publicKey": publicKey.trim(),
                "action": "create",
                "tokenMetadata": {
                    name: metadataResponseJSON.metadata.name,
                    symbol: metadataResponseJSON.metadata.symbol,
                    uri: metadataResponseJSON.metadataUri
                },
                "mint": mintAddress,
                "denominatedInSol": "true",
                "amount": amount,
                "slippage": slippage,
                "priorityFee": priorityFee,
                "pool": "pump"
            }, {
                headers: {
                    "Content-Type": "application/json"
                },
                responseType: 'arraybuffer'
            });

            if (response.status !== 200) {
                const errorMessage = response.statusText || 'Unknown error';

                // Check for specific error messages
                if (errorMessage.includes('insufficient funds')) {
                    return {
                        status: 400,
                        message: `Insufficient SOL balance for transaction. Please ensure you have enough SOL to cover the transaction fee.`,
                    };
                }

                return {
                    status: response.status,
                    message: `Error creating token: ${errorMessage}`,
                };
            }

            // Deserialize and sign the transaction
            const data = response.data;
            const tx = VersionedTransaction.deserialize(new Uint8Array(data));

            // Create keypair from private key
            const signerKeyPair = Keypair.fromSecretKey(bs58.decode(privateKey));

            // Sign the transaction
            tx.sign([mintKeypair, signerKeyPair]);

            // Get the latest blockhash before sending the transaction
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');

            // Send the transaction with blockhash and confirmation strategy
            const signature = await this.connection.sendTransaction(tx, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 5,
            });

            // Wait for transaction confirmation
            const confirmation = await this.connection.confirmTransaction({
                blockhash,
                lastValidBlockHeight,
                signature
            }, 'confirmed');

            if (confirmation.value.err) {
                this.logger.error(`Transaction confirmed with error: ${JSON.stringify(confirmation.value.err)}`);

                // Check for specific error types
                if (confirmation.value.err.toString().includes('insufficient funds')) {
                    return {
                        status: 400,
                        message: `Transaction failed: Insufficient SOL balance for transaction fee. Please ensure you have enough SOL.`,
                    };
                }

                return {
                    status: 500,
                    message: `Transaction confirmed with error: ${JSON.stringify(confirmation.value.err)}`,
                };
            }

            // Save token information to database if wallet_id is provided
            if (wallet_id) {
                try {
                    // Fetch metadata from IPFS URI and extract proper logo URL
                    let logoUrl = metadataResponseJSON.metadataUri;
                    let isVerified = false;

                    try {
                        // Fetch metadata JSON from the URI
                        const metadataResponse = await axios.get(metadataResponseJSON.metadataUri, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Accept': 'application/json, text/plain, */*'
                            },
                            timeout: 10000
                        });

                        if (metadataResponse.status === 200) {
                            const metadata = metadataResponse.data;
                            
                            // Extract the actual image URL from the metadata JSON
                            if (metadata && typeof metadata === 'object' && metadata.image) {
                                logoUrl = metadata.image;
                                this.logger.log(`Extracted logo URL from metadata: ${logoUrl}`);
                            } else {
                                this.logger.warn(`No image field found in metadata, using default: ${logoUrl}`);
                            }
                            
                            // Set verified if created on pump.fun
                            isVerified = metadata.createdOn === 'https://pump.fun';
                        }
                    } catch (error) {
                        this.logger.error(`Error fetching metadata from IPFS: ${error.message}`);
                        // Keep the original metadata URI as fallback
                    }

                    // Tạo giá trị market cap ngẫu nhiên từ 30-39
                    const randomMarketCap = Math.random() * 9 + 30;
                    
                    const tokenEntity = this.solanaTokenRepository.create({
                        slt_name: tokenData.name,
                        slt_symbol: tokenData.symbol,
                        slt_address: mintAddress,
                        slt_decimals: 9,
                        slt_logo_url: logoUrl,
                        slt_metadata_uri: metadataResponseJSON.metadataUri,
                        slt_description: tokenData.description || `${tokenData.name} token on Solana`,
                        slt_twitter: tokenData.twitter,
                        slt_telegram: tokenData.telegram,
                        slt_website: tokenData.website,
                        slt_transaction_hash: signature,
                        slt_wallet_id: wallet_id,
                        slt_program: TokenProgram.PUMPFUN,
                        slt_initial_liquidity: amount,
                        slt_is_verified: isVerified,
                        slt_create_check: true,
                        slt_market_cap: randomMarketCap
                    });

                    await this.solanaTokenRepository.save(tokenEntity);
                    this.logger.log(`Token saved to database with logo URL: ${logoUrl} and market cap: ${randomMarketCap.toFixed(2)}`);

                    // Tạo liên kết với categories nếu có
                    if (category_list && category_list.length > 0) {
                        try {
                            this.logger.log(`Creating category links for token: ${mintAddress}`);
                            this.logger.log(`Category list: ${JSON.stringify(category_list)}`);
                            
                            // Loại bỏ duplicate category_id
                            const uniqueCategoryIds = [...new Set(category_list)];
                            
                            // Tạo liên kết với các category
                            for (const categoryId of uniqueCategoryIds) {
                                this.logger.log(`Processing category ID: ${categoryId}`);
                                
                                // Kiểm tra category có tồn tại không
                                const category = await this.solanaListCategoriesTokenRepository.findOne({
                                    where: { slct_id: categoryId }
                                });

                                if (category) {
                                    this.logger.log(`Category found: ${category.slct_name}`);
                                    
                                    // Kiểm tra xem liên kết đã tồn tại chưa để tránh duplicate
                                    const existingJoin = await this.solanaTokenJoinCategoryRepository.findOne({
                                        where: {
                                            stjc_token_id: tokenEntity.slt_id,
                                            stjc_category_id: categoryId
                                        }
                                    });

                                    if (!existingJoin) {
                                        this.logger.log(`Creating new category link for token ${tokenEntity.slt_id} and category ${categoryId}`);
                                        
                                        // Tạo liên kết mới
                                        const joinCategory = this.solanaTokenJoinCategoryRepository.create({
                                            stjc_token_id: tokenEntity.slt_id,
                                            stjc_category_id: categoryId,
                                            stjc_status: JoinCategoryStatus.ON
                                        });
                                        await this.solanaTokenJoinCategoryRepository.save(joinCategory);
                                        this.logger.log(`Category link created successfully`);
                                    } else {
                                        this.logger.log(`Category link already exists for token ${tokenEntity.slt_id} and category ${categoryId}`);
                                    }
                                } else {
                                    this.logger.warn(`Category with ID ${categoryId} not found`);
                                }
                            }
                        } catch (error) {
                            this.logger.error(`Error creating category links: ${error.message}`, error.stack);
                            // Không throw error vì token đã được tạo thành công
                        }
                    }
                } catch (dbError) {
                    this.logger.error(`Error saving token to database: ${dbError.message}`);
                    // Don't throw error here, just log it since token creation was successful
                }
            }

            // Return the result
            return {
                status: 200,
                message: 'Token created successfully',
                data: {
                    tokenAddress: mintAddress,
                    transaction: signature,
                    name: tokenData.name,
                    symbol: tokenData.symbol,
                    metadataUri: metadataResponseJSON.metadataUri
                }
            };
        } catch (error) {
            this.logger.error('Error creating token:', error);

            // Handle specific error types
            if (error.message && error.message.includes('Blockhash not found')) {
                return {
                    status: 500,
                    message: 'Network error: Failed to get a valid blockhash. Please try again later.',
                };
            } else if (error.message && error.message.includes('Transaction simulation failed')) {
                if (error.message.includes('insufficient funds')) {
                    return {
                        status: 400,
                        message: 'Transaction simulation failed: Insufficient SOL balance for transaction fee. Please ensure you have enough SOL.',
                    };
                }
                return {
                    status: 500,
                    message: `Simulation error: ${error.message}. Please check your wallet balance and try again.`,
                };
            }

            return {
                status: 500,
                message: `Error creating token: ${error.message}`,
            };
        }
    }

    private async getTokenPriceFromQuickNode(tokenAddress: string): Promise<{ priceUSD: number; priceSOL: number }> {
        try {
            // Lấy giá SOL/USD từ QuickNode
            const solPrice = await this.solanaWebSocketService.getSolPrice();

            // Lấy giá token/SOL từ QuickNode
            const tokenSolPrice = await this.solanaWebSocketService.getTokenPrice(tokenAddress);

            // Tính giá token/USD
            const tokenUsdPrice = tokenSolPrice * solPrice;

            return {
                priceUSD: tokenUsdPrice,
                priceSOL: tokenSolPrice
            };
        } catch (error) {
            this.logger.error(`Error getting token price from QuickNode: ${error.message}`);
            throw error;
        }
    }

    private async getTokenPriceFromBirdeye(tokenAddress: string): Promise<TokenPriceResponseDto> {
        try {
            const response = await axios.get(`${this.configService.get('BIRDEYE_API_URL')}/defi/price`, {
                params: { address: tokenAddress },
                headers: {
                    'X-API-KEY': this.configService.get('BIRDEYE_API_KEY'),
                    'accept': 'application/json',
                    'x-chain': 'solana'
                }
            });

            if (!response.data?.success) {
                this.logger.error(`Birdeye API error: ${response.data?.message || 'Unknown error'}`);
                return { priceUSD: 0, priceSOL: 0, error: 'Failed to get price from Birdeye' };
            }

            if (!response.data?.data?.value) {
                this.logger.warn(`No price data available for token ${tokenAddress} from Birdeye`);
                return { priceUSD: 0, priceSOL: 0, error: 'No price data available' };
            }

            const price = parseFloat(response.data.data.value);
            const solPrice = await this.getTokenPrice(this.SOL_MINT);

            return {
                priceUSD: price,
                priceSOL: solPrice > 0 ? price / solPrice : 0
            };
        } catch (error) {
            this.logger.error(`Error getting token price from Birdeye: ${error.message}`);
            return { priceUSD: 0, priceSOL: 0, error: error.message };
        }
    }

    private async getTokenPriceFromJupiter(tokenAddress: string): Promise<TokenPriceResponseDto> {
        try {
            const response = await axios.get(`https://api.jup.ag/price/v2?ids=${tokenAddress},${this.SOL_MINT}`);
            const priceData = response.data.data[tokenAddress];
            const solData = response.data.data[this.SOL_MINT];

            if (!priceData?.price || !solData?.price) {
                this.logger.warn(`No price data available for token ${tokenAddress} from Jupiter`);
                return { priceUSD: 0, priceSOL: 0, error: 'No price data available' };
            }

            const price = parseFloat(priceData.price);
            const solPrice = parseFloat(solData.price);

            return {
                priceUSD: price,
                priceSOL: solPrice > 0 ? price / solPrice : 0
            };
        } catch (error) {
            this.logger.error(`Error getting token price from Jupiter: ${error.message}`);
            return { priceUSD: 0, priceSOL: 0, error: error.message };
        }
    }

    async getTokenPricesInRealTime(tokenAddresses: string[]): Promise<Map<string, { priceUSD: number; priceSOL: number }>> {
        try {
            // Check cache first
            const cachedPrices = await this.solanaCacheService.getTokenPrices(tokenAddresses);
            if (cachedPrices.size === tokenAddresses.length) {
                return cachedPrices;
            }

            // Fetch missing prices
            const missingAddresses = tokenAddresses.filter(addr => !cachedPrices.has(addr));
            const prices = new Map(cachedPrices);

            for (const address of missingAddresses) {
                try {
                    // Try SolanaTracker first
                    try {
                        const trackerPrice = await this.solanaTrackerService.getCurrentPrice(address);
                        if (trackerPrice.priceUSD > 0) {
                            prices.set(address, trackerPrice);
                            continue;
                        }
                    } catch (error) {
                        this.logger.warn(`Failed to get price from SolanaTracker: ${error.message}`);
                    }

                    // Try Jupiter as fallback
                    try {
                        const jupiterPrice = await this.getTokenPriceFromJupiter(address);
                        if (jupiterPrice.priceUSD > 0) {
                            prices.set(address, jupiterPrice);
                            continue;
                        }
                    } catch (error) {
                        this.logger.warn(`Failed to get price from Jupiter: ${error.message}`);
                    }

                    // If both fail, return error
                    prices.set(address, { priceUSD: 0, priceSOL: 0 });
                } catch (error) {
                    this.logger.warn(`Failed to get price for ${address}:`, error);
                    prices.set(address, { priceUSD: 0, priceSOL: 0 });
                }
            }

            return prices;
        } catch (error) {
            this.logger.error(`Error getting token prices: ${error.message}`);
            throw error;
        }
    }

    async getTokenPriceInRealTime(tokenAddress: string): Promise<TokenPriceResponseDto> {
        try {
            // Try SolanaTracker first
            const trackerPrice = await this.solanaTrackerService.getCurrentPrice(tokenAddress);
            if (trackerPrice.priceUSD > 0) {
                return trackerPrice;
            }

            // Try Jupiter as fallback
            const jupiterPrice = await this.getTokenPriceFromJupiter(tokenAddress);
            if (jupiterPrice.priceUSD > 0) {
                return jupiterPrice;
            }

            // If both fail, return error
            return {
                priceUSD: 0,
                priceSOL: 0,
                error: 'Failed to get price from all sources'
            };
        } catch (error) {
            this.logger.error(`Error getting token price: ${error.message}`);
            return {
                priceUSD: 0,
                priceSOL: 0,
                error: error.message
            };
        }
    }

    // Phương thức để xử lý khi WebSocket gặp lỗi
    async handleWebSocketError(address: string): Promise<void> {
        this.logger.warn(`WebSocket error for ${address}, switching to fallback mode`);
        const balance = await this.connection.getBalance(new PublicKey(address));
        await this.updateBalanceCache(address, balance, this.CACHE_TTL.FALLBACK);
    }

    // Phương thức để xử lý khi WebSocket ổn định
    async handleWebSocketStable(address: string): Promise<void> {
        this.logger.log(`WebSocket stable for ${address}, switching to stable mode`);
        const balance = await this.connection.getBalance(new PublicKey(address));
        await this.updateBalanceCache(address, balance, this.CACHE_TTL.STABLE);
    }

    private async calculatePriceFromPool(pool: any, poolData: any): Promise<number> {
        try {
            const reserveA = poolData.data.readBigUInt64LE(0);
            const reserveB = poolData.data.readBigUInt64LE(8);
            if (reserveA > 0 && reserveB > 0) {
                const price = Number(reserveB) / Number(reserveA);
                return price;
            }
            return 0;
        } catch (error) {
            this.logger.error('Error calculating price from pool:', error);
            return 0;
        }
    }

    async getTokenAccounts(walletAddress: string): Promise<any> {
        try {
            // Try to get from cache first
            const cachedAccounts = await this.solanaCacheService.getTokenAccounts(walletAddress);
            if (cachedAccounts) {
                return cachedAccounts;
            }

            // If not in cache, get from Solana network
            const accounts = await this.connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
            );

            const tokenAccounts = accounts.value.map(account => ({
                mint: account.account.data.parsed.info.mint,
                amount: account.account.data.parsed.info.tokenAmount.uiAmount,
                decimals: account.account.data.parsed.info.tokenAmount.decimals
            }));

            // Cache the result
            await this.solanaCacheService.setTokenAccounts(walletAddress, tokenAccounts);

            return tokenAccounts;
        } catch (error) {
            this.logger.error(`Error getting token accounts for ${walletAddress}:`, error);
            throw error;
        }
    }

    async getTokenUri(tokenAddress: string): Promise<string | null> {
        try {
            // Lấy account info của token
            const accountInfo = await this.connection.getAccountInfo(new PublicKey(tokenAddress));

            if (!accountInfo) {
                return null;
            }

            // Parse data từ account info
            const tokenData = AccountLayout.decode(accountInfo.data);

            // Lấy URI từ token data
            if (tokenData.mint) {
                const mintAccount = await this.connection.getAccountInfo(tokenData.mint);
                if (mintAccount) {
                    const mintData = MintLayout.decode(mintAccount.data);
                    // MintLayout không có uri property, cần tìm metadata account
                    return null;
                }
            }

            return null;
        } catch (error) {
            this.logger.error(`Error getting token URI for ${tokenAddress}:`, error);
            return null;
        }
    }

    public async clearAllBalanceCache(): Promise<void> {
        try {
            // Lấy tất cả các key cache liên quan đến balance
            const keys = await this.cacheService.keys('sol_balance:*');

            // Xóa tất cả các key
            for (const key of keys) {
                await this.cacheService.del(key);
            }

            this.logger.log('All wallet balance caches cleared successfully');
        } catch (error) {
            this.logger.error('Error clearing all wallet balance caches:', error);
            throw error;
        }
    }

    async uploadFile(file: any): Promise<string> {
        try {
            // Convert buffer to base64
            const base64Image = file.buffer.toString('base64');
            const dataURI = `data:${file.mimetype};base64,${base64Image}`;

            // Upload to Cloudinary
            const result = await cloudinary.uploader.upload(dataURI, {
                folder: 'memepump/tokens',
                resource_type: 'auto',
                allowed_formats: ['jpg', 'png', 'gif', 'webp'],
                transformation: [
                    { width: 500, height: 500, crop: 'limit' },
                    { quality: 'auto' }
                ]
            });

            if (!result.secure_url) {
                throw new Error('Failed to get upload URL from Cloudinary');
            }

            this.logger.log(`File uploaded successfully to Cloudinary: ${result.secure_url}`);
            return result.secure_url;
        } catch (error) {
            this.logger.error(`Error uploading file to Cloudinary: ${error.message}`, error.stack);
            throw new Error(`Failed to upload file: ${error.message}`);
        }
    }

    /**
     * Xử lý thu phí giao dịch 1% cho sàn
     * @param privateKey Private key của ví người dùng
     * @param tokenAddress Địa chỉ token (SOL hoặc token khác)
     * @param amount Số lượng token cần thu phí
     * @param isSOL true nếu token là SOL, false nếu là token khác
     * @param isSell true nếu là lệnh bán, false nếu là lệnh mua
     * @returns Promise<boolean> true nếu thu phí thành công
     */
    async handleTransactionFee(
        privateKey: string,
        tokenAddress: string,
        amount: number,
        isSOL: boolean,
        isSell: boolean = false
    ): Promise<boolean> {
        try {
            const keypair = this.getKeypairFromPrivateKey(privateKey);
            let feeAmountInSOL: number;

            if (isSOL) {
                // Nếu token là SOL, thu phí 1% SOL
                feeAmountInSOL = amount * 0.01;
            } else {
                // Nếu token không phải SOL, cần quy đổi giá trị
                if (isSell) {
                    // Khi bán token: quy đổi giá trị token sang SOL
                    const tokenPriceInfo = await this.getTokenPriceInRealTime(tokenAddress);
                    const solPriceInfo = await this.getTokenPriceInRealTime('So11111111111111111111111111111111111111112');
                    
                    const tokenValueUSD = amount * tokenPriceInfo.priceUSD;
                    const feeValueUSD = tokenValueUSD * 0.01; // 1% giá trị token
                    feeAmountInSOL = feeValueUSD / solPriceInfo.priceUSD;
                } else {
                    // Khi mua token: thu phí 1% SOL (vì user đang dùng SOL để mua)
                    feeAmountInSOL = amount * 0.01;
                }
            }

            // Kiểm tra số dư SOL hiện tại
            const currentBalance = await this.getBalance(keypair.publicKey.toString());
            
            // Nếu là lệnh mua và số dư không đủ thu phí 1%
            if (!isSell && currentBalance < feeAmountInSOL) {
                // Chuyển toàn bộ số dư còn lại (trừ đi 0.001 SOL để tránh lỗi)
                const remainingBalance = Math.max(0, currentBalance - 0.001);
                if (remainingBalance > 0) {
                    feeAmountInSOL = remainingBalance;
                    this.logger.log(`Insufficient balance for 1% fee. Transferring remaining balance: ${remainingBalance} SOL`);
                } else {
                    this.logger.warn(`Insufficient SOL balance for fee collection. Required: ${feeAmountInSOL}, Available: ${currentBalance}`);
                    return false;
                }
            }

            // Thu phí bằng SOL cho tất cả các trường hợp
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: keypair.publicKey,
                    toPubkey: new PublicKey(this.PLATFORM_WALLET),
                    lamports: Math.floor(feeAmountInSOL * LAMPORTS_PER_SOL)
                })
            );

            const signature = await this.connection.sendTransaction(transaction, [keypair]);
            await this.connection.confirmTransaction(signature);
            this.logger.log(`${isSell ? 'Sell' : 'Buy'} fee (SOL) collected successfully: ${signature}. Fee amount: ${feeAmountInSOL} SOL. Network fee: 0.000005 SOL`);
            return true;
        } catch (error) {
            this.logger.error(`Error collecting transaction fee: ${error.message}`);
            return false;
        }
    }

    /**
     * Lấy keypair từ private key
     */
    private getKeypairFromPrivateKey(privateKey: string): Keypair {
        const decodedKey = bs58.decode(privateKey);
        return Keypair.fromSecretKey(decodedKey);
    }

    /**
     * Lấy hoặc tạo Associated Token Account
     */
    private async getOrCreateATA(
        owner: Keypair,
        mint: PublicKey,
        ownerAddress: PublicKey
    ): Promise<PublicKey> {
        // Get associated token address
        const associatedTokenAccount = await getAssociatedTokenAddress(
            mint,
            ownerAddress
        );

        try {
            const accountInfo = await this.connection.getAccountInfo(associatedTokenAccount);
            if (!accountInfo) {
                const createATAInstruction = await createAssociatedTokenAccount(
                    ownerAddress,
                    mint,
                    owner.publicKey
                );
                
                const transaction = new Transaction().add(createATAInstruction);

                const signature = await this.connection.sendTransaction(transaction, [owner]);
                await this.connection.confirmTransaction(signature);
            }
        } catch (error) {
            this.logger.error(`Error creating ATA: ${error.message}`);
            throw error;
        }

        return associatedTokenAccount;
    }

    /**
     * Lấy số decimals của token
     */
    private async getTokenDecimals(mint: string): Promise<number> {
        try {
            const tokenInfo = await this.solanaTokenRepository.findOne({
                where: { slt_address: mint }
            });
            
            if (tokenInfo) {
                return tokenInfo.slt_decimals;
            }

            // Nếu không tìm thấy trong database, lấy từ blockchain
            const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mint));
            if (mintInfo.value && 'parsed' in mintInfo.value.data) {
                return mintInfo.value.data.parsed.info.decimals;
            }

            return 9; // Default to 9 decimals if not found
        } catch (error) {
            this.logger.error(`Error getting token decimals: ${error.message}`);
            return 9; // Default to 9 decimals on error
        }
    }

    /**
     * Update logo URLs for existing tokens in database
     * This method can be called to fix existing tokens that have metadata URI as logo URL
     */
    public async updateExistingTokenLogoUrls(): Promise<{ updated: number; errors: number }> {
        let updated = 0;
        let errors = 0;

        try {
            // Get all tokens that have metadata URI as logo URL (likely incorrect)
            const tokens = await this.solanaTokenRepository.find({
                where: [
                    { slt_logo_url: '' }, // Empty logo URLs
                ]
            });

            this.logger.log(`Found ${tokens.length} tokens to update`);

            for (const token of tokens) {
                try {
                    if (token.slt_metadata_uri) {
                        // Fetch metadata JSON from the URI
                        const metadataResponse = await axios.get(token.slt_metadata_uri, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Accept': 'application/json, text/plain, */*'
                            },
                            timeout: 10000
                        });

                        if (metadataResponse.status === 200) {
                            const metadata = metadataResponse.data;
                            
                            // Extract the actual image URL from the metadata JSON
                            if (metadata && typeof metadata === 'object' && metadata.image) {
                                const newLogoUrl = metadata.image;
                                
                                // Update the token
                                token.slt_logo_url = newLogoUrl;
                                await this.solanaTokenRepository.save(token);
                                
                                updated++;
                                this.logger.log(`Updated token ${token.slt_address}: ${newLogoUrl}`);
                            } else {
                                this.logger.warn(`No image field found in metadata for token ${token.slt_address}`);
                            }
                        }
                    }
                } catch (error) {
                    errors++;
                    this.logger.error(`Error updating token ${token.slt_address}: ${error.message}`);
                }
            }

            this.logger.log(`Logo URL update completed. Updated: ${updated}, Errors: ${errors}`);
            return { updated, errors };
        } catch (error) {
            this.logger.error(`Error in updateExistingTokenLogoUrls: ${error.message}`);
            return { updated, errors };
        }
    }

    /**
     * Extract logo URL from metadata URI
     * @param metadataUri The metadata URI to fetch and parse
     * @returns Promise<string> The extracted logo URL
     */
    public async extractLogoUrlFromMetadata(metadataUri: string): Promise<string> {
        try {
            // Fetch metadata JSON from the URI
            const metadataResponse = await axios.get(metadataUri, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                },
                timeout: 10000
            });

            if (metadataResponse.status === 200) {
                const metadata = metadataResponse.data;
                
                // Extract the actual image URL from the metadata JSON
                if (metadata && typeof metadata === 'object' && metadata.image) {
                    this.logger.log(`Extracted logo URL from metadata: ${metadata.image}`);
                    return metadata.image;
                } else {
                    this.logger.warn(`No image field found in metadata, using default: ${metadataUri}`);
                    return metadataUri;
                }
            }
        } catch (error) {
            this.logger.error(`Error fetching metadata from IPFS: ${error.message}`);
        }
        
        // Return original URI as fallback
        return metadataUri;
    }
} 