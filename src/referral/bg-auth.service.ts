import { Injectable, UnauthorizedException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { BgRefService } from './bg-ref.service';
import { TelegramWalletsService } from '../telegram-wallets/telegram-wallets.service';
import { WalletAuth } from '../telegram-wallets/entities/wallet-auth.entity';
import { UserWallet } from '../telegram-wallets/entities/user-wallet.entity';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import * as bcrypt from 'bcrypt';

export interface ManualLoginDto {
  email: string;
  password: string;
}

export interface ManualLoginResponseDto {
  message: string;
  walletInfo: {
    walletId: number;
    nickName: string | null;
    solanaAddress: string;
    ethAddress: string;
    email: string;
  };
}

@Injectable()
export class BgAuthService {
  private readonly logger = new Logger(BgAuthService.name);

  constructor(
    private jwtService: JwtService,
    private bgRefService: BgRefService,
    @Inject(forwardRef(() => TelegramWalletsService))
    private telegramWalletsService: TelegramWalletsService,
    @InjectRepository(WalletAuth)
    private walletAuthRepository: Repository<WalletAuth>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(ListWallet)
    private listWalletRepository: Repository<ListWallet>,
    private httpService: HttpService,
  ) {}

  async connectTelegram(
    body: { id: string; code: string },
    response: Response
  ): Promise<{ message: string; walletInfo: any }> {
    try {
      // Sử dụng logic verify wallet từ TelegramWalletsService
      const verifyResult = await this.telegramWalletsService.verifyWallet(body.id, body.code);
      
      if (verifyResult.status !== 200) {
        throw new BadRequestException(verifyResult.message || 'Verification failed');
      }

      // Decode JWT token để lấy wallet_id
      if (!verifyResult.token) {
        throw new BadRequestException('Invalid token from verification');
      }
      const decodedToken = this.jwtService.decode(verifyResult.token) as any;
      const walletId = decodedToken?.wallet_id;
      if (!walletId) {
        throw new BadRequestException('Invalid wallet information');
      }

      // Kiểm tra wallet có phải là wallet main không
      const isMainWallet = await this.checkMainWallet(walletId);
      if (!isMainWallet) {
        throw new BadRequestException('Đăng nhập thất bại: Ví không phải là ví chính (main wallet)');
      }

      // Kiểm tra wallet có thuộc luồng BG affiliate không
      const isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(walletId);
      if (!isBgAffiliate) {
        throw new BadRequestException('Đăng nhập thất bại: Ví không thuộc hệ thống BG affiliate');
      }

      // Lấy thông tin wallet
      const wallet = await this.telegramWalletsService.getWalletById(walletId);
      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      // Lấy thông tin user từ wallet
      const user = await this.telegramWalletsService['userWalletRepository'].findOne({
        where: { uw_telegram_id: body.id }
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      // Tạo JWT payload với đầy đủ thông tin
      const payload = {
        uid: user.uw_id,
        wallet_id: walletId,
        sol_public_key: wallet.wallet_solana_address,
        eth_public_key: wallet.wallet_eth_address,
        role: 'bg_affiliate'
      };

      // Tạo access token (15 phút)
      const accessToken = this.jwtService.sign(payload, {
        secret: `${process.env.JWT_SECRET}-affiliate`,
        expiresIn: '15m'
      });

      // Tạo refresh token (7 ngày)
      const refreshToken = this.jwtService.sign(
        { ...payload, type: 'refresh' },
        {
          secret: `${process.env.JWT_SECRET}-affiliate`,
          expiresIn: '7d'
        }
      );

      // Set HTTP-only cookies
      response.cookie('bg_access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        maxAge: 15 * 60 * 1000 // 15 phút
      });

      response.cookie('bg_refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 ngày
      });

      return {
        message: 'BG affiliate login successful',
        walletInfo: {
          walletId: wallet.wallet_id,
          nickName: wallet.wallet_nick_name,
          solanaAddress: wallet.wallet_solana_address,
          ethAddress: wallet.wallet_eth_address
        }
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Login failed');
    }
  }

  async refreshToken(refreshToken: string, response: Response): Promise<{ message: string }> {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: `${process.env.JWT_SECRET}-affiliate`
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Kiểm tra wallet có phải là wallet main không
      const isMainWallet = await this.checkMainWallet(payload.wallet_id);
      if (!isMainWallet) {
        throw new UnauthorizedException('Token không hợp lệ: Ví không phải là ví chính (main wallet)');
      }

      // Kiểm tra wallet có thuộc luồng BG affiliate không
      const isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(payload.wallet_id);
      if (!isBgAffiliate) {
        throw new UnauthorizedException('Token không hợp lệ: Ví không thuộc hệ thống BG affiliate');
      }

      // Lấy thông tin wallet để tạo payload đầy đủ
      const wallet = await this.telegramWalletsService.getWalletById(payload.wallet_id);
      if (!wallet) {
        throw new UnauthorizedException('Wallet not found');
      }

      // Tạo access token mới với payload đầy đủ
      const newAccessToken = this.jwtService.sign(
        {
          uid: payload.uid,
          wallet_id: payload.wallet_id,
          sol_public_key: wallet.wallet_solana_address,
          eth_public_key: wallet.wallet_eth_address,
          role: payload.role
        },
        {
          secret: `${process.env.JWT_SECRET}-affiliate`,
          expiresIn: '15m'
        }
      );

      // Set cookie mới
      response.cookie('bg_access_token', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        maxAge: 15 * 60 * 1000 // 15 phút
      });

      return { message: 'Token refreshed successfully' };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(response: Response): Promise<{ message: string }> {
    response.clearCookie('bg_access_token');
    response.clearCookie('bg_refresh_token');
    return { message: 'Logged out successfully' };
  }

  async loginEmail(
    body: { code: string },
    response: Response
  ): Promise<{ message: string; walletInfo: any }> {
    try {
      // 1. Exchange code for tokens với redirect URL khác cho BG affiliate
      const tokens = await this.exchangeCodeForTokenBgAffiliate(body.code);
      
      // 2. Verify ID token and get user info
      const userInfo = await this.verifyIdToken(tokens.id_token);
      
      // 3. Kiểm tra email có tồn tại trong hệ thống không
      const userWallet = await this.userWalletRepository.findOne({
        where: { uw_email: userInfo.email }
      });

      if (!userWallet) {
        throw new BadRequestException('Tài khoản không tồn tại trong hệ thống');
      }

      // 4. Kiểm tra active_email
      if (!userWallet.active_email) {
        throw new BadRequestException('Email chưa được xác thực. Vui lòng xác thực email trước');
      }

      // 5. Lấy ví main của user
      const mainWallet = await this.getMainWallet(userWallet);
      if (!mainWallet) {
        throw new BadRequestException('Không tìm thấy ví chính của tài khoản');
      }

      // 6. Kiểm tra ví có phải là ví main không
      const isMainWallet = await this.checkMainWallet(mainWallet.wallet_id);
      if (!isMainWallet) {
        throw new BadRequestException('Đăng nhập thất bại: Ví không phải là ví chính (main wallet)');
      }

      // 7. Kiểm tra ví có thuộc luồng BG affiliate không
      const isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(mainWallet.wallet_id);
      if (!isBgAffiliate) {
        throw new BadRequestException('Đăng nhập thất bại: Ví không thuộc hệ thống BG affiliate');
      }

      // 8. Tạo JWT payload với đầy đủ thông tin
      const payload = {
        uid: userWallet.uw_id,
        wallet_id: mainWallet.wallet_id,
        sol_public_key: mainWallet.wallet_solana_address,
        eth_public_key: mainWallet.wallet_eth_address,
        role: 'bg_affiliate'
      };

      // 9. Tạo access token (15 phút)
      const accessToken = this.jwtService.sign(payload, {
        secret: `${process.env.JWT_SECRET}-affiliate`,
        expiresIn: '15m'
      });

      // 10. Tạo refresh token (7 ngày)
      const refreshToken = this.jwtService.sign(
        { ...payload, type: 'refresh' },
        {
          secret: `${process.env.JWT_SECRET}-affiliate`,
          expiresIn: '7d'
        }
      );

      // 11. Set HTTP-only cookies
      response.cookie('bg_access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        maxAge: 15 * 60 * 1000 // 15 phút
      });

      response.cookie('bg_refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 ngày
      });

      return {
        message: 'BG affiliate login successful',
        walletInfo: {
          walletId: mainWallet.wallet_id,
          nickName: mainWallet.wallet_nick_name,
          solanaAddress: mainWallet.wallet_solana_address,
          ethAddress: mainWallet.wallet_eth_address,
          email: userWallet.uw_email
        }
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Login failed');
    }
  }

  async loginWithPassword(
    body: ManualLoginDto,
    response: Response
  ): Promise<ManualLoginResponseDto> {
    try {
      // 1. Validation cơ bản
      if (!body.email || !body.password) {
        throw new BadRequestException('Email and password are required');
      }

      // 2. Kiểm tra format email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        throw new BadRequestException('Invalid email format');
      }

      // 3. Kiểm tra email có tồn tại không
      const userWallet = await this.userWalletRepository.findOne({
        where: { uw_email: body.email }
      });

      if (!userWallet) {
        throw new BadRequestException('Account does not exist');
      }

      // 4. Kiểm tra user có password không (không phải Google login)
      if (!userWallet.uw_password) {
        throw new BadRequestException('This account does not have a password. Please use Google login');
      }

      // 5. Kiểm tra password
      const isPasswordValid = await bcrypt.compare(body.password, userWallet.uw_password);
      if (!isPasswordValid) {
        throw new BadRequestException('Invalid password');
      }

      // 6. Kiểm tra email đã được xác thực chưa
      if (!userWallet.active_email) {
        throw new BadRequestException('Email not verified. Please verify your email first');
      }

      // 7. Lấy ví main của user
      const mainWallet = await this.getMainWallet(userWallet);
      if (!mainWallet) {
        throw new BadRequestException('Main wallet not found for this account');
      }

      // 8. Kiểm tra ví có phải là ví main không
      const isMainWallet = await this.checkMainWallet(mainWallet.wallet_id);
      if (!isMainWallet) {
        throw new BadRequestException('Login failed: Wallet is not a main wallet');
      }

      // 9. Kiểm tra ví có thuộc luồng BG affiliate không
      const isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(mainWallet.wallet_id);
      if (!isBgAffiliate) {
        throw new BadRequestException('Login failed: Wallet does not belong to BG affiliate system');
      }

      // 10. Tạo JWT payload với đầy đủ thông tin
      const payload = {
        uid: userWallet.uw_id,
        wallet_id: mainWallet.wallet_id,
        sol_public_key: mainWallet.wallet_solana_address,
        eth_public_key: mainWallet.wallet_eth_address,
        role: 'bg_affiliate'
      };

      // 11. Tạo access token (15 phút)
      const accessToken = this.jwtService.sign(payload, {
        secret: `${process.env.JWT_SECRET}-affiliate`,
        expiresIn: '15m'
      });

      // 12. Tạo refresh token (7 ngày)
      const refreshToken = this.jwtService.sign(
        { ...payload, type: 'refresh' },
        {
          secret: `${process.env.JWT_SECRET}-affiliate`,
          expiresIn: '7d'
        }
      );

      // 13. Set HTTP-only cookies
      response.cookie('bg_access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        maxAge: 15 * 60 * 1000 // 15 phút
      });

      response.cookie('bg_refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 ngày
      });

      return {
        message: 'BG affiliate login successful',
        walletInfo: {
          walletId: mainWallet.wallet_id,
          nickName: mainWallet.wallet_nick_name,
          solanaAddress: mainWallet.wallet_solana_address,
          ethAddress: mainWallet.wallet_eth_address,
          email: userWallet.uw_email
        }
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Login failed');
    }
  }

  private async getMainWallet(userWallet: UserWallet): Promise<ListWallet | null> {
    const walletAuth = await this.walletAuthRepository.findOne({
      where: { 
        wa_user_id: userWallet.uw_id,
        wa_type: 'main'
      },
      relations: ['wa_wallet']
    });

    return walletAuth?.wa_wallet || null;
  }

  private async exchangeCodeForTokenBgAffiliate(code: string): Promise<any> {
    try {
      // Decode URL encoded code
      const decodedCode = decodeURIComponent(code);
      const redirectUri = process.env.URL_AFFILIATE_FRONTEND + '/login-email';
      
      // Sử dụng ConfigService và HttpService trực tiếp
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new BadRequestException('Google OAuth configuration is missing');
      }
      
      const response = await firstValueFrom(
        this.httpService.post(
          'https://oauth2.googleapis.com/token',
          {
            code: decodedCode,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }
        )
      );

      return response.data;
    } catch (error) {
      throw new BadRequestException('Failed to exchange code for token');
    }
  }

  private async verifyIdToken(idToken: string): Promise<any> {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        throw new BadRequestException('Google OAuth configuration is missing');
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
        )
      );

      const payload = response.data;

      // Verify token
      if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
        throw new BadRequestException('Invalid token issuer');
      }

      if (payload.aud !== clientId) {
        throw new BadRequestException('Invalid token audience');
      }

      // Verify email
      if (!payload.email_verified) {
        throw new BadRequestException('Email not verified');
      }

      return payload;
    } catch (error) {
      throw new BadRequestException('Invalid Google token');
    }
  }

  private async checkMainWallet(walletId: number): Promise<boolean> {
    try {
      // Kiểm tra wallet có wa_type = 'main' trong bảng wallet_auth
      const walletAuth = await this.walletAuthRepository.findOne({
        where: { 
          wa_wallet_id: walletId,
          wa_type: 'main'
        }
      });
      
      return !!walletAuth;
    } catch (error) {
      console.error('Error checking main wallet:', error);
      return false;
    }
  }
} 