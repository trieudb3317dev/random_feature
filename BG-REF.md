# BG Affiliate System Documentation

## Tổng quan
Hệ thống BG Affiliate cho phép tạo cây affiliate với cấu trúc phân cấp, tính toán và phân chia hoa hồng tự động từ các giao dịch.

## Database Schema

### 1. bg_affiliate_trees
Bảng lưu thông tin cây affiliate BG

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| bat_id | SERIAL | NO | - | Primary key, ID của cây affiliate |
| bat_root_wallet_id | INTEGER | NO | - | ID ví root BG của cây affiliate |
| bat_total_commission_percent | DECIMAL(5,2) | NO | 70.00 | Tổng phần trăm hoa hồng của cây affiliate |
| bat_created_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | Thời gian tạo cây affiliate |

**Foreign Keys:**
- `bat_root_wallet_id` → `list_wallets.wallet_id` (ON DELETE RESTRICT, ON UPDATE CASCADE)

**Indexes:**
- Primary key: `bat_id`
- Foreign key: `bat_root_wallet_id`

### 2. bg_affiliate_nodes
Bảng lưu thông tin các node trong cây affiliate BG

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ban_id | SERIAL | NO | - | Primary key, ID của node |
| ban_tree_id | INTEGER | NO | - | ID cây affiliate mà node thuộc về |
| ban_wallet_id | INTEGER | NO | - | ID ví của node (unique) |
| ban_parent_wallet_id | INTEGER | YES | NULL | ID ví parent của node (null nếu là root) |
| ban_commission_percent | DECIMAL(5,2) | NO | - | Phần trăm hoa hồng của node |
| ban_effective_from | TIMESTAMP | NO | CURRENT_TIMESTAMP | Thời gian node có hiệu lực |
| ban_status | BOOLEAN | NO | TRUE | Trạng thái node (true: active, false: inactive) |

**Foreign Keys:**
- `ban_tree_id` → `bg_affiliate_trees.bat_id` (ON DELETE CASCADE, ON UPDATE CASCADE)
- `ban_wallet_id` → `list_wallets.wallet_id` (ON DELETE CASCADE, ON UPDATE CASCADE)
- `ban_parent_wallet_id` → `list_wallets.wallet_id` (ON DELETE SET NULL, ON UPDATE CASCADE)

**Indexes:**
- Primary key: `ban_id`
- Unique: `ban_wallet_id`
- Foreign keys: `ban_tree_id`, `ban_wallet_id`, `ban_parent_wallet_id`
- Performance: `ban_status`

### 3. bg_affiliate_commission_logs
Bảng lưu lịch sử thay đổi hoa hồng BG affiliate

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| bacl_id | SERIAL | NO | - | Primary key, ID của log |
| bacl_tree_id | INTEGER | NO | - | ID cây affiliate |
| bacl_from_wallet_id | INTEGER | NO | - | ID ví thực hiện thay đổi |
| bacl_to_wallet_id | INTEGER | NO | - | ID ví được thay đổi hoa hồng |
| bacl_old_percent | DECIMAL(5,2) | YES | NULL | Phần trăm hoa hồng cũ |
| bacl_new_percent | DECIMAL(5,2) | YES | NULL | Phần trăm hoa hồng mới |
| bacl_changed_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | Thời gian thay đổi |

**Foreign Keys:**
- `bacl_tree_id` → `bg_affiliate_trees.bat_id` (ON DELETE CASCADE, ON UPDATE CASCADE)
- `bacl_from_wallet_id` → `list_wallets.wallet_id` (ON DELETE RESTRICT, ON UPDATE CASCADE)
- `bacl_to_wallet_id` → `list_wallets.wallet_id` (ON DELETE RESTRICT, ON UPDATE CASCADE)

**Indexes:**
- Primary key: `bacl_id`
- Foreign keys: `bacl_tree_id`, `bacl_from_wallet_id`, `bacl_to_wallet_id`
- Performance: `bacl_changed_at`

### 4. bg_affiliate_commission_rewards
Bảng lưu hoa hồng BG affiliate từ giao dịch

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| bacr_id | SERIAL | NO | - | Primary key, ID của reward |
| bacr_tree_id | INTEGER | NO | - | ID cây affiliate |
| bacr_order_id | INTEGER | NO | - | ID order giao dịch |
| bacr_wallet_id | INTEGER | NO | - | ID ví nhận hoa hồng |
| bacr_commission_amount | DECIMAL(18,6) | YES | NULL | Số tiền hoa hồng |
| bacr_level | INTEGER | NO | - | Cấp độ trong cây affiliate |
| bacr_created_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | Thời gian tạo reward |

**Foreign Keys:**
- `bacr_tree_id` → `bg_affiliate_trees.bat_id` (ON DELETE CASCADE, ON UPDATE CASCADE)
- `bacr_order_id` → `trading_orders.order_id` (ON DELETE CASCADE, ON UPDATE CASCADE)
- `bacr_wallet_id` → `list_wallets.wallet_id` (ON DELETE CASCADE, ON UPDATE CASCADE)

**Indexes:**
- Primary key: `bacr_id`
- Foreign keys: `bacr_tree_id`, `bacr_order_id`, `bacr_wallet_id`
- Performance: `bacr_created_at`

## Entity Relationships

### TypeORM Entity Relationships

#### BgAffiliateTree Entity
```typescript
@Entity('bg_affiliate_trees')
export class BgAffiliateTree {
  @PrimaryGeneratedColumn({ name: 'bat_id' })
  bat_id: number;

  @Column({ name: 'bat_root_wallet_id', type: 'integer', nullable: false })
  bat_root_wallet_id: number;

  @Column({ 
    name: 'bat_total_commission_percent', 
    type: 'decimal', 
    precision: 5, 
    scale: 2, 
    default: 70.00 
  })
  bat_total_commission_percent: number;

  @CreateDateColumn({ name: 'bat_created_at' })
  bat_created_at: Date;

  // Foreign key reference: bg_affiliate_trees.bat_root_wallet_id > list_wallets.wallet_id
  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateTrees)
  @JoinColumn({ name: 'bat_root_wallet_id' })
  rootWallet: ListWallet;

  // Relationships
  @OneToMany(() => BgAffiliateNode, node => node.banTree)
  nodes: BgAffiliateNode[];

  @OneToMany(() => BgAffiliateCommissionLog, log => log.baclTree)
  commissionLogs: BgAffiliateCommissionLog[];

  @OneToMany(() => BgAffiliateCommissionReward, reward => reward.bacrTree)
  commissionRewards: BgAffiliateCommissionReward[];
}
```

#### BgAffiliateNode Entity
```typescript
@Entity('bg_affiliate_nodes')
export class BgAffiliateNode {
  @PrimaryGeneratedColumn({ name: 'ban_id' })
  ban_id: number;

  @Column({ name: 'ban_tree_id', type: 'integer', nullable: false })
  ban_tree_id: number;

  @Column({ name: 'ban_wallet_id', type: 'integer', nullable: false, unique: true })
  ban_wallet_id: number;

  @Column({ name: 'ban_parent_wallet_id', type: 'integer', nullable: true })
  ban_parent_wallet_id: number | null;

  @Column({ 
    name: 'ban_commission_percent', 
    type: 'decimal', 
    precision: 5, 
    scale: 2, 
    nullable: false 
  })
  ban_commission_percent: number;

  @CreateDateColumn({ name: 'ban_effective_from' })
  ban_effective_from: Date;

  @Column({ 
    name: 'ban_status', 
    type: 'boolean', 
    default: true,
    nullable: false 
  })
  ban_status: boolean;

  // Foreign key references:
  // Ref: bg_affiliate_nodes.ban_tree_id > bg_affiliate_trees.bat_id
  // Ref: bg_affiliate_nodes.ban_wallet_id > list_wallets.wallet_id
  // Ref: bg_affiliate_nodes.ban_parent_wallet_id > list_wallets.wallet_id
  @ManyToOne(() => BgAffiliateTree, tree => tree.nodes)
  @JoinColumn({ name: 'ban_tree_id' })
  banTree: BgAffiliateTree;

  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateNodes)
  @JoinColumn({ name: 'ban_wallet_id' })
  wallet: ListWallet;

  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateParentNodes)
  @JoinColumn({ name: 'ban_parent_wallet_id' })
  parentWallet: ListWallet;

  @ManyToOne(() => BgAffiliateNode, node => node.children)
  @JoinColumn({ name: 'ban_parent_wallet_id' })
  parent: BgAffiliateNode;

  @OneToMany(() => BgAffiliateNode, node => node.parent)
  children: BgAffiliateNode[];
}
```

#### BgAffiliateCommissionLog Entity
```typescript
@Entity('bg_affiliate_commission_logs')
export class BgAffiliateCommissionLog {
  @PrimaryGeneratedColumn({ name: 'bacl_id' })
  bacl_id: number;

  @Column({ name: 'bacl_tree_id', type: 'integer', nullable: false })
  bacl_tree_id: number;

  @Column({ name: 'bacl_from_wallet_id', type: 'integer', nullable: false })
  bacl_from_wallet_id: number;

  @Column({ name: 'bacl_to_wallet_id', type: 'integer', nullable: false })
  bacl_to_wallet_id: number;

  @Column({ 
    name: 'bacl_old_percent', 
    type: 'decimal', 
    precision: 5, 
    scale: 2, 
    nullable: true 
  })
  bacl_old_percent: number;

  @Column({ 
    name: 'bacl_new_percent', 
    type: 'decimal', 
    precision: 5, 
    scale: 2, 
    nullable: true 
  })
  bacl_new_percent: number;

  @CreateDateColumn({ name: 'bacl_changed_at' })
  bacl_changed_at: Date;

  // Foreign key references:
  // Ref: bg_affiliate_commission_logs.bacl_tree_id > bg_affiliate_trees.bat_id
  // Ref: bg_affiliate_commission_logs.bacl_from_wallet_id > list_wallets.wallet_id
  // Ref: bg_affiliate_commission_logs.bacl_to_wallet_id > list_wallets.wallet_id
  @ManyToOne(() => BgAffiliateTree, tree => tree.commissionLogs)
  @JoinColumn({ name: 'bacl_tree_id' })
  baclTree: BgAffiliateTree;

  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateCommissionLogsFrom)
  @JoinColumn({ name: 'bacl_from_wallet_id' })
  fromWallet: ListWallet;

  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateCommissionLogsTo)
  @JoinColumn({ name: 'bacl_to_wallet_id' })
  toWallet: ListWallet;
}
```

#### BgAffiliateCommissionReward Entity
```typescript
@Entity('bg_affiliate_commission_rewards')
export class BgAffiliateCommissionReward {
  @PrimaryGeneratedColumn({ name: 'bacr_id' })
  bacr_id: number;

  @Column({ name: 'bacr_tree_id', type: 'integer', nullable: false })
  bacr_tree_id: number;

  @Column({ name: 'bacr_order_id', type: 'integer', nullable: false })
  bacr_order_id: number;

  @Column({ name: 'bacr_wallet_id', type: 'integer', nullable: false })
  bacr_wallet_id: number;

  @Column({ 
    name: 'bacr_commission_amount', 
    type: 'decimal', 
    precision: 18, 
    scale: 6, 
    nullable: true 
  })
  bacr_commission_amount: number;

  @Column({ name: 'bacr_level', type: 'integer', nullable: false })
  bacr_level: number;

  @CreateDateColumn({ name: 'bacr_created_at' })
  bacr_created_at: Date;

  // Foreign key references:
  // Ref: bg_affiliate_commission_rewards.bacr_tree_id > bg_affiliate_trees.bat_id
  // Ref: bg_affiliate_commission_rewards.bacr_order_id > trading_orders.order_id
  // Ref: bg_affiliate_commission_rewards.bacr_wallet_id > list_wallets.wallet_id
  @ManyToOne(() => BgAffiliateTree, tree => tree.commissionRewards)
  @JoinColumn({ name: 'bacr_tree_id' })
  bacrTree: BgAffiliateTree;

  @ManyToOne(() => TradingOrder, order => order.bgAffiliateCommissionRewards)
  @JoinColumn({ name: 'bacr_order_id' })
  order: TradingOrder;

  @ManyToOne(() => ListWallet, wallet => wallet.bgAffiliateCommissionRewards)
  @JoinColumn({ name: 'bacr_wallet_id' })
  wallet: ListWallet;
}
```

#### ListWallet Entity (Updated)
```typescript
@Entity('list_wallets')
export class ListWallet {
  // ... existing fields ...

  // Trading relationships
  @OneToMany(() => TradingOrder, order => order.wallet)
  tradingOrders: TradingOrder[];

  // BG Affiliate relationships
  @OneToMany(() => BgAffiliateTree, tree => tree.rootWallet)
  bgAffiliateTrees: BgAffiliateTree[];

  @OneToMany(() => BgAffiliateNode, node => node.wallet)
  bgAffiliateNodes: BgAffiliateNode[];

  @OneToMany(() => BgAffiliateNode, node => node.parentWallet)
  bgAffiliateParentNodes: BgAffiliateNode[];

  @OneToMany(() => BgAffiliateCommissionLog, log => log.fromWallet)
  bgAffiliateCommissionLogsFrom: BgAffiliateCommissionLog[];

  @OneToMany(() => BgAffiliateCommissionLog, log => log.toWallet)
  bgAffiliateCommissionLogsTo: BgAffiliateCommissionLog[];

  @OneToMany(() => BgAffiliateCommissionReward, reward => reward.wallet)
  bgAffiliateCommissionRewards: BgAffiliateCommissionReward[];
}
```

#### TradingOrder Entity (Updated)
```typescript
@Entity('trading_orders')
export class TradingOrder {
  // ... existing fields ...

  // Foreign key reference: trading_orders.order_wallet_id > list_wallets.wallet_id
  @ManyToOne(() => ListWallet, wallet => wallet.tradingOrders)
  @JoinColumn({ name: 'order_wallet_id' })
  wallet: ListWallet;

  // BG Affiliate relationships
  @OneToMany(() => BgAffiliateCommissionReward, reward => reward.order)
  bgAffiliateCommissionRewards: BgAffiliateCommissionReward[];
}
```

## API Endpoints

### Admin APIs

#### 1. Tạo BG Affiliate mới
```
POST /admin/bg-affiliate
```
**Body:**
```json
{
  "walletId": 123456,
  "totalCommissionPercent": 70.00
}
```

#### 2. Cập nhật hoa hồng root BG
```
PUT /admin/bg-affiliate/commission
```
**Body:**
```json
{
  "rootWalletId": 123456,
  "newPercent": 75.00
}
```
hoặc
```json
{
  "treeId": 1,
  "newPercent": 75.00
}
```

#### 3. Lấy danh sách tất cả BG affiliate trees
```
GET /admin/bg-affiliate/trees
```

#### 4. Lấy thông tin chi tiết BG affiliate tree theo wallet ID
```
GET /admin/bg-affiliate/trees/wallet/:walletId
```

#### 5. Cập nhật trạng thái BG affiliate node
```
PUT /admin/bg-affiliate/nodes/status
```
**Body:**
```json
{
  "walletId": 123456,
  "status": true
}
```

### User APIs

#### 1. Cập nhật commission percent
```
PUT /bg-ref/nodes/commission
```
**Body:**
```json
{
  "toWalletId": 789012,
  "newPercent": 25.00
}
```

#### 2. Lấy lịch sử hoa hồng
```
GET /bg-ref/commission-history
```

#### 3. Kiểm tra status BG affiliate
```
GET /bg-ref/my-bg-affiliate-status
```

#### 4. Lấy thống kê BG affiliate
```
GET /bg-ref/bg-affiliate-stats
```

#### 5. Lấy cây affiliate của mình
```
GET /bg-ref/trees
```

#### 6. Lấy thống kê downline
```
GET /bg-ref/downline-stats
```

## Logic hoạt động

### 1. Tạo cây affiliate
- Admin tạo BG affiliate cho wallet chưa thuộc hệ thống referral nào
- Tự động tạo root node với `ban_parent_wallet_id = null`
- Root BG nhận toàn bộ commission percent

### 2. Thêm node mới
- Khi user mới được giới thiệu bởi BG affiliate member
- Tự động thêm vào cây affiliate với commission percent mặc định
- Commission percent không được vượt quá giới hạn của parent

### 3. Cập nhật commission percent
- Chỉ người giới thiệu trực tiếp mới có quyền thay đổi
- Kiểm tra giới hạn để không ảnh hưởng tuyến dưới
- Lưu log thay đổi

### 4. Tính toán hoa hồng
- Chỉ tính cho tuyến trên của người giao dịch
- Chỉ tính cho các node có `ban_status = true`
- Tự động phân chia theo commission percent

### 5. Tích hợp với hệ thống referral truyền thống
- Nếu wallet thuộc BG affiliate, bỏ qua referral truyền thống
- Nếu gặp BG affiliate trong chuỗi referral, dừng chuỗi

## Migration Script

Chạy file `src/referral/migrations/update-bg-affiliate-schema-complete.sql` để:
1. Thêm tất cả foreign key constraints
2. Tạo indexes cho performance
3. Thêm comments cho tables và columns
4. Verify foreign key constraints

## Lưu ý quan trọng

1. **Foreign Key Constraints:**
   - CASCADE: Khi xóa tree, tất cả nodes và rewards sẽ bị xóa
   - RESTRICT: Không cho phép xóa wallet đang được sử dụng
   - SET NULL: Khi xóa parent wallet, parent_wallet_id sẽ thành null

2. **Performance:**
   - Indexes được tạo cho tất cả foreign keys
   - Indexes cho các trường thường query: status, created_at, changed_at

3. **Data Integrity:**
   - Unique constraint trên `ban_wallet_id` đảm bảo mỗi wallet chỉ thuộc 1 cây
   - Foreign key constraints đảm bảo tính toàn vẹn dữ liệu

4. **Entity Relationships:**
   - Đầy đủ bidirectional relationships
   - Có thể query theo cả hai chiều
   - Eager loading và lazy loading được hỗ trợ 