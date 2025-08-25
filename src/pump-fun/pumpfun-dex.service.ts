import { Injectable, Logger, Inject } from '@nestjs/common';
import { Connection, Keypair, PublicKey, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import bs58 from 'bs58';
import { ConfigService } from '@nestjs/config';
// Import từ SDK
import { 
    PumpAmmSdk, 
    canonicalPumpPoolPda, 
    transactionFromInstructions,
    Direction
} from '@pump-fun/pump-swap-sdk';
import BN from 'bn.js';

@Injectable()
export class PumpfunDexService {
    private readonly logger = new Logger(PumpfunDexService.name);
    private pumpAmmSdk: PumpAmmSdk;
    private connection: Connection;
    
    constructor(
        private readonly configService: ConfigService
    ) {
        // Sử dụng QuickNode endpoint
        const quicknodeEndpoint = this.configService.get<string>('QUICKNODE_RPC_URL');
        this.connection = new Connection(quicknodeEndpoint || 'https://api.mainnet-beta.solana.com');
        this.pumpAmmSdk = new PumpAmmSdk(this.connection);
    }

    /**
     * Kiểm tra xem token có pool trên PumpFun DEX không, sử dụng QuickNode
     * @param tokenMint mint address của token cần kiểm tra
     * @returns true nếu tồn tại pool, false nếu không
     */
    async checkPoolExists(tokenMint: string | PublicKey): Promise<boolean> {
        try {
            // Chuyển đổi thành PublicKey nếu là string
            const mintPubkey = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
            
            // Tìm canonical pool PDA theo token
            const [poolKeyPda] = await canonicalPumpPoolPda(mintPubkey);
            if (!poolKeyPda) {
                this.logger.warn(`Không tìm thấy canonical pool PDA cho token ${mintPubkey.toBase58()}`);
                return false;
            }
            
            // Sử dụng this.connection trực tiếp thay vì this.pumpAmmSdk['connection']
            const poolAccount = await this.connection.getAccountInfo(poolKeyPda);
            if (!poolAccount) {
                this.logger.warn(`Pool không tồn tại cho token ${mintPubkey.toBase58()}`);
                return false;
            }
            
            // Thử lấy thông tin pool từ QuickNode để đảm bảo đó là pool hợp lệ
            try {
                const pool = await this.pumpAmmSdk.fetchPool(poolKeyPda);
                if (!pool) {
                    this.logger.warn(`Không thể fetch thông tin pool cho token ${mintPubkey.toBase58()}`);
                    return false;
                }
                
                // Kiểm tra pool có dữ liệu không
                this.logger.log(`Tìm thấy pool hợp lệ cho token ${mintPubkey.toBase58()}`);
                return true;
            } catch (error) {
                this.logger.warn(`Lỗi khi fetch thông tin pool: ${error.message}`);
                return false;
            }
        } catch (error) {
            this.logger.warn(`Lỗi khi kiểm tra pool: ${error.message}`);
            return false;
        }
    }

    /**
     * Tính giá dự kiến cho giao dịch mua
     * @param baseMint Token cần mua (không phải SOL)
     * @param solAmount Số lượng SOL sẽ chi
     * @returns Số lượng token sẽ nhận được
     */
    async previewBuy(baseMint: string | PublicKey, solAmount: number): Promise<number | null> {
        try {
            const mintPubkey = typeof baseMint === 'string' ? new PublicKey(baseMint) : baseMint;
            const [poolKey] = await canonicalPumpPoolPda(mintPubkey);
            
            if (!poolKey) return null;
            
            const pool = await this.pumpAmmSdk.fetchPool(poolKey);
            if (!pool) return null;
            
            // Chuyển đổi số lượng SOL sang lamports
            const amountLamports = new BN(Math.floor(solAmount * Math.pow(10, 9)));
            
            // Sử dụng phương thức của SDK để tính toán
            const baseAmount = await this.pumpAmmSdk.swapAutocompleteBaseFromQuote(
                poolKey,
                amountLamports,
                0, // Slippage không quan trọng khi tính giá
                "quoteToBase" // Direction
            );
            
            if (!baseAmount) return null;
            
            // Lấy decimals từ token account
            const baseTokenAccount = await this.pumpAmmSdk['connection'].getTokenAccountBalance(pool.poolBaseTokenAccount);
            const baseDecimals = baseTokenAccount.value.decimals || 9; 
            
            // Chuyển đổi về số lượng token dựa trên decimals
            return parseFloat(baseAmount.toString()) / Math.pow(10, baseDecimals);
        } catch (error) {
            this.logger.error(`Lỗi khi tính giá mua: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Tính giá dự kiến cho giao dịch bán
     * @param baseMint Token cần bán (không phải SOL)
     * @param baseAmount Số lượng token sẽ bán
     * @returns Số lượng SOL sẽ nhận được
     */
    async previewSell(baseMint: string | PublicKey, baseAmount: number): Promise<number | null> {
        try {
            const mintPubkey = typeof baseMint === 'string' ? new PublicKey(baseMint) : baseMint;
            const [poolKey] = await canonicalPumpPoolPda(mintPubkey);
            
            if (!poolKey) return null;
            
            const pool = await this.pumpAmmSdk.fetchPool(poolKey);
            if (!pool) return null;
            
            // Lấy decimals từ token account
            const baseTokenAccount = await this.pumpAmmSdk['connection'].getTokenAccountBalance(pool.poolBaseTokenAccount);
            const baseDecimals = baseTokenAccount.value.decimals || 9;
            
            // Chuyển đổi số lượng token sang lamports
            const amountLamports = new BN(Math.floor(baseAmount * Math.pow(10, baseDecimals)));
            
            // Sử dụng phương thức của SDK để tính toán
            const quoteAmount = await this.pumpAmmSdk.swapAutocompleteQuoteFromBase(
                poolKey,
                amountLamports,
                0, // Slippage không quan trọng khi tính giá
                "baseToQuote" // Direction
            );
            
            if (!quoteAmount) return null;
            
            // Chuyển đổi về số lượng SOL
            return parseFloat(quoteAmount.toString()) / Math.pow(10, 9);
        } catch (error) {
            this.logger.error(`Lỗi khi tính giá bán: ${error.message}`);
            return null;
        }
    }

    /**
     * Swap qua PumpFun DEX (buy/sell) - Sử dụng các hàm có sẵn từ SDK
     * @param privateKey private key dạng base58 hoặc JSON
     * @param inputMint mint address của token vào
     * @param outputMint mint address của token ra
     * @param amount số lượng (theo đơn vị input)
     * @param slippage slippage (ví dụ: 10 = 10%)
     * @param direction 0 = QuoteToBase (buy), 1 = BaseToQuote (sell)
     */
    async swapDex({
        privateKey,
        inputMint,
        outputMint,
        amount,
        slippage = 10,
        direction,
    }: {
        privateKey: string;
        inputMint: string;
        outputMint: string;
        amount: number;
        slippage?: number;
        direction: number; // 0 = QuoteToBase (buy), 1 = BaseToQuote (sell)
    }): Promise<{ signature: string; outputAmount: number; }> {
        this.logger.log(`Attempting to swap via PumpFun DEX:
            Direction: ${direction === 0 ? 'Buy (QuoteToBase)' : 'Sell (BaseToQuote)'}
            Input Mint: ${inputMint}
            Output Mint: ${outputMint}
            Amount: ${amount}
            Slippage: ${slippage}%
        `);

        // Parse keypair for transaction
        let solanaKey = privateKey;
        try {
            const parsedKey = JSON.parse(privateKey);
            if (parsedKey && parsedKey.solana) {
                solanaKey = parsedKey.solana;
            }
        } catch (e) { }
        
        const keypair = Keypair.fromSecretKey(bs58.decode(solanaKey));
        const walletAddress = keypair.publicKey.toString();
        
        this.logger.log(`Using wallet address: ${walletAddress}`);
        
        try {
            // SOL mint
            const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
            
            // Xác định base và quote mint (SOL luôn là quote)
            const isBuy = direction === 0;
            const baseMint = isBuy ? new PublicKey(outputMint) : new PublicKey(inputMint);
            const quoteMint = isBuy ? new PublicKey(inputMint) : new PublicKey(outputMint);
            
            if (!quoteMint.equals(SOL_MINT)) {
                throw new Error("PumpFun DEX chỉ hỗ trợ swap với SOL, quote phải là SOL");
            }
            
            this.logger.log(`Looking for pool with base: ${baseMint.toBase58()}, quote: ${quoteMint.toBase58()}`);
            
            // Kiểm tra pool tồn tại trước khi tiếp tục
            const poolExists = await this.checkPoolExists(baseMint);
            if (!poolExists) {
                throw new Error(`Không tìm thấy pool cho token ${baseMint.toBase58()}, vui lòng sử dụng DEX khác`);
            }
            
            // Tìm canonical pool PDA theo token
            const [poolKeyPda] = await canonicalPumpPoolPda(baseMint);
            
            this.logger.log(`Found pool: ${poolKeyPda.toBase58()}`);
            
            // Lấy thông tin pool
            const pool = await this.pumpAmmSdk.fetchPool(poolKeyPda);
            if (!pool) {
                throw new Error(`Không tìm thấy thông tin pool cho token ${baseMint.toBase58()}`);
            }
            
            // Lấy thông tin reserves để tính slippage
            const baseTokenAccount = await this.pumpAmmSdk['connection'].getTokenAccountBalance(pool.poolBaseTokenAccount);
            const quoteTokenAccount = await this.pumpAmmSdk['connection'].getTokenAccountBalance(pool.poolQuoteTokenAccount);
            
            // Lấy decimals từ token account hoặc mặc định 9
            const baseDecimals = baseTokenAccount.value.decimals || 9;
            
            // Chuyển đổi số lượng sang lamports
            const amountLamports = new BN(Math.floor(amount * Math.pow(10, isBuy ? 9 : baseDecimals)));
            
            // Lấy blockhash mới nhất
            const { blockhash, lastValidBlockHeight } = await this.pumpAmmSdk['connection'].getLatestBlockhash();
            
            let instructions;
            let expectedOutputAmount: number;
            
            // Direction string cho SDK
            const directionString = isBuy ? "quoteToBase" : "baseToQuote";
            
            if (isBuy) {
                // Mua token bằng SOL
                this.logger.log(`Buying tokens with SOL...`);
                
                // Tính toán số lượng token dự kiến nhận được
                const baseAmount = await this.pumpAmmSdk.swapAutocompleteBaseFromQuote(
                    poolKeyPda,
                    amountLamports,
                    slippage,
                    directionString
                );
                
                if (!baseAmount) {
                    throw new Error(`Không thể tính toán giá mua cho ${amount} SOL`);
                }
                
                this.logger.log(`Expected base tokens: ${baseAmount.toString()}`);
                expectedOutputAmount = parseFloat(baseAmount.toString()) / Math.pow(10, baseDecimals);
                
                // Tạo instructions cho giao dịch mua
                instructions = await this.pumpAmmSdk.swapQuoteInstructions(
                    poolKeyPda,
                    amountLamports,
                    slippage,
                    directionString,
                    keypair.publicKey
                );
            } else {
                // Bán token lấy SOL
                this.logger.log(`Selling tokens for SOL...`);
                
                // Tính toán số lượng SOL dự kiến nhận được
                const quoteAmount = await this.pumpAmmSdk.swapAutocompleteQuoteFromBase(
                    poolKeyPda,
                    amountLamports,
                    slippage,
                    directionString
                );
                
                if (!quoteAmount) {
                    throw new Error(`Không thể tính toán giá bán cho ${amount} token`);
                }
                
                this.logger.log(`Expected SOL: ${quoteAmount.toString()}`);
                expectedOutputAmount = parseFloat(quoteAmount.toString()) / Math.pow(10, 9);
                
                // Tạo instructions cho giao dịch bán
                instructions = await this.pumpAmmSdk.swapBaseInstructions(
                    poolKeyPda,
                    amountLamports,
                    slippage,
                    directionString,
                    keypair.publicKey
                );
            }
            
            this.logger.log(`Created ${instructions.length} instructions for swap`);
            
            // Tạo transaction message
            const messageV0 = new TransactionMessage({
                payerKey: keypair.publicKey,
                recentBlockhash: blockhash,
                instructions
            }).compileToV0Message();
            
            // Tạo versioned transaction
            const transaction = new VersionedTransaction(messageV0);
            
            // Ký giao dịch
            transaction.sign([keypair]);
            
            // Gửi transaction
            const signature = await this.pumpAmmSdk['connection'].sendTransaction(transaction);
            
            this.logger.log(`Transaction sent: ${signature}`);
            
            // Đợi confirm
            await this.pumpAmmSdk['connection'].confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight
            });
            
            this.logger.log(`Transaction confirmed: ${signature}`);
            
            return {
                signature,
                outputAmount: expectedOutputAmount
            };
        } catch (error) {
            this.logger.error(`PumpFun DEX swap error: ${error.message}`);
            // Thêm thông tin về pool cho SmartRouteSolanaService
            if (error.message.includes('pool') || error.message.includes('Pool')) {
                throw new Error(`NoPoolFound: ${error.message}`);
            }
            throw new Error(`Swap thất bại: ${error.message}`);
        }
    }
} 