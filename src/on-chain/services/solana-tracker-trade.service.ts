import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { GetHistoriesTransactionDto } from '../dto/get-histories-transaction.dto';
import { TransactionType } from '../dto/get-histories-transaction.dto';

export interface SolanaTrackerTrade {
    tx: string;
    amount: number;
    priceUsd: number;
    volume: number;
    volumeSol: number;
    type: 'buy' | 'sell';
    wallet: string;
    time: number;
    program: string;
    pools: string[];
}

export interface SolanaTrackerTradeResponse {
    trades: SolanaTrackerTrade[];
    cursor?: string;
}

@Injectable()
export class SolanaTrackerTradeService {
    private readonly logger = new Logger(SolanaTrackerTradeService.name);
    private readonly baseUrl: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService
    ) {
        this.baseUrl = this.configService.get<string>('SOLANA_TRACKER_API_URL') || 'https://api.solana-tracker.com';
        const apiKey = this.configService.get<string>('SOLANA_TRACKER_API_KEY');
        console.log('Solana Tracker baseUrl:', this.baseUrl);
        console.log('Solana Tracker API KEY:', apiKey);
    }

    async getTransactionHistory(dto: GetHistoriesTransactionDto) {
        try {
            const params = new URLSearchParams();

            if (dto.offset) {
                // TODO: Implement cursor management
            }

            params.append('showMeta', 'true');
            params.append('parseJupiter', 'true');
            params.append('hideArb', 'true');
            params.append('sortDirection', 'DESC');

            const apiKey = this.configService.get<string>('SOLANA_TRACKER_API_KEY');
            const response = await firstValueFrom(
                this.httpService.get<SolanaTrackerTradeResponse>(
                    `${this.baseUrl}/trades/${dto.address}?${params.toString()}`,
                    {
                        headers: {
                            'x-api-key': apiKey
                        }
                    }
                )
            );

            let filteredTrades = response.data.trades;

            // Filter by transaction type
            if (dto.tx_type && dto.tx_type !== TransactionType.ALL) {
                filteredTrades = filteredTrades.filter(trade => trade.type === dto.tx_type);
            }

            // Filter by owner/wallet
            if (dto.owner) {
                filteredTrades = filteredTrades.filter(trade => trade.wallet === dto.owner);
            }

            // Pagination
            const limit = dto.limit || 20;
            const offset = dto.offset || 0;
            const paginatedTrades = filteredTrades.slice(offset, offset + limit);

            // Convert to response format
            const items = paginatedTrades.map(trade => ({
                tx: trade.tx,
                time: trade.time,
                type: trade.type,
                amount: trade.amount,
                priceUsd: trade.priceUsd,
                priceSol: trade.volumeSol / trade.volume,
                volume: trade.volume,
                wallet: trade.wallet,
                program: trade.program,
                token: {
                    from: {
                        address: dto.address,
                        amount: trade.amount,
                        price: {
                            usd: trade.priceUsd,
                            sol: trade.volumeSol / trade.volume
                        }
                    },
                    to: {
                        address: 'SOL',
                        amount: trade.volumeSol,
                        price: {
                            usd: trade.priceUsd * (trade.volumeSol / trade.volume),
                            sol: 1
                        }
                    }
                }
            }));

            return {
                success: true,
                data: {
                    items,
                    total: filteredTrades.length,
                    limit,
                    offset
                }
            };
        } catch (error) {
            this.logger.error(`Error fetching transaction history: ${error.message}`);
            throw error;
        }
    }

    async getTransactionHistoryByWallet(tokenAddress: string, walletAddress: string) {
        try {
            const params = new URLSearchParams();
            params.append('showMeta', 'true');
            params.append('parseJupiter', 'true');
            params.append('hideArb', 'true');
            params.append('sortDirection', 'DESC');

            const apiKey = this.configService.get<string>('SOLANA_TRACKER_API_KEY');
            const response = await firstValueFrom(
                this.httpService.get<SolanaTrackerTradeResponse>(
                    `${this.baseUrl}/trades/${tokenAddress}/by-wallet/${walletAddress}?${params.toString()}`,
                    {
                        headers: {
                            'x-api-key': apiKey
                        }
                    }
                )
            );

            const trades = response.data.trades;

            // Convert to response format
            const items = trades.map(trade => ({
                tx: trade.tx,
                time: trade.time,
                type: trade.type,
                amount: trade.amount,
                priceUsd: trade.priceUsd,
                priceSol: trade.volumeSol / trade.volume,
                volume: trade.volume,
                wallet: trade.wallet,
                program: trade.program,
                token: {
                    from: {
                        address: tokenAddress,
                        amount: trade.amount,
                        price: {
                            usd: trade.priceUsd,
                            sol: trade.volumeSol / trade.volume
                        }
                    },
                    to: {
                        address: 'SOL',
                        amount: trade.volumeSol,
                        price: {
                            usd: trade.priceUsd * (trade.volumeSol / trade.volume),
                            sol: 1
                        }
                    }
                }
            }));

            return {
                success: true,
                data: {
                    items,
                    total: trades.length,
                    limit: trades.length,
                    offset: 0
                }
            };
        } catch (error) {
            this.logger.error(`Error fetching transaction history by wallet: ${error.message}`);
            throw error;
        }
    }
} 