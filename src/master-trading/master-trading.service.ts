import { Injectable, OnModuleInit, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Not, Equal } from 'typeorm';
import { MasterGroup } from './entities/master-group.entity';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { AuthGroupDto } from './dto/auth-group.dto';
import { MasterGroupAuth } from './entities/master-group-auth.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { MasterTransaction } from './entities/master-transaction.entity';
import { In } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { SolanaService } from '../solana/solana.service';
import { MasterTransactionDetail } from './entities/master-transaction-detail.entity';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { NotificationService } from '../notifications/notification.service';
import { CacheService } from '../cache/cache.service';
import { PublicKey } from '@solana/web3.js';
import { ConfigService } from '@nestjs/config';
import { Connection as TypeOrmConnection } from 'typeorm';
import { Connection as SolanaConnection } from '@solana/web3.js';
import { ChangeAuthStatusDto } from './dto/auth-group.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderBookService } from '../trade/order-book.service';
import { PriceFeedService } from '../price-feed/price-feed.service';
import { TradeService } from '../trade/trade.service';
import { TradingOrder } from '../trade/entities/trading-order.entity';
import { UpdateGroupDto } from './dto/update-group.dto';
import bs58 from 'bs58';
import { MasterConnect } from './entities/master-connect.entity';
import { ConnectMasterDto } from './dto/connect-master.dto';
import { MasterSetConnectDto } from './dto/master-set-connect.dto';
import { MemberSetConnectDto } from './dto/member-set-connect.dto';
import { MasterCreateGroupDto } from './dto/master-create-group.dto';
import { MasterSetGroupDto } from './dto/master-set-group.dto';
import { PumpFunService } from 'src/pump-fun/pump-fun.service';
import { SolanaWebSocketService } from '../solana/solana-websocket.service';
import { SolanaTrackingService } from '../solana/services/tracking.service';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaPriceCacheService } from '../solana/solana-price-cache.service';
import { extractSolanaPrivateKey } from '../utils/key-utils';
import { UserWallet } from '../telegram-wallets/entities/user-wallet.entity';
import { BittworldsService } from '../bittworlds/services/bittworlds.service';
import { BgRefService } from '../referral/bg-ref.service';

@Injectable()
export class MasterTradingService implements OnModuleInit {
    private readonly logger = new Logger(MasterTradingService.name);
    private isProcessing = false;
    private retryDelay = 3000;
    private lastProcessedTime = new Date(Date.now() - 5 * 60 * 1000);
    private masterWalletTracking = new Map<string, boolean>();

    // Thêm constant cho phí chênh lệch
    private readonly MEMBER_FEE_MIN = 0.0005; // 0.05%
    private readonly MEMBER_FEE_MAX = 0.001;  // 0.1%

    // Thêm các hằng số ở đầu class
    private readonly MIN_SOL_BALANCE = 0.01; // Số dư SOL tối thiểu cần giữ lại
    private readonly SAFETY_BUFFER = 0.95; // Hệ số an toàn để tránh thiếu phí

    constructor(
        @InjectRepository(MasterGroup)
        private masterGroupRepository: Repository<MasterGroup>,
        @InjectRepository(ListWallet)
        private listWalletRepository: Repository<ListWallet>,
        @InjectRepository(MasterGroupAuth)
        private masterGroupAuthRepository: Repository<MasterGroupAuth>,
        @InjectRepository(MasterTransaction)
        private masterTransactionRepository: Repository<MasterTransaction>,
        @InjectRepository(MasterConnect)
        private masterConnectRepository: Repository<MasterConnect>,
        private solanaService: SolanaService,
        @InjectRepository(MasterTransactionDetail)
        private masterTransactionDetailRepository: Repository<MasterTransactionDetail>,
        private notificationService: NotificationService,
        private cacheService: CacheService,
        private configService: ConfigService,
        @Inject('SOLANA_CONNECTION')
        private readonly solanaConnection: SolanaConnection,
        private readonly dbConnection: TypeOrmConnection,
        private eventEmitter: EventEmitter2,
        private orderBookService: OrderBookService,
        @Inject(forwardRef(() => PriceFeedService))
        private priceFeedService: PriceFeedService,
        @Inject(forwardRef(() => TradeService))
        private tradeService: TradeService,
        @InjectRepository(TradingOrder)
        private tradingOrderRepository: Repository<TradingOrder>,
        private pumpFunService: PumpFunService,
        private readonly solanaWebSocketService: SolanaWebSocketService,
        private readonly solanaTrackingService: SolanaTrackingService,
        private solanaPriceCacheService: SolanaPriceCacheService,
        @InjectRepository(UserWallet)
        private userWalletRepository: Repository<UserWallet>,
        private readonly bittworldsService: BittworldsService,
        private readonly bgRefService: BgRefService
    ) {
        // Lắng nghe sự kiện order được thực hiện
        this.eventEmitter.on('order.executed', async (data) => {
            const masterTx = await this.masterTransactionRepository.findOne({
                where: { mt_transaction_folow: data.orderId }
            });
            if (masterTx) {
                await this.executeMasterTransaction(masterTx, data.price);
            }
        });

        // Lắng nghe sự kiện giao dịch từ WebSocket
        this.eventEmitter.on('transaction.received', async (data) => {
            const { account, signature } = data;
            await this.handleMasterTransaction(data);
        });
    }

    async onModuleInit() {
        console.log("🚀 Master Trading Service is running...");

        // Đăng ký theo dõi các ví master qua WebSocket
        await this.setupMasterWalletTracking();

        // Giữ lại monitor như một fallback
        this.monitor();
    }

    // Thêm phương thức setupMasterWalletTracking
    private async setupMasterWalletTracking() {
        try {
            // Lấy danh sách các ví master đang hoạt động
            const masterWallets = await this.listWalletRepository.find({
                where: {
                    wallet_auth: 'master',
                    wallet_status: true
                }
            });

            // Đăng ký theo dõi các ví master qua WebSocket
            for (const wallet of masterWallets) {
                if (wallet.wallet_solana_address &&
                    PublicKey.isOnCurve(new PublicKey(wallet.wallet_solana_address)) &&
                    !this.masterWalletTracking.has(wallet.wallet_solana_address)) {

                    this.masterWalletTracking.set(wallet.wallet_solana_address, true);
                    await this.solanaTrackingService.trackTransactions(
                        wallet.wallet_solana_address,
                        'master-trading'
                    );
                    console.log(`Tracking master wallet: ${wallet.wallet_solana_address}`);
                }
            }
        } catch (error) {
            console.error('Error setting up master wallet tracking:', error);
        }
    }

    // Cập nhật phương thức monitor để kiểm tra và đăng ký ví mới
    @Cron('*/10 * * * * *')
    async monitor() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // Lấy danh sách các ví master đang hoạt động
            const masterWallets = await this.listWalletRepository.find({
                where: {
                    wallet_auth: 'master',
                    wallet_status: true
                }
            });

            // Đăng ký theo dõi các ví master mới qua WebSocket
            for (const wallet of masterWallets) {
                try {
                    if (wallet.wallet_solana_address &&
                        PublicKey.isOnCurve(new PublicKey(wallet.wallet_solana_address)) &&
                        !this.masterWalletTracking.has(wallet.wallet_solana_address)) {

                        this.masterWalletTracking.set(wallet.wallet_solana_address, true);
                        await this.solanaTrackingService.trackTransactions(
                            wallet.wallet_solana_address,
                            'master-trading'
                        );
                        console.log(`Started tracking new master wallet: ${wallet.wallet_solana_address}`);
                    }
                } catch (error) {
                    console.error(`Error tracking wallet ${wallet.wallet_solana_address}:`, error);
                }
            }
        } catch (error) {
            console.error('Monitoring error:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async createMasterGroup(walletId: number, createGroupDto: CreateGroupDto) {
        try {
            // Kiểm tra wallet có quyền master
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet || wallet.wallet_auth !== 'master') {
                return {
                    status: 400,
                    message: 'Only master wallet can create groups'
                };
            }

            // Kiểm tra tên group trùng lặp
            const existingGroupByName = await this.masterGroupRepository.findOne({
                where: {
                    mg_master_wallet: walletId,
                    mg_name: createGroupDto.mg_name,
                    mg_status: Not('delete') // Không tính group đã xóa
                }
            });

            if (existingGroupByName) {
                return {
                    status: 400,
                    message: 'Group name already exists'
                };
            }

            // Validate option và ratio/price
            if (createGroupDto.mg_option === 'fixedprice') {
                if (!createGroupDto.mg_fixed_price || createGroupDto.mg_fixed_price < 0.01) {
                    return {
                        status: 400,
                        message: 'Fixed price must be greater than or equal to 0.01'
                    };
                }
                createGroupDto.mg_fixed_ratio = 0;
            } else if (createGroupDto.mg_option === 'fixedratio') {
                if (!createGroupDto.mg_fixed_ratio ||
                    createGroupDto.mg_fixed_ratio < 1 ||
                    createGroupDto.mg_fixed_ratio > 100) {
                    return {
                        status: 400,
                        message: 'Fixed ratio must be between 1 and 100'
                    };
                }
                createGroupDto.mg_fixed_price = 0;
            } else if (createGroupDto.mg_option === 'trackingratio') {
                createGroupDto.mg_fixed_price = 0;
                createGroupDto.mg_fixed_ratio = 0;
            }

            // Tạo group mới
            const masterGroup = new MasterGroup();
            masterGroup.mg_master_wallet = walletId;
            masterGroup.mg_name = createGroupDto.mg_name;
            masterGroup.mg_option = createGroupDto.mg_option;
            masterGroup.mg_fixed_price = createGroupDto.mg_fixed_price || 0;
            masterGroup.mg_fixed_ratio = createGroupDto.mg_fixed_ratio || 0;
            masterGroup.mg_status = 'on';

            const savedGroup = await this.masterGroupRepository.save(masterGroup);

            return {
                status: 200,
                message: 'Master group created successfully',
                data: {
                    mg_id: savedGroup.mg_id,
                    mg_name: savedGroup.mg_name,
                    mg_option: savedGroup.mg_option,
                    mg_status: savedGroup.mg_status,
                    created_at: savedGroup.created_at
                }
            };

        } catch (error) {
            console.error('Error creating master group:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async masterCreateGroup(user: any, createGroupDto: MasterCreateGroupDto) {
        try {
            // Lấy wallet_id từ payload JWT
            const { wallet_id } = user;

            // Kiểm tra wallet có quyền master
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id }
            });

            if (!wallet || wallet.wallet_auth !== 'master') {
                return {
                    status: 400,
                    message: 'Only master wallet can create groups'
                };
            }

            // Kiểm tra tên group trùng lặp
            const existingGroupByName = await this.masterGroupRepository.findOne({
                where: {
                    mg_master_wallet: wallet_id,
                    mg_name: createGroupDto.mg_name,
                    mg_status: Not(In(['delete', 'delete-hidden'])) // Không tính group đã xóa hoặc ẩn
                }
            });

            if (existingGroupByName) {
                return {
                    status: 400,
                    message: 'Group name already exists'
                };
            }

            // Tạo group mới với option mặc định là trackingratio
            const masterGroup = new MasterGroup();
            masterGroup.mg_master_wallet = wallet_id;
            masterGroup.mg_name = createGroupDto.mg_name;
            masterGroup.mg_option = 'trackingratio';  // Luôn là trackingratio
            masterGroup.mg_fixed_price = 0;           // Giá trị mặc định khi dùng trackingratio
            masterGroup.mg_fixed_ratio = 0;           // Giá trị mặc định khi dùng trackingratio
            masterGroup.mg_status = 'on';

            const savedGroup = await this.masterGroupRepository.save(masterGroup);

            return {
                status: 200,
                message: 'Master group created successfully',
                data: {
                    mg_id: savedGroup.mg_id,
                    mg_name: savedGroup.mg_name,
                    mg_option: savedGroup.mg_option,
                    mg_status: savedGroup.mg_status,
                    created_at: savedGroup.created_at
                }
            };

        } catch (error) {
            console.error('Error creating master group:', error);
            return {
                status: 500,
                message: 'Failed to create master group'
            };
        }
    }

    async getMasterGroups(
        walletId: number,
        option?: 'fixedprice' | 'fixedratio',
        status?: 'on' | 'off' | 'delete' | ('on' | 'off' | 'delete')[]
    ) {
        try {
            // Kiểm tra wallet có quyền master
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet || wallet.wallet_auth !== 'master') {
                return [];
            }

            let query = this.masterGroupRepository.createQueryBuilder('group')
                .where('group.mg_master_wallet = :walletId', { walletId });

            if (option) {
                query = query.andWhere('group.mg_option = :option', { option });
            }

            if (status) {
                if (Array.isArray(status)) {
                    query = query.andWhere('group.mg_status IN (:...statuses)', { statuses: status });
                } else {
                    query = query.andWhere('group.mg_status = :status', { status });
                }
            } else {
                // Mặc định lấy tất cả các trạng thái
                query = query.andWhere('group.mg_status IN (:...statuses)', { statuses: ['on', 'off', 'delete'] });
            }

            const groups = await query.orderBy('group.created_at', 'DESC').getMany();

            return groups.map(group => ({
                mg_id: group.mg_id,
                mg_name: group.mg_name,
                mg_master_wallet: group.mg_master_wallet,
                mg_option: group.mg_option,
                mg_fixed_price: group.mg_fixed_price,
                mg_fixed_ratio: group.mg_fixed_ratio,
                mg_status: group.mg_status,
                created_at: group.created_at
            }));
        } catch (error) {
            console.error('Error getting master groups:', error);
            return [];
        }
    }

    async authorizeMasterGroup(walletId: number, authGroupDto: AuthGroupDto) {
        try {
            // Kiểm tra wallet là member
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet || wallet.wallet_auth !== 'member') {
                return {
                    status: 400,
                    message: 'Only member wallet can authorize groups'
                };
            }

            // Kiểm tra group tồn tại và đang active
            const group = await this.masterGroupRepository.findOne({
                where: {
                    mg_id: authGroupDto.mga_group_id,
                    mg_status: 'on'
                }
            });

            if (!group) {
                return {
                    status: 404,
                    message: 'Group not found or inactive'
                };
            }

            // Kiểm tra đã ủy quyền trước đó
            let auth = await this.masterGroupAuthRepository.findOne({
                where: {
                    mga_group_id: authGroupDto.mga_group_id,
                    mga_wallet_member: walletId
                }
            });

            if (auth) {
                return {
                    status: 400,
                    message: 'Already joined this group'
                };
            }

            // Tạo ủy quyền mới với status mặc định là running
            auth = new MasterGroupAuth();
            auth.mga_group_id = authGroupDto.mga_group_id;
            auth.mga_wallet_member = walletId;
            auth.mga_status = 'running';

            const savedAuth = await this.masterGroupAuthRepository.save(auth);

            return {
                status: 200,
                message: 'Joined group successfully',
                data: savedAuth
            };

        } catch (error) {
            console.error('Error joining group:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async changeAuthStatus(walletId: number, changeStatusDto: ChangeAuthStatusDto) {
        try {
            // Kiểm tra master wallet tồn tại
            const masterWallet = await this.listWalletRepository.findOne({
                where: {
                    wallet_id: walletId,
                    wallet_auth: 'master'
                }
            });

            if (!masterWallet) {
                return {
                    status: 403,
                    message: 'Only master wallet can change auth status'
                };
            }

            // Kiểm tra group tồn tại và thuộc sở hữu của master
            const group = await this.masterGroupRepository.findOne({
                where: {
                    mg_id: changeStatusDto.mg_id,
                    mg_master_wallet: walletId,
                    mg_status: Not(In(['delete', 'delete-hidden'])) // Không xét các group đã xóa
                }
            });

            if (!group) {
                return {
                    status: 404,
                    message: 'Group not found or not owned by this master'
                };
            }

            // Kiểm tra kết nối bằng hàm checkConnectionStatus
            const { isConnected, activeConnect } = await this.checkConnectionStatus(
                walletId,
                changeStatusDto.member_id
            );

            if (!isConnected || !activeConnect || activeConnect.mc_status !== 'connect') {
                return {
                    status: 400,
                    message: 'Member is not connected to this master or connection status is not "connect"'
                };
            }

            // Kiểm tra auth tồn tại
            const auth = await this.masterGroupAuthRepository.findOne({
                where: {
                    mga_group_id: changeStatusDto.mg_id,
                    mga_wallet_member: changeStatusDto.member_id
                },
                relations: ['master_group']
            });

            if (!auth) {
                return {
                    status: 404,
                    message: 'Auth record not found'
                };
            }

            // Kiểm tra group hiện tại có phải delete-hidden không
            if (auth.master_group?.mg_status === 'delete-hidden') {
                return {
                    status: 400,
                    message: 'Cannot change status for a deleted-hidden group'
                };
            }

            // Cập nhật trạng thái
            auth.mga_status = changeStatusDto.status;
            const updatedAuth = await this.masterGroupAuthRepository.save(auth);

            return {
                status: 200,
                message: 'Auth status updated successfully',
                data: {
                    mga_id: updatedAuth.mga_id,
                    mga_status: updatedAuth.mga_status,
                    group_id: changeStatusDto.mg_id,
                    member_id: changeStatusDto.member_id
                }
            };

        } catch (error) {
            console.error('Error changing auth status:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async createMasterTransaction(masterWalletId: number, createTransactionDto: CreateTransactionDto) {
        try {
            // Kiểm tra wallet có quyền master
            const masterWallet = await this.listWalletRepository.findOne({
                where: { wallet_id: masterWalletId, wallet_auth: 'master' }
            });

            if (!masterWallet) {
                return {
                    status: 400,
                    message: 'Only master wallet can create transactions'
                };
            }

            // Extract values from DTO with correct property names
            const {
                mt_token_address: tokenAddress,
                mt_trade_type: tradeType,
                mt_price: price,
                mt_member_list: memberIds = []
            } = createTransactionDto;

            // Lọc các giá trị không hợp lệ trước khi stringify
            const validMemberIds = memberIds?.filter(id => {
                const numId = Number(id);
                return !isNaN(numId) && numId > 0;
            }) || [];

            // Tạo transaction mới
            const transaction = new MasterTransaction();
            transaction.mt_master_wallet = masterWalletId;
            transaction.mt_token_name = createTransactionDto.mt_token_name;
            transaction.mt_token_address = createTransactionDto.mt_token_address;
            transaction.mt_trade_type = tradeType as 'buy' | 'sell';
            transaction.mt_type = 'market';
            transaction.mt_price = price;
            transaction.mt_transaction_folow = createTransactionDto.mt_transaction_folow;
            transaction.mt_status = 'running';
            transaction.mt_group_list = '[]';  // Luôn gán mảng rỗng
            transaction.mt_member_list = JSON.stringify(validMemberIds);

            // Thêm dòng này: Set DEX là pumpfun nếu là meme coin
            const isMeme = await this.solanaService.isMemeCoin(createTransactionDto.mt_token_address);
            transaction.mt_used_dex = isMeme ? 'pumpfun' : 'jupiter';

            console.log('Member list after filtering and stringify:', transaction.mt_member_list);

            console.log('>>> Transaction object before save:', transaction);
            const savedTransaction = await this.masterTransactionRepository.save(transaction);
            console.log('>>> Transaction saved successfully:', savedTransaction.mt_id);

            // Kiểm tra xem master có phải là VIP không
            const isVip = await this.isVipMaster(masterWalletId);
            console.log(`>>> Master is VIP: ${isVip} (ID: ${masterWalletId})`);

            // Lấy thông tin order gốc
            const originalOrder = await this.tradingOrderRepository.findOne({
                where: { order_id: transaction.mt_transaction_folow }
            });

            if (!originalOrder) {
                throw new Error(`Original order not found: ${transaction.mt_transaction_folow}`);
            }

            // Bỏ qua kiểm tra balance cho master trading
            let masterTokenBalance: number | null = null;

            // Lấy danh sách member wallets
            const memberWallets = await this.listWalletRepository.find({
                where: { wallet_id: In(validMemberIds) }
            });

            // Xử lý giao dịch dựa trên loại master
            if (isVip) {
                console.log(`>>> Master is VIP: ${isVip}`);
                await this.executeVipMasterOrder(transaction, originalOrder, memberWallets);
            } else {
                console.log(`>>> Master is regular: ${isVip}`);
                await this.executeRegularMasterOrder(transaction, originalOrder, memberWallets);
            }

            return {
                status: 200,
                message: 'Master transaction created successfully',
                data: savedTransaction
            };
        } catch (error) {
            console.error('Error creating master transaction:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    // Cập nhật phương thức handleMasterTransaction để xử lý song song
    private async handleMasterTransaction(data: any) {
        const { account, signature } = data;

        try {
            // Kiểm tra xem account có phải là ví master không
            if (!this.masterWalletTracking.has(account)) {
                return;
            }

            console.log(`Detected transaction from master wallet ${account}: ${signature}`);

            // Lấy thông tin nhóm master trước
            const masterGroup = await this.masterGroupRepository.findOne({
                where: { mg_master_wallet: account }
            });

            if (!masterGroup) {
                return;
            }

            // Phân tích giao dịch
            const txDetails = await this.solanaService.analyzeTransaction(signature);
            if (!txDetails.inputMint || !txDetails.outputMint) {
                return;
            }

            // Xác định loại giao dịch và token address
            const transactionType = txDetails.inputMint === "So11111111111111111111111111111111111111112" ? 'buy' : 'sell';
            const tokenAddress = transactionType === 'buy' ? txDetails.outputMint : txDetails.inputMint;

            // Lấy thông tin token từ service
            const tokenInfo = await this.solanaService.getTokenInfo(tokenAddress);
            const tokenName = tokenInfo?.name || 'Unknown';

            // Lấy giá token từ price feed service
            const tokenPrice = await this.solanaService.getTokenPrice(tokenAddress) || 0;
            const tokenAmount = transactionType === 'buy' ? txDetails.outputAmount : txDetails.inputAmount;

            // Tạo giao dịch master sau khi đã có masterGroup
            const masterTransaction = await this.masterTransactionRepository.save({
                mt_master_wallet: masterGroup.mg_master_wallet,
                mt_trade_type: transactionType,
                mt_type: 'market',
                mt_token_address: tokenAddress,
                mt_token_name: tokenName,
                mt_price: tokenPrice,
                mt_group_list: JSON.stringify([masterGroup.mg_id]),
                mt_status: 'running'
            });

            // Kiểm tra token có thể giao dịch không
            const isTokenTradable = await this.solanaService.isTokenTradable(masterTransaction.mt_token_address);
            if (!isTokenTradable) {
                console.log(`Token ${masterTransaction.mt_token_address} không thể giao dịch, không có pool thanh khoản`);
                // Cập nhật trạng thái transaction
                await this.masterTransactionRepository.update(
                    { mt_id: masterTransaction.mt_id },
                    {
                        mt_status: 'failed',
                        mt_error_message: 'Token không có thanh khoản'
                    }
                );
                return;
            }

            // Lấy danh sách các member đã được xác thực trong nhóm
            const authorizedMembers = await this.masterGroupAuthRepository.find({
                where: {
                    master_group: { mg_master_wallet: masterGroup.mg_id },
                    mga_status: 'running'
                },
                relations: ['member_wallet']
            });

            // Xử lý song song các member
            const memberPromises = authorizedMembers.map(async (auth) => {
                try {
                    const memberAmount = this.calculateMemberAmount(auth, tokenAmount || 0);
                    const memberTotalValue = tokenPrice * memberAmount;

                    const detail = new MasterTransactionDetail();
                    detail.mt_transaction_id = masterTransaction.mt_id;
                    detail.mt_detail_type = transactionType;
                    detail.mt_detail_token_address = tokenAddress;
                    detail.mt_detail_token_name = tokenName;
                    detail.mt_detail_amount = memberAmount;
                    detail.mt_detail_price = tokenPrice;
                    detail.mt_detail_total_usd = memberTotalValue;
                    detail.mt_detail_status = 'wait';
                    detail.mt_detail_time = new Date();
                    detail.mt_wallet_master = masterGroup.mg_master_wallet;
                    detail.mt_wallet_member = auth.member_wallet.wallet_id;

                    return this.masterTransactionDetailRepository.save(detail);
                } catch (error) {
                    console.error(`Error creating transaction detail for member ${auth.member_wallet.wallet_id}:`, error);
                    return null;
                }
            });

            // Chờ tất cả các promises hoàn thành
            await Promise.all(memberPromises);

            console.log(`Created master transaction ${masterTransaction.mt_id} with ${authorizedMembers.length} member details`);
        } catch (error) {
            console.error('Error handling master transaction:', error);
        }
    }

    // Cập nhật phương thức executeMasterTransaction để xử lý song song
    async executeMasterTransaction(masterTx: MasterTransaction, price: number) {
        try {
            // Đợi master transaction hoàn thành trước khi thực hiện copy trade
            const maxWaitTime = 30000; // 30 seconds
            const startTime = Date.now();
            let updatedOrder: TradingOrder | null = null;

            while (Date.now() - startTime < maxWaitTime) {
                updatedOrder = await this.tradingOrderRepository.findOne({
                    where: { order_id: masterTx.mt_transaction_folow }
                });

                if (!updatedOrder) {
                    throw new Error('Master order not found');
                }

                if (updatedOrder.order_status === 'executed') {
                    // Master transaction thành công, tiếp tục thực hiện copy trade
                    break;
                } else if (updatedOrder.order_status === 'failed') {
                    // Master transaction thất bại, không thực hiện copy trade
                    masterTx.mt_status = 'failed';
                    masterTx.mt_error_message = updatedOrder.order_error_message || 'Master transaction failed';
                    await this.masterTransactionRepository.save(masterTx);
                    throw new Error('Master transaction failed: ' + masterTx.mt_error_message);
                }

                // Đợi 1 giây trước khi kiểm tra lại
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Kiểm tra timeout
            if (Date.now() - startTime >= maxWaitTime) {
                masterTx.mt_status = 'failed';
                masterTx.mt_error_message = 'Master transaction timeout';
                await this.masterTransactionRepository.save(masterTx);
                throw new Error('Master transaction timeout');
            }

            if (!updatedOrder) {
                throw new Error('Master order not found after waiting');
            }

            // Tiếp tục xử lý copy trade cho members
            const memberWallets = await this.listWalletRepository.find({
                where: { wallet_id: In(JSON.parse(masterTx.mt_member_list)) }
            });

            if (!memberWallets || memberWallets.length === 0) {
                throw new Error('No valid member wallets found');
            }

            // Kiểm tra xem master có phải là VIP không
            const isVip = await this.isVipMaster(masterTx.mt_master_wallet);

            if (isVip) {
                await this.executeVipMasterOrder(masterTx, updatedOrder, memberWallets);
            } else {
                await this.executeRegularMasterOrder(masterTx, updatedOrder, memberWallets);
            }

            // Tính toán Bittworld rewards cho master transaction
            try {
                const bittworldRewardResult = await this.bittworldsService.rewardBittworld(
                    masterTx.mt_master_wallet,
                    updatedOrder.order_total_value,
                    masterTx.mt_id
                );

                if (bittworldRewardResult.success) {
                    this.logger.debug(`Calculated Bittworld reward for master transaction ${masterTx.mt_id}: $${bittworldRewardResult.calculatedAmount}`);
                } else {
                    this.logger.debug(`No Bittworld reward for master transaction ${masterTx.mt_id}: ${bittworldRewardResult.message}`);
                }
            } catch (error) {
                this.logger.error(`Error calculating Bittworld reward for master transaction: ${error.message}`);
                // Không throw error vì đây là tính năng phụ
            }

            return true;
        } catch (error) {
            this.logger.error(`Error executing master transaction: ${error.message}`);
            throw error;
        }
    }

    @Cron('*/10 * * * * *')
    async checkAndExecuteMasterTransactions() {
        const activeTransactions = await this.masterTransactionRepository.find({
            where: {
                mt_status: 'running',
                mt_type: 'limit'
            },
            relations: ['trading_order']
        });

        for (const transaction of activeTransactions) {
            // Kiểm tra order gốc đã khớp chưa
            if (transaction.trading_order.order_status === 'executed') {
                await this.executeMasterTransaction(
                    transaction,
                    transaction.trading_order.order_price // Dùng giá order
                );
            }
        }
    }

    async getMasterTransactions(walletId: number, status?: string) {
        try {
            const where: any = {};
            if (status) {
                where.mt_status = status;
            }

            const transactions = await this.masterTransactionRepository.find({ where });
            return {
                status: 200,
                data: transactions
            };
        } catch (error) {
            console.error('Error getting master transactions:', error);
            return {
                status: 500,
                message: 'Internal server error',
                data: null
            };
        }
    }

    async changeMasterTransactionStatus(walletId: number, mtId: number, status: 'running' | 'pause' | 'stop') {
        try {
            const transaction = await this.masterTransactionRepository.findOne({
                where: { mt_id: mtId }
            });

            if (!transaction) {
                return {
                    status: 200,
                    message: 'Transaction not found'
                };
            }

            transaction.mt_status = status;
            const savedTransaction = await this.masterTransactionRepository.save(transaction);

            return {
                status: 200,
                message: 'Transaction status updated successfully',
                data: savedTransaction
            };
        } catch (error) {
            console.error('Error updating transaction status:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async getTransactionHistory(
        walletId: number,
        query: GetTransactionsDto
    ) {
        try {
            const cacheKey = `transaction_history:${walletId}:${JSON.stringify(query)}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return {
                    status: 200,
                    data: cachedData,
                    fromCache: true
                };
            }

            // Kiểm tra wallet là master
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet || wallet.wallet_auth !== 'master') {
                return {
                    status: 200,
                    message: 'Only master wallet can view transaction history'
                };
            }

            // Build query
            const qb = this.masterTransactionDetailRepository
                .createQueryBuilder('detail')
                .leftJoinAndSelect('detail.master_transaction', 'transaction')
                .where('detail.mt_wallet_master = :walletId', { walletId });

            if (query.status) {
                qb.andWhere('transaction.mt_status = :status', { status: query.status });
            }

            if (query.from_date) {
                qb.andWhere('detail.mt_detail_time >= :fromDate',
                    { fromDate: new Date(query.from_date).getTime() / 1000 });
            }

            if (query.to_date) {
                qb.andWhere('detail.mt_detail_time <= :toDate',
                    { toDate: new Date(query.to_date).getTime() / 1000 });
            }

            const details = await qb
                .orderBy('detail.mt_detail_time', 'DESC')
                .getMany();

            // Cache the result
            await this.cacheService.set(cacheKey, details, 60); // Cache for 1 minute

            return {
                status: 200,
                data: details
            };

        } catch (error) {
            console.error('Error getting transaction history:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async getTransactionStats(
        walletId: number,
        query: GetTransactionsDto
    ) {
        try {
            const cacheKey = `transaction_stats:${walletId}:${JSON.stringify(query)}`;
            const cachedData = await this.cacheService.get(cacheKey);

            if (cachedData) {
                return {
                    status: 200,
                    data: cachedData,
                    fromCache: true
                };
            }

            // Kiểm tra wallet là master
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet || wallet.wallet_auth !== 'master') {
                return {
                    status: 200,
                    message: 'Only master wallet can view transaction stats'
                };
            }

            // Build query
            const qb = this.masterTransactionDetailRepository
                .createQueryBuilder('detail')
                .where('detail.mt_wallet_master = :walletId', { walletId });

            if (query.from_date) {
                qb.andWhere('detail.mt_detail_time >= :fromDate',
                    { fromDate: new Date(query.from_date).getTime() / 1000 });
            }

            if (query.to_date) {
                qb.andWhere('detail.mt_detail_time <= :toDate',
                    { toDate: new Date(query.to_date).getTime() / 1000 });
            }

            // Tính toán thống kê
            const stats = await qb
                .select([
                    'COUNT(*) as total_transactions',
                    'SUM(CASE WHEN detail.mt_detail_status = :success THEN 1 ELSE 0 END) as successful_transactions',
                    'SUM(detail.mt_detail_total_usd) as total_volume',
                    'AVG(detail.mt_detail_price) as average_price'
                ])
                .setParameter('success', 'success')
                .getRawOne();

            // Cache the result
            await this.cacheService.set(cacheKey, stats, 300); // Cache for 5 minutes

            return {
                status: 200,
                data: {
                    ...stats,
                    success_rate: (stats.successful_transactions / stats.total_transactions) * 100
                }
            };

        } catch (error) {
            console.error('Error getting transaction stats:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async getGroupMembers(walletId: number, groupId: number) {
        try {
            // Kiểm tra wallet là master và sở hữu group
            const group = await this.masterGroupRepository.findOne({
                where: {
                    mg_id: groupId,
                    mg_master_wallet: walletId
                }
            });

            if (!group) {
                return {
                    status: 200,
                    message: 'Group not found or not owned by this wallet'
                };
            }

            // Lấy danh sách members
            const members = await this.masterGroupAuthRepository.find({
                where: { mga_group_id: groupId },
                relations: ['member_wallet']
            });

            return {
                status: 200,
                data: members.map(auth => ({
                    member_id: auth.mga_wallet_member,
                    member_address: auth.member_wallet.wallet_solana_address,
                    status: auth.mga_status
                }))
            };

        } catch (error) {
            console.error('Error getting group members:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    // Invalidate cache khi có thay đổi
    private async invalidateCache(walletId: number) {
        const keys = [
            `master_groups:${walletId}`,
            `transaction_history:${walletId}`,
            `transaction_stats:${walletId}`
        ];

        await Promise.all(keys.map(key => this.cacheService.del(key)));
    }

    private async processMasterTransaction(account: string, signature: string) {
        // Gọi đến phương thức xử lý hiện có
        await this.handleMasterTransaction({ account, signature });
    }

    async processSwapTransaction(
        privateKey: string,
        inputMint: string,
        outputMint: string,
        amount: number,
        detail: { mt_detail_status: 'wait' | 'success' | 'error' } & MasterTransactionDetail
    ): Promise<void> {
        try {
            console.log(`🚀 Initiating master swap for ${inputMint} to ${outputMint}...`);

            const signature = await this.solanaService.swapTokenOnSolana(
                privateKey,
                inputMint,
                outputMint,
                amount,
                1
            );

            // Update success status
            const successDetail = new MasterTransactionDetail();
            successDetail.mt_transaction_id = detail.mt_transaction_id;
            successDetail.mt_wallet_member = detail.mt_wallet_member;
            successDetail.mt_detail_status = 'success';
            successDetail.mt_detail_hash = typeof signature === 'string' ? signature : '';
            successDetail.mt_detail_time = new Date();

            await this.masterTransactionDetailRepository.save(successDetail);

        } catch (error) {
            let errorMessage = 'Unknown error';

            // Handle specific errors
            if (error.message?.includes('Insufficient balance') || error.message?.includes('insufficient funds')) {
                errorMessage = 'Insufficient balance for swap';
            } else if (error.message?.includes('No routes available')) {
                errorMessage = 'No liquidity route found';
            } else if (error.message?.includes('Failed to compute routes')) {
                errorMessage = 'Failed to compute swap route';
            } else if (error.message?.includes('Transaction failed')) {
                errorMessage = error.message;
            } else if (error.message?.includes('INSUFFICIENT_LIQUIDITY')) {
                errorMessage = 'Insufficient liquidity in pool';
            }

            console.error('❌ Error in master swap transaction:', error);

            // Update error status
            detail.mt_detail_status = 'error';
            detail.mt_detail_message = errorMessage;
            await this.masterTransactionDetailRepository.save(detail);

            throw error;
        }
    }

    async listMasterGroups(walletAddress: string, option?: 'fixedprice' | 'fixedratio', status?: 'on' | 'off' | 'delete') {
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

            if (wallet.wallet_auth !== 'master') {
                return {
                    status: 403,
                    message: 'Wallet is not authorized as master',
                    data: null
                };
            }

            const groups = await this.getMasterGroups(wallet.wallet_id, option, status);

            return {
                status: 200,
                message: 'Master groups retrieved successfully',
                data: {
                    wallet_id: wallet.wallet_id,
                    solana_address: wallet.wallet_solana_address,
                    groups: groups.map(group => ({
                        group_id: group.mg_id,
                        name: group.mg_name,
                        option: group.mg_option,
                        fixed_price: group.mg_fixed_price,
                        fixed_ratio: group.mg_fixed_ratio,
                        status: group.mg_status,
                        created_at: group.created_at,
                        master_wallet_id: group.mg_master_wallet
                    }))
                }
            };
        } catch (error) {
            console.error('Error in listGroups:', error);
            return {
                status: 500,
                message: 'Internal server error',
                data: null
            };
        }
    }

    async listMasterWallets(memberWalletId: number) {
        try {
            // Lấy danh sách tất cả master wallets
            const masterWallets = await this.listWalletRepository
                .createQueryBuilder('wallet')
                .where('wallet.wallet_auth = :auth', { auth: 'master' })
                .andWhere('wallet.wallet_status = :status', { status: true })
                .select([
                    'wallet.wallet_id',
                    'wallet.wallet_solana_address',
                    'wallet.wallet_nick_name',
                    'wallet.wallet_stream',
                    'wallet.wallet_country',
                    'wallet.wallet_code_ref'
                ])
                .getMany();

            // Lấy tất cả kết nối của member với các master
            const masterConnects = await this.masterConnectRepository
                .createQueryBuilder('connect')
                .where('connect.mc_member_wallet = :memberId', { memberId: memberWalletId })
                .select([
                    'connect.mc_id',
                    'connect.mc_master_wallet',
                    'connect.mc_status',
                    'connect.mc_option_limit',
                    'connect.mc_price_limit',
                    'connect.mc_ratio_limit'
                ])
                .getMany();

            // Tạo map để lưu trữ các kết nối theo master_wallet
            const connectMap = new Map<number, any[]>();
            masterConnects.forEach(connect => {
                const existingConnects = connectMap.get(connect.mc_master_wallet) || [];
                existingConnects.push(connect);
                connectMap.set(connect.mc_master_wallet, existingConnects);
            });

            // Kết hợp thông tin master và trạng thái kết nối
            const result = masterWallets.map(master => {
                const connects = connectMap.get(master.wallet_id) || [];

                // Kiểm tra xem có kết nối nào không phải delete-hidden không
                const activeConnect = connects.find(connect => connect.mc_status !== 'delete-hidden');

                // Nếu tất cả kết nối đều là delete-hidden hoặc không có kết nối nào
                if (!activeConnect) {
                    return {
                        id: master.wallet_id,
                        solana_address: master.wallet_solana_address,
                        nickname: master.wallet_nick_name,
                        type: master.wallet_stream,
                        country: master.wallet_country,
                        code_ref: master.wallet_code_ref,
                        connect_status: null  // Hiển thị là chưa kết nối
                    };
                }

                // Nếu có kết nối active, sử dụng thông tin của kết nối đó
                return {
                    id: master.wallet_id,
                    solana_address: master.wallet_solana_address,
                    nickname: master.wallet_nick_name,
                    type: master.wallet_stream,
                    country: master.wallet_country,
                    code_ref: master.wallet_code_ref,
                    connect_status: activeConnect.mc_status
                };
            });

            return {
                status: 200,
                data: result
            };
        } catch (error) {
            this.logger.error(`Error listing master wallets: ${error.message}`);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async getJoinedGroups(walletId: number, status?: 'active' | 'delete') {
        try {
            // Tìm tất cả các group auth của member
            const query = this.masterGroupAuthRepository
                .createQueryBuilder('auth')
                .innerJoinAndSelect('auth.master_group', 'group')
                .innerJoinAndSelect('group.master_wallet', 'master')
                .where('auth.mga_wallet_member = :walletId', { walletId })
                .andWhere('auth.mga_status IN (:...authStatuses)', { authStatuses: ['running', 'pause'] });

            // Lọc theo status của group
            if (status === 'active') {
                query.andWhere('group.mg_status IN (:...statuses)', { statuses: ['on', 'off'] });
            } else if (status === 'delete') {
                query.andWhere('group.mg_status = :status', { status: 'delete' });
            }

            const groupAuths = await query.getMany();

            // Format kết quả trả về với thông tin master wallet
            const joinedGroups = groupAuths.map(auth => ({
                group_id: auth.master_group.mg_id,
                name: auth.master_group.mg_name,
                option: auth.master_group.mg_option,
                fixed_price: auth.master_group.mg_fixed_price.toString(),
                fixed_ratio: auth.master_group.mg_fixed_ratio,
                status: auth.master_group.mg_status,
                created_at: auth.master_group.created_at,
                master_wallet: {
                    id: auth.master_group.master_wallet.wallet_id,
                    solana_address: auth.master_group.master_wallet.wallet_solana_address,
                    eth_address: auth.master_group.master_wallet.wallet_eth_address
                },
                auth_status: auth.mga_status
            }));

            return {
                status: 200,
                message: 'Joined groups retrieved successfully',
                data: joinedGroups
            };

        } catch (error) {
            console.error('Error getting joined groups:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async checkGroupJoinStatus(walletId: number, groupId: number) {
        try {
            // Kiểm tra group tồn tại
            const group = await this.masterGroupRepository.findOne({
                where: {
                    mg_id: groupId,
                    mg_status: Not(In(['delete', 'delete-hidden'])) // Không xét các group đã xóa
                }
            });

            if (!group) {
                return {
                    status: 404,
                    message: 'Group not found or has been deleted'
                };
            }

            // Kiểm tra kết nối bằng hàm checkConnectionStatus
            const { isConnected, activeConnect } = await this.checkConnectionStatus(
                group.mg_master_wallet,
                walletId
            );

            if (!isConnected || !activeConnect || activeConnect.mc_status !== 'connect') {
                return {
                    status: 400,
                    message: 'Wallet is not connected to this master or connection status is not "connect"',
                    data: {
                        is_joined: false,
                        connection_status: activeConnect?.mc_status || 'not_connected'
                    }
                };
            }

            // Kiểm tra auth tồn tại
            const auth = await this.masterGroupAuthRepository.findOne({
                where: {
                    mga_group_id: groupId,
                    mga_wallet_member: walletId
                },
                relations: ['master_group']
            });

            if (!auth) {
                return {
                    status: 200,
                    message: 'Wallet is not joined to this group',
                    data: {
                        is_joined: false,
                        connection_status: activeConnect.mc_status
                    }
                };
            }

            // Kiểm tra group hiện tại có phải delete-hidden không
            if (auth.master_group?.mg_status === 'delete-hidden') {
                return {
                    status: 200,
                    message: 'Group has been deleted',
                    data: {
                        is_joined: false,
                        connection_status: activeConnect.mc_status,
                        group_status: 'delete-hidden'
                    }
                };
            }

            return {
                status: 200,
                message: 'Wallet is joined to this group',
                data: {
                    is_joined: true,
                    connection_status: activeConnect.mc_status,
                    auth_status: auth.mga_status,
                    group_status: auth.master_group.mg_status
                }
            };

        } catch (error) {
            console.error('Error checking group join status:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    // Thêm hàm mới để xử lý limit orders
    async processMasterTransactions(tokenMint: string, currentPrice: number) {
        const matchingTransactions = await this.orderBookService
            .findMatchingMasterTransactions(tokenMint, currentPrice);

        for (const transaction of matchingTransactions) {
            try {
                await this.executeMasterTransaction(transaction, currentPrice);
            } catch (error) {
                console.error(`Error processing master transaction ${transaction.mt_id}:`, error);
            }
        }
    }

    async executeMasterMarketOrder(transaction: MasterTransaction) {
        try {
            // Lấy danh sách member
            const memberList = JSON.parse(transaction.mt_member_list || '[]');
            const memberWallets = await this.listWalletRepository.find({
                where: { wallet_id: In(memberList) }
            });

            // Lấy thông tin order gốc
            const originalOrder = await this.tradingOrderRepository.findOne({
                where: { order_id: transaction.mt_transaction_folow }
            });

            if (!originalOrder) {
                throw new Error(`Original order not found: ${transaction.mt_transaction_folow}`);
            }

            // Bỏ qua kiểm tra balance cho master trading
            const masterTokenBalance = null;

            // Xử lý master wallet và giao dịch master
            const masterWallet = await this.listWalletRepository.findOne({
                where: { wallet_id: transaction.mt_master_wallet }
            });

            if (!masterWallet) {
                console.error('Master wallet not found');
                return;
            }

            // Kiểm tra xem master có phải VIP không
            const isVipMaster = masterWallet?.wallet_stream === 'vip';
            console.log(`>>> Master is VIP: ${isVipMaster}`);

            // Xử lý khác nhau cho VIP và non-VIP
            if (isVipMaster) {
                console.log('>>> Master is VIP:', isVipMaster);
                // Thay thế dòng này:
                // await this.executeVipMasterOrder(savedTransaction, originalOrder, memberWallets);

                // Bằng dòng này:
                await this.executeVipMasterOrderWithBatching(transaction, originalOrder, memberWallets);
            } else {
                // Xử lý thông thường theo tỷ lệ
                await this.executeRegularMasterOrder(transaction, originalOrder, memberWallets);
            }
        } catch (error) {
            console.error('>>> Error executing master market order:', error);
        }
    }

    // Xử lý cho VIP Master - Copy chính xác số lượng nếu đủ điều kiện
    private async executeVipMasterOrderWithBatching(
        transaction: MasterTransaction,
        originalOrder: TradingOrder,
        memberWallets: ListWallet[]
    ) {
        try {
            console.log('>>> Executing VIP master order with optimized batch processing');

            // Lấy danh sách chi tiết giao dịch
            let details = await this.masterTransactionDetailRepository.find({
                where: { mt_transaction_id: transaction.mt_id }
            });

            // Nếu không có chi tiết, tạo chi tiết cho từng member
            if (!details || details.length === 0) {
                console.log('>>> Creating transaction details for members');

                // Lấy số dư SOL của master
                const masterWallet = await this.listWalletRepository.findOne({
                    where: { wallet_id: transaction.mt_master_wallet }
                });

                if (!masterWallet) {
                    throw new Error('Master wallet not found');
                }

                const masterBalance = await this.solanaService.getTokenBalance(
                    masterWallet.wallet_solana_address,
                    'SOL'
                );
                const masterSolAmount = originalOrder.order_total_value;

                const detailPromises = memberWallets.map(async (wallet) => {
                    // Kiểm tra số dư SOL của member
                    const memberBalance = await this.solanaService.getTokenBalance(
                        wallet.wallet_solana_address,
                        'SOL'
                    );

                    // Estimate gas fees
                    const estimatedGas = await this.estimateGasFees(transaction.mt_token_address);
                    const availableBalance = memberBalance - estimatedGas - this.MIN_SOL_BALANCE;

                    if (availableBalance <= 0) {
                        console.log(`>>> Member ${wallet.wallet_id} has insufficient SOL for gas`);
                        return null;
                    }

                    let memberAmount;
                    let solAmount;

                    if (transaction.mt_trade_type === 'buy') {
                        if (masterBalance <= memberBalance) {
                            // VIP Master + Member có đủ số dư: Copy chính xác
                            solAmount = Math.min(masterSolAmount, availableBalance * this.SAFETY_BUFFER);
                            // Điều chỉnh memberAmount theo tỷ lệ solAmount thực tế
                            memberAmount = originalOrder.order_qlty * (solAmount / masterSolAmount);
                        } else {
                            // Member có ít SOL hơn master: Copy theo tỷ lệ
                            const ratio = availableBalance / masterBalance;
                            solAmount = masterSolAmount * ratio * this.SAFETY_BUFFER;
                            memberAmount = originalOrder.order_qlty * ratio;
                        }
                    } else {
                        // Xử lý bán giữ nguyên logic cũ
                        memberAmount = originalOrder.order_qlty;
                    }

                    if (!memberAmount || memberAmount <= 0 || !solAmount || solAmount <= 0) {
                        console.log(`>>> Invalid amounts calculated for member ${wallet.wallet_id}`);
                        return null;
                    }

                    // Log thông tin chi tiết
                    console.log('VIP Master Trade Details:', {
                        masterBalance,
                        memberBalance,
                        availableBalance,
                        masterSolAmount,
                        solAmount,
                        memberAmount,
                        ratio: memberBalance >= masterBalance ? 1 : availableBalance / masterBalance
                    });

                    // Áp dụng phí chênh lệch cho member
                    const { priorityFee, slippage } = this.getStandardizedParams(
                        transaction.mt_token_address,
                        memberAmount,
                        false // Đây là member, không phải master
                    );

                    console.log(`>>> Fee params for MEMBER (VIP batching):`, {
                        priorityFee,
                        slippage,
                        feeIncrease: `${((priorityFee / 0.0000025 - 1) * 100).toFixed(4)}%`
                    });

                    // Điều chỉnh giá hoặc số lượng dựa trên phí
                    const memberFee = this.calculateMemberFee();
                    let adjustedPrice = transaction.mt_price;

                    if (transaction.mt_trade_type === 'buy') {
                        // Cho mua, tăng giá mua lên (rút ngắn số lượng token nhận được)
                        adjustedPrice = adjustedPrice * (1 + memberFee);
                    } else {
                        // Cho bán, giảm giá bán xuống (rút ngắn số lượng SOL nhận được)
                        adjustedPrice = adjustedPrice * (1 - memberFee);
                    }

                    const detail = new MasterTransactionDetail();
                    detail.mt_transaction_id = transaction.mt_id;
                    detail.mt_detail_type = transaction.mt_trade_type;
                    detail.mt_detail_token_address = transaction.mt_token_address;
                    detail.mt_detail_token_name = transaction.mt_token_name;
                    detail.mt_detail_amount = memberAmount;
                    detail.mt_detail_price = adjustedPrice;
                    detail.mt_detail_total_usd = adjustedPrice * memberAmount;
                    detail.mt_detail_status = 'wait';
                    detail.mt_detail_time = new Date();
                    detail.mt_wallet_master = transaction.mt_master_wallet;
                    detail.mt_wallet_member = wallet.wallet_id;

                    return this.masterTransactionDetailRepository.save(detail);
                });

                // Chờ tất cả promises hoàn thành và lọc bỏ các null
                details = (await Promise.all(detailPromises)).filter(detail => detail !== null);
            }

            // Map các wallet theo địa chỉ
            const walletMap = new Map<string, ListWallet>();

            for (const wallet of memberWallets) {
                walletMap.set(wallet.wallet_solana_address, wallet);
            }

            // Phân chia chi tiết thành các batch
            const BATCH_SIZE = 3; // Số lượng giao dịch thực hiện đồng thời
            const batches = this.chunkArray(details, BATCH_SIZE);

            // Thời gian cơ sở là thời điểm master thực hiện giao dịch
            const masterTransactionTime = originalOrder.order_created_at
                ? new Date(originalOrder.order_created_at).getTime()
                : Date.now();

            // Xử lý đồng bộ thời gian giao dịch để giảm tracking
            await this.synchronizeTransactionTiming(masterTransactionTime, details);

            // Xử lý từng batch
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                console.log(`>>> Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} transactions`);

                // Áp dụng V2 batch processing
                await this.processBatchV2(batch, walletMap, originalOrder, transaction, BATCH_SIZE);

                // Thêm độ trễ giữa các batch
                if (batchIndex < batches.length - 1) {
                    const delay = 1000 + Math.random() * 1000; // 1-2 giây trễ
                    console.log(`>>> Waiting ${delay.toFixed(0)}ms before next batch`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // Cập nhật trạng thái giao dịch
            await this.masterTransactionRepository.update(
                { mt_id: transaction.mt_id },
                { mt_status: 'stop' }
            );

        } catch (error) {
            console.error(`Error executing VIP master order with batching:`, error);
            await this.masterTransactionRepository.update(
                { mt_id: transaction.mt_id },
                { mt_status: 'failed', mt_error_message: error.message }
            );
        }
    }

    // Thêm phương thức để xáo trộn mảng
    private shuffleArray<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    // Đổi tên phương thức processBatch thành processBatchV1
    private async processBatchV1(
        details: MasterTransactionDetail[],
        walletMap: Map<string, any>,
        originalOrder: TradingOrder,
        transaction: MasterTransaction,
        concurrencyLimit: number
    ): Promise<any[]> {
        const results: any[] = [];
        const chunks: MasterTransactionDetail[][] = [];

        // Chia thành các nhóm nhỏ theo concurrencyLimit
        for (let i = 0; i < details.length; i += concurrencyLimit) {
            chunks.push(details.slice(i, i + concurrencyLimit));
        }

        // Xử lý từng nhóm
        for (const chunk of chunks) {
            const chunkPromises = chunk.map(detail =>
                this.promiseWithTimeout(
                    this.processDetailV1(detail, walletMap, originalOrder, transaction),
                    30000
                )
            );
            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);

            // Thêm độ trễ nhỏ giữa các nhóm
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return results;
    }

    // Xử lý chi tiết giao dịch cho một member
    private async processDetailV1(
        detail: MasterTransactionDetail,
        walletMap: Map<string, any>,
        originalOrder: TradingOrder,
        transaction: MasterTransaction
    ): Promise<any> {
        try {
            const walletId = detail.mt_wallet_member.toString();
            const memberData = walletMap.get(walletId);

            if (!memberData) {
                console.error(`>>> Member data not found for wallet ID ${walletId}`);
                // Cập nhật trạng thái detail thành error
                detail.mt_detail_status = 'error';
                detail.mt_detail_message = 'Member data not found';
                await this.masterTransactionDetailRepository.save(detail);
                return { success: false, error: 'Member data not found' };
            }

            const { wallet, fromToken, toToken, amount, slippage, priorityFee } = memberData;

            // Log thông tin giao dịch của member
            console.log(`>>> Executing swap for member ${walletId}`);
            console.log(`>>> Final swap amount: ${amount}`);
            console.log(`>>> Fee params for MEMBER: {
priorityFee: ${priorityFee},
slippage: ${slippage},
feeIncrease: '${((slippage / 3 - 1) * 100).toFixed(4)}%'
}`);

            // Log DEX sẽ được sử dụng 
            console.log(`>>> Member ${walletId} will use DEX: ${transaction.mt_used_dex}`);

            // Sanitize private key trước khi sử dụng
            const sanitizedPrivateKey = this.sanitizePrivateKey(wallet.wallet_private_key);

            try {
                // Thực hiện giao dịch swap
                const txResult = await this.solanaService.swapTokenOnSolana(
                    sanitizedPrivateKey,
                    fromToken,
                    toToken,
                    amount,
                    slippage,
                    {
                        priorityFee,
                        useDex: transaction.mt_used_dex as any
                    }
                );

                console.log(`>>> Swap successful for member ${walletId}, tx hash: ${txResult.signature}`);

                // Cập nhật trạng thái detail thành công
                detail.mt_detail_status = 'success';
                detail.mt_detail_hash = txResult.signature;
                detail.mt_detail_message = `Transaction successful: ${txResult.signature}`;

                // Lưu thông tin DEX vào thông điệp
                if (txResult.dex) {
                    detail.mt_detail_message += ` (via ${txResult.dex})`;
                }

                await this.masterTransactionDetailRepository.save(detail);

                return { success: true, txHash: txResult.signature };
            } catch (error) {
                console.error(`>>> Error executing swap for member ${walletId}:`, error);

                // Cập nhật trạng thái detail thành error
                detail.mt_detail_status = 'error';
                detail.mt_detail_message = `Error: ${error.message}`;
                await this.masterTransactionDetailRepository.save(detail);

                return { success: false, error: error.message };
            }
        } catch (error) {
            console.error(`>>> Error processing detail:`, error);

            // Cập nhật trạng thái detail thành error
            detail.mt_detail_status = 'error';
            detail.mt_detail_message = error.message;
            await this.masterTransactionDetailRepository.save(detail);

            return { success: false, error: error.message };
        }
    }

    async changeMasterGroupStatus(walletId: number, groupId: number, newStatus: 'on' | 'off' | 'delete') {
        try {
            // Kiểm tra wallet có quyền master
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet || wallet.wallet_auth !== 'master') {
                return {
                    status: 400,
                    message: 'Only master wallet can change group status'
                };
            }

            // Tìm group
            const group = await this.masterGroupRepository.findOne({
                where: {
                    mg_id: groupId,
                    mg_master_wallet: walletId
                }
            });

            if (!group) {
                return {
                    status: 404,
                    message: 'Group not found'
                };
            }

            // Kiểm tra nếu group đã delete thì không cho phép thay đổi status
            if (group.mg_status === 'delete') {
                return {
                    status: 400,
                    message: 'Cannot change status of deleted group'
                };
            }

            // Nếu status là delete, xóa tất cả các bản ghi trong master_group_auth
            if (newStatus === 'delete') {
                await this.masterGroupAuthRepository.delete({ mga_group_id: groupId });
                console.log(`>>> Deleted all auth records for group ${groupId}`);
            }

            // Cập nhật status mới
            group.mg_status = newStatus;
            const savedGroup = await this.masterGroupRepository.save(group);

            return {
                status: 200,
                message: 'Group status updated successfully',
                data: {
                    mg_id: savedGroup.mg_id,
                    mg_name: savedGroup.mg_name,
                    mg_option: savedGroup.mg_option,
                    mg_fixed_price: savedGroup.mg_fixed_price,
                    mg_fixed_ratio: savedGroup.mg_fixed_ratio,
                    mg_status: savedGroup.mg_status
                }
            };

        } catch (error) {
            console.error('Error changing group status:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async updateMasterGroup(walletId: number, groupId: number, updateGroupDto: UpdateGroupDto) {
        try {
            // Kiểm tra wallet có quyền master
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet || wallet.wallet_auth !== 'master') {
                return {
                    status: 400,
                    message: 'Only master wallet can update groups'
                };
            }

            // Tìm group hiện tại
            const group = await this.masterGroupRepository.findOne({
                where: {
                    mg_id: groupId,
                    mg_master_wallet: walletId
                }
            });

            if (!group) {
                return {
                    status: 404,
                    message: 'Group not found'
                };
            }

            // Kiểm tra trạng thái
            if (group.mg_status === 'delete') {
                return {
                    status: 400,
                    message: 'Cannot update deleted group'
                };
            }

            // Nếu có thay đổi tên, kiểm tra trùng lặp
            if (updateGroupDto.mg_name) {
                const existingGroupByName = await this.masterGroupRepository.findOne({
                    where: {
                        mg_master_wallet: walletId,
                        mg_name: updateGroupDto.mg_name,
                        mg_id: Not(groupId),
                        mg_status: Not('delete')
                    }
                });

                if (existingGroupByName) {
                    return {
                        status: 400,
                        message: 'Group name already exists'
                    };
                }
            }

            // Validate option và ratio/price
            if (updateGroupDto.mg_option) {
                if (updateGroupDto.mg_option === 'fixedprice') {
                    const price = updateGroupDto.mg_fixed_price || group.mg_fixed_price;
                    if (price < 0.01) {
                        return {
                            status: 400,
                            message: 'Fixed price must be greater than or equal to 0.01'
                        };
                    }
                    // Kiểm tra trùng lặp fixed price trong phạm vi của master wallet này
                    const existingGroupByPrice = await this.masterGroupRepository.findOne({
                        where: {
                            mg_master_wallet: walletId,  // Chỉ kiểm tra trong groups của master wallet này
                            mg_option: 'fixedprice',
                            mg_fixed_price: price,
                            mg_id: Not(groupId),
                            mg_status: Not('delete')
                        }
                    });

                    if (existingGroupByPrice) {
                        return {
                            status: 400,
                            message: 'You already have a group with this fixed price'
                        };
                    }

                    updateGroupDto.mg_fixed_ratio = 0;
                } else if (updateGroupDto.mg_option === 'fixedratio') {
                    const ratio = updateGroupDto.mg_fixed_ratio || group.mg_fixed_ratio;
                    if (ratio < 1 || ratio > 100) {
                        return {
                            status: 400,
                            message: 'Fixed ratio must be between 1 and 100'
                        };
                    }
                    // Kiểm tra trùng lặp fixed ratio trong phạm vi của master wallet này
                    const existingGroupByRatio = await this.masterGroupRepository.findOne({
                        where: {
                            mg_master_wallet: walletId,  // Chỉ kiểm tra trong groups của master wallet này
                            mg_option: 'fixedratio',
                            mg_fixed_ratio: ratio,
                            mg_id: Not(groupId),
                            mg_status: Not('delete')
                        }
                    });

                    if (existingGroupByRatio) {
                        return {
                            status: 400,
                            message: 'You already have a group with this fixed ratio'
                        };
                    }

                    updateGroupDto.mg_fixed_price = 0;
                } else if (updateGroupDto.mg_option === 'trackingratio') {
                    updateGroupDto.mg_fixed_price = 0;
                    updateGroupDto.mg_fixed_ratio = 0;
                }
            }

            // Cập nhật thông tin
            if (updateGroupDto.mg_name) {
                group.mg_name = updateGroupDto.mg_name;
            }
            if (updateGroupDto.mg_option) {
                group.mg_option = updateGroupDto.mg_option;
            }
            if (updateGroupDto.mg_fixed_price !== undefined) {
                group.mg_fixed_price = updateGroupDto.mg_fixed_price;
            }
            if (updateGroupDto.mg_fixed_ratio !== undefined) {
                group.mg_fixed_ratio = updateGroupDto.mg_fixed_ratio;
            }

            const savedGroup = await this.masterGroupRepository.save(group);

            return {
                status: 200,
                message: 'Group updated successfully',
                data: {
                    mg_id: savedGroup.mg_id,
                    mg_name: savedGroup.mg_name,
                    mg_option: savedGroup.mg_option,
                    mg_fixed_price: savedGroup.mg_fixed_price,
                    mg_fixed_ratio: savedGroup.mg_fixed_ratio,
                    mg_status: savedGroup.mg_status
                }
            };

        } catch (error) {
            console.error('Error updating master group:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async getGroupById(walletId: number, groupId: number) {
        try {
            // Tìm group
            const group = await this.masterGroupRepository.findOne({
                where: { mg_id: groupId }
            });

            if (!group) {
                return {
                    status: 404,
                    message: 'Group not found'
                };
            }

            // Kiểm tra quyền truy cập
            const isMember = await this.masterGroupAuthRepository.findOne({
                where: {
                    mga_group_id: groupId,
                    mga_wallet_member: walletId,
                    mga_status: 'running'
                }
            });

            if (group.mg_master_wallet !== walletId && !isMember) {
                return {
                    status: 403,
                    message: 'You do not have permission to view this group'
                };
            }

            return {
                status: 200,
                message: 'Group retrieved successfully',
                data: {
                    group_id: group.mg_id,
                    name: group.mg_name,
                    option: group.mg_option,
                    fixed_price: group.mg_fixed_price.toString(),
                    fixed_ratio: group.mg_fixed_ratio,
                    status: group.mg_status,
                    created_at: group.created_at,
                    master_wallet_id: group.mg_master_wallet
                }
            };

        } catch (error) {
            console.error('Error getting group:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    /**
     * Kiểm tra trạng thái kết nối giữa master và member
     * @param masterWalletId ID của master wallet
     * @param memberWalletId ID của member wallet
     * @returns {Promise<{isConnected: boolean, activeConnect: MasterConnect | null}>}
     * - isConnected: true nếu có kết nối active (không phải delete-hidden)
     * - activeConnect: kết nối active nếu có, null nếu không có
     */
    private async checkConnectionStatus(
        masterWalletId: number,
        memberWalletId: number
    ) {
        // Lấy tất cả kết nối giữa master và member
        const connects = await this.masterConnectRepository.find({
            where: {
                mc_master_wallet: masterWalletId,
                mc_member_wallet: memberWalletId,
                mc_status: Not('delete-hidden')  // Loại bỏ các kết nối đã xóa ẩn
            }
        });

        // Nếu không có kết nối nào
        if (!connects || connects.length === 0) {
            return {
                isConnected: false,
                activeConnect: null
            };
        }

        // Lấy kết nối mới nhất (nếu có nhiều kết nối)
        const currentConnect = connects[connects.length - 1];

        return {
            isConnected: currentConnect.mc_status === 'connect',
            activeConnect: currentConnect
        };
    }

    async connectToMaster(memberWalletId: number, connectMasterDto: ConnectMasterDto) {
        try {
            // Kiểm tra master wallet có tồn tại không
            const masterWallet = await this.listWalletRepository.findOne({
                where: {
                    wallet_solana_address: connectMasterDto.master_wallet_address,
                    wallet_auth: 'master',
                    wallet_status: true
                }
            });

            if (!masterWallet) {
                return {
                    status: 400,
                    message: 'Master wallet not found'
                };
            }

            // Kiểm tra member wallet có tồn tại không
            const memberWallet = await this.listWalletRepository.findOne({
                where: {
                    wallet_id: memberWalletId,
                    wallet_status: true
                }
            });

            if (!memberWallet) {
                return {
                    status: 400,
                    message: 'Member wallet not found'
                };
            }

            // Kiểm tra trạng thái kết nối
            const { isConnected } = await this.checkConnectionStatus(
                masterWallet.wallet_id,
                memberWalletId
            );

            if (isConnected) {
                return {
                    status: 400,
                    message: 'Already connected to this master'
                };
            }

            // Check if trying to connect to self
            if (masterWallet.wallet_id === memberWalletId) {
                return {
                    status: 400,
                    message: 'Cannot connect to yourself'
                };
            }

            // Kiểm tra member đã từng bị block bởi master này chưa
            const blockedConnection = await this.masterConnectRepository.findOne({
                where: {
                    mc_master_wallet: masterWallet.wallet_id,
                    mc_member_wallet: memberWalletId,
                    mc_status: 'block'
                }
            });

            if (blockedConnection) {
                return {
                    status: 403,
                    message: 'You have been blocked by this master and cannot connect'
                };
            }

            // Kiểm tra đã kết nối trước đó chưa (trừ trường hợp đã disconnect hoặc delete)
            const existingConnection = await this.masterConnectRepository.findOne({
                where: {
                    mc_master_wallet: masterWallet.wallet_id,
                    mc_member_wallet: memberWalletId,
                    mc_status: Not(In(['disconnect', 'delete']))
                }
            });

            if (existingConnection) {
                return {
                    status: 400,
                    message: 'Already connected to this master'
                };
            }

            // Xác định trạng thái kết nối dựa trên loại stream của master
            let connectionStatus: 'pending' | 'connect' = 'connect';

            // Nếu master là VIP, cần phê duyệt (pending)
            if (masterWallet.wallet_stream === 'vip') {
                connectionStatus = 'pending';
            }

            // Kiểm tra và cập nhật các giá trị limit dựa trên option_limit và loại master
            let priceLimitValue = 0;
            let ratioLimitValue = 0;
            let optionLimit = connectMasterDto.option_limit;

            // Nếu master là VIP, mặc định sử dụng option_limit = "default" và các giá trị limit = 0
            if (masterWallet.wallet_stream === 'vip') {
                optionLimit = 'default';
                priceLimitValue = 0;
                ratioLimitValue = 0;
            }
            // Nếu master là normal, kiểm tra và xác thực các giá trị limit
            else if (masterWallet.wallet_stream === 'normal' || masterWallet.wallet_stream === null) {
                if (connectMasterDto.option_limit === 'price') {
                    if (!connectMasterDto.price_limit || connectMasterDto.price_limit <= 0) {
                        return {
                            status: 400,
                            message: 'Price limit must be greater than 0 for normal masters with price option'
                        };
                    }
                    priceLimitValue = connectMasterDto.price_limit;
                } else if (connectMasterDto.option_limit === 'ratio') {
                    if (!connectMasterDto.ratio_limit || connectMasterDto.ratio_limit < 5) {
                        return {
                            status: 400,
                            message: 'Ratio limit must be at least 5 for normal masters with ratio option'
                        };
                    }
                    ratioLimitValue = connectMasterDto.ratio_limit;
                }
                // Với 'default', cả hai giá trị đều là 0
            }

            // Tạo kết nối mới
            const newConnection = new MasterConnect();
            newConnection.mc_master_wallet = masterWallet.wallet_id;
            newConnection.mc_member_wallet = memberWalletId;
            newConnection.mc_option_limit = optionLimit;
            newConnection.mc_price_limit = priceLimitValue;
            newConnection.mc_ratio_limit = ratioLimitValue;
            newConnection.mc_status = connectionStatus;

            const savedConnection = await this.masterConnectRepository.save(newConnection);

            return {
                status: 200,
                message: connectionStatus === 'pending'
                    ? 'Connection request sent, waiting for master approval'
                    : 'Successfully connected to master',
                data: {
                    ...savedConnection,
                    master_wallet_address: connectMasterDto.master_wallet_address,
                    master_type: masterWallet.wallet_stream || 'normal'
                }
            };

        } catch (error) {
            this.logger.error(`Error connecting to master: ${error.message}`);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async masterSetConnect(masterWalletId: number, dto: MasterSetConnectDto) {
        try {
            // Kiểm tra master wallet
            const masterWallet = await this.listWalletRepository.findOne({
                where: {
                    wallet_id: masterWalletId,
                    wallet_auth: 'master',
                    wallet_status: true
                }
            });

            if (!masterWallet) {
                return {
                    status: 400,
                    message: 'Master wallet not found'
                };
            }

            // Kiểm tra kết nối tồn tại
            const connect = await this.masterConnectRepository.findOne({
                where: {
                    mc_id: dto.mc_id,
                    mc_master_wallet: masterWalletId
                },
                relations: ['member_wallet']
            });

            if (!connect) {
                return {
                    status: 400,
                    message: 'Connection not found'
                };
            }

            // Kiểm tra quyền sở hữu
            if (connect.mc_master_wallet !== masterWalletId) {
                return {
                    status: 403,
                    message: 'You do not have permission to modify this connection'
                };
            }

            // Kiểm tra trạng thái kết nối hiện tại
            const { isConnected, activeConnect } = await this.checkConnectionStatus(
                masterWalletId,
                connect.mc_member_wallet
            );

            // Kiểm tra các trường hợp đặc biệt
            if (connect.mc_status === 'block') {
                // Chỉ cho phép chuyển từ block sang pause
                if (dto.status === 'pause') {
                    await this.masterConnectRepository.update(
                        { mc_id: dto.mc_id },
                        { mc_status: dto.status }
                    );
                    return {
                        status: 200,
                        message: 'Connection status updated successfully',
                        data: {
                            connect_id: dto.mc_id,
                            status: dto.status
                        }
                    };
                }
                return {
                    status: 400,
                    message: 'Cannot change status of blocked connection'
                };
            }

            // Kiểm tra chuyển từ pause sang block
            if (connect.mc_status === 'pause' && dto.status === 'block') {
                await this.masterConnectRepository.update(
                    { mc_id: dto.mc_id },
                    { mc_status: dto.status }
                );
                return {
                    status: 200,
                    message: 'Connection status updated successfully',
                    data: {
                        connect_id: dto.mc_id,
                        status: dto.status
                    }
                };
            }

            // Kiểm tra chuyển từ connect sang connect
            if (connect.mc_status === 'connect' && dto.status === 'connect') {
                return {
                    status: 400,
                    message: 'Connection is already active'
                };
            }

            // Kiểm tra chuyển từ pending sang connect hoặc block
            if (connect.mc_status === 'pending' &&
                (dto.status === 'connect' || dto.status === 'block')) {
                await this.masterConnectRepository.update(
                    { mc_id: dto.mc_id },
                    { mc_status: dto.status }
                );
                return {
                    status: 200,
                    message: 'Connection status updated successfully',
                    data: {
                        connect_id: dto.mc_id,
                        status: dto.status
                    }
                };
            }

            // Kiểm tra chuyển từ connect sang block
            if (connect.mc_status === 'connect' && dto.status === 'block') {
                await this.masterConnectRepository.update(
                    { mc_id: dto.mc_id },
                    { mc_status: dto.status }
                );
                return {
                    status: 200,
                    message: 'Connection status updated successfully',
                    data: {
                        connect_id: dto.mc_id,
                        status: dto.status
                    }
                };
            }

            // Nếu đang cố gắng tạo kết nối mới (status = 'connect') nhưng đã có kết nối active
            if (dto.status === 'connect' && isConnected && activeConnect?.mc_id !== dto.mc_id) {
                return {
                    status: 400,
                    message: 'Member already has an active connection with this master'
                };
            }

            // Cập nhật trạng thái cho các trường hợp còn lại
            await this.masterConnectRepository.update(
                { mc_id: dto.mc_id },
                { mc_status: dto.status }
            );

            return {
                status: 200,
                message: 'Connection status updated successfully',
                data: {
                    connect_id: dto.mc_id,
                    status: dto.status
                }
            };
        } catch (error) {
            this.logger.error(`Error updating connection status: ${error.message}`);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async memberSetConnect(memberWalletId: number, dto: MemberSetConnectDto) {
        try {
            // Kiểm tra master wallet
            const masterWallet = await this.listWalletRepository.findOne({
                where: {
                    wallet_id: dto.master_id,
                    wallet_auth: 'master',
                    wallet_status: true
                }
            });

            if (!masterWallet) {
                return {
                    status: 400,
                    message: 'Master wallet not found'
                };
            }

            // Kiểm tra member wallet
            const memberWallet = await this.listWalletRepository.findOne({
                where: {
                    wallet_id: memberWalletId,
                    wallet_status: true
                }
            });

            if (!memberWallet) {
                return {
                    status: 400,
                    message: 'Member wallet not found'
                };
            }

            // Kiểm tra không thể kết nối với chính mình
            if (masterWallet.wallet_id === memberWalletId) {
                return {
                    status: 400,
                    message: 'Cannot connect to yourself'
                };
            }

            // Kiểm tra trạng thái kết nối
            const { isConnected, activeConnect } = await this.checkConnectionStatus(
                dto.master_id,
                memberWalletId
            );

            // Nếu đang cố gắng tạo kết nối mới (status = 'connect') và đã có kết nối với status = 'connect'
            if (dto.status === 'connect' && activeConnect?.mc_status === 'connect') {
                return {
                    status: 400,
                    message: 'Already connected to this master'
                };
            }

            // Nếu có kết nối và đang bị block
            if (activeConnect?.mc_status === 'block') {
                return {
                    status: 400,
                    message: 'Cannot change status of a blocked connection'
                };
            }

            // Nếu không có kết nối nào và đang cố gắng thay đổi trạng thái khác 'connect'
            if (!activeConnect) {
                if (dto.status !== 'connect') {
                    return {
                        status: 400,
                        message: 'No connection found with this master'
                    };
                }
            }

            // Cập nhật hoặc tạo mới kết nối
            if (activeConnect) {  // Nếu đã có kết nối (bất kể status là gì)
                await this.masterConnectRepository.update(
                    { mc_id: activeConnect.mc_id },
                    { mc_status: dto.status }
                );
            } else {  // Chỉ tạo mới khi thực sự chưa có kết nối nào
                const newConnect = this.masterConnectRepository.create({
                    mc_master_wallet: dto.master_id,
                    mc_member_wallet: memberWalletId,
                    mc_status: dto.status,
                    mc_option_limit: 'default',
                    mc_price_limit: 0,
                    mc_ratio_limit: 0
                });
                await this.masterConnectRepository.save(newConnect);
            }

            return {
                status: 200,
                message: 'Connection status updated successfully',
                data: {
                    master_id: dto.master_id,
                    status: dto.status
                }
            };
        } catch (error) {
            this.logger.error(`Error updating connection status: ${error.message}`);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async masterSetGroup(masterWalletId: number, dto: MasterSetGroupDto) {
        try {
            // Kiểm tra master wallet tồn tại
            const masterWallet = await this.listWalletRepository.findOne({
                where: {
                    wallet_id: masterWalletId,
                    wallet_auth: 'master'
                }
            });

            if (!masterWallet) {
                return {
                    status: 403,
                    message: 'Only master wallet can add members to groups'
                };
            }

            // Kiểm tra group tồn tại và thuộc sở hữu của master
            const group = await this.masterGroupRepository.findOne({
                where: {
                    mg_id: dto.mg_id,
                    mg_master_wallet: masterWalletId,
                    mg_status: Not(In(['delete', 'delete-hidden'])) // Không xét các group đã xóa
                }
            });

            if (!group) {
                return {
                    status: 400,
                    message: 'Group not found or not owned by this master'
                };
            }

            // Lấy tất cả group của master này
            const masterGroups = await this.masterGroupRepository.find({
                where: {
                    mg_master_wallet: masterWalletId,
                    mg_status: Not(In(['delete', 'delete-hidden']))
                },
                select: ['mg_id']
            });

            // Lấy danh sách group ID của master
            const masterGroupIds = masterGroups.map(mg => mg.mg_id);

            // Kết quả xử lý cho từng member
            const results = {
                success: [] as Array<{
                    member_id: number;
                    mga_id: number;
                    mga_status: string;
                    member_info: {
                        wallet_id: number;
                        wallet_solana_address: string;
                        wallet_auth: string;
                    };
                    note?: string;
                }>,
                failed: [] as Array<{
                    member_id: number;
                    reason: string;
                }>
            };

            // Xử lý từng member trong mảng
            for (const memberId of dto.member_ids) {
                try {
                    // Kiểm tra wallet tồn tại (có thể là member hoặc master)
                    const targetWallet = await this.listWalletRepository.findOne({
                        where: {
                            wallet_id: memberId
                        }
                    });

                    if (!targetWallet) {
                        results.failed.push({
                            member_id: memberId,
                            reason: 'Wallet not found'
                        });
                        continue;
                    }

                    // Kiểm tra kết nối bằng hàm checkConnectionStatus
                    const { isConnected, activeConnect } = await this.checkConnectionStatus(
                        masterWalletId,
                        memberId
                    );

                    if (!isConnected || !activeConnect || activeConnect.mc_status !== 'connect') {
                        results.failed.push({
                            member_id: memberId,
                            reason: 'Wallet is not connected to this master or connection status is not "connect"'
                        });
                        continue;
                    }

                    if (masterGroupIds.length > 0) {
                        // Kiểm tra wallet đã tham gia bất kỳ group nào của master này chưa
                        const existingAuth = await this.masterGroupAuthRepository.findOne({
                            where: {
                                mga_group_id: In(masterGroupIds),
                                mga_wallet_member: memberId
                            },
                            relations: ['master_group']
                        });

                        if (existingAuth) {
                            // Kiểm tra group hiện tại có phải delete-hidden không
                            if (existingAuth.master_group?.mg_status === 'delete-hidden') {
                                // Nếu group hiện tại là delete-hidden, tạo mới auth cho group mới
                                const newAuth = new MasterGroupAuth();
                                newAuth.mga_group_id = dto.mg_id;
                                newAuth.mga_wallet_member = memberId;
                                newAuth.mga_status = 'running';

                                const savedAuth = await this.masterGroupAuthRepository.save(newAuth);

                                results.success.push({
                                    member_id: memberId,
                                    mga_id: savedAuth.mga_id,
                                    mga_status: savedAuth.mga_status,
                                    member_info: {
                                        wallet_id: targetWallet.wallet_id,
                                        wallet_solana_address: targetWallet.wallet_solana_address,
                                        wallet_auth: targetWallet.wallet_auth
                                    },
                                    note: 'Wallet moved from deleted-hidden group to new group'
                                });
                                continue;
                            }

                            // Thay vì từ chối, cập nhật group_id mới cho wallet này
                            if (existingAuth.mga_group_id === dto.mg_id) {
                                // Nếu đã join đúng group này rồi thì bỏ qua
                                results.failed.push({
                                    member_id: memberId,
                                    reason: 'Wallet already joined this group'
                                });
                                continue;
                            }

                            // Cập nhật group_id mới
                            existingAuth.mga_group_id = dto.mg_id;
                            const updatedAuth = await this.masterGroupAuthRepository.save(existingAuth);

                            results.success.push({
                                member_id: memberId,
                                mga_id: updatedAuth.mga_id,
                                mga_status: updatedAuth.mga_status,
                                member_info: {
                                    wallet_id: targetWallet.wallet_id,
                                    wallet_solana_address: targetWallet.wallet_solana_address,
                                    wallet_auth: targetWallet.wallet_auth
                                },
                                note: 'Wallet was moved from another group'
                            });
                            continue;
                        }
                    }

                    // Tạo mới master_group_auth với trạng thái mặc định là "running"
                    const newAuth = new MasterGroupAuth();
                    newAuth.mga_group_id = dto.mg_id;
                    newAuth.mga_wallet_member = memberId;
                    newAuth.mga_status = 'running';

                    const savedAuth = await this.masterGroupAuthRepository.save(newAuth);

                    results.success.push({
                        member_id: memberId,
                        mga_id: savedAuth.mga_id,
                        mga_status: savedAuth.mga_status,
                        member_info: {
                            wallet_id: targetWallet.wallet_id,
                            wallet_solana_address: targetWallet.wallet_solana_address,
                            wallet_auth: targetWallet.wallet_auth
                        },
                        note: 'Wallet newly added to group'
                    });
                } catch (error) {
                    console.error(`Error processing wallet ${memberId}:`, error);
                    results.failed.push({
                        member_id: memberId,
                        reason: 'Internal error during processing'
                    });
                }
            }

            return {
                status: 200,
                message: `Processed ${results.success.length} wallets successfully, ${results.failed.length} failed`,
                data: {
                    group_id: dto.mg_id,
                    total_processed: dto.member_ids.length,
                    success_count: results.success.length,
                    failed_count: results.failed.length,
                    success_members: results.success,
                    failed_members: results.failed
                }
            };

        } catch (error) {
            console.error('Error adding wallets to group:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    async checkMaster(wallet_address: string, currentWalletId?: number) {
        try {
            // Tìm wallet theo địa chỉ
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_solana_address: wallet_address } // Chỉ kiểm tra địa chỉ Solana
            });

            // Nếu không tìm thấy wallet hoặc không phải master
            if (!wallet || wallet.wallet_auth !== 'master') {
                return {
                    status: 400,
                    message: 'This wallet is not a master wallet',
                    data: {
                        is_master: false,
                        isConnect: false,
                        groupConnect: null
                    }
                };
            }

            // Kiểm tra kết nối nếu có currentWalletId
            let isConnect = false;
            let groupConnect: number | null = null;

            if (currentWalletId && currentWalletId !== wallet.wallet_id) {
                // Kiểm tra kết nối trong bảng master_connects
                const connection = await this.masterConnectRepository.findOne({
                    where: {
                        mc_master_wallet: wallet.wallet_id,
                        mc_member_wallet: currentWalletId,
                        mc_status: 'connect'
                    }
                });

                if (connection) {
                    isConnect = true;

                    // Kiểm tra group trong bảng master_group_auth, lấy group cũ nhất
                    const groupAuth = await this.masterGroupAuthRepository.findOne({
                        where: {
                            mga_wallet_member: currentWalletId,
                            mga_status: 'running'
                        },
                        relations: ['master_group'],
                        order: {
                            created_at: 'ASC'
                        }
                    });

                    if (groupAuth && groupAuth.master_group.mg_master_wallet === wallet.wallet_id) {
                        groupConnect = groupAuth.master_group.mg_id;
                    }
                }
            }

            // Nếu là master wallet, trả về thông tin
            return {
                status: 200,
                message: 'Master wallet found',
                data: {
                    is_master: true,
                    isConnect,
                    groupConnect,
                    master_wallet: {
                        wallet_id: wallet.wallet_id,
                        wallet_auth: wallet.wallet_auth,
                        wallet_stream: wallet.wallet_stream,
                        wallet_solana_address: wallet.wallet_solana_address,
                        wallet_eth_address: wallet.wallet_eth_address
                    }
                }
            };
        } catch (error) {
            console.error('Error checking master wallet:', error);
            return {
                status: 500,
                message: 'Internal server error',
                data: {
                    is_master: false,
                    isConnect: false,
                    groupConnect: null
                }
            };
        }
    }

    /**
     * Lấy danh sách các member đang kết nối đến một master wallet
     */
    async getMyConnects(masterWalletId: number) {
        try {
            // Kiểm tra wallet có quyền master
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: masterWalletId, wallet_auth: 'master' }
            });

            if (!wallet) {
                return {
                    status: 400,
                    message: 'Only master wallet can access this information'
                };
            }

            // Lấy danh sách kết nối
            const connections = await this.masterConnectRepository.find({
                where: { mc_master_wallet: masterWalletId },
                relations: ['member_wallet']
            });

            // Định dạng dữ liệu phản hồi
            const formattedConnections = await Promise.all(connections.map(async connection => {
                // Lấy thông tin các group mà member đã tham gia
                const groupAuths = await this.masterGroupAuthRepository.find({
                    where: {
                        mga_wallet_member: connection.mc_member_wallet,
                        mga_status: 'running'
                    },
                    relations: ['master_group']
                });

                // Lọc chỉ lấy các group thuộc sở hữu của master này
                const joinedGroups = groupAuths
                    .filter(auth => auth.master_group && auth.master_group.mg_master_wallet === masterWalletId)
                    .map(auth => ({
                        group_id: auth.master_group.mg_id,
                        group_name: auth.master_group.mg_name
                    }));

                // Lấy số dư SOL của member
                // const solanaBalance = await this.solanaService.getBalance(connection.member_wallet?.wallet_solana_address || '');

                // Lấy giá SOL trong USD
                // const solPriceInUsd = await this.solanaPriceCacheService.getTokenPriceInUSD('So11111111111111111111111111111111111111112');

                // Tính giá trị USD của số dư SOL
                // const solanaBalanceUsd = solanaBalance * solPriceInUsd;

                return {
                    connection_id: connection.mc_id,
                    member_id: connection.mc_member_wallet,
                    member_address: connection.member_wallet?.wallet_solana_address || 'Unknown',
                    status: connection.mc_status,
                    option_limit: connection.mc_option_limit,
                    price_limit: connection.mc_price_limit,
                    ratio_limit: connection.mc_ratio_limit,
                    joined_groups: joinedGroups,
                    // solana_balance: solanaBalance,
                    // solana_balance_usd: solanaBalanceUsd
                };
            }));

            return {
                status: 200,
                message: 'Member connections retrieved successfully',
                data: formattedConnections
            };
        } catch (error) {
            console.error('Error getting member connections:', error);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }

    // Hàm tính toán số lượng token cho member
    private calculateMemberAmount(auth: MasterGroupAuth, masterAmount: number): number {
        // Lấy thông tin group
        const group = auth.master_group;

        // Tính toán dựa trên option của group
        if (group.mg_option === 'fixedprice') {
            return group.mg_fixed_price;
        } else if (group.mg_option === 'fixedratio') {
            return masterAmount * (group.mg_fixed_ratio / 100);
        } else {
            // Mặc định là trackingratio - copy theo tỷ lệ
            return masterAmount;
        }
    }

    // Hàm chia nhỏ mảng thành các nhóm
    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    // Hàm để thêm timeout cho promise
    private promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
            )
        ]);
    }

    // Thêm phương thức processDetail để xử lý từng giao dịch chi tiết
    private async processDetail(
        detail: MasterTransactionDetail,
        walletMap: Map<string, any>,
        originalOrder: TradingOrder,
        transaction: MasterTransaction
    ): Promise<any> {
        try {
            const wallet = walletMap.get(detail.mt_wallet_member.toString());
            if (!wallet) {
                throw new Error(`Wallet not found for member ${detail.mt_wallet_member}`);
            }

            // Default value for sellAllTokens
            let sellAllTokens = false;

            if (transaction.mt_trade_type === 'sell') {
                const memberBalance = await this.solanaService.getTokenBalance(
                    wallet.wallet_solana_address,
                    transaction.mt_token_address
                );

                // Lấy thông tin ví master từ database
                const masterWallet = await this.listWalletRepository.findOne({
                    where: { wallet_id: transaction.mt_master_wallet }
                });

                if (!masterWallet) {
                    throw new Error(`Master wallet not found for ID: ${transaction.mt_master_wallet}`);
                }

                const masterBalance = await this.solanaService.getTokenBalance(
                    masterWallet.wallet_solana_address,
                    transaction.mt_token_address
                );

                // Fix lỗi member còn dư lượng nhỏ token sau khi bán.
                // Nếu chênh lệch số dư giữa master và member < 1% thì member sẽ bán hết token
                // để tránh còn dư lượng nhỏ không thể bán sau này.

                // Trường hợp 1: Master có nhiều token hơn member
                if (masterBalance > memberBalance) {
                    const diff = masterBalance - memberBalance;
                    const ratio = diff / memberBalance;

                    if (ratio < 0.01) { // Chênh lệch < 1%
                        sellAllTokens = true;
                    }
                }
                // Trường hợp 2: Member có nhiều token hơn hoặc bằng master
                else {
                    const diff = memberBalance - masterBalance;
                    const ratio = diff / masterBalance;

                    if (ratio < 0.01) { // Chênh lệch < 1%
                        sellAllTokens = true;
                    }
                }

                if (sellAllTokens) {
                    // Bán hết token
                    const SELL_SAFETY_BUFFER = 0.9999; // 99.99% để giảm số dư token
                    detail.mt_detail_amount = memberBalance * SELL_SAFETY_BUFFER;
                    console.log(`>>> Selling all tokens (${detail.mt_detail_amount}) for member ${detail.mt_wallet_member} with safety buffer`);
                }
                // Nếu không thỏa điều kiện, giữ nguyên logic hiện tại
            }

            // Thực hiện giao dịch (giữ nguyên logic hiện tại)
            const result = await this.executeSwap(
                detail,
                wallet,
                transaction,
                detail.mt_detail_amount
            );

            return result;
        } catch (error) {
            console.error('Error processing detail:', error);
            throw error;
        }
    }

    // Cập nhật phương thức swapWithRetryAndReduction để kiểm tra số lượng tối thiểu
    private async swapWithRetryAndReduction(
        wallet: ListWallet,
        fromToken: string,
        toToken: string,
        amount: number,
        slippage: number,
        options: any = {}
    ): Promise<any> {
        let attempts = 0;
        const maxAttempts = 3;
        let currentAmount = amount;
        let currentSlippage = options.maxSlippage || slippage;

        while (attempts < maxAttempts) {
            attempts++;
            console.log(`>>> Attempt ${attempts} to swap ${currentAmount} tokens with slippage ${currentSlippage}%`);

            try {
                // Kiểm tra xem token có phải là meme coin không
                const isMemeToken = await this.solanaService.isPumpFunToken(
                    fromToken === 'So11111111111111111111111111111111111111112' ? toToken : fromToken
                );

                if (isMemeToken) {
                    console.log(`>>> Token ${fromToken === 'So11111111111111111111111111111111111111112' ? toToken : fromToken} is a meme coin`);
                    console.log(`>>> Using PumpFun for meme coin ${fromToken === 'So11111111111111111111111111111111111111112' ? toToken : fromToken}`);

                    try {
                        const signature = await this.pumpFunService.swap(
                            wallet.wallet_private_key,
                            fromToken,
                            toToken,
                            currentAmount,
                            currentSlippage,
                            {
                                ...options,
                                denominatedInSol: fromToken === 'So11111111111111111111111111111111111111112'
                            }
                        );

                        // Tạo đối tượng kết quả với thông tin DEX
                        return {
                            signature: typeof signature === 'string' ? signature : (signature as any).signature,
                            dex: 'pumpfun',
                            outputAmount: currentAmount
                        };
                    } catch (error) {
                        console.error(`>>> PumpFun swap failed: ${error.message}`);
                        // Tiếp tục với Jupiter nếu PumpFun thất bại
                    }
                }

                // Thử với Jupiter
                try {
                    console.log(`=== JUPITER SWAP START ===`);
                    console.log(`Input: ${fromToken}`);
                    console.log(`Output: ${toToken}`);
                    console.log(`Amount: ${currentAmount}`);
                    console.log(`Slippage: ${currentSlippage}%`);

                    const result = await this.solanaService.swapTokenOnSolana(
                        wallet.wallet_private_key,
                        fromToken,
                        toToken,
                        currentAmount,
                        currentSlippage,
                        {
                            ...options,
                            useDex: 'jupiter' // Sử dụng useDex thay vì dex
                        }
                    );

                    // Thêm thông tin DEX đã sử dụng
                    result.dex = 'jupiter';
                    return result;
                } catch (error) {
                    console.error(`Jupiter swap failed: ${error.message}`);
                    // Tiếp tục với Raydium nếu Jupiter thất bại
                }

                // Thử với Raydium
                try {
                    console.log(`=== RAYDIUM SWAP START ===`);
                    console.log(`Input: ${fromToken}`);
                    console.log(`Output: ${toToken}`);
                    console.log(`Amount: ${currentAmount}`);
                    console.log(`Slippage: ${currentSlippage}%`);

                    const result = await this.solanaService.swapTokenOnSolana(
                        wallet.wallet_private_key,
                        fromToken,
                        toToken,
                        currentAmount,
                        currentSlippage,
                        {
                            ...options,
                            useDex: 'raydium' // Sử dụng useDex thay vì dex
                        }
                    );

                    // Thêm thông tin DEX đã sử dụng
                    result.dex = 'raydium';
                    return result;
                } catch (error) {
                    console.error(`Raydium swap failed: ${error.message}`);
                }

                // Giảm số lượng và tăng slippage cho lần thử tiếp theo
                currentAmount = currentAmount * 0.9;
                currentSlippage = currentSlippage * 1.2;
            } catch (error) {
                console.error(`>>> Swap attempt ${attempts} failed: ${error.message}`);

                // Giảm số lượng và tăng slippage cho lần thử tiếp theo
                currentAmount = currentAmount * 0.9;
                currentSlippage = currentSlippage * 1.2;
            }
        }

        throw new Error(`All swap attempts failed: ${attempts} attempts with reducing amounts`);
    }

    // Cải thiện hàm chuẩn hóa phí và slippage
    private getStandardizedParams(tokenAddress: string, amount: number, isMaster: boolean = false) {
        // Chuẩn hóa priority fee - Tạo chênh lệch phí từ 0.05% đến 0.1% giữa member và master
        let basePriorityFee;

        if (isMaster) {
            // Master sử dụng mức phí thấp hơn
            basePriorityFee = 0.0000025; // Giữ nguyên giá trị cơ sở thấp cho master
        } else {
            // Member sử dụng mức phí cao hơn 0.05% - 0.1%
            // Tăng phí lên từ 0.05% đến 0.1% (0.0000025 * 1.0005 đến 0.0000025 * 1.001)
            const feeIncreasePercentage = 1.0005 + (Math.random() * 0.0005); // 0.05% đến 0.1%
            basePriorityFee = 0.0000025 * feeIncreasePercentage;
        }

        // Thêm biến động rất nhỏ để tránh trùng lặp chính xác
        // Biến động chỉ ±0.00000001 (0.004% của giá trị cơ sở)
        const priorityFeeVariation = isMaster ?
            1.0 : // Master giữ nguyên
            (0.9998 + (Math.random() * 0.0004)); // Member thay đổi rất nhỏ

        const priorityFee = basePriorityFee * priorityFeeVariation;

        // Chuẩn hóa slippage theo token
        const tokenSlippageMap = {
            '2undnvUuWAz4KDBEENEvYmJWAMV5aqmHExcJ5kaqpump': 8, // 8% cố định cho token thanh khoản thấp
            // Thêm các token khác nếu cần
        };

        // Slippage cơ sở dựa trên token
        let slippage = tokenSlippageMap[tokenAddress] || 3; // 3% mặc định

        // Điều chỉnh slippage dựa trên kích thước giao dịch (nhưng ít biến động hơn)
        if (amount < 10) {
            slippage += 0.1; // Tăng 0.1% cho giao dịch nhỏ
        } else if (amount > 10000) {
            slippage += 0.1; // Tăng 0.1% cho giao dịch lớn
        }

        // Thêm biến động rất nhỏ cho slippage để tránh mẫu (chỉ ±0.05%)
        const slippageVariation = isMaster ?
            1.0 : // Master giữ nguyên
            (0.998 + (Math.random() * 0.004)); // Member thay đổi rất nhỏ

        slippage *= slippageVariation;

        console.log(`>>> Fee params for ${isMaster ? 'MASTER' : 'MEMBER'}:`, {
            priorityFee,
            slippage,
            // Hiển thị chênh lệch phí so với mức cơ sở của master
            feeIncrease: isMaster ? '0%' : `${((priorityFee / 0.0000025 - 1) * 100).toFixed(4)}%`
        });

        return {
            priorityFee: priorityFee,
            slippage: slippage
        };
    }

    // Thêm phương thức mới để quyết định có nên chia nhỏ giao dịch hay không
    private async shouldSplitTransaction(amount: number, tokenAddress: string): Promise<boolean> {
        // Ngưỡng cơ bản cho SOL
        const SOL_THRESHOLD = 0.5; // 0.5 SOL

        // Nếu là SOL, so sánh trực tiếp
        if (tokenAddress === 'So11111111111111111111111111111111111111112') {
            return amount > SOL_THRESHOLD;
        }

        try {
            // Lấy giá token từ cache (đã được cập nhật bởi WebSocket)
            const cacheKey = `token_price_sol:${tokenAddress}`;
            const cachedPrice = await this.cacheService.get(cacheKey);

            if (cachedPrice) {
                // Sử dụng giá từ cache (cập nhật bởi WebSocket)
                const priceInSol = parseFloat(cachedPrice as string);
                const solValue = amount * priceInSol;
                console.log(`Token ${tokenAddress} amount ${amount} = ${solValue} SOL (from WebSocket cache)`);

                return solValue > SOL_THRESHOLD;
            }

            // Nếu không có trong cache, đăng ký theo dõi token này
            this.solanaWebSocketService.trackTokenPrice(tokenAddress);

            // Mặc định không chia nhỏ nếu không có giá
            return false;
        } catch (error) {
            console.error(`Error calculating token value for splitting decision:`, error);
            return false;
        }
    }

    // Thêm phương thức theo dõi và điều chỉnh
    private async monitorAndAdjustTransaction(
        detail: MasterTransactionDetail,
        expectedAmount: number,
        txHash: string
    ) {
        try {
            // Đợi giao dịch hoàn thành
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Lấy thông tin giao dịch thực tế
            const txInfo = await this.solanaService.analyzeTransaction(txHash);

            if (txInfo && txInfo.outputAmount) {
                const actualAmount = txInfo.outputAmount;
                const difference = Math.abs(actualAmount - expectedAmount);
                const percentDiff = (difference / expectedAmount) * 100;

                console.log(`Transaction ${txHash} completed: Expected ${expectedAmount}, Actual ${actualAmount}`);
                console.log(`Difference: ${difference} (${percentDiff.toFixed(2)}%)`);

                // Cập nhật thông tin chi tiết
                await this.masterTransactionDetailRepository.update(
                    { mt_detail_id: detail.mt_detail_id },
                    {
                        mt_detail_received: actualAmount,
                        mt_detail_message: `Expected: ${expectedAmount}, Actual: ${actualAmount}, Diff: ${percentDiff.toFixed(2)}%`
                    }
                );

                // Nếu chênh lệch quá lớn, ghi log để phân tích
                if (percentDiff > 10) {
                    console.warn(`Large difference detected in transaction ${txHash}: ${percentDiff.toFixed(2)}%`);
                }
            }
        } catch (error) {
            console.error(`Error monitoring transaction ${txHash}:`, error);
        }
    }

    // Thêm phương thức để đồng bộ hóa thời gian giao dịch
    private async synchronizeTransactionTiming(masterTxTime: number, memberDetails: MasterTransactionDetail[]) {
        // Tính toán độ trễ giữa các giao dịch member
        const baseDelay = 50; // 50ms
        const maxRandomDelay = 150; // Thêm tối đa 150ms ngẫu nhiên

        // Sắp xếp chi tiết theo thứ tự ưu tiên (có thể dựa trên kích thước, VIP, v.v.)
        const sortedDetails = [...memberDetails].sort((a, b) => {
            // Ví dụ: ưu tiên giao dịch lớn hơn trước
            return b.mt_detail_amount - a.mt_detail_amount;
        });

        // Tạo mảng promises với độ trễ tăng dần
        const delayedPromises = sortedDetails.map((detail, index) => {
            // Tính toán độ trễ cho member này
            const randomDelay = Math.floor(Math.random() * maxRandomDelay);
            const totalDelay = baseDelay * index + randomDelay;

            // Trả về promise với setTimeout
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    // Đánh dấu chi tiết này đã sẵn sàng để xử lý
                    this.eventEmitter.emit('member.transaction.ready', { detailId: detail.mt_detail_id });
                    resolve();
                }, totalDelay);
            });
        });

        // Chờ tất cả các promises hoàn thành
        await Promise.all(delayedPromises);
    }

    // Thêm phương thức processBatch để xử lý các giao dịch theo lô
    private async processBatchV2(
        details: MasterTransactionDetail[],
        walletMap: Map<string, any>,
        originalOrder: TradingOrder,
        transaction: MasterTransaction,
        concurrencyLimit: number
    ): Promise<any[]> {
        interface BatchResult {
            success: boolean;
            detail: MasterTransactionDetail;
            result?: any;
            error?: any;
        }

        // Tạo một mảng các promises
        const promises = details.map(detail => {
            // Tạo một promise mới với xử lý retry và error handling
            return new Promise<BatchResult>(async (resolve) => {
                try {
                    // Thực hiện processDetail với retry logic
                    const result = await this.processDetail(detail, walletMap, originalOrder, transaction);
                    resolve({ success: true, detail, result });
                } catch (error) {
                    console.error(`Error processing detail in batch:`, error);
                    // Cập nhật trạng thái lỗi
                    try {
                        await this.masterTransactionDetailRepository.update(
                            { mt_detail_id: detail.mt_detail_id },
                            {
                                mt_detail_status: 'error',
                                mt_detail_message: error.message || 'Unknown error in batch processing'
                            }
                        );
                    } catch (updateError) {
                        console.error(`Error updating detail status:`, updateError);
                    }

                    resolve({ success: false, detail, error });
                }
            });
        });

        // Thực hiện theo limit
        const results: BatchResult[] = [];

        // Xử lý tất cả promises theo nhóm có kích thước concurrencyLimit
        for (let i = 0; i < promises.length; i += concurrencyLimit) {
            const chunk = promises.slice(i, i + concurrencyLimit);
            const chunkResults = await Promise.all(chunk);
            results.push(...chunkResults);
        }

        // Báo cáo kết quả
        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;

        console.log(`Processed ${results.length} details: ${successful} successful, ${failed} failed`);

        return results;
    }

    // Sửa phương thức executeVipMasterOrder để đảm bảo giao dịch theo tỷ lệ
    private async executeVipMasterOrder(
        transaction: MasterTransaction,
        originalOrder: TradingOrder,
        memberWallets: ListWallet[]
    ) {
        try {
            // Lấy số dư SOL của master để tính tỷ lệ
            const masterWallet = await this.listWalletRepository.findOne({
                where: { wallet_id: transaction.mt_master_wallet }
            });

            if (!masterWallet) {
                throw new Error('Master wallet not found');
            }

            const masterSolBalance = await this.solanaService.getBalance(masterWallet.wallet_solana_address);
            const masterBuyRatio = originalOrder.order_qlty / masterSolBalance; // Tỷ lệ mua của master

            // Chia memberWallets thành các nhóm 10 member
            const BATCH_SIZE = 10;
            const batches = this.chunkArray(memberWallets, BATCH_SIZE);

            // Xử lý từng batch 10 member song song
            for (const batch of batches) {
                const batchPromises = batch.map(async (member) => {
                    try {
                        const memberSolBalance = await this.solanaService.getBalance(member.wallet_solana_address);

                        // VIP Master - Member copy chính xác số lượng nếu đủ balance
                        let copyAmount = memberSolBalance >= masterSolBalance
                            ? originalOrder.order_qlty  // Copy chính xác nếu đủ balance
                            : memberSolBalance * masterBuyRatio; // Copy theo tỷ lệ nếu không đủ

                        // Tạo và thực hiện giao dịch
                        const detail = await this.createTransactionDetail(transaction, member, copyAmount);
                        await this.executeSwap(detail, member, transaction, copyAmount);
                    } catch (error) {
                        console.error(`Error processing member ${member.wallet_id}:`, error);
                    }
                });

                // Đợi tất cả 10 member trong batch hoàn thành
                await Promise.all(batchPromises);

                // Thêm độ trễ nhỏ giữa các batch để tránh quá tải
                if (batches.indexOf(batch) < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            console.error('Error in VIP master order:', error);
            throw error;
        }
    }

    private async executeRegularMasterOrder(
        transaction: MasterTransaction,
        originalOrder: TradingOrder,
        memberWallets: ListWallet[]
    ) {
        try {
            // Xử lý từng member
            for (const member of memberWallets) {
                try {
                    // Copy chính xác số lượng của master
                    const copyAmount = originalOrder.order_qlty;

                    // Kiểm tra balance
                    const hasBalance = await this.checkSufficientBalance(
                        member,
                        transaction.mt_trade_type === 'buy' ? 'SOL' : transaction.mt_token_address,
                        copyAmount
                    );

                    if (!hasBalance) {
                        console.log(`Member ${member.wallet_id} insufficient balance`);
                        continue;
                    }

                    // Tạo và thực hiện giao dịch
                    const detail = await this.createTransactionDetail(transaction, member, copyAmount);
                    await this.executeSwap(detail, member, transaction, copyAmount);

                } catch (error) {
                    console.error(`Error processing member ${member.wallet_id}:`, error);
                }
            }
        } catch (error) {
            console.error('Error in regular master order:', error);
        }
    }

    // Helper methods
    private async estimateGasFees(tokenAddress: string): Promise<number> {
        const baseGas = 0.000005;
        const buffer = 1.2;

        if (await this.solanaService.isMemeCoin(tokenAddress)) {
            return baseGas * 2 * buffer;
        }
        return baseGas * buffer;
    }

    private async createTransactionDetail(
        transaction: MasterTransaction,
        member: ListWallet,
        copyAmount: number
    ): Promise<MasterTransactionDetail> {
        const detail = new MasterTransactionDetail();
        detail.mt_transaction_id = transaction.mt_id;
        detail.mt_wallet_master = transaction.mt_master_wallet;
        detail.mt_wallet_member = member.wallet_id;
        detail.mt_detail_type = transaction.mt_trade_type;
        detail.mt_detail_token_name = transaction.mt_token_name;
        detail.mt_detail_token_address = transaction.mt_token_address;
        detail.mt_detail_amount = copyAmount;
        detail.mt_detail_price = transaction.mt_price;

        // Đảm bảo total_usd luôn có giá trị
        detail.mt_detail_total_usd = copyAmount * transaction.mt_price || 0;

        detail.mt_detail_status = 'wait';
        detail.mt_detail_time = new Date();

        return await this.masterTransactionDetailRepository.save(detail);
    }

    private async executeSwap(
        detail: MasterTransactionDetail,
        member: ListWallet,
        transaction: MasterTransaction,
        amount: number
    ) {
        try {
            const solanaPrivateKey = extractSolanaPrivateKey(member.wallet_private_key);
            const fromToken = transaction.mt_trade_type === 'buy' ? 'So11111111111111111111111111111111111111112' : transaction.mt_token_address;
            const toToken = transaction.mt_trade_type === 'buy' ? transaction.mt_token_address : 'So11111111111111111111111111111111111111112';

            // Sử dụng chính xác DEX và tham số của master transaction
            const dex = transaction.mt_used_dex;
            if (!dex) {
                throw new Error('DEX information not found in master transaction');
            }

            // Sử dụng chính xác các tham số của master transaction
            const options = {
                priorityFee: dex === 'pumpfun' ? 0.00002 : 0.00001,
                useDex: dex,
                force_sell_all: dex === 'pumpfun' && transaction.mt_trade_type === 'sell'
            };

            // Thực hiện swap với cùng tham số như master
            const swapResult = await this.solanaService.swapTokenOnSolana(
                solanaPrivateKey,
                fromToken,
                toToken,
                amount,
                dex === 'pumpfun' ? 10 : 3, // Slippage giống master
                options
            );

            if (swapResult?.signature) {
                // Thu phí giao dịch sau khi giao dịch chính thành công
                try {
                    // Tính phí 1% từ amount gốc
                    const feeAmount = amount * 0.01;
                    
                    const feeSuccess = await this.solanaService.handleTransactionFee(
                        solanaPrivateKey,
                        transaction.mt_trade_type === 'buy' ? 'So11111111111111111111111111111111111111112' : transaction.mt_token_address,
                        feeAmount, // ✅ SỬA: Truyền feeAmount thay vì amount
                        transaction.mt_trade_type === 'buy',
                        transaction.mt_trade_type === 'sell'
                    );

                    if (!feeSuccess) {
                        this.logger.warn(`Failed to collect transaction fee for member ${member.wallet_id}, but main trade was successful`);
                    }
                } catch (feeError) {
                    // Log lỗi thu phí nhưng không ảnh hưởng đến trạng thái giao dịch chính
                    this.logger.error(`Error collecting transaction fee for member ${member.wallet_id}: ${feeError.message}`);
                }

                detail.mt_detail_status = 'success';
                detail.mt_detail_hash = swapResult.signature;
                detail.mt_detail_message = `Transaction successful via ${dex}: ${swapResult.signature}`;
                await this.masterTransactionDetailRepository.save(detail);

                // Tính toán BG affiliate commission cho member transaction
                try {
                    // Kiểm tra xem member wallet có thuộc BG affiliate không
                    const isBgAffiliate = await this.bgRefService.isWalletInBgAffiliateSystem(member.wallet_id);
                    
                    if (isBgAffiliate) {
                        // Tính toán BG affiliate rewards cho member
                        const bgAffiliateInfo = await this.bgRefService.getWalletBgAffiliateInfo(member.wallet_id);
                        if (bgAffiliateInfo) {
                            // Tính total value của member transaction
                            const memberTotalValue = detail.mt_detail_total_usd || (amount * (transaction.mt_price || 1));
                            
                            await this.bgRefService.calculateAndDistributeCommission(
                                bgAffiliateInfo.treeId,
                                detail.mt_detail_id, // Sử dụng detail ID thay vì order ID
                                memberTotalValue,
                                0.01, // Commission rate mặc định (sẽ được điều chỉnh dựa trên isBittworld)
                                member.wallet_id // ID của member wallet thực hiện giao dịch
                            );
                            this.logger.debug(`Calculated BG affiliate rewards for member ${member.wallet_id}, tree ${bgAffiliateInfo.treeId}, detail ${detail.mt_detail_id}`);
                        }
                    }
                } catch (error) {
                    this.logger.error(`Error calculating BG affiliate rewards for member ${member.wallet_id}: ${error.message}`);
                    // Không throw error vì đây là tính năng phụ, không ảnh hưởng đến giao dịch chính
                }

                // Tính toán Bittworld rewards cho member transaction
                try {
                    const memberTotalValue = detail.mt_detail_total_usd || (amount * (transaction.mt_price || 1));
                    
                    const bittworldRewardResult = await this.bittworldsService.rewardBittworld(
                        member.wallet_id,
                        memberTotalValue,
                        detail.mt_detail_id
                    );

                    if (bittworldRewardResult.success) {
                        this.logger.debug(`Calculated Bittworld reward for member ${member.wallet_id}: $${bittworldRewardResult.calculatedAmount}`);
                    } else {
                        this.logger.debug(`No Bittworld reward for member ${member.wallet_id}: ${bittworldRewardResult.message}`);
                    }
                } catch (error) {
                    this.logger.error(`Error calculating Bittworld reward for member ${member.wallet_id}: ${error.message}`);
                    // Không throw error vì đây là tính năng phụ
                }
            }

        } catch (error) {
            console.error(`Error executing swap for member ${member.wallet_id}:`, error);
            detail.mt_detail_status = 'error';
            detail.mt_detail_message = error.message;
            await this.masterTransactionDetailRepository.save(detail);
            throw error;
        }
    }

    // Hàm helper để lấy minimum amount cho token
    private async getMinimumAmount(tokenAddress: string): Promise<number> {
        try {
            const tokenInfo = await this.getTokenInfoWithRetry(tokenAddress);
            // Có thể điều chỉnh logic tính minimum amount dựa vào tokenInfo
            return tokenInfo?.minimumAmount || 0.000001; // Default minimum amount
        } catch (error) {
            console.error(`Error getting minimum amount for token ${tokenAddress}:`, error);
            return 0.000001; // Default fallback
        }
    }

    // Hàm helper để kiểm tra balance
    private async checkSufficientBalance(
        wallet: ListWallet,
        tokenAddress: string,
        amount: number
    ): Promise<boolean> {
        try {
            const balance = await this.solanaService.getTokenBalance(
                wallet.wallet_solana_address,
                tokenAddress
            );
            return balance >= amount;
        } catch (error) {
            console.error(`Error checking balance for wallet ${wallet.wallet_solana_address}:`, error);
            return false;
        }
    }

    // Thêm phương thức isVipMaster vào class MasterTradingService
    private async isVipMaster(masterId: number): Promise<boolean> {
        try {
            const masterWallet = await this.listWalletRepository.findOne({
                where: { wallet_id: masterId }
            });

            if (!masterWallet) {
                return false;
            }

            // Chỉ kiểm tra wallet_auth vì wallet_vip không tồn tại
            return masterWallet.wallet_stream === 'vip';
        } catch (error) {
            console.error(`Error checking if master ${masterId} is VIP:`, error);
            return false;
        }
    }

    // Phương thức tiện ích để đảm bảo mt_used_dex được cập nhật
    private async ensureTransactionDex(transaction: MasterTransaction, preferredDex?: 'raydium' | 'jupiter' | 'pumpfun'): Promise<'raydium' | 'jupiter' | 'pumpfun'> {
        if (!transaction.mt_used_dex) {
            // Nếu không có thông tin DEX, cập nhật với dex được ưu tiên hoặc mặc định là jupiter
            const dexToUse = preferredDex || 'jupiter';
            console.log(`>>> Transaction ${transaction.mt_id} missing mt_used_dex, updating to ${dexToUse}`);

            transaction.mt_used_dex = dexToUse;
            await this.masterTransactionRepository.save(transaction);
            return dexToUse;
        }

        return transaction.mt_used_dex as 'raydium' | 'jupiter' | 'pumpfun';
    }

    // Phương thức để ghi log và theo dõi giao dịch
    private logTransactionStats(transaction: MasterTransaction, masterAmount: number, memberAmount: number, isMaster: boolean) {
        const actorType = isMaster ? 'MASTER' : 'MEMBER';
        const tradeType = transaction.mt_trade_type === 'buy' ? 'BUY' : 'SELL';

        console.log(`>>> [${actorType}] ${tradeType} Transaction Stats:`);
        console.log(`    - Token: ${transaction.mt_token_name} (${transaction.mt_token_address})`);
        console.log(`    - Amount: ${isMaster ? masterAmount : memberAmount}`);
        console.log(`    - Price: ${transaction.mt_price}`);
        console.log(`    - DEX: ${transaction.mt_used_dex || 'Not specified yet'}`);
        console.log(`    - Transaction ID: ${transaction.mt_id}`);

        if (!isMaster) {
            // Tính chênh lệch phần trăm giữa master và member
            const percentDiff = ((memberAmount / masterAmount - 1) * 100).toFixed(4);
            console.log(`    - % Difference from Master: ${percentDiff}%`);
        }
    }

    // Phương thức sanitizePrivateKey để chuẩn bị private key trước khi sử dụng
    private sanitizePrivateKey(privateKey: string): string {
        if (!privateKey) {
            throw new Error('Private key is missing');
        }

        // Loại bỏ khoảng trắng và dấu ngoặc kép đầu/cuối
        let sanitized = privateKey.trim().replace(/^"|"$/g, '');

        // Kiểm tra xem nó có phải là chuỗi JSON không
        try {
            const jsonData = JSON.parse(sanitized);

            // Nếu là JSON, kiểm tra các trường thường gặp
            if (jsonData.solana) {
                return this.sanitizePrivateKey(jsonData.solana);
            } else if (jsonData.privateKey) {
                return this.sanitizePrivateKey(jsonData.privateKey);
            } else if (jsonData.secretKey) {
                return this.sanitizePrivateKey(jsonData.secretKey);
            }

            // Nếu không tìm thấy các trường quen thuộc, trả về chuỗi gốc
            return sanitized;
        } catch (e) {
            // Nếu không phải JSON, trả về chuỗi đã được làm sạch
            return sanitized;
        }
    }

    // Phương thức để tính toán số lượng cho member dựa trên authorization
    private calculateMemberAmountV2(auth: any, masterAmount: number): number {
        // Đảm bảo masterAmount là số hợp lệ
        if (!masterAmount || isNaN(masterAmount) || masterAmount <= 0) {
            return 0.001; // Giá trị mặc định tối thiểu
        }

        // Lấy tỷ lệ copy từ authorization hoặc sử dụng giá trị mặc định
        const copyRatio = auth.mga_copy_ratio || 1.0;

        // Tính số lượng cho member
        const memberAmount = masterAmount * copyRatio;

        // Đảm bảo giá trị trả về hợp lệ
        return !isNaN(memberAmount) && memberAmount > 0 ? memberAmount : 0.001;
    }

    // Add this helper function before executeVipMasterOrder
    private async getTokenInfoWithRetry(tokenAddress: string, maxRetries: number = 3): Promise<any> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const tokenInfo = await this.solanaService.getTokenInfo(tokenAddress);

                if (tokenInfo) {
                    return tokenInfo;
                }

                // If no token info but no error, wait and retry
                const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
                await new Promise(resolve => setTimeout(resolve, delay));

            } catch (error) {
                lastError = error;

                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError || new Error(`Failed to get token info after ${maxRetries} attempts`);
    }

    // Thêm helper method để tính phí ngẫu nhiên trong khoảng
    private calculateMemberFee(): number {
        return this.MEMBER_FEE_MIN + Math.random() * (this.MEMBER_FEE_MAX - this.MEMBER_FEE_MIN);
    }

    // Thêm endpoint để VIP Master tự bán hết token còn lại trong ví
    async sellAllRemainingTokens(walletId: number, tokenAddress: string) {
        try {
            // Xác minh wallet là VIP Master
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet) {
                return {
                    status: 404,
                    message: 'Wallet not found'
                };
            }

            // Kiểm tra xem wallet có phải là VIP Master không
            if (wallet.wallet_stream !== 'vip') {
                return {
                    status: 403,
                    message: 'Only VIP Masters can use this feature'
                };
            }

            // Kiểm tra số dư token trong ví
            const tokenBalance = await this.solanaService.getTokenBalance(
                wallet.wallet_solana_address,
                tokenAddress
            );

            if (tokenBalance <= 0) {
                return {
                    status: 400,
                    message: 'No token balance to sell'
                };
            }

            // Tạo giao dịch bán tất cả token
            const result = await this.executeForceAllTokensSale(wallet, tokenAddress, tokenBalance);

            return {
                status: 200,
                message: 'Sell all tokens transaction executed successfully',
                data: result
            };
        } catch (error) {
            console.error('Error selling all remaining tokens:', error);
            return {
                status: 500,
                message: `Error: ${error.message}`
            };
        }
    }

    // Thêm hàm mới để bán tất cả token còn lại
    private async executeForceAllTokensSale(wallet: ListWallet, tokenAddress: string, amount: number): Promise<any> {
        try {
            console.log(`>>> EXECUTING FORCE SELL ALL TOKENS: ${amount} of ${tokenAddress} for wallet ${wallet.wallet_id}`);

            // Lấy thông tin token
            const tokenInfo = await this.solanaService.getTokenInfo(tokenAddress);
            const tokenName = tokenInfo?.name || 'Unknown Token';

            // Lấy giá token hiện tại
            const tokenPrice = await this.solanaService.getTokenPriceInSol(tokenAddress);
            if (!tokenPrice) {
                throw new Error('Could not determine token price');
            }

            // Tạo transaction detail trực tiếp
            const transactionDetail = new MasterTransactionDetail();
            transactionDetail.mt_detail_type = 'sell';
            transactionDetail.mt_detail_token_address = tokenAddress;
            transactionDetail.mt_detail_token_name = tokenName;
            transactionDetail.mt_detail_amount = amount;
            transactionDetail.mt_detail_price = tokenPrice;
            transactionDetail.mt_detail_total_usd = amount * tokenPrice;
            transactionDetail.mt_detail_status = 'wait';
            transactionDetail.mt_detail_time = new Date();
            transactionDetail.mt_wallet_master = wallet.wallet_id;
            transactionDetail.mt_wallet_member = wallet.wallet_id;

            const savedDetail = await this.masterTransactionDetailRepository.save(transactionDetail);

            // Gọi swap với forced sell all options
            const fromToken = tokenAddress;
            const toToken = 'So11111111111111111111111111111111111111112'; // SOL

            // Sử dụng slippage cao
            const slippage = 15;

            // Tạo swap options với force_sell_all = true
            const swapOptions = {
                isMaxSell: true,
                force_sell_all: true,
                maxSlippage: 15,
                priorityFee: 0.00002,
                useDex: 'pumpfun' // Sử dụng PumpFun cho lệnh bán tất cả
            };

            const swapResult = await this.solanaService.swapTokenOnSolana(
                wallet.wallet_private_key,
                fromToken,
                toToken,
                amount,
                slippage,
                swapOptions
            );

            if (swapResult?.signature) {
                await this.masterTransactionDetailRepository.update(
                    { mt_detail_id: savedDetail.mt_detail_id },
                    {
                        mt_detail_status: 'success',
                        mt_detail_hash: swapResult.signature,
                        mt_detail_received: swapResult.outputAmount || 0
                    }
                );

                return {
                    signature: swapResult.signature,
                    amountSold: amount,
                    received: swapResult.outputAmount,
                    dex: swapResult.dex
                };
            } else {
                throw new Error('Swap transaction failed');
            }
        } catch (error) {
            console.error('Error in force selling all tokens:', error);
            throw error;
        }
    }

    async getDetailCopies(memberWalletId: number, walletMaster?: number): Promise<{ status: number; data?: any; message?: string }> {
        try {
            const whereCondition: any = {
                mt_wallet_member: memberWalletId
            };

            if (walletMaster) {
                const masterWallet = await this.listWalletRepository.findOne({
                    where: {
                        wallet_id: walletMaster,
                        wallet_auth: 'master'
                    }
                });

                if (!masterWallet) {
                    return {
                        status: 400,
                        message: 'Invalid master wallet'
                    };
                }

                whereCondition.mt_wallet_master = walletMaster;
            }

            const details = await this.masterTransactionDetailRepository.find({
                where: whereCondition,
                relations: ['master_transaction', 'master_wallet', 'member_wallet'],
                order: {
                    mt_detail_time: 'DESC'
                }
            });

            const formattedDetails = details.map(detail => ({
                id: detail.mt_detail_id,
                transaction_id: detail.mt_transaction_id,
                master_wallet: {
                    id: detail.master_wallet.wallet_id,
                    address: detail.master_wallet.wallet_solana_address
                },
                type: detail.mt_detail_type,
                token_name: detail.mt_detail_token_name,
                total_usd: detail.mt_detail_total_usd,
                amount: detail.mt_detail_amount,
                price: detail.mt_detail_price,
                time: detail.mt_detail_time
            }));

            return {
                status: 200,
                data: {
                    details: formattedDetails,
                    total: details.length
                }
            };
        } catch (error) {
            return {
                status: 500,
                message: `Error fetching detail copies: ${error.message}`
            };
        }
    }

    async changeStream(
        walletId: number,
        uid: number,
        password: string
    ): Promise<{ status: number; message?: string; data?: any }> {
        try {
            // Check if wallet is master
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet || wallet.wallet_auth !== 'master') {
                return {
                    status: 403,
                    message: 'Wallet is not a master wallet'
                };
            }

            // Verify password
            const userWallet = await this.userWalletRepository.findOne({
                where: { uw_id: uid }
            });

            if (!userWallet || userWallet.uw_password !== password) {
                return {
                    status: 400,
                    message: 'Invalid password'
                };
            }

            // Get current stream status
            const currentStream = wallet.wallet_stream || 'normal';
            const newStream = currentStream === 'normal' ? 'vip' : 'normal';

            // Update wallet stream
            await this.listWalletRepository.update(
                { wallet_id: walletId },
                { wallet_stream: newStream }
            );

            // Update master groups status
            await this.masterGroupRepository.update(
                { mg_master_wallet: walletId },
                { mg_status: 'delete-hidden' }
            );

            // Update master connects status
            await this.masterConnectRepository.update(
                { mc_master_wallet: walletId },
                { mc_status: 'delete-hidden' }
            );

            return {
                status: 200,
                message: `Stream status changed to ${newStream} successfully`,
                data: {
                    wallet_id: walletId,
                    new_stream: newStream
                }
            };
        } catch (error) {
            this.logger.error(`Error changing stream status: ${error.message}`);
            return {
                status: 500,
                message: 'Internal server error'
            };
        }
    }
} 
