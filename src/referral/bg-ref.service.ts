import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { BgAffiliateTree } from './entities/bg-affiliate-tree.entity';
import { BgAffiliateNode } from './entities/bg-affiliate-node.entity';
import { BgAffiliateCommissionLog } from './entities/bg-affiliate-commission-log.entity';
import { BgAffiliateCommissionReward } from './entities/bg-affiliate-commission-reward.entity';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { WalletRefReward } from './entities/wallet-ref-reward.entity';

@Injectable()
export class BgRefService {
  constructor(
    @InjectRepository(BgAffiliateTree)
    private bgAffiliateTreeRepository: Repository<BgAffiliateTree>,
    @InjectRepository(BgAffiliateNode)
    private bgAffiliateNodeRepository: Repository<BgAffiliateNode>,
    @InjectRepository(BgAffiliateCommissionLog)
    private bgAffiliateCommissionLogRepository: Repository<BgAffiliateCommissionLog>,
    @InjectRepository(BgAffiliateCommissionReward)
    private bgAffiliateCommissionRewardRepository: Repository<BgAffiliateCommissionReward>,
    @InjectRepository(ListWallet)
    private listWalletRepository: Repository<ListWallet>,
    @InjectRepository(WalletRefReward)
    private walletRefRewardRepository: Repository<WalletRefReward>,
    private dataSource: DataSource,
  ) {}

  /**
   * Tạo cây affiliate mới cho BG
   */
  async createAffiliateTree(rootWalletId: number, totalCommissionPercent: number = 70.00, bat_alias: string): Promise<BgAffiliateTree> {
    // Kiểm tra xem wallet đã có cây affiliate chưa
    const existingTree = await this.bgAffiliateTreeRepository.findOne({
      where: { bat_root_wallet_id: rootWalletId }
    });

    if (existingTree) {
      throw new BadRequestException('Wallet already has an affiliate tree');
    }

    // Tạo cây affiliate
    const tree = this.bgAffiliateTreeRepository.create({
      bat_root_wallet_id: rootWalletId,
      bat_total_commission_percent: totalCommissionPercent,
      bat_alias: bat_alias,
    });

    const savedTree = await this.bgAffiliateTreeRepository.save(tree);

    // Tạo root node cho cây affiliate
    const rootNode = this.bgAffiliateNodeRepository.create({
      ban_tree_id: savedTree.bat_id,
      ban_wallet_id: rootWalletId,
      ban_parent_wallet_id: null, // Root node không có parent
      ban_commission_percent: totalCommissionPercent, // Root BG nhận toàn bộ commission
    });

    await this.bgAffiliateNodeRepository.save(rootNode);

    return savedTree;
  }

  /**
   * Thêm node mới vào cây affiliate
   */
  async addAffiliateNode(
    treeId: number, 
    walletId: number, 
    parentWalletId: number | null, 
    commissionPercent: number
  ): Promise<BgAffiliateNode> {
    // Kiểm tra cây affiliate tồn tại
    const tree = await this.bgAffiliateTreeRepository.findOne({
      where: { bat_id: treeId }
    });

    if (!tree) {
      throw new NotFoundException('Affiliate tree does not exist');
    }

    // Kiểm tra wallet đã có trong cây chưa
    const existingNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: walletId }
    });

    if (existingNode) {
      throw new BadRequestException('Wallet already exists in the affiliate tree');
    }

    // Kiểm tra parent wallet có tồn tại trong cây không
    if (parentWalletId) {
      const parentNode = await this.bgAffiliateNodeRepository.findOne({
        where: { ban_wallet_id: parentWalletId, ban_tree_id: treeId }
      });

      if (!parentNode) {
        throw new BadRequestException('Parent wallet does not exist in the affiliate tree');
      }

      // Kiểm tra commission percent không vượt quá commission của parent
      if (commissionPercent > parentNode.ban_commission_percent) {
        throw new BadRequestException(`Commission percent cannot exceed ${parentNode.ban_commission_percent}%`);
      }
    }

    const node = this.bgAffiliateNodeRepository.create({
      ban_tree_id: treeId,
      ban_wallet_id: walletId,
      ban_parent_wallet_id: parentWalletId || undefined,
      ban_commission_percent: commissionPercent,
    });

    return await this.bgAffiliateNodeRepository.save(node);
  }

  /**
   * Cập nhật commission percent của node (chỉ người giới thiệu trực tiếp mới có quyền)
   */
  async updateCommissionPercent(
    fromWalletId: number,
    toWalletId: number,
    newPercent: number
  ): Promise<{
    success: boolean;
    message: string;
    fromWallet: any;
    toWallet: any;
    oldPercent: number;
    newPercent: number;
  }> {
    // Lấy thông tin BG affiliate của toWalletId để lấy treeId
    const toWalletBgInfo = await this.getWalletBgAffiliateInfo(toWalletId);
    if (!toWalletBgInfo) {
      throw new BadRequestException('Wallet does not belong to the BG affiliate system');
    }

    const treeId = toWalletBgInfo.treeId;

    // Kiểm tra from wallet có phải là parent trực tiếp của to wallet không
    const node = await this.bgAffiliateNodeRepository.findOne({
      where: { 
        ban_tree_id: treeId,
        ban_wallet_id: toWalletId,
        ban_parent_wallet_id: fromWalletId
      }
    });

    if (!node) {
      throw new BadRequestException('Only the direct referrer has permission to change commission percent');
    }

    const oldPercent = node.ban_commission_percent;

    // Kiểm tra giới hạn commission percent để không ảnh hưởng tới tuyến dưới
    const maxAllowedPercent = await this.getMaxAllowedCommissionPercentForUpdate(treeId, fromWalletId, toWalletId);
    if (newPercent > maxAllowedPercent) {
      throw new BadRequestException(`Commission percent cannot exceed ${maxAllowedPercent}% to avoid affecting the downline`);
    }

    // Lưu log thay đổi
    await this.logCommissionChange(treeId, fromWalletId, toWalletId, oldPercent, newPercent);

    // Lấy thông tin wallet from và to
    const fromWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: fromWalletId },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address']
    });

    const toWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: toWalletId },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address']
    });

    // Cập nhật commission percent
    node.ban_commission_percent = newPercent;
    await this.bgAffiliateNodeRepository.save(node);

    return {
      success: true,
      message: 'Updated commission percent successfully',
      fromWallet: fromWallet ? {
        walletId: fromWallet.wallet_id,
        solanaAddress: fromWallet.wallet_solana_address,
        nickName: fromWallet.wallet_nick_name,
        ethAddress: fromWallet.wallet_eth_address
      } : null,
      toWallet: toWallet ? {
        walletId: toWallet.wallet_id,
        solanaAddress: toWallet.wallet_solana_address,
        nickName: toWallet.wallet_nick_name,
        ethAddress: toWallet.wallet_eth_address
      } : null,
      oldPercent,
      newPercent
    };
  }

  /**
   * Tính toán và phân chia hoa hồng khi có giao dịch
   */
  async calculateAndDistributeCommission(
    treeId: number,
    orderId: number,
    transactionAmount: number,
    commissionRate: number = 0.01, // 1% phí giao dịch mặc định
    traderWalletId?: number // ID của wallet thực hiện giao dịch
  ): Promise<{
    success: boolean;
    message: string;
    treeId: number;
    orderId: number;
    transactionAmount: number;
    totalCommission: number;
    rewards: Array<{
      rewardId: number;
      walletId: number;
      solanaAddress: string;
      nickName: string;
      commissionAmount: number;
      level: number;
    }>;
  }> {
    const tree = await this.bgAffiliateTreeRepository.findOne({
      where: { bat_id: treeId }
    });

    if (!tree) {
      throw new NotFoundException('Affiliate tree does not exist');
    }

    // Tính commission dựa trên trường isBittworld của wallet giao dịch
    let actualCommissionRate = commissionRate; // Mặc định 1%

    if (traderWalletId) {
      // Lấy thông tin wallet giao dịch
      const traderWallet = await this.listWalletRepository.findOne({
        where: { wallet_id: traderWalletId },
        select: ['wallet_id', 'isBittworld']
      });

      if (traderWallet) {
        // Nếu wallet được tạo từ Bittworld thì commission = 0.7%
        if (traderWallet.isBittworld) {
          actualCommissionRate = 0.007; // 0.7%
        }
        // Nếu không phải Bittworld thì giữ nguyên 1%
      }
    }

    // Thuật toán tính commission:
    // - Ví không phải Bittworld (isBittworld = false): Commission = Volume × 1%
    // - Ví từ Bittworld (isBittworld = true): Commission = Volume × 0.7%

    const totalCommission = transactionAmount * actualCommissionRate;
    const rewards: BgAffiliateCommissionReward[] = [];

    // Nếu không có traderWalletId, sử dụng logic cũ (tính cho tất cả nodes)
    if (!traderWalletId) {
      const nodes = await this.getNodesByLevel(treeId);
      const rewardsWithWalletInfo: Array<{
        rewardId: number;
        walletId: number;
        solanaAddress: string;
        nickName: string;
        commissionAmount: number;
        level: number;
      }> = [];

      for (const node of nodes) {
        const commissionAmount = (totalCommission * node.ban_commission_percent) / 100;
        
        if (commissionAmount > 0) {
          const reward = this.bgAffiliateCommissionRewardRepository.create({
            bacr_tree_id: treeId,
            bacr_order_id: orderId,
            bacr_wallet_id: node.ban_wallet_id,
            bacr_commission_amount: commissionAmount,
            bacr_level: node.level,
          });

          const savedReward = await this.bgAffiliateCommissionRewardRepository.save(reward);
          rewards.push(savedReward);

          // Lấy thông tin wallet
          const wallet = await this.listWalletRepository.findOne({
            where: { wallet_id: node.ban_wallet_id },
            select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name']
          });

          rewardsWithWalletInfo.push({
            rewardId: savedReward.bacr_id,
            walletId: node.ban_wallet_id,
            solanaAddress: wallet?.wallet_solana_address || '',
            nickName: wallet?.wallet_nick_name || '',
            commissionAmount,
            level: node.level
          });
        }
      }

      return {
        success: true,
        message: 'Calculated and distributed commission successfully',
        treeId,
        orderId,
        transactionAmount,
        totalCommission,
        rewards: rewardsWithWalletInfo
      };
    }

    // Logic mới: Chỉ tính commission cho tuyến trên của người giao dịch
    const traderNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: traderWalletId, ban_tree_id: treeId }
    });

    if (!traderNode) {
      throw new NotFoundException('Trading wallet does not exist in the affiliate tree');
    }

    // Tìm tất cả tuyến trên của trader
    const uplineNodes = await this.getUplineNodes(treeId, traderWalletId);
    
    const rewardsWithWalletInfo: Array<{
      rewardId: number;
      walletId: number;
      solanaAddress: string;
      nickName: string;
      commissionAmount: number;
      level: number;
    }> = [];

    // Tính commission cho từng tuyến trên
    for (const uplineNode of uplineNodes) {
      // Sử dụng actualCommissionPercent thay vì commissionPercent
      const commissionAmount = (totalCommission * uplineNode.actualCommissionPercent) / 100;
      
      if (commissionAmount > 0) {
        const reward = this.bgAffiliateCommissionRewardRepository.create({
          bacr_tree_id: treeId,
          bacr_order_id: orderId,
          bacr_wallet_id: uplineNode.walletId,
          bacr_commission_amount: commissionAmount,
          bacr_level: uplineNode.level,
        });

        const savedReward = await this.bgAffiliateCommissionRewardRepository.save(reward);
        rewards.push(savedReward);

        // Lấy thông tin wallet
        const wallet = await this.listWalletRepository.findOne({
          where: { wallet_id: uplineNode.walletId },
          select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name']
        });

        rewardsWithWalletInfo.push({
          rewardId: savedReward.bacr_id,
          walletId: uplineNode.walletId,
          solanaAddress: wallet?.wallet_solana_address || '',
          nickName: wallet?.wallet_nick_name || '',
          commissionAmount,
          level: uplineNode.level
        });
      }
    }

    return {
      success: true,
      message: 'Calculated and distributed commission successfully',
      treeId,
      orderId,
      transactionAmount,
      totalCommission,
      rewards: rewardsWithWalletInfo
    };
  }

  /**
   * Lấy tất cả tuyến trên của một wallet với commission thực tế
   * Commission thực tế = Commission của level đó - Commission của level con trực tiếp
   */
  private async getUplineNodes(treeId: number, walletId: number): Promise<Array<{
    walletId: number;
    commissionPercent: number;
    actualCommissionPercent: number;
    level: number;
  }>> {
    const uplineNodes: Array<{
      walletId: number;
      commissionPercent: number;
      actualCommissionPercent: number;
      level: number;
    }> = [];

    let currentWalletId = walletId;
    let level = 0;
    let previousLevelCommission = 0; // Commission của level trước đó

    // Tìm tất cả tuyến trên
    while (true) {
      const currentNode = await this.bgAffiliateNodeRepository.findOne({
        where: { ban_wallet_id: currentWalletId, ban_tree_id: treeId }
      });

      if (!currentNode || !currentNode.ban_parent_wallet_id) {
        break; // Đã đến root hoặc không tìm thấy node
      }

      // Lấy thông tin parent
      const parentNode = await this.bgAffiliateNodeRepository.findOne({
        where: { ban_wallet_id: currentNode.ban_parent_wallet_id, ban_tree_id: treeId }
      });

      if (!parentNode) {
        break;
      }

      // Chỉ tính commission cho parent node có trạng thái active
      if (parentNode.ban_status) {
        level++;
        
        // Commission thực tế = Commission của parent - Commission của level trước đó
        const actualCommissionPercent = parentNode.ban_commission_percent - previousLevelCommission;
        
        uplineNodes.push({
          walletId: parentNode.ban_wallet_id,
          commissionPercent: parentNode.ban_commission_percent,
          actualCommissionPercent: actualCommissionPercent,
          level: level
        });

        // Cập nhật commission của level trước đó cho lần lặp tiếp theo
        previousLevelCommission = parentNode.ban_commission_percent;
      }

      currentWalletId = parentNode.ban_wallet_id;
    }

    return uplineNodes.sort((a, b) => a.level - b.level);
  }

  /**
   * Lấy danh sách nodes theo level (từ root xuống)
   */
  private async getNodesByLevel(treeId: number): Promise<Array<BgAffiliateNode & { level: number }>> {
    const nodes = await this.bgAffiliateNodeRepository.find({
      where: { ban_tree_id: treeId, ban_status: true },
      order: { ban_effective_from: 'ASC' }
    });

    const nodesWithLevel: Array<BgAffiliateNode & { level: number }> = [];
    const nodeMap = new Map<number, BgAffiliateNode>();

    // Tạo map để truy cập nhanh
    nodes.forEach(node => {
      nodeMap.set(node.ban_wallet_id, node);
    });

    // Tính level cho từng node
    for (const node of nodes) {
      let level = 0;
      let currentWalletId = node.ban_parent_wallet_id;

      while (currentWalletId) {
        level++;
        const parentNode = nodeMap.get(currentWalletId);
        if (!parentNode) break;
        currentWalletId = parentNode.ban_parent_wallet_id;
      }

      nodesWithLevel.push({ ...node, level });
    }

    return nodesWithLevel.sort((a, b) => a.level - b.level);
  }

  /**
   * Tính toán commission percent tối đa có thể cấp
   */
  private async getMaxAllowedCommissionPercent(treeId: number, parentWalletId: number): Promise<number> {
    const tree = await this.bgAffiliateTreeRepository.findOne({
      where: { bat_id: treeId }
    });

    if (!tree) return 0;

    // Lấy commission percent của parent
    const parentNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: parentWalletId, ban_tree_id: treeId }
    });

    if (!parentNode) return tree.bat_total_commission_percent;

    // Commission percent tối đa = commission của parent
    return parentNode.ban_commission_percent;
  }

  /**
   * Tính toán commission percent tối đa có thể cập nhật để không ảnh hưởng tới tuyến dưới
   */
  private async getMaxAllowedCommissionPercentForUpdate(treeId: number, fromWalletId: number, toWalletId: number): Promise<number> {
    // Lấy commission percent hiện tại của toWalletId
    const toNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: toWalletId, ban_tree_id: treeId }
    });

    if (!toNode) {
      throw new BadRequestException('Wallet does not exist in the affiliate tree');
    }

    // Lấy commission percent của parent (fromWalletId)
    const parentNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: fromWalletId, ban_tree_id: treeId }
    });

    if (!parentNode) {
      throw new BadRequestException('Parent wallet does not exist in the affiliate tree');
    }

    // Commission percent tối đa = commission của parent
    // Điều này đảm bảo:
    // 1. Không vượt quá commission của parent
    // 2. Có thể set bất kỳ giá trị nào từ 0% đến commission của parent
    return parentNode.ban_commission_percent;
  }

  /**
   * Lấy commission percent cao nhất của các direct children
   */
  private async getMaxDirectChildCommission(treeId: number, walletId: number): Promise<number> {
    const childNodes = await this.bgAffiliateNodeRepository.find({
      where: { ban_parent_wallet_id: walletId, ban_tree_id: treeId }
    });

    if (childNodes.length === 0) {
      return 0; // Không có child nào, có thể set từ 0% trở lên
    }

    let maxCommission = 0;

    for (const childNode of childNodes) {
      // Lấy commission của child hiện tại
      const childCommission = childNode.ban_commission_percent;
      
      // Cập nhật maxCommission
      maxCommission = Math.max(maxCommission, childCommission);
    }

    return maxCommission;
  }

  /**
   * Lấy commission percent thấp nhất của tất cả descendant nodes
   */
  private async getMinDescendantCommission(treeId: number, walletId: number): Promise<number> {
    const childNodes = await this.bgAffiliateNodeRepository.find({
      where: { ban_parent_wallet_id: walletId, ban_tree_id: treeId }
    });

    if (childNodes.length === 0) {
      return Number.MAX_SAFE_INTEGER; // Không có child nào
    }

    let minCommission = Number.MAX_SAFE_INTEGER;

    for (const childNode of childNodes) {
      // Lấy commission của child hiện tại
      const childCommission = childNode.ban_commission_percent;
      
      // Lấy commission thấp nhất của các descendant của child
      const minChildDescendantCommission = await this.getMinDescendantCommission(treeId, childNode.ban_wallet_id);
      
      // Tính commission thấp nhất = min(child_commission, min_child_descendant_commission)
      const minChildCommission = Math.min(childCommission, minChildDescendantCommission);
      
      // Cập nhật minCommission tổng thể
      minCommission = Math.min(minCommission, minChildCommission);
    }

    return minCommission;
  }

  /**
   * Lưu log thay đổi commission percent
   */
  private async logCommissionChange(
    treeId: number,
    fromWalletId: number,
    toWalletId: number,
    oldPercent: number,
    newPercent: number
  ): Promise<void> {
    const log = this.bgAffiliateCommissionLogRepository.create({
      bacl_tree_id: treeId,
      bacl_from_wallet_id: fromWalletId,
      bacl_to_wallet_id: toWalletId,
      bacl_old_percent: oldPercent,
      bacl_new_percent: newPercent,
    });

    await this.bgAffiliateCommissionLogRepository.save(log);
  }

  /**
   * Lấy thông tin cây affiliate
   */
  async getAffiliateTree(treeId: number): Promise<BgAffiliateTree> {
    const tree = await this.bgAffiliateTreeRepository.findOne({
      where: { bat_id: treeId },
      relations: ['nodes']
    });

    if (!tree) {
      throw new NotFoundException('Affiliate tree does not exist');
    }

    return tree;
  }

  /**
   * Lấy thông tin cây affiliate của wallet hiện tại (chỉ hiển thị tuyến dưới)
   */
  async getMyAffiliateTree(walletId: number): Promise<{
    isBgAffiliate: boolean;
    treeInfo?: any;
    downlineStructure?: any[];
  }> {
    // Kiểm tra wallet có thuộc BG affiliate không
    const bgAffiliateInfo = await this.getWalletBgAffiliateInfo(walletId);
    
    if (!bgAffiliateInfo) {
      return { isBgAffiliate: false };
    }

    // Lấy thông tin cây
    const tree = await this.getAffiliateTree(bgAffiliateInfo.treeId);
    
    // Lấy tất cả nodes trong cây
    const allNodes = await this.bgAffiliateNodeRepository.find({
      where: { ban_tree_id: bgAffiliateInfo.treeId, ban_status: true },
      order: { ban_effective_from: 'ASC' }
    });

    // Hàm để lấy thống kê cho một node
    const getNodeStats = async (nodeWalletId: number): Promise<{
      totalVolume: number;
      totalReward: number;
      totalTrans: number;
    }> => {
      // Lấy tổng khối lượng giao dịch và số giao dịch của node
      const volumeStats = await this.dataSource.createQueryBuilder()
        .select('COALESCE(SUM(orders.order_total_value), 0)', 'totalVolume')
        .addSelect('COUNT(orders.order_id)', 'totalTrans')
        .from('trading_orders', 'orders')
        .where('orders.order_wallet_id = :walletId', { walletId: nodeWalletId })
        .getRawOne();

      // Lấy tổng hoa hồng mà wallet hiện tại nhận được từ node này
      const rewardStats = await this.bgAffiliateCommissionRewardRepository.createQueryBuilder('reward')
        .innerJoin('trading_orders', 'order', 'order.order_id = reward.bacr_order_id')
        .select('COALESCE(SUM(reward.bacr_commission_amount), 0)', 'totalReward')
        .where('reward.bacr_wallet_id = :currentWalletId', { currentWalletId: walletId })
        .andWhere('order.order_wallet_id = :nodeWalletId', { nodeWalletId: nodeWalletId })
        .getRawOne();

      return {
        totalVolume: parseFloat(volumeStats?.totalVolume || '0'),
        totalReward: parseFloat(rewardStats?.totalReward || '0'),
        totalTrans: parseInt(volumeStats?.totalTrans || '0')
      };
    };

    // Hàm đệ quy để xây dựng cấu trúc cây phân cấp
    const buildHierarchicalStructure = async (parentWalletId: number): Promise<any[]> => {
      const children = allNodes.filter(node => node.ban_parent_wallet_id === parentWalletId);
      
      if (children.length === 0) {
        return [];
      }

      const hierarchicalStructure: any[] = [];

      for (const child of children) {
        // Lấy thông tin wallet
        const wallet = await this.listWalletRepository.findOne({
          where: { wallet_id: child.ban_wallet_id },
          select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address', 'isBittworld', 'bittworld_uid']
        });

        // Lấy thống kê cho node này
        const nodeStats = await getNodeStats(child.ban_wallet_id);

        const childNode = {
          nodeId: child.ban_id,
          solanaAddress: wallet?.wallet_solana_address || null,
          commissionPercent: child.ban_commission_percent,
          effectiveFrom: child.ban_effective_from,
          bgAlias: child.bg_alias,
          totalVolume: nodeStats.totalVolume,
          totalReward: nodeStats.totalReward,
          totalTrans: nodeStats.totalTrans,
          walletInfo: wallet ? {
            walletId: wallet.wallet_id,
            nickName: wallet.wallet_nick_name,
            solanaAddress: wallet.wallet_solana_address,
            ethAddress: wallet.wallet_eth_address,
            isBittworld: wallet.isBittworld,
            bittworldUid: wallet.isBittworld ? wallet.bittworld_uid || null : null
          } : null,
          children: await buildHierarchicalStructure(child.ban_wallet_id)
        };

        hierarchicalStructure.push(childNode);
      }

      return hierarchicalStructure;
    };

    // Xây dựng cấu trúc cây phân cấp từ wallet hiện tại
    const downlineStructure = await buildHierarchicalStructure(walletId);

    return {
      isBgAffiliate: true,
      treeInfo: {
        treeId: tree.bat_id,
        totalCommissionPercent: bgAffiliateInfo.commissionPercent,
        createdAt: tree.bat_created_at
      },
      downlineStructure
    };
  }

  /**
   * Lấy lịch sử hoa hồng của wallet
   */
  async getWalletCommissionHistory(walletId: number, includeWithdrawn: boolean = true): Promise<any[]> {
    const whereCondition: any = { bacr_wallet_id: walletId };
    
    // Nếu không bao gồm rewards đã rút, chỉ lấy rewards chưa rút
    if (!includeWithdrawn) {
      whereCondition.bacr_withdraw_id = IsNull();
      whereCondition.bacr_withdraw_status = false;
    }

    const rewards = await this.bgAffiliateCommissionRewardRepository.find({
      where: whereCondition,
      order: { bacr_created_at: 'DESC' }
    });

    // Lấy thông tin wallet để map địa chỉ Solana
    const wallet = await this.listWalletRepository.findOne({
      where: { wallet_id: walletId },
      select: ['wallet_solana_address', 'isBittworld', 'bittworld_uid']
    });

    // Lấy thông tin bg_alias từ bảng bg_affiliate_nodes
    const bgNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: walletId }
    });

    // Transform data để thay bacr_wallet_id bằng bacr_wallet và thêm bgAlias
    return rewards.map(reward => ({
      bacr_id: reward.bacr_id,
      bacr_tree_id: reward.bacr_tree_id,
      bacr_order_id: reward.bacr_order_id,
      bacr_wallet: wallet?.wallet_solana_address || null,
      bacr_commission_amount: reward.bacr_commission_amount,
      bacr_level: reward.bacr_level,
      bacr_created_at: reward.bacr_created_at,
      bgAlias: bgNode?.bg_alias || null,
      isBittworld: wallet?.isBittworld || false,
      bittworldUid: wallet?.isBittworld ? wallet?.bittworld_uid || null : null
    }));
  }

  /**
   * Kiểm tra xem wallet có thuộc hệ thống BG affiliate không
   */
  async isWalletInBgAffiliateSystem(walletId: number): Promise<boolean> {
    const node = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: walletId, ban_status: true }
    });
    return !!node;
  }

  /**
   * Kiểm tra status của wallet trong tuyến dưới (chỉ ví tuyến trên mới có quyền)
   */
  async checkBgAffiliateStatusInDownline(
    fromWalletId: number, 
    targetWalletId: number
  ): Promise<{
    hasPermission: boolean;
    isTargetInDownline: boolean;
    fromWallet?: any;
    targetWallet?: any;
    targetBgAffiliateInfo?: any;
    relationship?: {
      level: number;
      commissionPercent: number;
      effectiveFrom: Date;
    };
    reason?: string;
  }> {
    // Kiểm tra fromWallet có thuộc BG affiliate không
    const fromWalletBgInfo = await this.getWalletBgAffiliateInfo(fromWalletId);
    if (!fromWalletBgInfo) {
      return {
        hasPermission: false,
        isTargetInDownline: false,
        reason: 'From wallet does not belong to the BG affiliate system'
      };
    }

    // Kiểm tra targetWallet có thuộc BG affiliate không
    const targetWalletBgInfo = await this.getWalletBgAffiliateInfo(targetWalletId);
    if (!targetWalletBgInfo) {
      return {
        hasPermission: true,
        isTargetInDownline: false,
        reason: 'Target wallet does not belong to the BG affiliate system'
      };
    }

    // Kiểm tra xem targetWallet có thuộc tuyến dưới của fromWallet không
    const isInDownline = await this.isWalletInDownline(fromWalletId, targetWalletId);
    
    if (!isInDownline) {
      return {
        hasPermission: true,
        isTargetInDownline: false,
        reason: 'Target wallet does not belong to the downline of from wallet'
      };
    }

    // Lấy thông tin wallet from và target
    const fromWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: fromWalletId },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address']
    });

    const targetWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: targetWalletId },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address']
    });

    // Lấy thông tin quan hệ giữa fromWallet và targetWallet
    const relationship = await this.getRelationshipInfo(fromWalletId, targetWalletId);

    return {
      hasPermission: true,
      isTargetInDownline: true,
      fromWallet: fromWallet ? {
        walletId: fromWallet.wallet_id,
        solanaAddress: fromWallet.wallet_solana_address,
        nickName: fromWallet.wallet_nick_name,
        ethAddress: fromWallet.wallet_eth_address
      } : null,
      targetWallet: targetWallet ? {
        walletId: targetWallet.wallet_id,
        solanaAddress: targetWallet.wallet_solana_address,
        nickName: targetWallet.wallet_nick_name,
        ethAddress: targetWallet.wallet_eth_address
      } : null,
      targetBgAffiliateInfo: {
        treeId: targetWalletBgInfo.treeId,
        parentWalletId: targetWalletBgInfo.parentWalletId,
        commissionPercent: targetWalletBgInfo.commissionPercent,
        level: targetWalletBgInfo.level
      },
      relationship: relationship || undefined
    };
  }

  /**
   * Kiểm tra xem targetWallet có thuộc tuyến dưới của fromWallet không
   */
  private async isWalletInDownline(fromWalletId: number, targetWalletId: number): Promise<boolean> {
    // Lấy thông tin BG affiliate của fromWallet
    const fromWalletBgInfo = await this.getWalletBgAffiliateInfo(fromWalletId);
    if (!fromWalletBgInfo) return false;

    // Lấy thông tin BG affiliate của targetWallet
    const targetWalletBgInfo = await this.getWalletBgAffiliateInfo(targetWalletId);
    if (!targetWalletBgInfo) return false;

    // Kiểm tra cùng cây affiliate
    if (fromWalletBgInfo.treeId !== targetWalletBgInfo.treeId) {
      return false;
    }

    // Kiểm tra targetWallet có phải là descendant của fromWallet không
    let currentWalletId = targetWalletBgInfo.parentWalletId;
    
    while (currentWalletId) {
      if (currentWalletId === fromWalletId) {
        return true; // Tìm thấy fromWallet trong chuỗi parent của targetWallet
      }
      
      // Tìm parent tiếp theo
      const parentNode = await this.bgAffiliateNodeRepository.findOne({
        where: { 
          ban_wallet_id: currentWalletId, 
          ban_tree_id: fromWalletBgInfo.treeId 
        }
      });
      
      if (!parentNode) break;
      currentWalletId = parentNode.ban_parent_wallet_id;
    }

    return false;
  }

  /**
   * Lấy thông tin quan hệ giữa fromWallet và targetWallet
   */
  private async getRelationshipInfo(
    fromWalletId: number, 
    targetWalletId: number
  ): Promise<{
    level: number;
    commissionPercent: number;
    effectiveFrom: Date;
  } | null> {
    // Tìm node của targetWallet
    const targetNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: targetWalletId }
    });

    if (!targetNode) return null;

    // Tính level từ fromWallet đến targetWallet
    let level = 0;
    let currentWalletId = targetNode.ban_parent_wallet_id;

    while (currentWalletId && currentWalletId !== fromWalletId) {
      level++;
      const parentNode = await this.bgAffiliateNodeRepository.findOne({
        where: { 
          ban_wallet_id: currentWalletId, 
          ban_tree_id: targetNode.ban_tree_id 
        }
      });
      
      if (!parentNode) break;
      currentWalletId = parentNode.ban_parent_wallet_id;
    }

    // Nếu tìm thấy fromWallet trong chuỗi parent
    if (currentWalletId === fromWalletId) {
      return {
        level: level + 1, // +1 vì level bắt đầu từ 1
        commissionPercent: targetNode.ban_commission_percent,
        effectiveFrom: targetNode.ban_effective_from
      };
    }

    return null;
  }

  /**
   * Lấy thông tin BG affiliate của wallet (nếu có)
   */
  async getWalletBgAffiliateInfo(walletId: number): Promise<{
    treeId: number;
    parentWalletId: number | null;
    commissionPercent: number;
    level: number;
  } | null> {
    const node = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: walletId }
    });

    if (!node) return null;

    // Tính level
    let level = 0;
    let currentWalletId = node.ban_parent_wallet_id;

    while (currentWalletId) {
      level++;
      const parentNode = await this.bgAffiliateNodeRepository.findOne({
        where: { ban_wallet_id: currentWalletId, ban_tree_id: node.ban_tree_id, ban_status: true }
      });
      if (!parentNode) break;
      currentWalletId = parentNode.ban_parent_wallet_id;
    }

    return {
      treeId: node.ban_tree_id,
      parentWalletId: node.ban_parent_wallet_id,
      commissionPercent: node.ban_commission_percent,
      level
    };
  }



  /**
   * Lấy danh sách tất cả BG affiliate trees
   */
  async getAllBgAffiliateTrees(): Promise<BgAffiliateTree[]> {
    return await this.bgAffiliateTreeRepository.find({
      relations: ['nodes']
    });
  }

  /**
   * Lấy thống kê BG affiliate của một wallet
   */
  async getWalletBgAffiliateStats(walletId: number): Promise<{
    isBgAffiliate: boolean;
    currentWallet?: any;
    treeInfo?: any;
    nodeInfo?: any;
    totalEarnings?: number;
    availableEarnings?: number;
  }> {
    const bgAffiliateInfo = await this.getWalletBgAffiliateInfo(walletId);

    if (!bgAffiliateInfo) {
      return { isBgAffiliate: false };
    }

    // Lấy thông tin cây
    const tree = await this.getAffiliateTree(bgAffiliateInfo.treeId);
    
    // Lấy thông tin wallet hiện tại và email từ user_wallets
    const currentWalletWithEmail = await this.listWalletRepository
      .createQueryBuilder('wallet')
      .leftJoin('wallet.wallet_auths', 'wallet_auths')
      .leftJoin('wallet_auths.wa_user', 'user_wallet')
      .select([
        'wallet.wallet_id',
        'wallet.wallet_solana_address',
        'wallet.wallet_nick_name',
        'wallet.wallet_eth_address',
        'wallet.isBittworld',
        'wallet.bittworld_uid',
        'user_wallet.uw_email'
      ])
      .where('wallet.wallet_id = :walletId', { walletId })
      .getRawOne();

    // Lấy thông tin bg_alias từ node
    const bgNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: walletId, ban_tree_id: bgAffiliateInfo.treeId }
    });

    // Lấy tổng thu nhập (bao gồm cả đã rút)
    const allRewards = await this.getWalletCommissionHistory(walletId, true);
    const totalEarnings = allRewards.reduce((sum, reward) => sum + Number(reward.bacr_commission_amount), 0);

    // Lấy thu nhập khả dụng (chưa rút)
    const availableRewards = await this.getWalletCommissionHistory(walletId, false);
    const availableEarnings = availableRewards.reduce((sum, reward) => sum + Number(reward.bacr_commission_amount), 0);

    return {
      isBgAffiliate: true,
      currentWallet: currentWalletWithEmail ? {
        walletId: currentWalletWithEmail.wallet_wallet_id,
        solanaAddress: currentWalletWithEmail.wallet_wallet_solana_address,
        nickName: currentWalletWithEmail.wallet_wallet_nick_name,
        ethAddress: currentWalletWithEmail.wallet_wallet_eth_address,
        isBittworld: currentWalletWithEmail.wallet_isBittworld,
        bittworldUid: currentWalletWithEmail.wallet_bittworld_uid,
        bgAlias: bgNode?.bg_alias || null,
        email: currentWalletWithEmail.user_wallet_uw_email || null
      } : null,
      treeInfo: {
        treeId: tree.bat_id,
        totalCommissionPercent: bgAffiliateInfo.commissionPercent
      },
      totalEarnings,
      availableEarnings
    };
  }



  /**
   * Lấy danh sách các tuyến dưới trong luồng BG affiliate
   */
  async getDownlineMembers(walletId: number): Promise<{
    isBgAffiliate: boolean;
    downlineMembers: Array<{
      walletId: number;
      level: number;
      commissionPercent: number;
      effectiveFrom: Date;
      bgAlias?: string;
      walletInfo?: {
        nickName: string;
        solanaAddress: string;
        ethAddress: string;
        isBittworld: boolean;
        bittworldUid: string | null;
        createdAt: Date;
      };
    }>;
  }> {
    // Kiểm tra wallet có thuộc BG affiliate không
    const bgAffiliateInfo = await this.getWalletBgAffiliateInfo(walletId);
    
    if (!bgAffiliateInfo) {
      return {
        isBgAffiliate: false,
        downlineMembers: []
      };
    }

    // Lấy tất cả nodes trong cây
    const allNodes = await this.bgAffiliateNodeRepository.find({
      where: { ban_tree_id: bgAffiliateInfo.treeId, ban_status: true },
      order: { ban_effective_from: 'ASC' }
    });

    // Tạo map để truy cập nhanh
    const nodeMap = new Map<number, any>();
    allNodes.forEach(node => {
      nodeMap.set(node.ban_wallet_id, node);
    });

    // Tìm tất cả descendant nodes
    const downlineMembers: Array<{
      walletId: number;
      level: number;
      commissionPercent: number;
      effectiveFrom: Date;
      bgAlias?: string;
      walletInfo?: any;
    }> = [];

    // Hàm đệ quy để tìm tất cả descendants
    const findDescendants = async (parentWalletId: number, currentLevel: number) => {
      const children = allNodes.filter(node => node.ban_parent_wallet_id === parentWalletId);
      
      for (const child of children) {
        // Lấy thông tin wallet
        const wallet = await this.listWalletRepository.findOne({
          where: { wallet_id: child.ban_wallet_id },
          select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address', 'isBittworld', 'bittworld_uid']
        });

        downlineMembers.push({
          walletId: child.ban_wallet_id,
          level: currentLevel,
          commissionPercent: child.ban_commission_percent,
          effectiveFrom: child.ban_effective_from,
          bgAlias: child.bg_alias,
          walletInfo: wallet ? {
            nickName: wallet.wallet_nick_name,
            solanaAddress: wallet.wallet_solana_address,
            ethAddress: wallet.wallet_eth_address,
            isBittworld: wallet.isBittworld,
            bittworldUid: wallet.isBittworld ? wallet.bittworld_uid || null : null,
            createdAt: child.ban_effective_from
          } : null
        });

        // Tìm tiếp các descendants của child này
        await findDescendants(child.ban_wallet_id, currentLevel + 1);
      }
    };

    // Bắt đầu tìm từ wallet hiện tại
    await findDescendants(walletId, 1);

    return {
      isBgAffiliate: true,
      downlineMembers: downlineMembers.sort((a, b) => a.level - b.level)
    };
  }

  /**
   * Thêm wallet vào BG affiliate tree của referrer
   */
  async addToBgAffiliateTree(referrerWalletId: number, newWalletId: number): Promise<BgAffiliateNode> {
    // Lấy thông tin BG affiliate của referrer
    const referrerBgInfo = await this.getWalletBgAffiliateInfo(referrerWalletId);
    
    if (!referrerBgInfo) {
      throw new BadRequestException('Referrer does not belong to the BG affiliate system');
    }

    // Kiểm tra wallet mới chưa có trong hệ thống BG affiliate
    const existingNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: newWalletId }
    });

    if (existingNode) {
      throw new BadRequestException('Wallet already exists in the BG affiliate system');
    }

    // Commission percent mặc định cho wallet mới là 0%
    const newCommissionPercent = 0.00;

    // Thêm node mới vào cây affiliate
    const node = this.bgAffiliateNodeRepository.create({
      ban_tree_id: referrerBgInfo.treeId,
      ban_wallet_id: newWalletId,
      ban_parent_wallet_id: referrerWalletId,
      ban_commission_percent: newCommissionPercent,
    });

    return await this.bgAffiliateNodeRepository.save(node);
  }

  /**
   * Lấy thống kê chi tiết về downline members với bộ lọc
   */
  async getDownlineStats(
    walletId: number,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      minCommission?: number;
      maxCommission?: number;
      minVolume?: number;
      maxVolume?: number;
      level?: number;
      sortBy?: 'commission' | 'volume' | 'transactions' | 'level';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    isBgAffiliate: boolean;
    totalMembers: number;
    membersByLevel: { [key: string]: number };
    totalCommissionEarned: number;
    totalVolume: number;
    totalTransactions: number;
    stats: { [key: string]: { count: number; totalCommission: number; totalVolume: number; totalTransactions: number } };
    detailedMembers: Array<{
      walletId: number;
      level: number;
      commissionPercent: number;
      totalCommission: number;
      totalVolume: number;
      totalTransactions: number;
      lastTransactionDate?: Date;
      bgAlias?: string;
      walletInfo?: {
        nickName: string;
        solanaAddress: string;
        ethAddress: string;
        isBittworld: boolean;
        bittworldUid: string | null;
        createdAt: Date;
      };
    }>;
  }> {
    const downlineData = await this.getDownlineMembers(walletId);
    
    if (!downlineData.isBgAffiliate) {
      return {
        isBgAffiliate: false,
        totalMembers: 0,
        membersByLevel: {},
        totalCommissionEarned: 0,
        totalVolume: 0,
        totalTransactions: 0,
        stats: {},
        detailedMembers: []
      };
    }

    // Tính toán thống kê chi tiết cho từng member
    const detailedMembers: Array<{
      walletId: number;
      level: number;
      commissionPercent: number;
      totalCommission: number;
      totalVolume: number;
      totalTransactions: number;
      lastTransactionDate?: Date;
      bgAlias?: string;
      walletInfo?: any;
    }> = [];

    let totalCommissionEarned = 0;
    let totalVolume = 0;
    let totalTransactions = 0;
    const membersByLevel: { [key: string]: number } = {};
    const stats: { [key: string]: { count: number; totalCommission: number; totalVolume: number; totalTransactions: number } } = {};

    for (const member of downlineData.downlineMembers) {
      // Lọc theo level nếu có
      if (filters?.level && member.level !== filters.level) {
        continue;
      }

      // Lấy thống kê commission mà wallet hiện tại nhận được từ member này
      let memberRewardsQuery = this.bgAffiliateCommissionRewardRepository.createQueryBuilder('reward')
        .innerJoin('trading_orders', 'order', 'order.order_id = reward.bacr_order_id')
        .where('reward.bacr_wallet_id = :currentWalletId', { currentWalletId: walletId })
        .andWhere('order.order_wallet_id = :memberWalletId', { memberWalletId: member.walletId });

      // Lọc theo ngày nếu có
      if (filters?.startDate) {
        memberRewardsQuery = memberRewardsQuery.andWhere('reward.bacr_created_at >= :startDate', { startDate: filters.startDate });
      }
      if (filters?.endDate) {
        memberRewardsQuery = memberRewardsQuery.andWhere('reward.bacr_created_at <= :endDate', { endDate: filters.endDate });
      }

      const memberRewards = await memberRewardsQuery.getMany();
      const commissionEarned = memberRewards.reduce((sum, reward) => 
        sum + Number(reward.bacr_commission_amount), 0
      );

      // Lấy thống kê giao dịch từ bảng trading_orders
      let memberTransactionsQuery = this.dataSource.createQueryBuilder()
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(orders.order_total_value), 0)', 'totalVolume')
        .addSelect('MAX(orders.order_created_at)', 'lastTransaction')
        .from('trading_orders', 'orders')
        .where('orders.order_wallet_id = :walletId', { walletId: member.walletId });

      // Lọc theo ngày cho giao dịch
      if (filters?.startDate) {
        memberTransactionsQuery = memberTransactionsQuery.andWhere('orders.order_created_at >= :startDate', { startDate: filters.startDate });
      }
      if (filters?.endDate) {
        memberTransactionsQuery = memberTransactionsQuery.andWhere('orders.order_created_at <= :endDate', { endDate: filters.endDate });
      }

      const memberTransactionStats = await memberTransactionsQuery.getRawOne();
      const memberTransactionCount = parseInt(memberTransactionStats?.count || '0');
      const memberTransactionVolume = parseFloat(memberTransactionStats?.totalVolume || '0');
      const memberLastTransaction = memberTransactionStats?.lastTransaction;

      // Lọc theo commission nếu có
      if (filters?.minCommission !== undefined && commissionEarned < filters.minCommission) {
        continue;
      }
      if (filters?.maxCommission !== undefined && commissionEarned > filters.maxCommission) {
        continue;
      }

      // Lọc theo volume nếu có
      if (filters?.minVolume !== undefined && memberTransactionVolume < filters.minVolume) {
        continue;
      }
      if (filters?.maxVolume !== undefined && memberTransactionVolume > filters.maxVolume) {
        continue;
      }

      // Thêm vào danh sách chi tiết
      detailedMembers.push({
        walletId: member.walletId,
        level: member.level,
        commissionPercent: member.commissionPercent,
        totalCommission: commissionEarned, // Commission mà wallet hiện tại nhận được từ member
        totalVolume: memberTransactionVolume,
        totalTransactions: memberTransactionCount,
        lastTransactionDate: memberLastTransaction,
        bgAlias: member.bgAlias,
        walletInfo: member.walletInfo
      });

      // Cập nhật tổng số
      totalCommissionEarned += commissionEarned;
      totalVolume += memberTransactionVolume;
      totalTransactions += memberTransactionCount;

      // Cập nhật stats theo level
      const levelKey = `level${member.level}`;
      membersByLevel[levelKey] = (membersByLevel[levelKey] || 0) + 1;

      // Chỉ tạo stats cho những levels có members
      if (!stats[levelKey]) {
        stats[levelKey] = { count: 0, totalCommission: 0, totalVolume: 0, totalTransactions: 0 };
      }
      stats[levelKey].count++;
      stats[levelKey].totalCommission += commissionEarned;
      stats[levelKey].totalVolume += memberTransactionVolume;
      stats[levelKey].totalTransactions += memberTransactionCount;
    }

    // Sắp xếp detailedMembers theo tiêu chí
    if (filters?.sortBy) {
      detailedMembers.sort((a, b) => {
        let aValue: number;
        let bValue: number;

        switch (filters.sortBy) {
          case 'commission':
            aValue = a.totalCommission;
            bValue = b.totalCommission;
            break;
          case 'volume':
            aValue = a.totalVolume;
            bValue = b.totalVolume;
            break;
          case 'transactions':
            aValue = a.totalTransactions;
            bValue = b.totalTransactions;
            break;
          case 'level':
            aValue = a.level;
            bValue = b.level;
            break;
          default:
            aValue = a.totalCommission;
            bValue = b.totalCommission;
        }

        if (filters.sortOrder === 'asc') {
          return aValue - bValue;
        } else {
          return bValue - aValue;
        }
      });
    }

    return {
      isBgAffiliate: true,
      totalMembers: detailedMembers.length,
      membersByLevel,
      totalCommissionEarned,
      totalVolume,
      totalTransactions,
      stats,
      detailedMembers
    };
  }

  /**
   * Admin cập nhật hoa hồng của root BG (chỉ admin mới có quyền)
   * Kiểm tra tối thiểu để không ảnh hưởng đến tuyến dưới
   */
  async adminUpdateRootBgCommission(
    rootWalletId: number,
    newPercent: number
  ): Promise<{
    success: boolean;
    message: string;
    oldPercent: number;
    newPercent: number;
    minRequiredPercent: number | null;
    treeInfo: any;
  }> {
    // Kiểm tra commission percent hợp lệ
    if (newPercent < 0 || newPercent > 100) {
      throw new BadRequestException('Commission percent must be between 0 and 100');
    }

    // Tìm cây affiliate dựa trên root wallet ID
    const tree = await this.bgAffiliateTreeRepository.findOne({
      where: { bat_root_wallet_id: rootWalletId }
    });

    if (!tree) {
      throw new NotFoundException(`Affiliate tree not found for wallet ${rootWalletId}`);
    }

    // Lấy root node (node có ban_parent_wallet_id = null)
    const rootNode = await this.bgAffiliateNodeRepository.findOne({
      where: { 
        ban_tree_id: tree.bat_id,
        ban_parent_wallet_id: IsNull()
      }
    });

    if (!rootNode) {
      throw new BadRequestException('Root node not found in the affiliate tree');
    }

    // Kiểm tra xem có phải là root BG không (ban_wallet_id = bat_root_wallet_id)
    if (rootNode.ban_wallet_id !== tree.bat_root_wallet_id) {
      throw new BadRequestException('You can only update the root BG commission');
    }

    const oldPercent = rootNode.ban_commission_percent;

    // Root BG có thể set commission bất kỳ từ 0% đến 100%
    // Không cần kiểm tra giới hạn vì root BG là người quản lý toàn bộ cây

    // Cập nhật commission percent của root BG trong node
    rootNode.ban_commission_percent = newPercent;
    await this.bgAffiliateNodeRepository.save(rootNode);

    // Cập nhật total commission percent trong tree
    tree.bat_total_commission_percent = newPercent;
    await this.bgAffiliateTreeRepository.save(tree);

    // Lưu log thay đổi (fromWalletId = 0 để đánh dấu là admin thay đổi)
    await this.logCommissionChange(tree.bat_id, rootNode.ban_wallet_id, rootNode.ban_wallet_id, oldPercent, newPercent);

    // Lấy thông tin wallet root
    const rootWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: rootNode.ban_wallet_id },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name']
    });

    return {
      success: true,
      message: 'Updated root BG commission successfully',
      oldPercent,
      newPercent,
      minRequiredPercent: null, // Root BG không có giới hạn
      treeInfo: {
        treeId: tree.bat_id,
        rootWallet: rootWallet ? {
          walletId: rootWallet.wallet_id,
          solanaAddress: rootWallet.wallet_solana_address,
          nickName: rootWallet.wallet_nick_name
        } : null,
        totalCommissionPercent: newPercent // Sử dụng giá trị mới đã cập nhật
      }
    };
  }

  /**
   * Admin cập nhật hoa hồng của root BG bằng treeId (phiên bản cũ - giữ lại để tương thích)
   */
  async adminUpdateRootBgCommissionByTreeId(
    treeId: number,
    newPercent: number
  ): Promise<{
    success: boolean;
    message: string;
    oldPercent: number;
    newPercent: number;
    minRequiredPercent: number | null;
    treeInfo: any;
  }> {
    // Kiểm tra cây affiliate tồn tại
    const tree = await this.bgAffiliateTreeRepository.findOne({
      where: { bat_id: treeId }
    });

    if (!tree) {
      throw new NotFoundException('Affiliate tree does not exist');
    }

    // Gọi method mới với root wallet ID
    return this.adminUpdateRootBgCommission(tree.bat_root_wallet_id, newPercent);
  }

  /**
   * Lấy số lượng phần thưởng có thể nhận từ hệ thống ref truyền thống
   */
  async getTraditionalReferralRewards(walletId: number): Promise<{
    walletId: number;
    totalRewards: number;
    rewardsCount: number;
    walletInfo?: {
      solanaAddress: string;
      nickName: string;
      ethAddress: string;
    };
  }> {
    // Lấy thông tin wallet
    const wallet = await this.listWalletRepository.findOne({
      where: { wallet_id: walletId },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name', 'wallet_eth_address']
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Lấy tổng phần thưởng từ hệ thống ref truyền thống
    // Điều kiện: wrr_withdraw_status = false và wrr_withdraw_id = null
    const rewardsStats = await this.dataSource.createQueryBuilder()
      .select('COALESCE(SUM(reward.wrr_use_reward), 0)', 'totalRewards')
      .addSelect('COUNT(reward.wrr_id)', 'rewardsCount')
      .from('wallet_ref_rewards', 'reward')
      .innerJoin('wallet_referents', 'referent', 'referent.wr_id = reward.wrr_ref_id')
      .where('referent.wr_wallet_referent = :walletId', { walletId })
      .andWhere('reward.wrr_withdraw_status = :withdrawStatus', { withdrawStatus: false })
      .andWhere('reward.wrr_withdraw_id IS NULL')
      .getRawOne();

    return {
      walletId: wallet.wallet_id,
      totalRewards: parseFloat(rewardsStats?.totalRewards || '0'),
      rewardsCount: parseInt(rewardsStats?.rewardsCount || '0'),
      walletInfo: {
        solanaAddress: wallet.wallet_solana_address,
        nickName: wallet.wallet_nick_name,
        ethAddress: wallet.wallet_eth_address
      }
    };
  }

  /**
   * Update bg_alias for node in affiliate tree
   * Only upline can update alias for downline
   */
  async updateBgAlias(
    fromWalletId: number,
    toWalletId: number,
    newAlias: string
  ): Promise<{
    success: boolean;
    message: string;
    fromWallet: any;
    toWallet: any;
    oldAlias: string | null;
    newAlias: string;
  }> {
    // Check if the wallet performing the change is in the BG affiliate system
    const fromNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: fromWalletId }
    });

    if (!fromNode) {
      throw new BadRequestException('Wallet performing the change is not in the BG affiliate system');
    }

    // Check if the wallet being changed is in the BG affiliate system
    const toNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: toWalletId }
    });

    if (!toNode) {
      throw new BadRequestException('Wallet being changed is not in the BG affiliate system');
    }

    // Check if both wallets belong to the same affiliate tree
    if (fromNode.ban_tree_id !== toNode.ban_tree_id) {
      throw new BadRequestException('Both wallets must belong to the same affiliate tree');
    }

    // Check if the wallet performing the change is upline of the wallet being changed
    const isUpline = await this.isWalletInUpline(fromWalletId, toWalletId);
    if (!isUpline) {
      throw new BadRequestException('Only upline can update alias for downline');
    }

    // Save old alias
    const oldAlias = toNode.bg_alias;

    // Update new alias
    toNode.bg_alias = newAlias;
    await this.bgAffiliateNodeRepository.save(toNode);

    // Get wallet information
    const fromWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: fromWalletId },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name']
    });

    const toWallet = await this.listWalletRepository.findOne({
      where: { wallet_id: toWalletId },
      select: ['wallet_id', 'wallet_solana_address', 'wallet_nick_name']
    });

    return {
      success: true,
      message: 'BG alias updated successfully',
      fromWallet: fromWallet ? {
        walletId: fromWallet.wallet_id,
        solanaAddress: fromWallet.wallet_solana_address,
        nickName: fromWallet.wallet_nick_name
      } : null,
      toWallet: toWallet ? {
        walletId: toWallet.wallet_id,
        solanaAddress: toWallet.wallet_solana_address,
        nickName: toWallet.wallet_nick_name
      } : null,
      oldAlias,
      newAlias
    };
  }

  /**
   * Check if a wallet is upline of another wallet
   */
  private async isWalletInUpline(uplineWalletId: number, downlineWalletId: number): Promise<boolean> {
    // If it's the same wallet, it's not upline
    if (uplineWalletId === downlineWalletId) {
      return false;
    }

    // Get downline wallet node information
    const downlineNode = await this.bgAffiliateNodeRepository.findOne({
      where: { ban_wallet_id: downlineWalletId }
    });

    if (!downlineNode) {
      return false;
    }

    // Check if upline wallet is direct parent
    if (downlineNode.ban_parent_wallet_id === uplineWalletId) {
      return true;
    }

    // Check if upline wallet is ancestor (higher upline)
    let currentParentId = downlineNode.ban_parent_wallet_id;
    
    while (currentParentId !== null) {
      const parentNode = await this.bgAffiliateNodeRepository.findOne({
        where: { ban_wallet_id: currentParentId }
      });

      if (!parentNode) {
        break;
      }

      if (parentNode.ban_wallet_id === uplineWalletId) {
        return true;
      }

      currentParentId = parentNode.ban_parent_wallet_id;
    }

    return false;
  }
} 