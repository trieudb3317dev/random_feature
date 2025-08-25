import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
    constructor(
        private jwtService: JwtService,
        private configService: ConfigService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            const client: Socket = context.switchToWs().getClient();
            const token = this.extractTokenFromHeader(client);
            
            if (!token) {
                throw new UnauthorizedException('No token provided');
            }

            const payload = await this.jwtService.verifyAsync(
                token,
                {
                    secret: this.configService.get<string>('JWT_SECRET')
                }
            );

            // Gán thông tin user vào client để sử dụng sau này
            (client as any).user = payload;
            return true;
        } catch (error) {
            throw new UnauthorizedException('Invalid token');
        }
    }

    private extractTokenFromHeader(client: Socket): string | undefined {
        if (client.handshake.auth?.token) {
            return client.handshake.auth.token;
        }
    
        console.warn('⚠️ No token found in any source.');
        return undefined;
    }
} 