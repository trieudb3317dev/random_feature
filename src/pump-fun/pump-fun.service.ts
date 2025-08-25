import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VersionedTransaction, Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

// Thêm interface SwapResult
interface SwapResult {
    signature: string;
    dex: string;
    outputAmount: number;
}

@Injectable()
export class PumpFunService {
    private readonly connection: Connection;
    private readonly logger = new Logger(PumpFunService.name);
    private readonly priorityFees = [0.00001, 0.00005, 0.0001, 0.0005]; // Tăng dần priority fees

    constructor(
        private configService: ConfigService
    ) {
        const rpcEndpoint = this.configService.get<string>('SOLANA_RPC_URL')
            || 'https://api.mainnet-beta.solana.com';
        this.connection = new Connection(rpcEndpoint, 'confirmed');
    }

    async swap(
        privateKeyJson: string,
        fromToken: string,
        toToken: string,
        amount: number,
        slippage: number,
        isBuy: boolean = true,
        forceSellAll: boolean = false
    ): Promise<SwapResult> {
        let lastError: Error | null = null;

        // Thử với từng mức priority fee
        for (const priorityFee of this.priorityFees) {
            try {
                this.logger.log(`=== PUMP FUN SWAP START (Priority Fee: ${priorityFee} SOL) ===`);
                this.logger.log(`Input: ${fromToken}`);
                this.logger.log(`Output: ${toToken}`);
                this.logger.log(`Amount: ${amount}`);
                this.logger.log(`Slippage: ${slippage}%`);
                this.logger.log(`Action: ${isBuy ? 'buy' : 'sell'}`);

                // Parse private key
                let solanaPrivateKey: string;
                try {
                    const keys = JSON.parse(privateKeyJson);
                    solanaPrivateKey = keys.solana;
                    if (!solanaPrivateKey) {
                        throw new Error('Solana private key not found in JSON');
                    }
                } catch (e) {
                    solanaPrivateKey = privateKeyJson;
                }

                // Create wallet from private key
                const wallet = Keypair.fromSecretKey(bs58.decode(solanaPrivateKey));
                const publicKey = wallet.publicKey.toString();

                // Determine token mint and amount
                const mint = isBuy ? toToken : fromToken;

                // If selling and forceSellAll is true, get actual balance
                if (!isBuy && forceSellAll) {
                    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                        wallet.publicKey,
                        { mint: new PublicKey(mint) }
                    );
                    if (tokenAccounts.value.length > 0) {
                        const tokenAccount = tokenAccounts.value[0];
                        const actualBalance = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
                        if (actualBalance) {
                            amount = actualBalance * 0.999; // Reduce slightly to avoid errors
                            this.logger.log(`Force sell all: Using actual balance ${amount}`);
                        }
                    }
                }

                // Prepare request body with current priority fee
                const requestBody = {
                    publicKey,
                    action: isBuy ? "buy" : "sell",
                    mint,
                    denominatedInSol: isBuy ? "true" : "false",
                    amount,
                    slippage,
                    priorityFee,
                    pool: "auto"
                };

                this.logger.log(`Sending request to pumpportal.fun: ${JSON.stringify(requestBody)}`);

                // Call pumpportal.fun API
                const response = await fetch('https://pumpportal.fun/api/trade-local', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (response.status !== 200) {
                    const errorText = await response.text();
                    this.logger.error(`PumpFun API error: ${response.status} ${errorText}`);
                    throw new Error(`PumpFun API error: ${response.status} ${errorText}`);
                }

                // Get transaction data
                const data = await response.arrayBuffer();
                const tx = VersionedTransaction.deserialize(new Uint8Array(data));

                // Sign transaction
                tx.sign([wallet]);

                // Send transaction with increased commitment
                const signature = await this.connection.sendTransaction(tx, {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed',
                    maxRetries: 3
                });

                this.logger.log(`Transaction sent: ${signature}`);
                this.logger.log(`=== PUMP FUN SWAP COMPLETED ===`);

                return {
                    signature,
                    dex: 'pumpfun',
                    outputAmount: amount
                };

            } catch (error) {
                lastError = error;
                this.logger.error(`PumpFun swap failed with priority fee ${priorityFee}: ${error.message}`);

                // Nếu là lỗi không đủ SOL, dừng ngay không thử tiếp
                if (error.message?.includes('insufficient lamports') ||
                    error.message?.includes('insufficient funds')) {
                    throw new Error(`Insufficient SOL balance. Please add more SOL to your wallet.`);
                }

                // Nếu là lỗi khác, thử tiếp với priority fee cao hơn
                if (priorityFee < this.priorityFees[this.priorityFees.length - 1]) {
                    this.logger.log(`Retrying with higher priority fee...`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Đợi 1 giây trước khi thử lại
                    continue;
                }
            }
        }

        // Nếu đã thử hết các mức fee mà vẫn thất bại
        if (lastError) {
            this.logger.error(`All swap attempts failed with different priority fees`);
            throw lastError;
        }

        throw new Error('Swap failed for unknown reason');
    }
} 