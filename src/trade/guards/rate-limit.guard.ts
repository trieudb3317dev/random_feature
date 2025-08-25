import { ExecutionContext, HttpException, HttpStatus, CanActivate, Injectable } from "@nestjs/common";

@Injectable()
export class RateLimitGuard implements CanActivate {
    private readonly store = new Map<string, number[]>();

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const userId = request.user?.id;

        return this.checkRateLimit(userId);
    }

    private checkRateLimit(userId: string): boolean {
        const now = Date.now();
        const windowMs = 60 * 1000; // 1 minute
        const maxRequests = 5000;     // 5000 requests per minute

        const userRequests = this.store.get(userId) || [];
        const recentRequests = userRequests.filter(time => time > now - windowMs);

        if (recentRequests.length >= maxRequests) {
            throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
        }

        this.store.set(userId, [...recentRequests, now]);
        return true;
    }
} 