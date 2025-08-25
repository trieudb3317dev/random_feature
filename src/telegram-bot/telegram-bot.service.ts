import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { ethers } from 'ethers';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { UserWalletCode } from 'src/telegram-wallets/entities/user-wallet-code.entity';
import { randomBytes } from 'crypto';
import { TelegramWalletsService } from '../telegram-wallets/telegram-wallets.service';
import { SolanaService } from '../solana/solana.service';
import { createHash } from 'crypto';
import { UserWallet } from 'src/telegram-wallets/entities/user-wallet.entity';
import { WalletAuth } from 'src/telegram-wallets/entities/wallet-auth.entity';
import { WalletReferent } from '../referral/entities/wallet-referent.entity';
import { BgRefService } from '../referral/bg-ref.service';
import axios from 'axios';

@Injectable()
export class TelegramBotService implements OnModuleInit {
    private botToken: string;
    private frontendUrl: string;
    private workerUrl: string;
    private readonly logger = new Logger(TelegramBotService.name);
    private lastUpdateId: number = 0;
    private isPolling: boolean = false;

    constructor(
        private configService: ConfigService,
        @InjectRepository(ListWallet)
        private listWalletRepository: Repository<ListWallet>,
        @InjectRepository(UserWallet)
        private userWalletRepository: Repository<UserWallet>,
        @InjectRepository(WalletAuth)
        private walletAuthRepository: Repository<WalletAuth>,
        @InjectRepository(UserWalletCode)
        private userWalletCodeRepository: Repository<UserWalletCode>,
        @InjectRepository(WalletReferent)
        private walletReferentRepository: Repository<WalletReferent>,
        @Inject(forwardRef(() => TelegramWalletsService))
        private readonly telegramWalletsService: TelegramWalletsService,
        private readonly solanaService: SolanaService,
        private readonly bgRefService: BgRefService,
    ) {
        this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
        this.frontendUrl = this.configService.get<string>('URL_FRONTEND', '');
        this.workerUrl = this.configService.get<string>('URL_WORKER', 'https://proxy.michosso2025.workers.dev');

        if (!this.botToken) {
            throw new Error('TELEGRAM_BOT_TOKEN is missing in .env file');
        }

        if (!this.frontendUrl) {
            throw new Error('URL_FRONTEND is missing in .env file');
        }
    }

    private async sendMessage(chatId: number, text: string, options?: any): Promise<any> {
        try {
            const url = `${this.workerUrl}/bot${this.botToken}/sendMessage`;
            const response = await axios.post(url, {
                chat_id: chatId,
                text: text,
                ...options
            });
            return response.data;
        } catch (error) {
            this.logger.error(`Error sending message: ${error.message}`);
            throw error;
        }
    }

    private async getUpdates(): Promise<any[]> {
        try {
            const url = `${this.workerUrl}/bot${this.botToken}/getUpdates`;
            const response = await axios.get(url, {
                params: {
                    offset: this.lastUpdateId + 1,
                    timeout: 30
                }
            });
            return response.data.result || [];
        } catch (error) {
            this.logger.error(`Error getting updates: ${error.message}`);
            return [];
        }
    }

    private async handleUpdate(update: any): Promise<void> {
        if (!update.message) return;

        const message = update.message;
        const chatId = message.chat.id;
        const text = message.text;
        const telegramId = message.from?.id?.toString();

        if (!telegramId) {
            await this.sendMessage(chatId, '❌ Lỗi: Không thể xác định Telegram ID.');
            return;
        }

        if (text?.startsWith('/start')) {
            try {
                let refCode: string | undefined = undefined;
                const match = text.match(/\/start(?:[\s_](.+))?/);
                
                if (match && match[1]) {
                    const param = match[1].trim();
                    
                    if (param.startsWith('ref=')) {
                        refCode = param.substring(4);
                    } else if (param.includes('ref=')) {
                        const refIndex = param.indexOf('ref=');
                        if (refIndex !== -1) {
                            const afterRef = param.substring(refIndex + 4);
                            const spaceIndex = afterRef.indexOf(' ');
                            refCode = spaceIndex !== -1 ? afterRef.substring(0, spaceIndex) : afterRef;
                        }
                    } else {
                        refCode = param;
                    }
                }

                this.logger.log(`Processing /start command for ${telegramId} with refCode: ${refCode || 'none'}`);
                
                const existingUser = await this.userWalletRepository.findOne({ 
                    where: { uw_telegram_id: telegramId } 
                });
                
                const isNewUser = !existingUser;
                const wallets = await this.getOrCreateWallet(telegramId, refCode);
                
                let solBalance = 0;
                try {
                    solBalance = await this.solanaService.getBalance(wallets.solana);
                } catch (balanceError) {
                    this.logger.error(`Error getting Solana balance: ${balanceError.message}`);
                }

                let referralMessage = '';
                if (refCode && isNewUser) {
                    if (wallets.referralSuccess) {
                        referralMessage = `\n\n🎁 *Thành công*: Bạn đã sử dụng mã giới thiệu: *${refCode}*`;
                    } else {
                        referralMessage = `\n\n🔍 Mã giới thiệu *${refCode}* không hợp lệ.`;
                    }
                }

                const message = `
⭐️ *Log in to MemePump for trading in seconds* 🤘

💰 *Solana*: ${solBalance.toFixed(5)} SOL _(Please top up 👇)_
\`${wallets.solana}\`

💰 *Ethereum*: 0 ETH _(Please top up 👇)_
\`${wallets.ethereum}\`

💰 *BSC*: 0 BNB _(Please top up 👇)_
\`${wallets.bsc}\`${referralMessage}
                `;

                // Kiểm tra xem user có phải là BG affiliate không
                let isBgAffiliate = false;
                try {
                    isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(wallets.walletId);
                } catch (bgError) {
                    this.logger.error(`Error checking BG affiliate status: ${bgError.message}`);
                }

                // Tạo keyboard với 1 hoặc 2 nút tùy theo trạng thái BG affiliate
                const keyboardButtons = [
                    [{ text: '🌐 Login Website', url: wallets.websiteLink }]
                ];

                // Thêm nút BG Affiliate nếu user là BG affiliate
                if (isBgAffiliate) {
                    const bgAffiliateUrl = wallets.websiteLink.replace(this.frontendUrl, `${this.frontendUrl.replace('https://', 'https://affiliate.')}`);
                    keyboardButtons.push([{ text: '🎯 BG Affiliate', url: bgAffiliateUrl }]);
                }

                const keyboard = {
                    inline_keyboard: keyboardButtons,
                };

                await this.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
                
            } catch (error) {
                this.logger.error(`Start command failed: ${error.message}`);
                await this.sendMessage(chatId, '❌ Có lỗi xảy ra. Vui lòng thử lại sau.');
            }
        }
    }

    private async initializeLastUpdateId(): Promise<void> {
        try {
            const url = `${this.workerUrl}/bot${this.botToken}/getUpdates`;
            const response = await axios.get(url, {
                params: {
                    limit: 1,
                    offset: -1  // Lấy update mới nhất
                }
            });
            
            const updates = response.data.result || [];
            if (updates.length > 0) {
                this.lastUpdateId = updates[0].update_id;
                this.logger.log(`Initialized lastUpdateId to ${this.lastUpdateId}`);
            } else {
                this.lastUpdateId = 0;
                this.logger.log('No updates found, initialized lastUpdateId to 0');
            }
        } catch (error) {
            this.logger.error(`Error initializing lastUpdateId: ${error.message}`);
            this.lastUpdateId = 0;
        }
    }

    private async startPolling(): Promise<void> {
        if (this.isPolling) return;
        
        this.isPolling = true;
        this.logger.log('Starting polling...');

        const poll = async () => {
            if (!this.isPolling) return;

            try {
                const updates = await this.getUpdates();
                
                for (const update of updates) {
                    this.lastUpdateId = update.update_id;
                    await this.handleUpdate(update);
                }
            } catch (error) {
                this.logger.error(`Polling error: ${error.message}`);
            }

            // Schedule next poll
            setTimeout(poll, 1000);
        };

        // Start polling
        poll();
    }

    async onModuleInit() {
        // this.logger.log('🚀 Telegram bot starting...');
        // await this.startPolling();
        // this.logger.log('🚀 Telegram bot started');
    }

    /**
     * Tạo mã giới thiệu 6 ký tự ngẫu nhiên và kiểm tra trùng lặp
     * @returns Mã giới thiệu duy nhất
     */
    private async generateUniqueReferralCode(): Promise<string> {
        const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz';
        const CODE_LENGTH = 6;
        
        // Tạo mã ngẫu nhiên 6 ký tự
        const generateCode = () => {
            let code = '';
            for (let i = 0; i < CODE_LENGTH; i++) {
                const randomIndex = Math.floor(Math.random() * CHARS.length);
                code += CHARS.charAt(randomIndex);
            }
            return code;
        };
        
        // Kiểm tra tính duy nhất của mã
        let isUnique = false;
        let newCode = '';
        
        // Lặp cho đến khi tìm được mã duy nhất
        while (!isUnique) {
            newCode = generateCode();
            
            // Kiểm tra xem mã đã tồn tại trong cơ sở dữ liệu chưa
            const existingWallet = await this.listWalletRepository.findOne({
                where: { wallet_code_ref: newCode }
            });
            
            if (!existingWallet) {
                isUnique = true;
            }
        }
        
        this.logger.log(`Generated unique referral code: ${newCode}`);
        return newCode;
    }

    /**
     * Tìm ví dựa vào mã giới thiệu
     * @param referralCode Mã giới thiệu
     * @returns Ví tìm thấy hoặc null
     */
    private async findWalletByReferralCode(referralCode: string): Promise<ListWallet | null> {
        // Tìm ví với mã giới thiệu
        const wallet = await this.listWalletRepository.findOne({
            where: { wallet_code_ref: referralCode }
        });
        
        if (wallet) {
            this.logger.log(`Found wallet ${wallet.wallet_id} with referral code ${referralCode}`);
        } else {
            this.logger.warn(`No wallet found with referral code ${referralCode}`);
        }
        
        return wallet;
    }

    /**
     * Tạo quan hệ giới thiệu đa cấp hoặc thêm vào BG affiliate
     * @param inviteeWalletId ID ví của người được giới thiệu
     * @param referrerWalletId ID ví của người giới thiệu cấp 1
     * @returns true nếu tạo thành công, false nếu có lỗi
     */
    private async createMultiLevelReferralRelationships(inviteeWalletId: number, referrerWalletId: number): Promise<boolean> {
        try {
            // Kiểm tra không cho phép tự giới thiệu chính mình
            if (inviteeWalletId === referrerWalletId) {
                this.logger.warn(`Cannot create self-referral relationship for wallet ${inviteeWalletId}`);
                return false;
            }
            
            // Kiểm tra referrer có thuộc BG affiliate không
            const isReferrerBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(referrerWalletId);
            
            if (isReferrerBgAffiliate) {
                // Thêm vào BG affiliate tree
                try {
                    await this.bgRefService.addToBgAffiliateTree(referrerWalletId, inviteeWalletId);
                    this.logger.log(`Added wallet ${inviteeWalletId} to BG affiliate tree of referrer ${referrerWalletId}`);
                    return true;
                } catch (bgError) {
                    this.logger.error(`Error adding to BG affiliate tree: ${bgError.message}`);
                    // Nếu thêm vào BG affiliate thất bại, fallback về multi-level
                    this.logger.log(`Falling back to multi-level referral for wallet ${inviteeWalletId}`);
                }
            }
            
            // Tạo mảng để lưu tất cả các quan hệ giới thiệu cần tạo (multi-level truyền thống)
            const MAX_LEVELS = 10;  // Tối đa 10 tầng (cấp)
            type ReferralRelation = {
                wr_wallet_invitee: number;
                wr_wallet_referent: number;
                wr_wallet_level: number;
            };
            
            const referralRelationships: ReferralRelation[] = [];
            
            // Thêm quan hệ giới thiệu cấp 1 (trực tiếp)
            referralRelationships.push({
                wr_wallet_invitee: inviteeWalletId,
                wr_wallet_referent: referrerWalletId,
                wr_wallet_level: 1
            });
            
            // Tìm tất cả người giới thiệu của người giới thiệu (cấp 2 đến cấp 9)
            const upperReferrers = await this.findUpperReferrers(referrerWalletId);
            this.logger.log(`Found ${upperReferrers.length} upper level referrers for wallet ${referrerWalletId}`);
            
            // Thêm từng quan hệ giới thiệu từ cấp 2 trở lên (nếu có)
            for (let i = 0; i < upperReferrers.length && i < MAX_LEVELS - 1; i++) {
                const level = i + 2; // Cấp bắt đầu từ 2
                referralRelationships.push({
                    wr_wallet_invitee: inviteeWalletId,
                    wr_wallet_referent: upperReferrers[i].referrer_id,
                    wr_wallet_level: level
                });
            }
            
            // Lưu tất cả các quan hệ giới thiệu vào cơ sở dữ liệu
            for (const relation of referralRelationships) {
                const newReferral = this.walletReferentRepository.create(relation);
                await this.walletReferentRepository.save(newReferral);
                this.logger.log(`Created level ${relation.wr_wallet_level} referral: wallet ${relation.wr_wallet_referent} referred wallet ${relation.wr_wallet_invitee}`);
            }
            
            this.logger.log(`Created ${referralRelationships.length} multi-level referral relationships for wallet ${inviteeWalletId}`);
            return true;
        } catch (error) {
            this.logger.error(`Error creating referral relationships: ${error.message}`, error.stack);
            return false;
        }
    }
    
    /**
     * Tìm tất cả người giới thiệu ở cấp cao hơn của một ví
     * @param walletId ID ví cần tìm người giới thiệu
     * @returns Mảng các ID ví người giới thiệu, từ cấp gần nhất đến xa nhất
     */
    private async findUpperReferrers(walletId: number): Promise<{referrer_id: number, level: number}[]> {
        try {
            // Tìm tất cả người giới thiệu của ví này
            const relationships = await this.walletReferentRepository.find({
                where: { wr_wallet_invitee: walletId },
                order: { wr_wallet_level: 'ASC' } // Sắp xếp theo cấp, từ thấp đến cao
            });
            
            if (relationships.length === 0) {
                return [];
            }
            
            // Chuyển đổi thành mảng ID người giới thiệu và cấp
            return relationships.map(rel => ({ 
                referrer_id: rel.wr_wallet_referent,
                level: rel.wr_wallet_level
            }));
            
        } catch (error) {
            this.logger.error(`Error finding upper referrers: ${error.message}`, error.stack);
            return [];
        }
    }

    async getOrCreateWallet(telegramId: string, refCode?: string): Promise<{ solana: string; ethereum: string; bsc: string; solanaPrivateKey: string; ethPrivateKey: string; code: string; websiteLink: string; refCode?: string; referralSuccess?: boolean; walletId: number }> {
        try {
            this.logger.log(`Creating or getting wallet for Telegram ID: ${telegramId}`);
            
            // Kiểm tra nếu user đã tồn tại trong bảng user_wallets
            let userWallet = await this.userWalletRepository.findOne({ 
                where: { uw_telegram_id: telegramId },
                relations: ['wallet_auths', 'wallet_auths.wa_wallet']
            });

            let listWallet: ListWallet;
            let isNewUser = false;
            let referralSuccess = false;
            let referrerWallet: ListWallet | null = null;

            // Nếu user chưa tồn tại, tạo mới user và wallet
            if (!userWallet) {
                isNewUser = true;
                this.logger.log(`Creating new user for Telegram ID: ${telegramId}`);

                // Kiểm tra mã giới thiệu nếu có (chỉ xử lý mã giới thiệu cho người dùng mới)
                if (refCode) {
                    referrerWallet = await this.findWalletByReferralCode(refCode);
                }
                
                // Tạo Solana keypair ngẫu nhiên
                const solanaKeypair = Keypair.generate();
                const solanaPublicKey = solanaKeypair.publicKey.toBase58();
                const solanaPrivateKey = bs58.encode(solanaKeypair.secretKey);

                // Tạo Ethereum private key từ Solana private key
                const ethPrivateKey = this.deriveEthereumPrivateKey(solanaKeypair.secretKey);
                const ethWallet = new ethers.Wallet(ethPrivateKey);
                const ethAddress = ethWallet.address;

                // 1. Tạo user mới
                userWallet = this.userWalletRepository.create({
                    uw_telegram_id: telegramId
                });
                await this.userWalletRepository.save(userWallet);

                // Tạo mã giới thiệu ngẫu nhiên 6 ký tự
                const referralCode = await this.generateUniqueReferralCode();

                // 2. Tạo ví mới
                listWallet = this.listWalletRepository.create({
                    wallet_private_key: JSON.stringify({
                        solana: solanaPrivateKey,
                        ethereum: ethPrivateKey
                    }),
                    wallet_solana_address: solanaPublicKey,
                    wallet_eth_address: ethAddress,
                    wallet_status: true,
                    wallet_auth: 'member',
                    wallet_code_ref: referralCode
                });
                
                // Lưu ví vào cơ sở dữ liệu
                await this.listWalletRepository.save(listWallet);

                // 3. Tạo liên kết wallet_auth
                const walletAuth = this.walletAuthRepository.create({
                    wa_user_id: userWallet.uw_id,
                    wa_wallet_id: listWallet.wallet_id,
                    wa_type: 'main'
                });
                await this.walletAuthRepository.save(walletAuth);
                
                this.logger.log(`Created new wallet for user ${telegramId}: ${solanaPublicKey} with referral code: ${referralCode}`);

                // 4. Tạo quan hệ giới thiệu đa cấp nếu có mã giới thiệu hợp lệ
                if (referrerWallet) {
                    referralSuccess = await this.createMultiLevelReferralRelationships(listWallet.wallet_id, referrerWallet.wallet_id);
                }
            } else {
                this.logger.log(`Found existing user for Telegram ID: ${telegramId}`);
                // Nếu user đã tồn tại, lấy ví chính (main wallet)
                if (userWallet.wallet_auths && userWallet.wallet_auths.length > 0) {
                    const mainWalletAuth = userWallet.wallet_auths.find(auth => auth.wa_type === 'main');
                    if (mainWalletAuth && mainWalletAuth.wa_wallet) {
                        listWallet = mainWalletAuth.wa_wallet;
                    } else {
                        // Nếu không tìm thấy ví chính, sử dụng ví đầu tiên
                        listWallet = userWallet.wallet_auths[0].wa_wallet;
                    }
                    
                    // ✨ Cập nhật địa chỉ ví từ private key
                    await this.updateWalletAddresses(listWallet);
                    
                    // Kiểm tra và cập nhật wallet_code_ref nếu chưa có
                    if (!listWallet.wallet_code_ref) {
                        const referralCode = await this.generateUniqueReferralCode();
                        listWallet.wallet_code_ref = referralCode;
                        await this.listWalletRepository.save(listWallet);
                        this.logger.log(`Updated wallet ${listWallet.wallet_id} with new referral code: ${referralCode}`);
                    }
                    
                    // Không xử lý mã giới thiệu cho người dùng đã tồn tại
                    if (refCode) {
                        this.logger.log(`Ignoring referral code for existing user: ${telegramId}`);
                    }
                } else {
                    this.logger.log(`User ${telegramId} exists but has no wallet, creating new wallet`);
                    // Trường hợp có user nhưng không có ví (hiếm gặp)
                    // Tạo ví mới và liên kết
                    const solanaKeypair = Keypair.generate();
                    const solanaPublicKey = solanaKeypair.publicKey.toBase58();
                    const solanaPrivateKey = bs58.encode(solanaKeypair.secretKey);
                    const ethPrivateKey = this.deriveEthereumPrivateKey(solanaKeypair.secretKey);
                    const ethWallet = new ethers.Wallet(ethPrivateKey);
                    
                    // Tạo mã giới thiệu ngẫu nhiên 6 ký tự
                    const referralCode = await this.generateUniqueReferralCode();
                    
                    listWallet = this.listWalletRepository.create({
                        wallet_private_key: JSON.stringify({
                            solana: solanaPrivateKey,
                            ethereum: ethPrivateKey
                        }),
                        wallet_solana_address: solanaPublicKey,
                        wallet_eth_address: ethWallet.address,
                        wallet_status: true,
                        wallet_auth: 'member',
                        wallet_code_ref: referralCode
                    });
                    
                    // Lưu ví vào cơ sở dữ liệu
                    await this.listWalletRepository.save(listWallet);

                    const walletAuth = this.walletAuthRepository.create({
                        wa_user_id: userWallet.uw_id,
                        wa_wallet_id: listWallet.wallet_id,
                        wa_type: 'main'
                    });
                    await this.walletAuthRepository.save(walletAuth);
                    
                    this.logger.log(`Created new wallet for existing user ${telegramId} with referral code: ${referralCode}`);
                    
                    // Không xử lý mã giới thiệu cho người dùng đã tồn tại (Ngay cả khi họ đang tạo ví mới)
                    if (refCode) {
                        this.logger.log(`Ignoring referral code for existing user with new wallet: ${telegramId}`);
                    }
                }
            }

            // Parse private key từ ví
            const privateKeyObj = JSON.parse(listWallet.wallet_private_key);
            const solanaPrivateKey = privateKeyObj.solana;
            const ethPrivateKey = privateKeyObj.ethereum;

            // Tạo code mới và lưu vào user_wallet_code
            const code = await this.generateNewCode(userWallet);
            this.logger.log(`Created wallet code for user ${telegramId}`);

            // Tạo link website với telegram_id và code, thêm tham số ref nếu có
            let websiteLink = `${this.frontendUrl}/tglogin?id=${telegramId}&code=${code}`;
            
            // Ưu tiên sử dụng wallet_code_ref nếu không có refCode được chỉ định
            const finalRefCode = refCode || listWallet.wallet_code_ref;
            
            if (finalRefCode) {
                websiteLink += `&ref=${finalRefCode}`;
                this.logger.log(`Added referral code ${finalRefCode} to website link`);
            }
            
            this.logger.log(`Generated login link for user ${telegramId}`);

            return {
                solana: listWallet.wallet_solana_address,
                ethereum: listWallet.wallet_eth_address,
                bsc: listWallet.wallet_eth_address, // BSC sử dụng cùng địa chỉ với ETH
                solanaPrivateKey: solanaPrivateKey,
                ethPrivateKey: ethPrivateKey,
                code: code,
                websiteLink: websiteLink,
                refCode: finalRefCode,
                referralSuccess,
                walletId: listWallet.wallet_id
            };
        } catch (error) {
            this.logger.error(`Error in getOrCreateWallet: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Tạo Ethereum private key từ Solana private key
     * @param solanaSecretKey Uint8Array Solana secret key
     * @returns Ethereum private key (hex string with 0x prefix)
     */
    private deriveEthereumPrivateKey(solanaSecretKey: Uint8Array): string {
        // Lấy 32 bytes đầu tiên từ Solana secret key
        const ethPrivateKeyBytes = solanaSecretKey.slice(0, 32);

        // Chuyển đổi sang hex string và thêm prefix 0x
        const ethPrivateKey = '0x' + Buffer.from(ethPrivateKeyBytes).toString('hex');

        // Kiểm tra tính hợp lệ của private key
        try {
            new ethers.Wallet(ethPrivateKey);
            return ethPrivateKey;
        } catch (error) {
            throw new Error('Invalid Ethereum private key generated');
        }
    }

    // Thêm phương thức để cập nhật địa chỉ ví từ private key
    private async updateWalletAddresses(wallet: ListWallet): Promise<ListWallet> {
        try {
            let updated = false;
            const privateKeyObject = JSON.parse(wallet.wallet_private_key);

            // Cập nhật địa chỉ Solana
            if (privateKeyObject.solana) {
                try {
                    const solanaKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyObject.solana));
                    const solanaAddress = solanaKeypair.publicKey.toBase58();
                    
                    if (wallet.wallet_solana_address !== solanaAddress) {
                        wallet.wallet_solana_address = solanaAddress;
                        updated = true;
                        this.logger.log(`Updated Solana address for wallet ${wallet.wallet_id} to ${solanaAddress}`);
                    }
                } catch (e) {
                    this.logger.error(`Error updating Solana address: ${e.message}`);
                }
            }

            // Cập nhật địa chỉ Ethereum
            if (privateKeyObject.ethereum) {
                try {
                    const ethWallet = new ethers.Wallet(privateKeyObject.ethereum);
                    
                    if (wallet.wallet_eth_address !== ethWallet.address) {
                        wallet.wallet_eth_address = ethWallet.address;
                        updated = true;
                        this.logger.log(`Updated Ethereum address for wallet ${wallet.wallet_id} to ${ethWallet.address}`);
                    }
                } catch (e) {
                    this.logger.error(`Error updating Ethereum address: ${e.message}`);
                }
            }

            // Lưu nếu có thay đổi
            if (updated) {
                await this.listWalletRepository.save(wallet);
            }

            return wallet;
        } catch (error) {
            this.logger.error('Error updating wallet addresses:', error);
            return wallet;
        }
    }

    async generateNewCode(userWallet: UserWallet): Promise<string> {
        // Generate a random hex string using crypto
        const code = randomBytes(16).toString('hex');
        
        // Create dates explicitly in UTC
        const now = new Date();
        // Convert current time to UTC and add 10 minutes
        const expirationTime = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes() + 10,
            now.getUTCSeconds()
        ));
        
        this.logger.debug('Generating new code:', {
            code,
            nowUTC: now.toISOString(),
            expirationTimeUTC: expirationTime.toISOString(),
            nowLocal: now.toString(),
            expirationTimeLocal: expirationTime.toString()
        });

        // Create new UserWalletCode entity
        const userWalletCode = this.userWalletCodeRepository.create({
            tw_wallet_id: userWallet.uw_id,
            tw_code_value: code,
            tw_code_time: expirationTime,
            tw_code_status: true,
            tw_code_type: 1
        });

        // Save to database using TypeORM
        await this.userWalletCodeRepository.save(userWalletCode);

        return code;
    }

    // Public method for external use
    async sendTelegramMessage(chatId: number, text: string): Promise<void> {
        try {
            await this.sendMessage(chatId, text);
        } catch (error) {
            this.logger.error(`Error sending Telegram message: ${error.message}`, error.stack);
            throw error;
        }
    }
}
