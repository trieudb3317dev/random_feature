import { Injectable } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SolanaCacheService {
    private readonly CACHE_TTL = 5; // 5 seconds
    private readonly TOKEN_INFO_PREFIX = 'token:info:';
    private readonly TOKEN_PRICE_PREFIX = 'token:price:';
    private readonly TOKEN_ACCOUNTS_PREFIX = 'token:accounts:';

    constructor(
        private readonly redisCacheService: CacheService,
        private readonly configService: ConfigService,
    ) { }

    async getTokenInfo(mintAddress: string): Promise<any> {
        const key = `${this.TOKEN_INFO_PREFIX}${mintAddress}`;
        return this.redisCacheService.get(key);
    }

    async setTokenInfo(mintAddress: string, tokenInfo: any): Promise<void> {
        const key = `${this.TOKEN_INFO_PREFIX}${mintAddress}`;
        await this.redisCacheService.set(key, tokenInfo, this.CACHE_TTL);
    }

    async getTokenPrice(mintAddress: string): Promise<any> {
        const key = `${this.TOKEN_PRICE_PREFIX}${mintAddress}`;
        return this.redisCacheService.get(key);
    }

    async setTokenPrice(mintAddress: string, priceInfo: any): Promise<void> {
        const key = `${this.TOKEN_PRICE_PREFIX}${mintAddress}`;
        await this.redisCacheService.set(key, priceInfo, this.CACHE_TTL);
    }

    async getTokenAccounts(walletAddress: string): Promise<any> {
        const key = `${this.TOKEN_ACCOUNTS_PREFIX}${walletAddress}`;
        return this.redisCacheService.get(key);
    }

    async setTokenAccounts(walletAddress: string, accounts: any): Promise<void> {
        const key = `${this.TOKEN_ACCOUNTS_PREFIX}${walletAddress}`;
        await this.redisCacheService.set(key, accounts, this.CACHE_TTL);
    }

    async deleteTokenInfo(mintAddress: string): Promise<void> {
        const key = `${this.TOKEN_INFO_PREFIX}${mintAddress}`;
        await this.redisCacheService.del(key);
    }

    async deleteTokenPrice(mintAddress: string): Promise<void> {
        const key = `${this.TOKEN_PRICE_PREFIX}${mintAddress}`;
        await this.redisCacheService.del(key);
    }

    async deleteTokenAccounts(walletAddress: string): Promise<void> {
        const key = `${this.TOKEN_ACCOUNTS_PREFIX}${walletAddress}`;
        await this.redisCacheService.del(key);
    }

    async getTokenPrices(tokenAddresses: string[]): Promise<Map<string, { priceUSD: number; priceSOL: number }>> {
        const prices = new Map<string, { priceUSD: number; priceSOL: number }>();
        for (const address of tokenAddresses) {
            const price = await this.getTokenPrice(address);
            if (price) {
                prices.set(address, price);
            }
        }
        return prices;
    }

    async setTokenPrices(prices: Map<string, { priceUSD: number; priceSOL: number }>): Promise<void> {
        for (const [address, price] of prices) {
            await this.setTokenPrice(address, price);
        }
    }
} 