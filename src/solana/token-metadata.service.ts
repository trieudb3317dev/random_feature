import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolanaListToken } from './entities/solana-list-token.entity';
import axios from 'axios';

interface TokenMetadata {
    name: string;
    symbol: string;
    description: string;
    image: string;
    showName: boolean;
    createdOn: string;
    twitter: string;
    telegram?: string;
    website?: string;
}

interface MetadataQueueItem {
    mint: string;
    uri: string;
    wallet_id: number;
}

@Injectable()
export class TokenMetadataService {
    private readonly metadataQueue: MetadataQueueItem[] = [];
    private isProcessing = false;
    private readonly PROCESSING_INTERVAL = 1000; // 1 second between requests

    constructor(
        @InjectRepository(SolanaListToken)
        private readonly solanaListTokenRepository: Repository<SolanaListToken>,
    ) {}

    async addToQueue(mint: string, uri: string, wallet_id: number) {
        this.metadataQueue.push({ mint, uri, wallet_id });
        if (!this.isProcessing) {
            await this.processQueue();
        }
    }

    private async processQueue() {
        if (this.metadataQueue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const { mint, uri, wallet_id } = this.metadataQueue.shift()!;
        
        try {
            const response = await axios.get<TokenMetadata>(uri, { 
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://pumpportal.fun',
                    'Referer': 'https://pumpportal.fun/'
                }
            });
            
            const metadata = response.data;
            
            // Kiểm tra và xử lý độ dài của các URL
            const twitter = metadata.twitter && metadata.twitter.length > 255 ? '' : metadata.twitter;
            const telegram = metadata.telegram && metadata.telegram.length > 255 ? '' : metadata.telegram;
            const website = metadata.createdOn && metadata.createdOn.length > 255 ? '' : metadata.createdOn;

            await this.solanaListTokenRepository.update(
                { slt_address: mint },
                {
                    slt_logo_url: metadata.image || '',
                    slt_description: metadata.description || '',
                    slt_twitter: twitter,
                    slt_telegram: telegram,
                    slt_website: website,
                    slt_updated_at: new Date()
                }
            );
        } catch (error) {
            // Add back to queue if failed
            this.metadataQueue.push({ mint, uri, wallet_id });
        }

        // Process next item after interval
        setTimeout(() => this.processQueue(), this.PROCESSING_INTERVAL);
    }
} 