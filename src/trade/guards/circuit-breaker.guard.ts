import { ExecutionContext, HttpException, HttpStatus, CanActivate, Injectable } from "@nestjs/common";
import { SolanaService } from "src/solana/solana.service";

@Injectable()
export class CircuitBreakerGuard implements CanActivate {
    private readonly PRICE_CHANGE_THRESHOLD = 0.1; // 10%
    private readonly VOLUME_THRESHOLD = 1000000;   // $1M
    private readonly breakers = new Map<string, boolean>();

    constructor(private solanaService: SolanaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const tokenAddress = request.body.order_token_address;

        if (this.breakers.get(tokenAddress)) {
            throw new HttpException('Circuit breaker active', HttpStatus.SERVICE_UNAVAILABLE);
        }

        const priceChange = await this.checkPriceVolatility(tokenAddress);
        if (Math.abs(priceChange) > this.PRICE_CHANGE_THRESHOLD) {
            this.breakers.set(tokenAddress, true);
            setTimeout(() => this.breakers.set(tokenAddress, false), 5 * 60 * 1000); // Reset after 5 minutes
            throw new HttpException('Circuit breaker triggered', HttpStatus.SERVICE_UNAVAILABLE);
        }

        return true;
    }

    private async checkPriceVolatility(tokenAddress: string): Promise<number> {
        const prices = await this.solanaService.getPriceHistory(tokenAddress, '5m');
        return (prices[prices.length - 1] - prices[0]) / prices[0];
    }
} 