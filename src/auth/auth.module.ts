import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TelegramWalletsModule } from '../telegram-wallets/telegram-wallets.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { JwtAuthGuard } from './jwt-auth.guard';
import { WalletAuth } from '../telegram-wallets/entities/wallet-auth.entity';
import { UserWallet } from '../telegram-wallets/entities/user-wallet.entity';
import { WsJwtAuthGuard } from './guards/ws-jwt-auth.guard';

@Module({
    imports: [
        TypeOrmModule.forFeature([ListWallet, WalletAuth, UserWallet]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: {
                    expiresIn: configService.get<string>('JWT_EXPIRATION', '86400'),
                },
            }),
        }),
        forwardRef(() => TelegramWalletsModule),
    ],
    providers: [JwtStrategy, AuthService, JwtAuthGuard, WsJwtAuthGuard],
    controllers: [AuthController],
    exports: [
        JwtStrategy,
        PassportModule,
        JwtModule,
        JwtAuthGuard,
        WsJwtAuthGuard,
        AuthService,
        TypeOrmModule.forFeature([WalletAuth])
    ],
})
export class AuthModule { }
