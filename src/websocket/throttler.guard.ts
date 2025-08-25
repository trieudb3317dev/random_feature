import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
    private connectionCountByIp = new Map<string, number>();
    private readonly MAX_CONNECTIONS_PER_IP = 150;

    protected async getTracker(req: Record<string, any>): Promise<string> {
        return req.ip;
    }

    protected getRequestResponse(context: ExecutionContext): { req: Record<string, any>; res: Record<string, any> } {
        const client = context.switchToWs().getClient();
        const ip = client.handshake.address;

        // Kiểm tra số lượng kết nối từ IP này
        const currentCount = this.connectionCountByIp.get(ip) || 0;

        if (currentCount >= this.MAX_CONNECTIONS_PER_IP) {
            // Tính thời gian chờ ngẫu nhiên từ 5-10 phút
            const randomMinutes = Math.floor(Math.random() * 6) + 5;
            client.emit('error', {
                message: `Connection limit reached. Please try again after ${randomMinutes} minutes.`,
                retryAfter: randomMinutes * 60
            });
            throw new WsException('Too many connections from this IP');
        }

        // Tăng số lượng kết nối
        this.connectionCountByIp.set(ip, currentCount + 1);

        // Đăng ký sự kiện disconnect để giảm số lượng kết nối khi client ngắt kết nối
        client.on('disconnect', () => {
            const count = this.connectionCountByIp.get(ip) || 0;
            if (count > 0) {
                this.connectionCountByIp.set(ip, count - 1);
            }
        });

        // Trả về một đối tượng giả có phương thức header
        return {
            req: { ip },
            res: {
                header: () => ({}) // Thêm phương thức header giả
            }
        };
    }

    protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
        const client = requestProps.context.switchToWs().getClient();
        const ip = client.handshake.address;
        const key = this.generateKey(requestProps.context, ip);

        const { totalHits } = await this.storageService.increment(
            key,
            requestProps.ttl,
            requestProps.limit,
            1,
            ip
        );

        if (totalHits > requestProps.limit) {
            await this.throwThrottlingException(requestProps.context, { limit: requestProps.limit, ttl: requestProps.ttl });
            return false;
        }

        return true;
    }

    protected generateKey(context: ExecutionContext, suffix: string): string {
        return `${context.getClass().name}-${context.getHandler().name}-${suffix}`;
    }

    protected async throwThrottlingException(context: ExecutionContext, throttlerLimitDetail: any): Promise<void> {
        const client = context.switchToWs().getClient();
        const randomMinutes = Math.floor(Math.random() * 6) + 5; // 5-10 phút

        client.emit('error', {
            message: `Too many requests. Please try again after ${randomMinutes} minutes.`,
            retryAfter: randomMinutes * 60
        });

        throw new WsException('Too many requests');
    }
} 