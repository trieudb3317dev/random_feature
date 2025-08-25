import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError, LessThanOrEqual } from 'typeorm';
import { WalletReferent } from '../entities/wallet-referent.entity';
import { ReferentSetting } from '../entities/referent-setting.entity';
import { ListWallet } from '../../telegram-wallets/entities/list-wallet.entity';
import { WalletRefReward } from '../entities/wallet-ref-reward.entity';
import { ReferentLevelReward } from '../entities/referent-level-rewards.entity';
import { SolanaPriceCacheService } from '../../solana/solana-price-cache.service';
import { BgRefService } from '../bg-ref.service';

@Injectable()
export class WalletReferentService {
    private readonly logger = new Logger(WalletReferentService.name);
    private readonly MAX_REF_LEVEL = 7; // Giới hạn tối đa cấp độ giới thiệu

    constructor(
        @InjectRepository(WalletReferent)
        private walletReferentRepository: Repository<WalletReferent>,
        @InjectRepository(ReferentSetting)
        private referentSettingRepository: Repository<ReferentSetting>,
        @InjectRepository(ListWallet)
        private listWalletRepository: Repository<ListWallet>,
        @InjectRepository(ReferentLevelReward)
        private referentLevelRewardRepository: Repository<ReferentLevelReward>,
        @InjectRepository(WalletRefReward)
        private walletRefRewardRepository: Repository<WalletRefReward>,
        private readonly solanaPriceCacheService: SolanaPriceCacheService,
        private readonly bgRefService: BgRefService,
    ) {}

    /**
     * Helper function để xử lý max level theo yêu cầu
     * @param rawLevel Giá trị rs_ref_level từ database
     * @returns Giá trị level đã được xử lý (tối đa = 7)
     */
    private processMaxLevel(rawLevel: number): number {
        if (!rawLevel || rawLevel === 0) {
            this.logger.debug(`Raw level is ${rawLevel}, using default level 1`);
            return 1; // Default level
        }

        // Lấy trị tuyệt đối nếu là số âm
        const absLevel = Math.abs(rawLevel);
        
        // Giới hạn tối đa = 7
        const processedLevel = Math.min(absLevel, this.MAX_REF_LEVEL);
        
        if (rawLevel < 0) {
            this.logger.debug(`Negative level ${rawLevel} converted to absolute value ${absLevel}`);
        }
        
        if (absLevel > this.MAX_REF_LEVEL) {
            this.logger.warn(`Referral level ${rawLevel} (abs: ${absLevel}) exceeds maximum (${this.MAX_REF_LEVEL}), using ${this.MAX_REF_LEVEL}`);
        } else {
            this.logger.debug(`Processing referral level: ${rawLevel} -> ${processedLevel}`);
        }
        
        return processedLevel;
    }

    async findByInvitee(walletId: number) {
        try {
            return await this.walletReferentRepository.findOne({
                where: { wr_wallet_invitee: walletId },
                relations: ['referent'],
                select: {
                    wr_id: true,
                    wr_wallet_referent: true,
                    wr_wallet_level: true,
                    referent: {
                        wallet_id: true,
                        wallet_solana_address: true,
                        wallet_nick_name: true,
                        wallet_code_ref: true
                    }
                }
            });
        } catch (error) {
            if (error instanceof QueryFailedError && error.message.includes('relation') && error.message.includes('does not exist')) {
                this.logger.warn('Wallet referent table does not exist yet.');
                return null;
            }
            throw error;
        }
    }

    async getReferentInfo(walletId: number) {
        const referentRelation = await this.findByInvitee(walletId);
        
        if (!referentRelation) {
            return null;
        }

        return {
            referent_id: referentRelation.wr_wallet_referent,
            referent_level: referentRelation.wr_wallet_level,
            referent_info: {
                wallet_id: referentRelation.referent.wallet_id,
                wallet_solana_address: referentRelation.referent.wallet_solana_address,
                wallet_nick_name: referentRelation.referent.wallet_nick_name,
                wallet_code_ref: referentRelation.referent.wallet_code_ref
            }
        };
    }

    async getListMembers(walletId: number) {
        // Lấy thông tin ví hiện tại để lấy referent_code
        const currentWallet = await this.listWalletRepository.findOne({
            where: { wallet_id: walletId }
        });

        if (!currentWallet) {
            return {
                success: false,
                message: 'Không tìm thấy thông tin ví',
                data: null
            };
        }

        // Lấy cấu hình số cấp từ referent_settings và xử lý max level
        const setting = await this.referentSettingRepository.findOne({ where: { rs_id: 1 } });
        const maxLevel = this.processMaxLevel(setting?.rs_ref_level || 1);

        // Khởi tạo object để lưu danh sách thành viên theo từng cấp
        const membersByLevel = {};

        // Khởi tạo mảng cho từng cấp
        for (let i = 1; i <= maxLevel; i++) {
            membersByLevel[`level_${i}`] = [];
        }

        // Lấy tất cả thành viên được giới thiệu bởi wallet_id này
        const members = await this.walletReferentRepository.find({
            where: {
                wr_wallet_referent: walletId,
                wr_wallet_level: LessThanOrEqual(maxLevel)
            },
            relations: ['invitee', 'rewards'],
        });

        // Phân loại thành viên theo cấp
        for (const member of members) {
            const level = member.wr_wallet_level;
            if (level > maxLevel) continue;

            const levelKey = `level_${level}`;
            // Tính tổng reward an toàn
            const totalReward = (member.rewards || []).reduce((total, reward) => {
                const rewardValue = parseFloat(String(reward.wrr_use_reward)) || 0;
                return total + rewardValue;
            }, 0);

            // Lấy thông tin người giới thiệu (referent) của member này
            const memberReferent = await this.walletReferentRepository.findOne({
                where: { wr_wallet_invitee: member.invitee.wallet_id },
                relations: ['referent']
            });

            membersByLevel[levelKey].push({
                wallet_id: member.invitee.wallet_id,
                wallet_solana_address: member.invitee.wallet_solana_address,
                wallet_nick_name: member.invitee.wallet_nick_name,
                amount_reward: Number(totalReward.toFixed(5)),
                referred_by: memberReferent ? {
                    wallet_id: memberReferent.referent.wallet_id,
                    wallet_solana_address: memberReferent.referent.wallet_solana_address,
                    wallet_nick_name: memberReferent.referent.wallet_nick_name,
                    wallet_eth_address: memberReferent.referent.wallet_eth_address
                } : null
            });
        }

        return {
            success: true,
            message: 'Lấy danh sách thành viên thành công',
            data: {
                referent_code: currentWallet.wallet_code_ref,
                max_level: maxLevel,
                members: membersByLevel
            }
        };
    }

    async getRewards(walletId: number) {
        // Lấy thông tin ví hiện tại để lấy referent_code
        const currentWallet = await this.listWalletRepository.findOne({
            where: { wallet_id: walletId }
        });

        if (!currentWallet) {
            return {
                success: false,
                message: 'Không tìm thấy thông tin ví',
                data: null
            };
        }

        // Lấy cấu hình số cấp từ referent_settings và xử lý max level
        const setting = await this.referentSettingRepository.findOne({ where: { rs_id: 1 } });
        const maxLevel = this.processMaxLevel(setting?.rs_ref_level || 1);

        // Khởi tạo object để lưu thống kê theo từng cấp
        const rewardsByLevel = {};
        let totalStats = {
            member_num: 0,
            amount_total: 0,
            amount_available: 0
        };

        // Khởi tạo thống kê cho từng cấp
        for (let i = 1; i <= maxLevel; i++) {
            rewardsByLevel[`level_${i}`] = {
                member_num: 0,
                amount_total: 0,
                amount_available: 0
            };
        }

        // Lấy tất cả thành viên được giới thiệu bởi wallet_id này
        const members = await this.walletReferentRepository.find({
            where: {
                wr_wallet_referent: walletId,
                wr_wallet_level: LessThanOrEqual(maxLevel)
            },
            relations: ['rewards'],
        });

        // Tính toán thống kê cho từng thành viên
        for (const member of members) {
            const level = member.wr_wallet_level;
            if (level > maxLevel) continue;

            const levelKey = `level_${level}`;
            rewardsByLevel[levelKey].member_num++;

            // Tính toán phần thưởng cho thành viên này
            const memberRewards = member.rewards || [];
            for (const reward of memberRewards) {
                // Chuyển đổi wrr_use_reward sang số và xử lý trường hợp null/undefined
                const rewardValue = parseFloat(String(reward.wrr_use_reward)) || 0;
                const rewardAmount = Number(rewardValue.toFixed(5));
                
                // Tổng hoa hồng (bao gồm cả đã rút và chưa rút)
                rewardsByLevel[levelKey].amount_total += rewardAmount;
                totalStats.amount_total += rewardAmount;

                // Chỉ tính hoa hồng khả dụng (chưa rút)
                if (!reward.wrr_withdraw_status && reward.wrr_withdraw_id === null) {
                    rewardsByLevel[levelKey].amount_available += rewardAmount;
                    totalStats.amount_available += rewardAmount;
                }
            }
        }

        // Cập nhật tổng số thành viên
        totalStats.member_num = members.length;

        // Làm tròn các giá trị cuối cùng
        totalStats.amount_total = Number(totalStats.amount_total.toFixed(5));
        totalStats.amount_available = Number(totalStats.amount_available.toFixed(5));

        // Làm tròn các giá trị cho từng cấp
        for (let i = 1; i <= maxLevel; i++) {
            const levelKey = `level_${i}`;
            rewardsByLevel[levelKey].amount_total = Number(rewardsByLevel[levelKey].amount_total.toFixed(5));
            rewardsByLevel[levelKey].amount_available = Number(rewardsByLevel[levelKey].amount_available.toFixed(5));
        }

        return {
            success: true,
            message: 'Lấy thông tin phần thưởng thành công',
            data: {
                referent_code: currentWallet.wallet_code_ref,
                max_level: maxLevel,
                total: totalStats,
                by_level: rewardsByLevel
            }
        };
    }

    /**
     * Calculate and save referral rewards based on trading volume
     * @param walletId The wallet ID that made the trade
     * @param tradingVolume The trading volume in USD
     * @param signature The transaction signature (optional)
     * @returns Array of created reward records
     */
    async calculateReferralRewards(walletId: number, tradingVolume: number, signature?: string): Promise<WalletRefReward[]> {
        try {
            // Kiểm tra xem wallet có thuộc hệ thống BG affiliate không
            const isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(walletId);
            
            if (isBgAffiliate) {
                this.logger.debug(`Wallet ${walletId} belongs to BG affiliate system, skipping traditional referral calculation`);
                return []; // Trả về mảng rỗng vì sẽ được xử lý bởi BG affiliate system
            }

            // Get referral settings
            const settings = await this.referentSettingRepository.findOne({
                where: { rs_id: 1 },
                order: { rs_id: 'DESC' }
            });

            if (!settings) {
                this.logger.warn('No referral settings found');
                return [];
            }

            // Xử lý max level theo yêu cầu
            const maxLevel = this.processMaxLevel(settings.rs_ref_level);

            // Get all level rewards
            const levelRewards = await this.referentLevelRewardRepository.find({
                where: { rlr_is_active: true },
                order: { rlr_level: 'ASC' }
            });

            if (!levelRewards.length) {
                this.logger.warn('No active level rewards found');
                return [];
            }

            // Find all referrers up to max level
            const referrers: WalletReferent[] = [];
            let currentWalletId = walletId;
            let currentLevel = 1;

            while (currentLevel <= maxLevel) {
                // Tìm người giới thiệu của currentWalletId
                const referent = await this.walletReferentRepository.findOne({
                    where: { wr_wallet_invitee: currentWalletId },
                    relations: ['referent']
                });

                if (!referent) {
                    this.logger.debug(`No referrer found for wallet ${currentWalletId} at level ${currentLevel}`);
                    break; // No more referrers in the chain
                }

                // Kiểm tra xem referent có thuộc BG affiliate không
                const isReferentBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(referent.wr_wallet_referent);
                if (isReferentBgAffiliate) {
                    this.logger.debug(`Referrer ${referent.wr_wallet_referent} belongs to BG affiliate system, stopping traditional referral chain`);
                    break; // Dừng chuỗi referral cũ nếu gặp BG affiliate
                }

                // Kiểm tra xem referent có đúng level không
                if (referent.wr_wallet_level !== currentLevel) {
                    this.logger.warn(`Referent level mismatch: expected ${currentLevel}, got ${referent.wr_wallet_level}`);
                }

                referrers.push(referent);
                currentWalletId = referent.wr_wallet_referent; // Chuyển sang người giới thiệu tiếp theo
                currentLevel++;
            }

            if (!referrers.length) {
                this.logger.debug(`No referrers found for wallet ${walletId}`);
                return [];
            }

            // Get current SOL price from cache
            const solPriceUSD = await this.solanaPriceCacheService.getSOLPriceInUSD();
            if (!solPriceUSD || solPriceUSD <= 0) {
                this.logger.error('Failed to get SOL price from cache');
                throw new Error('Failed to get SOL price');
            }

            // Calculate and save rewards
            const createdRewards: WalletRefReward[] = [];
            const baseReward = tradingVolume * 0.01; // 1% of trading volume

            this.logger.debug(`Calculating traditional referral rewards for wallet ${walletId}, trading volume: $${tradingVolume}, base reward: $${baseReward}, max level: ${maxLevel}`);

            for (let i = 0; i < referrers.length; i++) {
                const referent = referrers[i];
                const level = i + 1;
                const levelReward = levelRewards.find(lr => lr.rlr_level === level);

                if (!levelReward) {
                    this.logger.warn(`No reward percentage found for level ${level}`);
                    continue;
                }

                // Calculate reward amount in USD
                const rewardAmountUSD = baseReward * (levelReward.rlr_percentage / 100);
                
                // Convert USD reward to SOL
                const rewardAmountSOL = rewardAmountUSD / solPriceUSD;

                this.logger.debug(`Level ${level}: ${levelReward.rlr_percentage}% of $${baseReward} = $${rewardAmountUSD} (${rewardAmountSOL} SOL)`);

                // Create reward record
                const reward = new WalletRefReward();
                reward.wrr_ref_id = referent.wr_id;
                reward.wrr_sol_reward = rewardAmountSOL; // Lưu phần thưởng tính bằng SOL
                reward.wrr_use_reward = rewardAmountUSD; // Lưu phần thưởng tính bằng USD
                reward.wrr_signature = signature || ''; // Sử dụng signature nếu có, nếu không thì dùng empty string

                const savedReward = await this.walletRefRewardRepository.save(reward);
                createdRewards.push(savedReward);

                this.logger.debug(`Created traditional referral reward for referent ${referent.wr_wallet_referent} at level ${level}: ${rewardAmountUSD} USD (${rewardAmountSOL} SOL)${signature ? ` with signature ${signature}` : ''}`);
            }

            return createdRewards;

        } catch (error) {
            this.logger.error(`Error calculating referral rewards: ${error.message}`, error.stack);
            throw error;
        }
    }
} 