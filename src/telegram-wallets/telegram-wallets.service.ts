import { Injectable, NotFoundException, Logger, UseInterceptors, UploadedFile, Body, Req, Post, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ManyToOne, JoinColumn } from 'typeorm';
import { UserWalletCode } from './entities/user-wallet-code.entity';
import { ListWallet } from './entities/list-wallet.entity';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, TransactionInstruction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { ethers } from 'ethers';
import bs58 from 'bs58';
import ms = require('ms');
import { SolanaService } from '../solana/solana.service';
import { TokenProgram } from '../solana/entities/solana-list-token.entity';
import { WalletPrivateKeysDto } from './dto/wallet-private-keys.dto';
import { UserWallet } from './entities/user-wallet.entity';
import { WalletAuth } from './entities/wallet-auth.entity';
import { AddWalletDto } from './dto/add-wallet.dto';
import { SolanaListToken } from '../solana/entities/solana-list-token.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateTokenDto } from './dto/create-token.dto';
import { Express } from 'express';
import { Multer } from 'multer';
import { diskStorage } from 'multer';
import { SolanaListCategoriesToken, CategoryStatus } from '../solana/entities/solana-list-categories-token.entity';
import { SolanaTokenJoinCategory, JoinCategoryStatus } from '../solana/entities/solana-token-join-category.entity';
import { GetCategoriesResponseDto } from './dto/get-categories.dto';
import { SolanaListCategoriesTokenRepository } from '../solana/repositories/solana-list-categories-token.repository';
import { CacheService } from '../cache/cache.service';
import { SolanaPriceCacheService } from '../solana/solana-price-cache.service';
import { DeepPartial } from 'typeorm';
import { SetWalletPasswordDto } from './dto/set-wallet-password.dto';
import { VerifyWalletPasswordDto } from './dto/verify-wallet-password.dto';
import * as bcrypt from 'bcrypt';
import { NotificationService } from 'src/notifications/notification.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import BN = require('bn.js');
import { Metaplex, keypairIdentity, toMetaplexFile } from '@metaplex-foundation/js';
import { 
    createCreateMetadataAccountV3Instruction,
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
    DataV2
} from '@metaplex-foundation/mpl-token-metadata';
import * as path from 'path';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { AddGoogleAuthDto, AddGoogleAuthResponseDto } from './dto/add-google-auth.dto';
import { RemoveGoogleAuthDto, RemoveGoogleAuthResponseDto } from './dto/remove-google-auth.dto';
import { AddGmailDto, AddGmailResponseDto } from './dto/add-gmail.dto';
import { GoogleAuthService } from '../telegram-bot/google-auth.service';
import { SetMailCodeResponseDto } from './dto/set-mail-code.dto';
import { LessThan, MoreThan } from 'typeorm';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { VerifyGmailDto, VerifyGmailResponseDto } from './dto/verify-gmail.dto';
import { MemepumpTokenService } from './memepump-token.service';
import { BgRefService } from '../referral/bg-ref.service';
import { SolanaTrackerService } from '../on-chain/solana-tracker.service';

@Injectable()
export class TelegramWalletsService {
    private readonly logger = new Logger(TelegramWalletsService.name);
    private readonly DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');

    constructor(
        @InjectRepository(UserWalletCode)
        private userWalletCodeRepository: Repository<UserWalletCode>,
        @InjectRepository(ListWallet)
        private listWalletRepository: Repository<ListWallet>,
        @InjectRepository(UserWallet)
        private userWalletRepository: Repository<UserWallet>,
        @InjectRepository(WalletAuth)
        private walletAuthRepository: Repository<WalletAuth>,
        @InjectRepository(SolanaListToken)
        private solanaListTokenRepository: Repository<SolanaListToken>,
        private readonly solanaListCategoriesTokenRepository: SolanaListCategoriesTokenRepository,
        @InjectRepository(SolanaTokenJoinCategory)
        private solanaTokenJoinCategoryRepository: Repository<SolanaTokenJoinCategory>,
        private configService: ConfigService,
        private solanaService: SolanaService,
        private readonly redisCacheService: CacheService,
        private readonly solanaPriceCacheService: SolanaPriceCacheService,
        private readonly googleAuthService: GoogleAuthService,
        private readonly telegramBotService: TelegramBotService,
        private readonly memepumpTokenService: MemepumpTokenService,
        private readonly notificationService: NotificationService,
        private readonly bgRefService: BgRefService,
        private readonly solanaTrackerService: SolanaTrackerService,
    ) { }

    async verifyWallet(telegramId: string, code: string) {
        this.logger.debug(`Verifying wallet for telegramId: ${telegramId} with code: ${code}`);

        // Find code in user_wallet_code table
        const walletCode = await this.findCode(telegramId, code);

        this.logger.debug('Found wallet code:', walletCode);

        if (!walletCode) {
            this.logger.debug('No wallet code found');
            return {
                status: 401,
                message: 'Invalid verification code'
            };
        }

        // Check code expiration and status
        // Always use UTC dates for comparison
        const currentTimeUTC = new Date();
        // Ensure the stored time is treated as UTC
        const codeTimeUTC = new Date(walletCode.tw_code_time);

        // Log for debugging
        this.logger.debug('Time comparison:', {
            currentTimeUTC: currentTimeUTC.toISOString(),
            codeTimeUTC: codeTimeUTC.toISOString(),
            currentTimeLocal: currentTimeUTC.toString(),
            codeTimeLocal: codeTimeUTC.toString()
        });

        const isExpired = codeTimeUTC.getTime() < currentTimeUTC.getTime();
        if (isExpired || !walletCode.tw_code_status) {
            this.logger.debug(`Code expired or invalid status. isExpired: ${isExpired}, status: ${walletCode.tw_code_status}`);
            return { status: 401, message: 'Expired code' };
        }

        // Update code status to false
        walletCode.tw_code_status = false;
        await this.updateCodeStatus(walletCode);

        // Get JWT secret from config
        const jwtSecret = this.configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
            throw new Error('❌ JWT_SECRET is missing in environment variables');
        }

        const jwtExpiration = this.configService.get<string>('JWT_EXPIRATION', '86400');
        const expiresIn = parseInt(jwtExpiration, 10);

        // Find user and linked wallet
        const user = await this.userWalletRepository.findOne({
            where: { uw_telegram_id: telegramId },
        });

        if (!user) {
            return { status: 401, message: 'User not found' };
        }

        // Find all 'main' links of this user
        const mainWalletAuths = await this.walletAuthRepository.createQueryBuilder('wa')
            .leftJoinAndSelect('wa.wa_wallet', 'lw')
            .where('wa.wa_user_id = :userId', { userId: user.uw_id })
            .andWhere('wa.wa_type = :type', { type: 'main' })
            .orderBy('wa.wa_id', 'ASC')
            .getMany();

        let wallet: ListWallet;

        // Process based on 'main' link count
        if (mainWalletAuths.length === 1) {
            // Case with exactly 1 'main' link
            wallet = mainWalletAuths[0].wa_wallet;
        } else if (mainWalletAuths.length > 1) {
            // Case with multiple 'main' links
            // Use the oldest (lowest ID) link as the main link
            wallet = mainWalletAuths[0].wa_wallet;

            // Change other 'main' links to 'other'
            const otherMainWalletAuths = mainWalletAuths.slice(1);
            for (const auth of otherMainWalletAuths) {
                auth.wa_type = 'other';
                await this.walletAuthRepository.save(auth);
            }
        } else {
            // Case with no 'main' links
            // Create new wallet
            const solanaKeypair = Keypair.generate();
            const solanaPublicKey = solanaKeypair.publicKey.toBase58();
            const solanaPrivateKey = bs58.encode(solanaKeypair.secretKey);

            // Create Ethereum private key from Solana private key
            const ethPrivateKeyBytes = solanaKeypair.secretKey.slice(0, 32);
            const ethPrivateKey = '0x' + Buffer.from(ethPrivateKeyBytes).toString('hex');
            const ethWallet = new ethers.Wallet(ethPrivateKey);

            // Create new wallet in database
            const newWallet = this.listWalletRepository.create({
                wallet_private_key: JSON.stringify({
                    solana: solanaPrivateKey,
                    ethereum: ethPrivateKey
                }),
                wallet_solana_address: solanaPublicKey,
                wallet_eth_address: ethWallet.address,
                wallet_status: true,
                wallet_auth: 'member'
            });
            await this.listWalletRepository.save(newWallet);

            // Create 'main' link with new wallet
            const newWalletAuth = this.walletAuthRepository.create({
                wa_user_id: user.uw_id,
                wa_wallet_id: newWallet.wallet_id,
                wa_type: 'main'
            });
            await this.walletAuthRepository.save(newWalletAuth);

            wallet = newWallet;
        }

        // Create payload for JWT token
        const payload = {
            uid: user.uw_id,
            wallet_id: wallet.wallet_id,
            sol_public_key: wallet.wallet_solana_address,
            eth_public_key: wallet.wallet_eth_address,
        };

        // Define options
        const signOptions: jwt.SignOptions = {
            expiresIn,
            algorithm: 'HS256',
        };

        // Create token
        const token = jwt.sign(payload, jwtSecret, signOptions);

        return { status: 200, token };
    }

    async findCode(telegramId: string, code: string): Promise<UserWalletCode | null> {
        // Find user with telegram_id corresponding
        const user = await this.userWalletRepository.findOne({
            where: { uw_telegram_id: telegramId }
        });

        if (!user) {
            return null;
        }

        // Find code with user_id and code value
        return await this.userWalletCodeRepository.findOne({
            where: {
                tw_code_value: code,
                tw_wallet_id: user.uw_id,
                tw_code_status: true,
            }
        });
    }

    async updateCodeStatus(walletCode: UserWalletCode): Promise<void> {
        walletCode.tw_code_status = false;
        await this.userWalletCodeRepository.save(walletCode);
    }

    async createWalletCode(userWallet: UserWallet, code: string, expirationTime: Date): Promise<UserWalletCode> {
        const walletCode = this.userWalletCodeRepository.create({
            tw_wallet_id: userWallet.uw_id,
            tw_code_value: code,
            tw_code_type: 1,
            tw_code_time: expirationTime,
            tw_code_status: true,
        });
        return await this.userWalletCodeRepository.save(walletCode);
    }

    async getWalletInfo(req) {
        try {
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: req.user.wallet_id }
            });

            const user = await this.userWalletRepository.findOne({
                where: { uw_id: req.user.uid }
            });

            if (!wallet) {
                return {
                    status: 404,
                    message: 'Wallet not found',
                    data: null
                };
            }

            // Kiểm tra wallet_nick_name
            if (!wallet.wallet_nick_name) {
                return {
                    status: 403,
                    message: 'Wallet nickname is required',
                    data: null
                };
            }

            // Kiểm tra xem wallet có thuộc hệ thống BG affiliate không
            const isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(wallet.wallet_id);

            // Clear cache trước khi lấy số dư mới
            // await this.solanaService.clearBalanceCache(wallet.wallet_solana_address);

            // Lấy số dư mới từ chain
            const solBalance = await this.solanaService.getBalance(wallet.wallet_solana_address);
            const solPrice = await this.solanaPriceCacheService.getSOLPriceInUSD();
            const solBalanceUSD = solBalance * solPrice;

            // Lấy wallet name từ walletAuth
            const walletAuth = await this.walletAuthRepository.findOne({
                where: {
                    wa_wallet_id: wallet.wallet_id,
                    wa_user_id: req.user.uid
                }
            });

            return {
                status: 200,
                message: 'Wallet info retrieved successfully',
                data: {
                    wallet_id: wallet.wallet_id,
                    wallet_name: walletAuth?.wa_name || null,
                    wallet_nick_name: wallet.wallet_nick_name,
                    wallet_country: wallet.wallet_country || null,
                    solana_address: wallet.wallet_solana_address,
                    solana_balance: solBalance,
                    solana_balance_usd: solBalanceUSD,
                    role: wallet.wallet_auth,
                    stream: wallet.wallet_stream || 'normal',
                    password: !!user?.uw_password,
                    isGGAuth: !!user?.active_gg_auth,
                    email: user?.uw_email || null,
                    isActiveMail: user?.active_email,
                    isBgAffiliate
                }
            };
        } catch (error) {
            this.logger.error(`Error in getWalletInfo: ${error.message}`);
            throw error;
        }
    }

    async updateWalletAddresses(wallet: ListWallet) {
        try {
            if (!wallet.wallet_solana_address || !wallet.wallet_eth_address) {
                const privateKeyObject = JSON.parse(wallet.wallet_private_key);

                if (!wallet.wallet_solana_address && privateKeyObject?.solana) {
                    const solanaKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyObject.solana));
                    wallet.wallet_solana_address = solanaKeypair.publicKey.toBase58();
                }

                if (!wallet.wallet_eth_address && privateKeyObject?.ethereum) {
                    const ethWallet = new ethers.Wallet(privateKeyObject.ethereum);
                    wallet.wallet_eth_address = ethWallet.address;
                }

                await this.listWalletRepository.save(wallet);
            }
            return wallet;
        } catch (error) {
            console.error('Error updating wallet addresses:', error);
            throw error;
        }
    }

    async findWalletBySolanaAddress(address: string): Promise<ListWallet | null> {
        const wallet = await this.listWalletRepository.findOne({
            where: { wallet_solana_address: address }
        });

        if (wallet) {
            return await this.updateWalletAddresses(wallet);
        }
        return null;
    }

    async findWalletByTelegramId(telegramId: string): Promise<ListWallet | null> {
        // Find user with this telegram ID
        const user = await this.userWalletRepository.findOne({
            where: { uw_telegram_id: telegramId }
        });

        if (!user) {
            return null;
        }

        // Find main wallet linked to this user
        const walletAuth = await this.walletAuthRepository.createQueryBuilder('wa')
            .leftJoinAndSelect('wa.wa_wallet', 'lw')
            .where('wa.wa_user_id = :userId', { userId: user.uw_id })
            .andWhere('wa.wa_type = :type', { type: 'main' })
            .orderBy('wa.wa_id', 'ASC')
            .getOne();

        if (!walletAuth || !walletAuth.wa_wallet) {
            return null;
        }

        return walletAuth.wa_wallet;
    }

    async getPrivateKeys(req): Promise<{ status: number; data?: WalletPrivateKeysDto; message?: string }> {
        try {
            // Lấy wallet_id từ payload JWT
            const { wallet_id } = req.user;

            if (!wallet_id) {
                return {
                    status: 400,
                    message: 'Missing wallet_id in JWT token',
                };
            }

            // Tìm wallet từ wallet_id
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: wallet_id },
            });

            if (!wallet) {
                return {
                    status: 404,
                    message: `Wallet not found`,
                };
            }

            try {
                // Parse private key JSON
                const privateKeyObject = JSON.parse(wallet.wallet_private_key);

                // Lấy private key từ wallet
                const privateKeys: WalletPrivateKeysDto = {
                    sol_private_key: privateKeyObject.solana || '',
                    eth_private_key: privateKeyObject.ethereum || '',
                    bnb_private_key: privateKeyObject.ethereum || '', // BNB sử dụng cùng private key với Ethereum
                };

                return {
                    status: 200,
                    data: privateKeys,
                };
            } catch (error) {
                return {
                    status: 500,
                    message: `Error parsing private keys: ${error.message}`,
                };
            }
        } catch (error) {
            return {
                status: 500,
                message: `Error fetching wallet private keys: ${error.message}`,
            };
        }
    }

    async addWallet(user, addWalletDto: AddWalletDto) {
        try {
            const { uid } = user;
            const { name, type, private_key, nick_name, country } = addWalletDto;

            // Kiểm tra user có tồn tại không
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: uid }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User not found',
                };
            }

            let listWallet: ListWallet | undefined;

            if (type === 'other') {
                // Kiểm tra nick_name đã tồn tại chưa khi type là 'other'
                if (!nick_name) {
                    return {
                        status: 400,
                        message: 'Nickname is required for new wallet',
                    };
                }

                // Kiểm tra độ dài tối thiểu của nick_name
                if (nick_name.length < 3) {
                    return {
                        status: 400,
                        message: 'Nickname must be at least 3 characters long',
                    };
                }

                const existingWalletWithNickName = await this.listWalletRepository.findOne({
                    where: { wallet_nick_name: nick_name }
                });

                if (existingWalletWithNickName) {
                    return {
                        status: 409,
                        error_code: 'NICKNAME_EXISTS',
                        message: 'Wallet nickname already exists',
                    };
                }

                // Chỉ kiểm tra tên ví có trùng không khi name không phải null/undefined
                if (name) {
                    const existingWalletAuth = await this.walletAuthRepository.findOne({
                        where: {
                            wa_user_id: uid,
                            wa_name: name
                        }
                    });

                    if (existingWalletAuth) {
                        return {
                            status: 400,
                            message: 'Wallet name already exists for this user',
                        };
                    }
                }

                // Tạo ví mới nếu type là 'other'
                // Tạo keypair mới cho đến khi không có xung đột
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount < maxRetries) {
                    try {
                        const solanaKeypair = Keypair.generate();
                        const solanaPublicKey = solanaKeypair.publicKey.toBase58();
                        const solanaPrivateKey = bs58.encode(solanaKeypair.secretKey);

                        // Tạo Ethereum private key từ Solana private key
                        const ethPrivateKeyBytes = solanaKeypair.secretKey.slice(0, 32);
                        const ethPrivateKey = '0x' + Buffer.from(ethPrivateKeyBytes).toString('hex');
                        const ethWallet = new ethers.Wallet(ethPrivateKey);

                        // Kiểm tra địa chỉ đã tồn tại chưa
                        const existingWallet = await this.listWalletRepository.findOne({
                            where: { wallet_solana_address: solanaPublicKey }
                        });

                        if (existingWallet) {
                            retryCount++;
                            continue; // Tạo lại keypair mới
                        }

                        // Tạo ví mới
                        listWallet = this.listWalletRepository.create({
                            wallet_private_key: JSON.stringify({
                                solana: solanaPrivateKey,
                                ethereum: ethPrivateKey
                            }),
                            wallet_solana_address: solanaPublicKey,
                            wallet_eth_address: ethWallet.address,
                            wallet_status: true,
                            wallet_auth: 'member',
                            wallet_nick_name: nick_name,
                            wallet_country: country || undefined
                        });

                        // Lưu ví vào database
                        listWallet = await this.listWalletRepository.save(listWallet);
                        break; // Thoát khỏi vòng lặp nếu thành công
                    } catch (error) {
                        if (error.message.includes('duplicate key') && retryCount < maxRetries - 1) {
                            retryCount++;
                            this.logger.warn(`Duplicate key detected, retrying (${retryCount}/${maxRetries})`);
                        } else {
                            throw error; // Ném lỗi nếu đã thử lại đủ số lần
                        }
                    }
                }

                if (listWallet === undefined) {
                    throw new Error(`Failed to create wallet after ${maxRetries} attempts`);
                }
            } else if (type === 'import') {
                // Kiểm tra private_key có được cung cấp không
                if (!private_key) {
                    return {
                        status: 400,
                        message: 'Private key is required for import',
                    };
                }

                // Kiểm tra private_key có hợp lệ không
                try {
                    const decodedKey = bs58.decode(private_key);
                    Keypair.fromSecretKey(decodedKey);
                } catch (error) {
                    return {
                        status: 400,
                        message: 'Invalid Solana private key',
                    };
                }

                // Kiểm tra private_key đã tồn tại trong list_wallets chưa
                const existingWallet = await this.listWalletRepository.createQueryBuilder('lw')
                    .where(`lw.wallet_private_key::jsonb->>'solana' = :privateKey`, { privateKey: private_key })
                    .getOne();

                if (existingWallet) {
                    // Kiểm tra xem ví đã tồn tại này đã được liên kết với user hiện tại chưa
                    const existingWalletAuth = await this.walletAuthRepository.findOne({
                        where: {
                            wa_user_id: uid,
                            wa_wallet_id: existingWallet.wallet_id
                        }
                    });

                    if (existingWalletAuth) {
                        return {
                            status: 400,
                            message: 'This wallet is already linked to your account',
                        };
                    }

                    // Nếu ví đã tồn tại nhưng chưa liên kết với user, sử dụng ví đó
                    listWallet = existingWallet;
                } else {
                    // Nếu ví chưa tồn tại, kiểm tra nick_name
                    if (!nick_name) {
                        return {
                            status: 400,
                            message: 'Nickname is required for new imported wallet',
                        };
                    }

                    // Kiểm tra nick_name đã tồn tại chưa
                    const existingWalletWithNickName = await this.listWalletRepository.findOne({
                        where: { wallet_nick_name: nick_name }
                    });

                    if (existingWalletWithNickName) {
                        return {
                            status: 409,
                            error_code: 'NICKNAME_EXISTS',
                            message: 'Wallet nickname already exists',
                        };
                    }

                    // Tạo ví mới
                    try {
                        const solanaKeypair = Keypair.fromSecretKey(bs58.decode(private_key));
                        const solanaPublicKey = solanaKeypair.publicKey.toBase58();

                        // Tạo Ethereum private key từ Solana private key
                        const ethPrivateKeyBytes = solanaKeypair.secretKey.slice(0, 32);
                        const ethPrivateKey = '0x' + Buffer.from(ethPrivateKeyBytes).toString('hex');
                        const ethWallet = new ethers.Wallet(ethPrivateKey);

                        // Tạo ví mới
                        listWallet = this.listWalletRepository.create({
                            wallet_private_key: JSON.stringify({
                                solana: private_key,
                                ethereum: ethPrivateKey
                            }),
                            wallet_solana_address: solanaPublicKey,
                            wallet_eth_address: ethWallet.address,
                            wallet_status: true,
                            wallet_auth: 'member',
                            wallet_nick_name: nick_name,
                            wallet_country: country || undefined
                        });
                        await this.listWalletRepository.save(listWallet);
                    } catch (error) {
                        return {
                            status: 400,
                            message: `Error creating wallet: ${error.message}`,
                        };
                    }
                }
            } else {
                return {
                    status: 400,
                    message: 'Invalid wallet type',
                };
            }

            // Trước khi tạo wallet_auth, kiểm tra xem liên kết đã tồn tại chưa
            const existingWalletAuth = await this.walletAuthRepository.findOne({
                where: {
                    wa_user_id: userWallet.uw_id,
                    wa_wallet_id: listWallet.wallet_id
                }
            });

            if (existingWalletAuth) {
                return {
                    status: 400,
                    message: 'This wallet is already linked to your account'
                };
            }

            // Tạo liên kết wallet_auth với tên có thể là null
            try {
                // Sử dụng phương thức mới để tạo wallet_auth
                await this.createWalletAuth(
                    userWallet.uw_id,
                    listWallet.wallet_id,
                    type,
                    name || null
                );
            } catch (error) {
                if (error.message.includes('already linked')) {
                    return {
                        status: 400,
                        message: error.message
                    };
                }
                return {
                    status: 500,
                    message: `Error adding wallet: ${error.message}`
                };
            }

            // Cập nhật địa chỉ ví nếu cần
            await this.updateWalletAddresses(listWallet);

            return {
                status: 200,
                message: 'Wallet added successfully',
                data: {
                    wallet_id: listWallet.wallet_id,
                    solana_address: listWallet.wallet_solana_address,
                    eth_address: listWallet.wallet_eth_address,
                    wallet_type: type,
                    wallet_name: name || null,
                    wallet_nick_name: listWallet.wallet_nick_name,
                    wallet_country: listWallet.wallet_country
                }
            };
        } catch (error) {
            this.logger.error(`Error adding wallet: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error adding wallet: ${error.message}`,
            };
        }
    }

    private async createWalletAuth(
        userId: number,
        walletId: number,
        type: string,
        name: string | null
    ): Promise<number> {
        try {
            // Trước khi insert, kiểm tra xem có bản ghi nào cho cặp user và wallet này chưa
            const existingCheck = await this.walletAuthRepository.query(
                `SELECT COUNT(*) as count FROM wallet_auth WHERE wa_user_id = $1 AND wa_wallet_id = $2`,
                [userId, walletId]
            );

            if (existingCheck[0].count > 0) {
                throw new Error('This wallet is already linked to your account');
            }

            // Dùng SQL thuần để chèn với cú pháp ON CONFLICT DO NOTHING để tránh lỗi
            const result = await this.walletAuthRepository.query(`
                INSERT INTO wallet_auth (wa_user_id, wa_wallet_id, wa_type, wa_name)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT DO NOTHING
                RETURNING wa_id
            `, [userId, walletId, type, name]);

            if (result && result.length > 0) {
                return result[0].wa_id;
            } else {
                // Nếu không insert được, có thể đã có conflict. Thử lấy record đã tồn tại
                const existing = await this.walletAuthRepository.findOne({
                    where: {
                        wa_user_id: userId,
                        wa_wallet_id: walletId
                    }
                });

                if (existing) {
                    return existing.wa_id;
                }
            }

            throw new Error('Failed to create or get wallet_auth record');
        } catch (error) {
            this.logger.error(`Error creating wallet auth: ${error.message}`, error.stack);

            // Kiểm tra lỗi duplicate
            if (error.message.includes('duplicate key') || error.message.includes('already linked')) {
                throw new Error('This wallet is already linked to your account');
            }
            throw error;
        }
    }

    async updateWallet(user, updateWalletDto: { wallet_id: number; name: string; nick_name?: string; country?: string; bittworld_uid?: string }) {
        try {
            const { uid } = user;
            const { wallet_id, name, nick_name, country, bittworld_uid } = updateWalletDto;

            // Kiểm tra user có tồn tại không
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: uid }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User not found',
                };
            }

            // Kiểm tra tên ví này đã được sử dụng cho ví khác chưa
            const existingWalletWithName = await this.walletAuthRepository.findOne({
                where: {
                    wa_user_id: uid,
                    wa_name: name
                }
            });

            if (existingWalletWithName && existingWalletWithName.wa_wallet_id !== wallet_id) {
                return {
                    status: 400,
                    message: 'Wallet name already exists for this user',
                };
            }

            // Kiểm tra liên kết giữa user và wallet có tồn tại không
            const walletAuth = await this.walletAuthRepository.findOne({
                where: {
                    wa_user_id: uid,
                    wa_wallet_id: wallet_id
                },
                relations: ['wa_wallet']
            });

            if (!walletAuth) {
                return {
                    status: 404,
                    message: 'Wallet not linked to this user',
                };
            }

            // Nếu có nick_name được truyền vào, kiểm tra quyền cập nhật
            if (nick_name) {
                // Kiểm tra xem ví này có phải là ví main của user nào không
                const mainWalletAuth = await this.walletAuthRepository.findOne({
                    where: {
                        wa_wallet_id: wallet_id,
                        wa_type: 'main'
                    },
                    relations: ['wa_user']
                });

                if (mainWalletAuth) {
                    // Nếu là ví main, chỉ cho phép chủ sở hữu cập nhật
                    if (mainWalletAuth.wa_user.uw_telegram_id !== userWallet.uw_telegram_id) {
                        return {
                            status: 403,
                            message: 'Only the main wallet owner can update its nickname',
                        };
                    }
                }

                // Kiểm tra nick_name đã tồn tại chưa
                const existingWalletWithNickName = await this.listWalletRepository.findOne({
                    where: { wallet_nick_name: nick_name }
                });

                if (existingWalletWithNickName && existingWalletWithNickName.wallet_id !== wallet_id) {
                    return {
                        status: 409,
                        error_code: 'NICKNAME_EXISTS',
                        message: 'Wallet nickname already exists',
                    };
                }

                // Cập nhật nick_name
                walletAuth.wa_wallet.wallet_nick_name = nick_name;
            }

            // Cập nhật country nếu được truyền vào
            if (country !== undefined) {
                walletAuth.wa_wallet.wallet_country = country;
            }

            // Cập nhật bittworld_uid nếu được truyền vào
            if (bittworld_uid !== undefined) {
                // Kiểm tra unique
                const existingWalletWithBittworldUid = await this.listWalletRepository.findOne({
                    where: { bittworld_uid }
                });
                if (existingWalletWithBittworldUid && existingWalletWithBittworldUid.wallet_id !== wallet_id) {
                    return {
                        status: 409,
                        error_code: 'BITTWORLD_UID_EXISTS',
                        message: 'Bittworld UID already exists',
                    };
                }
                walletAuth.wa_wallet.bittworld_uid = bittworld_uid;
            }

            // Lưu thay đổi vào list_wallets
            if (nick_name || country !== undefined || bittworld_uid !== undefined) {
                await this.listWalletRepository.save(walletAuth.wa_wallet);
            }

            // Cập nhật tên ví
            walletAuth.wa_name = name;
            await this.walletAuthRepository.save(walletAuth);

            // Trả về thông tin ví đã cập nhật
            return {
                status: 200,
                message: 'Wallet updated successfully',
                data: {
                    wallet_id: walletAuth.wa_wallet_id,
                    wallet_type: walletAuth.wa_type,
                    wallet_name: walletAuth.wa_name,
                    wallet_nick_name: walletAuth.wa_wallet.wallet_nick_name,
                    wallet_country: walletAuth.wa_wallet.wallet_country,
                    solana_address: walletAuth.wa_wallet?.wallet_solana_address || null,
                    eth_address: walletAuth.wa_wallet?.wallet_eth_address || null,
                    bittworld_uid: walletAuth.wa_wallet?.bittworld_uid || null
                }
            };
        } catch (error) {
            this.logger.error(`Error updating wallet: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error updating wallet: ${error.message}`,
            };
        }
    }

    async deleteWallet(user, wallet_id: number) {
        try {
            const { uid, wallet_id: currentWalletId } = user;

            // Kiểm tra xem wallet có đang được sử dụng không
            if (currentWalletId === wallet_id) {
                return {
                    status: 400,
                    message: 'Cannot delete wallet that is currently in use',
                };
            }

            // Kiểm tra user có tồn tại không
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: uid }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User not found',
                };
            }

            // Kiểm tra liên kết giữa user và wallet có tồn tại không
            const walletAuth = await this.walletAuthRepository.findOne({
                where: {
                    wa_user_id: uid,
                    wa_wallet_id: wallet_id
                },
                relations: ['wa_wallet']
            });

            if (!walletAuth) {
                return {
                    status: 404,
                    message: 'Wallet not linked to this user',
                };
            }

            // Không cho phép xóa ví chính (main)
            if (walletAuth.wa_type === 'main') {
                return {
                    status: 400,
                    message: 'Cannot delete main wallet',
                };
            }

            // Lưu thông tin ví để trả về
            const walletInfo = {
                wallet_id: walletAuth.wa_wallet_id,
                wallet_type: walletAuth.wa_type,
                wallet_name: walletAuth.wa_name,
                solana_address: walletAuth.wa_wallet?.wallet_solana_address || null,
                eth_address: walletAuth.wa_wallet?.wallet_eth_address || null,
                bittworld_uid: walletAuth.wa_wallet?.bittworld_uid || null
            };

            // Xóa liên kết trong wallet_auth
            await this.walletAuthRepository.remove(walletAuth);

            return {
                status: 200,
                message: 'Wallet unlinked successfully',
                data: walletInfo
            };
        } catch (error) {
            this.logger.error(`Error deleting wallet: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error deleting wallet: ${error.message}`,
            };
        }
    }

    async getMyWallets(user) {
        try {
            const { uid } = user;

            // Kiểm tra user có tồn tại không
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: uid }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User not found',
                    data: []
                };
            }

            // Tìm tất cả các ví được liên kết với user
            const walletAuths = await this.walletAuthRepository.createQueryBuilder('wa')
                .leftJoinAndSelect('wa.wa_wallet', 'lw')
                .where('wa.wa_user_id = :userId', { userId: uid })
                .orderBy('wa.wa_type', 'ASC') // Sắp xếp 'main' lên đầu
                .addOrderBy('wa.wa_id', 'ASC')
                .getMany();

            if (!walletAuths || walletAuths.length === 0) {
                return {
                    status: 200,
                    message: 'No wallets found for this user',
                    data: []
                };
            }

            // // Lấy giá SOL từ cache
            // const solPriceInfo = await this.solanaService.getTokenPricesInRealTime(['So11111111111111111111111111111111111111112']);
            // const solPrice = solPriceInfo.get('So11111111111111111111111111111111111111112');

            // Chuyển đổi dữ liệu sang định dạng phản hồi
            const walletsList = await Promise.all(walletAuths.map(async auth => {
                // Lấy số dư SOL của ví
                // const solBalance = await this.solanaService.getBalance(auth.wa_wallet?.wallet_solana_address);
                // Tính số dư USD
                // const solBalanceUSD = solBalance * (solPrice?.priceUSD || 0);

                return {
                    wallet_id: auth.wa_wallet_id,
                    wallet_type: auth.wa_type,
                    wallet_name: auth.wa_name,
                    wallet_nick_name: auth.wa_wallet?.wallet_nick_name || null,
                    wallet_country: auth.wa_wallet?.wallet_country || null,
                    solana_address: auth.wa_wallet?.wallet_solana_address || null,
                    eth_address: auth.wa_wallet?.wallet_eth_address || null,
                    wallet_auth: auth.wa_wallet?.wallet_auth || 'member',
                    // solana_balance: solBalance,
                    // solana_balance_usd: solBalanceUSD
                };
            }));

            return {
                status: 200,
                message: 'Wallets retrieved successfully',
                data: walletsList
            };
        } catch (error) {
            this.logger.error(`Error getting user wallets: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error getting user wallets: ${error.message}`,
                data: []
            };
        }
    }

    async useWallet(user, wallet_id: number) {
        try {
            const { uid } = user;

            // Kiểm tra user có tồn tại không
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: uid }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User not found',
                };
            }

            // Kiểm tra liên kết giữa user và wallet có tồn tại không
            const walletAuth = await this.walletAuthRepository.findOne({
                where: {
                    wa_user_id: uid,
                    wa_wallet_id: wallet_id
                },
                relations: ['wa_wallet']
            });

            if (!walletAuth || !walletAuth.wa_wallet) {
                return {
                    status: 404,
                    message: 'Wallet not linked to this user',
                };
            }

            // Kiểm tra trạng thái của ví
            if (!walletAuth.wa_wallet.wallet_status) {
                return {
                    status: 400,
                    message: 'Wallet is disabled',
                };
            }

            // Lấy thông tin JWT secret và expiration từ config
            const jwtSecret = this.configService.get<string>('JWT_SECRET');
            if (!jwtSecret) {
                throw new Error('JWT_SECRET is missing in environment variables');
            }

            const jwtExpiration = this.configService.get<string>('JWT_EXPIRATION', '86400');
            const expiresIn = parseInt(jwtExpiration, 10);

            // Tạo payload cho JWT token
            const payload = {
                uid: uid,
                wallet_id: wallet_id,
                sol_public_key: walletAuth.wa_wallet.wallet_solana_address,
                eth_public_key: walletAuth.wa_wallet.wallet_eth_address,
            };

            // Định nghĩa options
            const signOptions: jwt.SignOptions = {
                expiresIn,
                algorithm: 'HS256',
            };

            // Tạo token mới
            const token = jwt.sign(payload, jwtSecret, signOptions);

            return {
                status: 200,
                message: 'Wallet switched successfully',
                token: token
            };
        } catch (error) {
            this.logger.error(`Error switching wallet: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error switching wallet: ${error.message}`,
            };
        }
    }

    async getMyTokens(user) {
        try {
            const { uid, wallet_id } = user;

            // Kiểm tra user có tồn tại không
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: uid }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User not found',
                    data: []
                };
            }

            // Kiểm tra wallet có tồn tại không
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: wallet_id }
            });

            if (!wallet) {
                return {
                    status: 404,
                    message: 'Wallet not found',
                    data: []
                };
            }

            // Kiểm tra xem ví có được liên kết với user không
            const walletAuth = await this.walletAuthRepository.findOne({
                where: {
                    wa_user_id: uid,
                    wa_wallet_id: wallet_id
                }
            });

            if (!walletAuth) {
                return {
                    status: 401,
                    message: 'Wallet not linked to this user',
                    data: []
                };
            }

            // Lấy danh sách token của ví
            const tokens = await this.solanaListTokenRepository.find({
                where: { slt_wallet_id: wallet_id },
                order: { slt_created_at: 'DESC' }
            });

            // Chuyển đổi dữ liệu sang định dạng phản hồi
            const tokensList = tokens.map(token => ({
                token_id: token.slt_id,
                name: token.slt_name,
                symbol: token.slt_symbol,
                address: token.slt_address,
                decimals: token.slt_decimals,
                logo_url: token.slt_logo_url,
                description: token.slt_description,
                twitter: token.slt_twitter,
                telegram: token.slt_telegram,
                website: token.slt_website,
                transaction_hash: token.slt_transaction_hash,
                metadata_uri: token.slt_metadata_uri,
                initial_liquidity: token.slt_initial_liquidity,
                is_verified: token.slt_is_verified,
                created_at: token.slt_created_at,
                updated_at: token.slt_updated_at
            }));

            return {
                status: 200,
                message: 'Tokens retrieved successfully',
                data: tokensList
            };
        } catch (error) {
            this.logger.error(`Error getting user tokens: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error getting user tokens: ${error.message}`,
                data: []
            };
        }
    }

    async createTokenPumpfun(user: any, createTokenDto: CreateTokenDto, file: any) {
        try {
            const { wallet_id } = user;
            this.logger.log(`Creating token with wallet_id: ${wallet_id}`);

            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: wallet_id }
            });

            if (!wallet) {
                this.logger.error(`Wallet not found for wallet_id: ${wallet_id}`);
                return {
                    status: 404,
                    message: 'Wallet not found'
                };
            }

            // Validate public key
            if (!wallet.wallet_solana_address) {
                return {
                    status: 400,
                    message: 'Invalid wallet: Missing Solana address'
                };
            }

            // Validate required fields
            if (!createTokenDto.name || !createTokenDto.symbol || !file) {
                return {
                    status: 400,
                    message: 'Missing required fields: name, symbol and image are required'
                };
            }

            const tokenData = {
                name: createTokenDto.name,
                symbol: createTokenDto.symbol,
                description: createTokenDto.description || `${createTokenDto.name} token on Solana`,
                twitter: createTokenDto.twitter || undefined,
                telegram: createTokenDto.telegram || undefined,
                website: createTokenDto.website || undefined,
                showName: createTokenDto.showName !== undefined ? createTokenDto.showName : true,
                amount: createTokenDto.amount ? Number(createTokenDto.amount) : 0,
                totalSupply: createTokenDto.totalSupply || 1000000000,
                decimals: createTokenDto.decimals !== undefined ? createTokenDto.decimals : (createTokenDto.totalSupply || 1000000000) > 3000000000 ? 6 : 9
            };

            const privateKeyObject = JSON.parse(wallet.wallet_private_key);
            if (!privateKeyObject.solana) {
                return {
                    status: 400,
                    message: 'Invalid wallet: Missing Solana private key'
                };
            }

            // Tạo token
            const result = await this.solanaService.createTokenPumpfun(
                privateKeyObject.solana,
                wallet.wallet_solana_address,
                tokenData,
                file,
                wallet_id,
                createTokenDto.category_list
            );

            return result;
        } catch (error) {
            this.logger.error(`Error in createToken: ${error.message}`, error.stack);
            return {
                status: 500,
                message: error.message || 'Internal server error'
            };
        }
    }

    async createTokenMemepump(
        user: any,
        createTokenDto: CreateTokenDto,
        logoFile: Express.Multer.File
    ): Promise<{ mint: Keypair | PublicKey; metadataAddress: PublicKey; metadataUri: string; status?: number; message?: string }> {
        try {
            this.logger.log('Starting createTokenMemepump...');
            const connection = this.solanaService.getConnection();

            // Get wallet from user
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: user.wallet_id }
            });

            if (!wallet) {
                return {
                    mint: this.DEFAULT_PUBLIC_KEY,
                    metadataAddress: this.DEFAULT_PUBLIC_KEY,
                    metadataUri: '',
                    status: 404,
                    message: 'Wallet not found'
                };
            }

            // Get private key
            const privateKeyObject = JSON.parse(wallet.wallet_private_key);
            if (!privateKeyObject.solana) {
                return {
                    mint: this.DEFAULT_PUBLIC_KEY,
                    metadataAddress: this.DEFAULT_PUBLIC_KEY,
                    metadataUri: '',
                    status: 400,
                    message: 'Invalid wallet: Missing Solana private key'
                };
            }

            const payerKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyObject.solana));

            // Kiểm tra số dư SOL trước khi tạo token
            const minBalanceLamports = 3000000; // 0.003 SOL, dư ra một chút
            const balance = await connection.getBalance(payerKeypair.publicKey);
            if (balance < minBalanceLamports) {
                return {
                    mint: this.DEFAULT_PUBLIC_KEY,
                    metadataAddress: this.DEFAULT_PUBLIC_KEY,
                    metadataUri: '',
                    status: 400,
                    message: 'Không đủ số dư SOL để tạo token. Vui lòng nạp thêm SOL vào ví.'
                };
            }

            // Use MemepumpTokenService to create token
            const result = await this.memepumpTokenService.createTokenMemepump(
                connection,
                payerKeypair,
                createTokenDto,
                logoFile
            );

            // Save token info to database with all fields
            this.logger.log('Saving token info to database...');
            
            // Extract proper logo URL from metadata
            const logoUrl = await this.solanaService.extractLogoUrlFromMetadata(result.metadataUri);
            
            // Tính toán decimals mặc định dựa trên totalSupply
            const totalSupply = createTokenDto.totalSupply || 1000000000;
            const defaultDecimals = totalSupply > 3000000000 ? 6 : 9;
            const finalDecimals = createTokenDto.decimals !== undefined ? createTokenDto.decimals : defaultDecimals;
            
            const token = this.solanaListTokenRepository.create({
                slt_name: createTokenDto.name,
                slt_symbol: createTokenDto.symbol,
                slt_address: result.mint.publicKey.toBase58(),
                slt_decimals: finalDecimals,
                slt_logo_url: logoUrl,
                slt_metadata_uri: result.metadataUri,
                slt_keypair: bs58.encode(result.mint.secretKey),
                slt_description: createTokenDto.description,
                slt_twitter: createTokenDto.twitter,
                slt_telegram: createTokenDto.telegram,
                slt_website: createTokenDto.website,
                slt_wallet_id: user.wallet_id,
                slt_program: TokenProgram.MEMEPUMP,
                slt_initial_liquidity: 0,
                slt_create_check: true
            });

            await this.solanaListTokenRepository.save(token);
            this.logger.log(`Token saved to database with logo URL: ${logoUrl}`);

            // Nếu có category_list, tạo liên kết với các category
            if (createTokenDto.category_list && createTokenDto.category_list.length > 0) {
                try {
                    // Loại bỏ duplicate category_id
                    const uniqueCategoryIds = [...new Set(createTokenDto.category_list)];
                    
                    // Tạo liên kết với các category
                    for (const categoryId of uniqueCategoryIds) {
                        // Kiểm tra category có tồn tại không
                        const category = await this.solanaListCategoriesTokenRepository.findOne({
                            where: { slct_id: categoryId }
                        });

                        if (category) {
                            // Kiểm tra xem liên kết đã tồn tại chưa để tránh duplicate
                            const existingJoin = await this.solanaTokenJoinCategoryRepository.findOne({
                                where: {
                                    stjc_token_id: token.slt_id,
                                    stjc_category_id: categoryId
                                }
                            });

                            if (!existingJoin) {
                                // Tạo liên kết mới
                                const joinCategory = this.solanaTokenJoinCategoryRepository.create({
                                    stjc_token_id: token.slt_id,
                                    stjc_category_id: categoryId,
                                    stjc_status: JoinCategoryStatus.ON
                                });
                                await this.solanaTokenJoinCategoryRepository.save(joinCategory);
                            }
                        }
                    }
                } catch (error) {
                    this.logger.error(`Error creating category links: ${error.message}`, error.stack);
                    // Không trả về lỗi vì token đã được tạo thành công
                }
            }

            return {
                mint: result.mint,
                metadataAddress: result.metadataAddress,
                metadataUri: result.metadataUri
            };
        } catch (error) {
            // Phân tích lỗi thiếu SOL từ log
            if (
                error?.transactionLogs &&
                error.transactionLogs.some((log: string) =>
                    log.includes('insufficient lamports')
                )
            ) {
                return {
                    mint: this.DEFAULT_PUBLIC_KEY,
                    metadataAddress: this.DEFAULT_PUBLIC_KEY,
                    metadataUri: '',
                    status: 400,
                    message: 'Không đủ số dư SOL để tạo token. Vui lòng nạp thêm SOL vào ví.'
                };
            }
            // Các lỗi khác giữ nguyên
            this.logger.error('Error in createTokenMemepump:', error);
            return {
                mint: this.DEFAULT_PUBLIC_KEY,
                metadataAddress: this.DEFAULT_PUBLIC_KEY,
                metadataUri: '',
                status: 500,
                message: error.message || 'Internal server error'
            };
        }
    }

    async getCategories(): Promise<GetCategoriesResponseDto> {
        try {
            const categories = await this.solanaListCategoriesTokenRepository.findActiveCategories();

            const categoriesList = categories.map(category => ({
                id: category.slct_id,
                name: category.slct_name,
                slug: category.slct_slug,
                prioritize: category.slct_prioritize,
                status: category.sltc_status
            }));

            return {
                status: 200,
                message: 'Categories retrieved successfully',
                data: categoriesList
            };
        } catch (error) {
            this.logger.error(`Error getting categories: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error getting categories: ${error.message}`,
                data: []
            };
        }
    }

    async getWalletBalance(walletAddress: string) {
        try {
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_solana_address: walletAddress }
            });
            if (!wallet) {
                return {
                    status: 404,
                    message: 'Wallet not found',
                    data: null
                };
            }
            const solBalance = await this.solanaService.getBalance(walletAddress);
            const solBalanceUSD = await this.solanaService.getBalanceInUSD(walletAddress);

            return {
                status: 200,
                message: 'Wallet balance retrieved successfully',
                data: {
                    sol_balance: solBalance,
                    sol_balance_usd: solBalanceUSD
                }
            };
        } catch (error) {
            this.logger.error(`Error getting wallet balance: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error getting wallet balance: ${error.message}`,
                data: null
            };
        }
    }

    async getListBuyTokens(user: any) {
        try {
            const { wallet_id } = user;
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id }
            });

            if (!wallet) {
                return {
                    status: 404,
                    message: 'Wallet not found'
                };
            }

            const walletAddress = wallet.wallet_solana_address;
            const tokenAccounts = await this.solanaService.getTokenAccounts(walletAddress);

            // Default tokens to always include
            const defaultTokens = [
                'So11111111111111111111111111111111111111112', // SOL
                'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
                '4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN' // BITT
            ];

            // Get balances for default tokens that are not in user's token accounts
            const missingDefaultTokens = defaultTokens.filter(mint => 
                !tokenAccounts.some(account => account.mint === mint)
            );

            // Get SOL balance (native SOL)
            let solBalance = 0;
            if (missingDefaultTokens.includes('So11111111111111111111111111111111111111112')) {
                try {
                    const solBalanceInfo = await this.getWalletBalance(walletAddress);
                    if (solBalanceInfo.status === 200 && solBalanceInfo.data) {
                        solBalance = solBalanceInfo.data.sol_balance || 0;
                    }
                } catch (error) {
                    this.logger.error(`Error fetching SOL balance: ${error.message}`);
                }
            }

            // Get USDT balance if not in token accounts
            let usdtBalance = 0;
            if (missingDefaultTokens.includes('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')) {
                try {
                    usdtBalance = await this.solanaService.getTokenBalance(
                        walletAddress, 
                        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
                    );
                } catch (error) {
                    this.logger.error(`Error fetching USDT balance: ${error.message}`);
                }
            }

            // Get BITT balance if not in token accounts
            let bittBalance = 0;
            if (missingDefaultTokens.includes('4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN')) {
                try {
                    bittBalance = await this.solanaService.getTokenBalance(
                        walletAddress, 
                        '4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN'
                    );
                } catch (error) {
                    this.logger.error(`Error fetching BITT balance: ${error.message}`);
                }
            }

            // Combine user's tokens with default tokens, ensuring SOL and USDT are at the beginning
            const allTokenAccounts: Array<{ mint: string; amount: number }> = [];
            
            // Add SOL first (always at index 0)
            if (missingDefaultTokens.includes('So11111111111111111111111111111111111111112')) {
                allTokenAccounts.push({
                    mint: 'So11111111111111111111111111111111111111112',
                    amount: solBalance
                });
            } else {
                // Find SOL in user's token accounts and add it first
                const solAccount = tokenAccounts.find(account => account.mint === 'So11111111111111111111111111111111111111112');
                if (solAccount) {
                    allTokenAccounts.push(solAccount);
                }
            }
            
            // Add USDT second (always at index 1)
            if (missingDefaultTokens.includes('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')) {
                allTokenAccounts.push({
                    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
                    amount: usdtBalance
                });
            } else {
                // Find USDT in user's token accounts and add it second
                const usdtAccount = tokenAccounts.find(account => account.mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
                if (usdtAccount) {
                    allTokenAccounts.push(usdtAccount);
                }
            }
            
            // Add BITT third (always at index 2)
            if (missingDefaultTokens.includes('4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN')) {
                allTokenAccounts.push({
                    mint: '4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN',
                    amount: bittBalance
                });
            } else {
                // Find BITT in user's token accounts and add it third
                const bittAccount = tokenAccounts.find(account => account.mint === '4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN');
                if (bittAccount) {
                    allTokenAccounts.push(bittAccount);
                }
            }
            
            // Add all other tokens (excluding SOL, USDT and BITT which are already added)
            const otherTokens = tokenAccounts.filter(account => 
                account.mint !== 'So11111111111111111111111111111111111111112' && 
                account.mint !== 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' &&
                account.mint !== '4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN'
            );
            allTokenAccounts.push(...otherTokens);

            const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
            const SOL_MINT = 'So11111111111111111111111111111111111111112';
            const BITT_MINT = '4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN';

            // Get detailed token info from Solana Tracker for other tokens (not SOL, USDT, BITT)
            const otherTokenMints = allTokenAccounts
                .filter(account => 
                    account.mint !== SOL_MINT && 
                    account.mint !== USDT_MINT && 
                    account.mint !== BITT_MINT
                )
                .map(account => account.mint);

            let trackerTokensData: any[] = [];
            if (otherTokenMints.length > 0) {
                try {
                    const trackerResponse = await this.solanaTrackerService.getMultiTokensData(otherTokenMints);
                    if (trackerResponse.success && trackerResponse.data) {
                        trackerTokensData = trackerResponse.data;
                        this.logger.log(`Successfully fetched data for ${trackerTokensData.length} tokens from Solana Tracker`);
                    }
                } catch (error) {
                    this.logger.error(`Error fetching from Solana Tracker: ${error.message}`);
                }
            }

            const tokens = await Promise.all(allTokenAccounts.map(async (account) => {
                // Always override SOL info
                if (account.mint === SOL_MINT) {
                    // Lấy giá SOL thực tế nếu có
                    const tokenPrice = await this.solanaService.getTokenPricesInRealTime([SOL_MINT]);
                    const priceUSD = tokenPrice?.get(SOL_MINT)?.priceUSD || 0;
                    const priceSOL = tokenPrice?.get(SOL_MINT)?.priceSOL || 1;
                    return {
                        token_address: SOL_MINT,
                        token_name: 'SOL',
                        token_symbol: 'SOL',
                        token_logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
                        token_decimals: 9,
                        token_balance: account.amount,
                        token_balance_usd: account.amount * priceUSD,
                        token_price_usd: priceUSD,
                        token_price_sol: priceSOL,
                        is_verified: true
                    };
                }
                // Always override USDT info
                if (account.mint === USDT_MINT) {
                    // Lấy giá USDT thực tế nếu có
                    const tokenPrice = await this.solanaService.getTokenPricesInRealTime([USDT_MINT]);
                    const priceUSD = tokenPrice?.get(USDT_MINT)?.priceUSD || 1;
                    const priceSOL = tokenPrice?.get(USDT_MINT)?.priceSOL || 0;
                    return {
                        token_address: USDT_MINT,
                        token_name: 'USDT',
                        token_symbol: 'USDT',
                        token_logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
                        token_decimals: 6,
                        token_balance: account.amount,
                        token_balance_usd: account.amount * priceUSD,
                        token_price_usd: priceUSD,
                        token_price_sol: priceSOL,
                        is_verified: true
                    };
                }
                // Always override BITT info
                if (account.mint === BITT_MINT) {
                    // Lấy giá BITT thực tế nếu có
                    const tokenPrice = await this.solanaService.getTokenPricesInRealTime([BITT_MINT]);
                    const priceUSD = tokenPrice?.get(BITT_MINT)?.priceUSD || 0;
                    const priceSOL = tokenPrice?.get(BITT_MINT)?.priceSOL || 0;
                    return {
                        token_address: BITT_MINT,
                        token_name: 'BITT',
                        token_symbol: 'BITT',
                        token_logo_url: 'https://ipfs.filebase.io/ipfs/QmYXoGub5bFrqMGDtCM6WuCKch4BUizmENR4R8MQxW2bfq',
                        token_decimals: 9,
                        token_balance: account.amount,
                        token_balance_usd: account.amount * priceUSD,
                        token_price_usd: priceUSD,
                        token_price_sol: priceSOL,
                        is_verified: true
                    };
                }
                // For other tokens, try to get info from Solana Tracker first
                const trackerToken = trackerTokensData.find((t: any) => t.address === account.mint);
                
                if (trackerToken && (trackerToken.name || trackerToken.symbol)) {
                    // Use data from Solana Tracker
                    const tokenPrice = await this.solanaService.getTokenPricesInRealTime([account.mint]);
                    const tokenBalanceUSD = account.amount * (tokenPrice?.get(account.mint)?.priceUSD || 0);
                    
                    return {
                        token_address: account.mint,
                        token_name: trackerToken.name || `Token_${account.mint.slice(0, 8)}`,
                        token_symbol: trackerToken.symbol || account.mint.slice(0, 4).toUpperCase(),
                        token_logo_url: trackerToken.logo_uri || '',
                        token_decimals: 9, // Default for most Solana tokens
                        token_balance: account.amount,
                        token_balance_usd: tokenBalanceUSD,
                        token_price_usd: tokenPrice?.get(account.mint)?.priceUSD || 0,
                        token_price_sol: tokenPrice?.get(account.mint)?.priceSOL || 0,
                        is_verified: false
                    };
                }

                // Fallback to existing logic if tracker data not available
                const cacheKey = `token:${account.mint}`;
                let tokenInfo = await this.redisCacheService.get(cacheKey);

                if (!tokenInfo) {
                    tokenInfo = await this.solanaListTokenRepository.findOne({
                        where: { slt_address: account.mint }
                    });

                    if (tokenInfo) {
                        await this.redisCacheService.set(cacheKey, tokenInfo, 3600);
                    }
                }

                if (!tokenInfo) {
                    try {
                        const tokenData = await this.solanaService.getTokenInfo(account.mint);
                        tokenInfo = this.solanaListTokenRepository.create({
                            slt_address: account.mint,
                            slt_name: tokenData.name || '',
                            slt_symbol: tokenData.symbol || '',
                            slt_decimals: tokenData.decimals || 0,
                            slt_logo_url: tokenData.logoURI || '',
                            slt_is_verified: tokenData.verified || false
                        });
                        await this.solanaListTokenRepository.save(tokenInfo as DeepPartial<SolanaListToken>);
                        await this.redisCacheService.set(cacheKey, tokenInfo, 3600);
                    } catch (error) {
                        this.logger.error(`Error fetching token info for ${account.mint}: ${error.message}`);
                    }
                }

                const tokenPrice = await this.solanaService.getTokenPricesInRealTime([account.mint]);
                const tokenBalanceUSD = account.amount * (tokenPrice?.get(account.mint)?.priceUSD || 0);

                const info = tokenInfo as Partial<SolanaListToken>;
                return {
                    token_address: account.mint,
                    token_name: info?.slt_name || `Token_${account.mint.slice(0, 8)}`,
                    token_symbol: info?.slt_symbol || account.mint.slice(0, 4).toUpperCase(),
                    token_logo_url: info?.slt_logo_url || '',
                    token_decimals: info?.slt_decimals || 0,
                    token_balance: account.amount,
                    token_balance_usd: tokenBalanceUSD,
                    token_price_usd: tokenPrice?.get(account.mint)?.priceUSD || 0,
                    token_price_sol: tokenPrice?.get(account.mint)?.priceSOL || 0,
                    is_verified: info?.slt_is_verified || false
                };
            }));

            return {
                status: 200,
                message: 'Token list retrieved successfully',
                data: {
                    wallet_address: walletAddress,
                    tokens: tokens
                }
            };
        } catch (error) {
            this.logger.error(`Error getting list buy tokens: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error getting list buy tokens: ${error.message}`,
                data: null
            };
        }
    }

    async getWalletInfoById(idOrPrivateKey: string | number) {
        try {
            let wallet: ListWallet | null = null;

            // Kiểm tra xem input có phải là private key của Solana không
            if (typeof idOrPrivateKey === 'string') {
                try {
                    // Thử decode private key để kiểm tra định dạng
                    const decodedKey = bs58.decode(idOrPrivateKey);
                    if (decodedKey.length === 64) { // Solana private key length
                        // Tìm ví với private key này
                        wallet = await this.listWalletRepository.createQueryBuilder('lw')
                            .where(`lw.wallet_private_key::jsonb->>'solana' = :privateKey`, { privateKey: idOrPrivateKey })
                            .getOne();
                    }
                } catch (error) {
                    // Nếu không decode được, có thể là wallet_id dạng string
                    const numericId = parseInt(idOrPrivateKey);
                    if (!isNaN(numericId)) {
                        wallet = await this.listWalletRepository.findOne({
                            where: { wallet_id: numericId }
                        });
                    }
                }
            } else {
                // Nếu là number, tìm theo wallet_id
                wallet = await this.listWalletRepository.findOne({
                    where: { wallet_id: idOrPrivateKey }
                });
            }

            if (!wallet) {
                return {
                    status: 404,
                    message: 'Wallet not found',
                    data: null
                };
            }

            // Tìm wallet_name từ wallet_auth (lấy bản ghi đầu tiên nếu có nhiều)
            const walletAuth = await this.walletAuthRepository.findOne({
                where: { wa_wallet_id: wallet.wallet_id }
            });

            return {
                status: 200,
                message: 'Wallet info retrieved successfully',
                data: {
                    wallet_id: wallet.wallet_id,
                    wallet_name: walletAuth?.wa_name || null,
                    wallet_nick_name: wallet.wallet_nick_name,
                    wallet_country: wallet.wallet_country || null,
                    solana_address: wallet.wallet_solana_address,
                    role: wallet.wallet_auth
                }
            };
        } catch (error) {
            this.logger.error(`Error getting wallet info: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error getting wallet info: ${error.message}`,
                data: null
            };
        }
    }

    async setWalletPassword(userId: number, dto: SetWalletPasswordDto) {
        const user = await this.userWalletRepository.findOne({
            where: { uw_id: userId }
        });

        if (!user) {
            throw new NotFoundException('User wallet not found');
        }

        // Check if password already exists
        if (user.uw_password) {
            throw new BadRequestException('Wallet password already set');
        }

        // Hash password using bcrypt
        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(dto.password, salt);

        // Update user wallet with hashed password
        user.uw_password = hashedPassword;
        await this.userWalletRepository.save(user)
        return { message: 'Wallet password set successfully' };
    }

    async verifyWalletPassword(userId: number, dto: VerifyWalletPasswordDto) {
        if (!userId || !dto || !dto.password) {
            throw new BadRequestException('Invalid request parameters');
        }

        const user = await this.userWalletRepository.findOne({
            where: { uw_id: userId }
        });

        if (!user) {
            throw new NotFoundException('User wallet not found');
        }

        if (!user.uw_password) {
            throw new NotFoundException('Wallet password not set');
        }

        const isPasswordValid = await bcrypt.compare(dto.password, user.uw_password);
        if (!isPasswordValid) {
            throw new BadRequestException('Invalid wallet password');
        }

        return { message: 'Wallet password verified successfully' };
    }

    async getWalletPrivateKeys(userId: number, walletId: number, dto: VerifyWalletPasswordDto) {
        // First verify the password
        await this.verifyWalletPassword(userId, dto);

        // Then proceed with getting private keys
        const wallet = await this.listWalletRepository.findOne({
            where: { wallet_id: walletId }
        });
        if (!wallet) {
            throw new NotFoundException('Wallet not found');
        }

        return {
            status: 200,
            message: 'Private keys retrieved successfully',
            data: {
                sol_private_key: JSON.parse(wallet.wallet_private_key).solana,
                eth_private_key: JSON.parse(wallet.wallet_private_key).ethereum,
                bnb_private_key: JSON.parse(wallet.wallet_private_key).ethereum,
            }
        };
    }

    async sendCodeResetPassword(userId: number) {
        try {
            // 1. Kiểm tra user tồn tại
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: userId }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User wallet not found'
                };
            }

            // 2. Kiểm tra user có telegram_id hoặc email không
            if (!userWallet.uw_telegram_id && !userWallet.uw_email) {
                return {
                    status: 400,
                    message: 'User has no Telegram account or email linked'
                };
            }

            // 3. Kiểm tra xem có code đang active không
            const now = new Date();
            const existingCode = await this.userWalletCodeRepository.findOne({
                where: {
                    tw_wallet_id: userId,
                    tw_code_type: 3,
                    tw_code_status: true,
                    tw_code_time: MoreThan(now)  // Code chưa hết hạn
                }
            });

            // Nếu đã có code active thì trả về lỗi 403
            if (existingCode) {
                return {
                    status: 403,
                    message: 'A reset code is already active. Please wait for it to expire or use the existing code.'
                };
            }

            // 4. Tạo code mới
            const code = this.generateRandomCode(4);
            const threeMinutesLater = new Date(now.getTime() + 3 * 60 * 1000); // UTC + 3 phút
            const newCode = this.userWalletCodeRepository.create({
                tw_wallet_id: userId,
                tw_code_type: 3,
                tw_code_status: true,
                tw_code_time: threeMinutesLater,
                tw_code_value: code
            });

            await this.userWalletCodeRepository.save(newCode);

            // 5. Gửi code qua Telegram nếu có
            if (userWallet.uw_telegram_id) {
                const message = `Your password reset code is: ${code}\nThis code will expire in 3 minutes.`;
                await this.telegramBotService.sendTelegramMessage(
                    parseInt(userWallet.uw_telegram_id),
                    message
                );
            }

            // 6. Gửi code qua email nếu có
            if (userWallet.uw_email) {
                await this.notificationService.sendPasswordResetCodeEmail(userWallet.uw_email, code);
            }

            return {
                status: 200,
                message: 'Reset code has been sent to your linked contact(s)'
            };

        } catch (error) {
            this.logger.error(`Error sending reset code: ${error.message}`, error.stack);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async verifyResetCode(userId: number, code: string) {
        const user = await this.userWalletRepository.findOne({
            where: { uw_id: userId }
        });

        if (!user) {
            throw new NotFoundException('User wallet not found');
        }

        const cacheKey = `reset_password:${userId}`;
        const cachedCode = await this.redisCacheService.get(cacheKey);
        console.log("cachedCode: " + cachedCode);

        if (!cachedCode) {
            throw new BadRequestException('Reset code has expired or not found');
        }

        if (cachedCode !== code) {
            throw new BadRequestException('Invalid reset code');
        }

        return {
            status: 200,
            message: 'Reset code verified successfully'
        };
    }

    async changePassword(userId: number, dto: ChangePasswordDto) {
        // 1. Kiểm tra user tồn tại
        const userWallet = await this.userWalletRepository.findOne({
            where: { uw_id: userId }
        });

        if (!userWallet) {
            throw new NotFoundException('User wallet not found');
        }

        // 2. Kiểm tra code reset password
        const now = new Date();

        const resetCode = await this.userWalletCodeRepository.findOne({
            where: {
                tw_wallet_id: userId,
                tw_code_type: 3,
                tw_code_status: true,
                tw_code_value: dto.code,
                tw_code_time: MoreThan(now)  // Code chưa hết hạn
            }
        });

        if (!resetCode) {
            throw new BadRequestException('Invalid or expired reset code');
        }

        // 3. Mã hóa password mới
        const hashedPassword = await bcrypt.hash(dto.password, 10);

        // 4. Cập nhật password
        userWallet.uw_password = hashedPassword;
        await this.userWalletRepository.save(userWallet);

        // 5. Đánh dấu code đã sử dụng
        resetCode.tw_code_status = false;
        await this.userWalletCodeRepository.save(resetCode);

        return {
            status: 200,
            message: 'Password changed successfully'
        };
    }

    async getWalletById(walletId: number): Promise<ListWallet | null> {
        return this.listWalletRepository.findOne({
            where: { wallet_id: walletId }
        });
    }

    async addGoogleAuth(userId: number, dto: AddGoogleAuthDto): Promise<AddGoogleAuthResponseDto> {
        try {
            // Find user wallet
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: userId }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User wallet not found'
                };
            }

            // Check if Google Auth is already active
            if (userWallet.active_gg_auth) {
                return {
                    status: 403, // Changed from 400 to 403 (Forbidden)
                    message: 'Google Authenticator is already active for this wallet'
                };
            }

            // Only verify password if user has set a password
            if (userWallet.uw_password) {
                if (!dto.password) {
                    return {
                        status: 400,
                        message: 'Password is required for users with existing password'
                    };
                }
                const isPasswordValid = await bcrypt.compare(dto.password, userWallet.uw_password);
                if (!isPasswordValid) {
                    return {
                        status: 401,
                        message: 'Invalid password'
                    };
                }
            }

            // Generate secret using speakeasy
            const secret = speakeasy.generateSecret({
                length: 20,
                name: `Memepump:${userWallet.uw_telegram_id}`,
                issuer: 'Memepump'
            });

            this.logger.log('Generated new Google Auth secret:', {
                userId,
                secret: secret.base32,
                otpauth_url: secret.otpauth_url
            });

            // Save new secret to database
            userWallet.google_auth = secret.base32;
            userWallet.active_gg_auth = false;
            await this.userWalletRepository.save(userWallet);

            return {
                status: 201, // Changed from 200 to 201 (Created)
                message: 'Google Authenticator setup successfully',
                qr_code_url: secret.otpauth_url,
                secret_key: secret.base32
            };
        } catch (error) {
            this.logger.error(`Error in addGoogleAuth: ${error.message}`);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async verifyGoogleAuthToken(userId: number, token: string): Promise<boolean> {
        try {
            const user = await this.userWalletRepository.findOne({
                where: { uw_id: userId }
            });

            if (!user) {
                throw new NotFoundException('User wallet not found');
            }

            if (!user.google_auth) {
                throw new BadRequestException('Google Authenticator is not set up for this wallet');
            }

            // Get current time in seconds since epoch (UTC)
            const currentTime = Math.floor(Date.now() / 1000);
            const timeStep = 30; // TOTP time step in seconds

            // Calculate counter (number of 30-second intervals since epoch)
            const counter = Math.floor(currentTime / timeStep);

            // Generate tokens for counter-1, counter, counter+1
            const tokens = [-1, 0, 1].map(offset => {
                const time = counter + offset;
                return speakeasy.totp({
                    secret: user.google_auth!, // Use non-null assertion since we checked above
                    encoding: 'base32',
                    counter: time,
                    digits: 6,
                    algorithm: 'sha1'
                });
            });

            this.logger.log('Token verification attempt:', {
                userId,
                inputToken: token,
                secret: user.google_auth,
                currentTime: new Date(currentTime * 1000).toISOString(),
                counter,
                generatedTokens: {
                    previous: tokens[0],
                    current: tokens[1],
                    next: tokens[2]
                }
            });

            // Check if input token matches any of the generated tokens
            const verified = tokens.includes(token);
            
            this.logger.log('Token verification result:', { 
                verified,
                token,
                matches: {
                    previous: token === tokens[0],
                    current: token === tokens[1],
                    next: token === tokens[2]
                }
            });

            return verified;
        } catch (error) {
            this.logger.error(`Error verifying Google Auth token: ${error.message}`, error.stack);
            throw error;
        }
    }

    async verifyAndActivateGoogleAuth(userId: number, token: string): Promise<{ status: number; message: string }> {
        try {
            const user = await this.userWalletRepository.findOne({
                where: { uw_id: userId }
            });

            if (!user) {
                return {
                    status: 404,
                    message: 'User wallet not found'
                };
            }

            // Check if Google Auth is already active
            if (user.active_gg_auth) {
                return {
                    status: 403, // Changed from 200 to 403 (Forbidden)
                    message: 'Google Authenticator is already active for this wallet'
                };
            }

            if (!user.google_auth) {
                return {
                    status: 400,
                    message: 'Google Authenticator is not set up for this wallet'
                };
            }

            // Verify token using the new method
            const isVerified = await this.verifyGoogleAuthToken(userId, token);
            if (!isVerified) {
                return {
                    status: 401, // Changed from 400 to 401 (Unauthorized)
                    message: 'Invalid verification code'
                };
            }

            // Activate Google Auth
            user.active_gg_auth = true;
            await this.userWalletRepository.save(user);

            return {
                status: 200,
                message: 'Google Authenticator activated successfully'
            };
        } catch (error) {
            this.logger.error(`Error verifying Google Authenticator: ${error.message}`, error.stack);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async removeGoogleAuth(userId: number, dto: RemoveGoogleAuthDto): Promise<RemoveGoogleAuthResponseDto> {
        try {
            // Find user wallet
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: userId }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User wallet not found'
                };
            }

            // Check if Google Auth is active
            if (!userWallet.active_gg_auth) {
                return {
                    status: 400,
                    message: 'Google Authenticator is not active for this wallet'
                };
            }

            // Verify password if user has set a password
            if (userWallet.uw_password) {
                if (!dto.password) {
                    return {
                        status: 400,
                        message: 'Password is required for users with existing password'
                    };
                }
                const isPasswordValid = await bcrypt.compare(dto.password, userWallet.uw_password);
                if (!isPasswordValid) {
                    return {
                        status: 401,
                        message: 'Invalid password'
                    };
                }
            }

            // Verify Google Auth token
            const isTokenValid = await this.verifyGoogleAuthToken(userId, dto.token);
            if (!isTokenValid) {
                return {
                    status: 401,
                    message: 'Invalid verification code'
                };
            }

            // Remove Google Auth
            userWallet.google_auth = null;
            userWallet.active_gg_auth = false;
            await this.userWalletRepository.save(userWallet);

            return {
                status: 200,
                message: 'Google Authenticator removed successfully'
            };
        } catch (error) {
            this.logger.error(`Error in removeGoogleAuth: ${error.message}`);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async addGmail(userId: number, dto: AddGmailDto): Promise<AddGmailResponseDto> {
        try {
            // 1. Kiểm tra user tồn tại
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: userId }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User wallet not found'
                };
            }

            // 2. Kiểm tra nếu user đã có email và active_email = true
            if (userWallet.uw_email && userWallet.active_email) {
                return {
                    status: 403,
                    message: 'Email is already verified'
                };
            }

            // 3. Xác thực code với Google và lấy thông tin email
            const tokens = await this.googleAuthService.exchangeCodeForToken(dto.code);
            const userInfo = await this.googleAuthService.verifyIdToken(tokens.id_token);

            // 4. Kiểm tra email đã được xác thực
            if (!userInfo.email_verified) {
                return {
                    status: 400,
                    message: 'Email is not verified'
                };
            }

            // 5. Kiểm tra email đã tồn tại trong hệ thống chưa
            const existingUser = await this.userWalletRepository.findOne({
                where: { uw_email: userInfo.email }
            });

            if (existingUser) {
                return {
                    status: 409,
                    message: 'Email is already associated with another account'
                };
            }

            // 6. Cập nhật email cho user (active_email vẫn là false)
            userWallet.uw_email = userInfo.email;
            await this.userWalletRepository.save(userWallet);

            return {
                status: 200,
                message: 'Email added successfully'
            };

        } catch (error) {
            this.logger.error(`Error adding Gmail: ${error.message}`, error.stack);
            return {
                status: 500,
                message: error.message || 'Internal server error'
            };
        }
    }

    private generateRandomCode(length: number): string {
        const uppercaseLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        const allChars = uppercaseLetters + numbers;
        let code = '';

        // Đảm bảo code có ít nhất 1 chữ hoa và 1 số
        code += uppercaseLetters.charAt(Math.floor(Math.random() * uppercaseLetters.length));
        code += numbers.charAt(Math.floor(Math.random() * numbers.length));

        // Thêm các ký tự ngẫu nhiên còn lại
        for (let i = code.length; i < length; i++) {
            code += allChars.charAt(Math.floor(Math.random() * allChars.length));
        }

        // Xáo trộn code
        return code.split('').sort(() => Math.random() - 0.5).join('');
    }

    async setMailCode(userId: number): Promise<SetMailCodeResponseDto> {
        try {
            // 1. Kiểm tra user tồn tại
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: userId }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User wallet not found'
                };
            }

            // 2. Kiểm tra user có telegram_id không
            if (!userWallet.uw_telegram_id) {
                return {
                    status: 400,
                    message: 'User has no Telegram account linked'
                };
            }

            // 3. Kiểm tra xem có code đang active không
            const now = new Date();

            const existingCode = await this.userWalletCodeRepository.findOne({
                where: {
                    tw_wallet_id: userId,
                    tw_code_type: 2,
                    tw_code_status: true,
                    tw_code_time: MoreThan(now)  // Code chưa hết hạn
                }
            });

            // Nếu đã có code active thì trả về lỗi 403
            if (existingCode) {
                return {
                    status: 403,
                    message: 'A verification code is already active. Please wait for it to expire or use the existing code.'
                };
            }

            // 4. Tạo code mới
            const code = this.generateRandomCode(8);
            const threeMinutesLater = new Date(now.getTime() + 3 * 60 * 1000); // UTC + 3 phút
            const newCode = this.userWalletCodeRepository.create({
                tw_wallet_id: userId,
                tw_code_type: 2,
                tw_code_status: true,
                tw_code_time: threeMinutesLater,
                tw_code_value: code
            });

            await this.userWalletCodeRepository.save(newCode);

            // 5. Gửi code qua Telegram
            const message = `Your email verification code is: ${code}\nThis code will expire in 3 minutes.`;
            await this.telegramBotService.sendTelegramMessage(
                parseInt(userWallet.uw_telegram_id),
                message
            );

            return {
                status: 200,
                message: 'Verification code has been sent to your Telegram account'
            };

        } catch (error) {
            this.logger.error(`Error sending verification code: ${error.message}`, error.stack);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async verifyGmail(userId: number, dto: VerifyGmailDto): Promise<VerifyGmailResponseDto> {
        try {
            // 1. Kiểm tra user tồn tại
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: userId }
            });

            if (!userWallet) {
                return {
                    status: 404,
                    message: 'User wallet not found'
                };
            }

            // 2. Kiểm tra nếu user đã có email và active_email = true
            if (userWallet.uw_email && userWallet.active_email) {
                return {
                    status: 403,
                    message: 'Email is already verified'
                };
            }

            // 3. Kiểm tra verification code
            const now = new Date();

            const verificationCode = await this.userWalletCodeRepository.findOne({
                where: {
                    tw_wallet_id: userId,
                    tw_code_type: 2,
                    tw_code_status: true,
                    tw_code_value: dto.telegram_code,
                    tw_code_time: MoreThan(now)  // Code chưa hết hạn
                }
            });

            if (!verificationCode) {
                return {
                    status: 400,
                    message: 'Invalid or expired verification code'
                };
            }

            // 4. Cập nhật active_email = true
            userWallet.active_email = true;
            await this.userWalletRepository.save(userWallet);

            // 5. Đánh dấu code đã sử dụng
            verificationCode.tw_code_status = false;
            await this.userWalletCodeRepository.save(verificationCode);

            return {
                status: 200,
                message: 'Email verified successfully'
            };

        } catch (error) {
            this.logger.error(`Error verifying Gmail: ${error.message}`, error.stack);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async updateExistingTokenLogoUrls(): Promise<{ updated: number; errors: number }> {
        return await this.solanaService.updateExistingTokenLogoUrls();
    }

    async getWalletByEmail(email: string, walletType?: string) {
        
        try {
            // Tìm user wallet theo email
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_email: email }
            });

            if (!userWallet) {
                return {
                    success: false,
                    message: 'User not found with this email',
                    data: null
                };
            }

            // Tìm wallet auth của user này
            let walletAuthQuery = this.walletAuthRepository
                .createQueryBuilder('wa')
                .leftJoinAndSelect('wa.wa_wallet', 'wallet')
                .where('wa.wa_user_id = :userId', { userId: userWallet.uw_id });

            // Nếu có walletType, thêm điều kiện lọc
            if (walletType) {
                walletAuthQuery = walletAuthQuery.andWhere('wa.wa_type = :walletType', { walletType });
            }

            const walletAuths = await walletAuthQuery.getMany();

            if (!walletAuths || walletAuths.length === 0) {
                this.logger.log(`No wallet auth found for user: ${userWallet.uw_id}`);
                return {
                    success: false,
                    message: 'No wallet found for this user',
                    data: null
                };
            }

            // Lấy ví đầu tiên (hoặc ví main nếu có)
            let selectedWalletAuth = walletAuths[0];
            if (walletType) {
                selectedWalletAuth = walletAuths.find(wa => wa.wa_type === walletType) || walletAuths[0];
            } else {
                // Ưu tiên ví main
                selectedWalletAuth = walletAuths.find(wa => wa.wa_type === 'main') || walletAuths[0];
            }

            const wallet = selectedWalletAuth.wa_wallet;

            this.logger.log(`Found wallet: ${wallet.wallet_id} for user: ${userWallet.uw_id}`);

            return {
                success: true,
                message: 'Wallet information retrieved successfully',
                data: {
                    walletId: wallet.wallet_id,
                    solanaAddress: wallet.wallet_solana_address,
                    ethAddress: wallet.wallet_eth_address,
                    nickName: wallet.wallet_nick_name || 'Unnamed Wallet',
                    walletType: selectedWalletAuth.wa_type,
                    userEmail: userWallet.uw_email
                }
            };

        } catch (error) {
            this.logger.error('Error in getWalletByEmail:', error);
            return {
                success: false,
                message: 'An error occurred while searching for wallet',
                data: null
            };
        }
    }

    async getSolUsdtInfo(user: any) {
        try {
            const { wallet_id } = user;
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id }
            });

            if (!wallet) {
                return {
                    status: 404,
                    message: 'Wallet not found'
                };
            }

            const walletAddress = wallet.wallet_solana_address;
            const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
            const SOL_MINT = 'So11111111111111111111111111111111111111112';
            const BITT_MINT = '4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN';

            // Get SOL balance
            let solBalance = 0;
            try {
                const solBalanceInfo = await this.getWalletBalance(walletAddress);
                if (solBalanceInfo.status === 200 && solBalanceInfo.data) {
                    solBalance = solBalanceInfo.data.sol_balance || 0;
                }
            } catch (error) {
                this.logger.error(`Error fetching SOL balance: ${error.message}`);
            }

            // Get USDT balance
            let usdtBalance = 0;
            try {
                usdtBalance = await this.solanaService.getTokenBalance(walletAddress, USDT_MINT);
            } catch (error) {
                this.logger.error(`Error fetching USDT balance: ${error.message}`);
            }

            // Get BITT balance
            let bittBalance = 0;
            try {
                bittBalance = await this.solanaService.getTokenBalance(walletAddress, BITT_MINT);
            } catch (error) {
                this.logger.error(`Error fetching BITT balance: ${error.message}`);
            }

            // Get token prices
            const tokenPrices = await this.solanaService.getTokenPricesInRealTime([SOL_MINT, USDT_MINT, BITT_MINT]);
            
            const solPriceUSD = tokenPrices?.get(SOL_MINT)?.priceUSD || 0;
            const solPriceSOL = 1; // SOL price in SOL is always 1
            const usdtPriceUSD = tokenPrices?.get(USDT_MINT)?.priceUSD || 1;
            const usdtPriceSOL = tokenPrices?.get(USDT_MINT)?.priceSOL || 0;
            const bittPriceUSD = tokenPrices?.get(BITT_MINT)?.priceUSD || 0;
            const bittPriceSOL = tokenPrices?.get(BITT_MINT)?.priceSOL || 0;

            const solInfo = {
                token_address: SOL_MINT,
                token_name: 'Solana',
                token_symbol: 'SOL',
                token_logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
                token_decimals: 9,
                token_balance: solBalance,
                token_balance_usd: solBalance * solPriceUSD,
                token_price_usd: solPriceUSD,
                token_price_sol: solPriceSOL,
                is_verified: true
            };

            const usdtInfo = {
                token_address: USDT_MINT,
                token_name: 'USDT',
                token_symbol: 'USDT',
                token_logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
                token_decimals: 6,
                token_balance: usdtBalance,
                token_balance_usd: usdtBalance * usdtPriceUSD,
                token_price_usd: usdtPriceUSD,
                token_price_sol: usdtPriceSOL,
                is_verified: true
            };

            const bittInfo = {
                token_address: BITT_MINT,
                token_name: 'Bitcoin AI Trading Token',
                token_symbol: 'BITT',
                token_logo_url: 'https://ipfs.filebase.io/ipfs/QmYXoGub5bFrqMGDtCM6WuCKch4BUizmENR4R8MQxW2bfq',
                token_decimals: 9,
                token_balance: bittBalance,
                token_balance_usd: bittBalance * bittPriceUSD,
                token_price_usd: bittPriceUSD,
                token_price_sol: bittPriceSOL,
                is_verified: true
            };

            return {
                status: 200,
                message: 'SOL, USDT and BITT info retrieved successfully',
                data: {
                    wallet_address: walletAddress,
                    sol: solInfo,
                    usdt: usdtInfo,
                    bitt: bittInfo
                }
            };
        } catch (error) {
            this.logger.error(`Error getting SOL and USDT info: ${error.message}`, error.stack);
            return {
                status: 500,
                message: `Error getting SOL and USDT info: ${error.message}`,
                data: null
            };
        }
    }
}
