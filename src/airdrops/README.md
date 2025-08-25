# Airdrops Module

Module quản lý hệ thống airdrop pools cho nền tảng Bittworld.

## Tổng quan

Module này cung cấp chức năng quản lý các airdrop pools, cho phép người dùng tạo pool airdrop và tham gia vào các pool để nhận token.

## Cấu trúc Database

### 1. airdrop_list_pool
Bảng lưu thông tin các airdrop pools

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| alp_id | SERIAL | NO | - | Primary key, ID của pool |
| alp_originator | INTEGER | NO | - | ID ví người tạo pool |
| alp_name | VARCHAR(255) | NO | - | Tên pool |
| alp_slug | VARCHAR(255) | NO | - | Slug của pool |
| alp_describe | VARCHAR(1000) | YES | - | Mô tả pool |
| alp_logo | VARCHAR(500) | YES | - | Logo URL của pool |
| alp_member_num | INTEGER | NO | 0 | Số lượng thành viên |
| apl_volume | DECIMAL(18,6) | NO | 0 | Tổng volume |
| apl_creation_date | TIMESTAMP | NO | CURRENT_TIMESTAMP | Thời gian tạo |
| apl_end_date | TIMESTAMP | YES | - | Thời gian kết thúc |
| apl_round_end | TIMESTAMP | YES | NULL | Thời điểm kết thúc vòng hiện tại (round) |
| apl_status | ENUM | NO | 'pending' | Trạng thái pool |
| apl_hash | TEXT | YES | NULL | Transaction hash khi giao dịch thành công |

**Foreign Keys:**
- `alp_originator` → `list_wallets.wallet_id` (ON DELETE RESTRICT, ON UPDATE CASCADE)

### 2. airdrop_pool_joins 
Bảng lưu thông tin thành viên tham gia pool

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| apj_id | SERIAL | NO | - | Primary key, ID của join |
| apj_pool_id | INTEGER | NO | - | ID pool tham gia |
| apj_member | INTEGER | NO | - | ID ví thành viên |
| apj_volume | DECIMAL(18,6) | NO | 0 | Volume stake |
| apj_stake_date | TIMESTAMP | NO | CURRENT_TIMESTAMP | Thời gian stake |
| apj_stake_end | TIMESTAMP | YES | - | Thời gian kết thúc stake |
| apj_round_end | TIMESTAMP | YES | NULL | Thời điểm kết thúc vòng stake hiện tại (round) |
| apj_status | ENUM | NO | 'pending' | Trạng thái join |
| apj_hash | TEXT | YES | NULL | Transaction hash khi giao dịch thành công |

**Foreign Keys:**
- `apj_pool_id` → `airdrop_list_pool.alp_id` (ON DELETE CASCADE, ON UPDATE CASCADE)
- `apj_member` → `list_wallets.wallet_id` (ON DELETE CASCADE, ON UPDATE CASCADE)

## Entity Relationships

### AirdropListPool Entity
```typescript
@Entity('airdrop_list_pool')
export class AirdropListPool {
  @PrimaryGeneratedColumn({ name: 'alp_id' })
  alp_id: number;

  @Column({ name: 'alp_originator', type: 'integer', nullable: false })
  alp_originator: number;

  @Column({ name: 'alp_name', type: 'varchar', length: 255, nullable: false })
  alp_name: string;

  @Column({ name: 'alp_slug', type: 'varchar', length: 255, nullable: false })
  alp_slug: string;

  @Column({ name: 'alp_describe', type: 'varchar', length: 1000, nullable: true })
  alp_describe: string;

  @Column({ name: 'alp_member_num', type: 'integer', default: 0 })
  alp_member_num: number;

  @Column({ name: 'apl_volume', type: 'decimal', precision: 18, scale: 6, default: 0 })
  apl_volume: number;

  @CreateDateColumn({ name: 'apl_creation_date' })
  apl_creation_date: Date;

  @Column({ name: 'apl_end_date', type: 'timestamp', nullable: true })
  apl_end_date: Date;

  @Column({
    name: 'apl_status',
    type: 'enum',
    enum: AirdropPoolStatus,
    default: AirdropPoolStatus.PENDING
  })
  apl_status: AirdropPoolStatus;

  @Column({ name: 'apl_hash', type: 'text', nullable: true })
  apl_hash: string | null;

  // Relationships
  @ManyToOne(() => ListWallet, wallet => wallet.airdropPools)
  @JoinColumn({ name: 'alp_originator' })
  originator: ListWallet;

  @OneToMany(() => AirdropPoolJoin, join => join.pool)
  poolJoins: AirdropPoolJoin[];
}
```

### AirdropPoolJoin Entity
```typescript
@Entity('airdrop_pool_joins')
export class AirdropPoolJoin {
  @PrimaryGeneratedColumn({ name: 'apj_id' })
  apj_id: number;

  @Column({ name: 'apj_pool_id', type: 'integer', nullable: false })
  apj_pool_id: number;

  @Column({ name: 'apj_member', type: 'integer', nullable: false })
  apj_member: number;

  @Column({ name: 'apj_volume', type: 'decimal', precision: 18, scale: 6, default: 0 })
  apj_volume: number;

  @CreateDateColumn({ name: 'apj_stake_date' })
  apj_stake_date: Date;

  @Column({ name: 'apj_stake_end', type: 'timestamp', nullable: true })
  apj_stake_end: Date;

  @Column({
    name: 'apj_status',
    type: 'enum',
    enum: AirdropPoolJoinStatus,
    default: AirdropPoolJoinStatus.PENDING
  })
  apj_status: AirdropPoolJoinStatus;

  @Column({ name: 'apj_hash', type: 'text', nullable: true })
  apj_hash: string | null;

  // Relationships
  @ManyToOne(() => AirdropListPool, pool => pool.poolJoins)
  @JoinColumn({ name: 'apj_pool_id' })
  pool: AirdropListPool;

  @ManyToOne(() => ListWallet, wallet => wallet.airdropPoolJoins)
  @JoinColumn({ name: 'apj_member' })
  member: ListWallet;
}
```

## Enums

### AirdropPoolStatus
```typescript
export enum AirdropPoolStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  END = 'end',
  ERROR = 'error'
}
```

### AirdropPoolJoinStatus
```typescript
export enum AirdropPoolJoinStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  WITHDRAW = 'withdraw',
  ERROR = 'error'
}
```

## API Endpoints

### Create Pool API

#### POST /api/v1/airdrops/create-pool

Tạo một airdrop pool mới với token X.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body (JSON):**
```json
{
  "name": "My Airdrop Pool",
  "logo": "https://example.com/logo.png",
  "describe": "Mô tả chi tiết về pool",
  "initialAmount": 1000000
}
```

**Request Body (Form Data - với file upload):**
```
name: "My Airdrop Pool"
logo: [file upload]
describe: "Mô tả chi tiết về pool"
initialAmount: 1000000
```

**Request Body (JSON - không có logo):**
```json
{
  "name": "My Airdrop Pool",
  "describe": "Mô tả chi tiết về pool",
  "initialAmount": 1000000
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tạo pool thành công",
  "data": {
    "poolId": 1,
    "name": "My Airdrop Pool",
    "slug": "my-airdrop-pool-1",
    "logo": "https://res.cloudinary.com/.../airdrop-pool-logo.jpg",
    "status": "active",
    "initialAmount": 1000000,
    "transactionHash": "5J7X...abc123"
  }
}
```

**Validation Rules:**
- `initialAmount`: Tối thiểu 1,000,000 token X
- `name`: Bắt buộc, không được rỗng
- `logo`: Tùy chọn, có thể là URL hoặc file upload
- `describe`: Tùy chọn

### Update Pool API

#### PUT /api/v1/airdrops/pool/:idOrSlug

Cập nhật logo và mô tả của một airdrop pool. Chỉ người tạo pool mới được cập nhật.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data
```

**Path Parameters:**
- `idOrSlug`: ID hoặc slug của pool (ví dụ: `1` hoặc `"my-airdrop-pool-1"`)

**Request Body (Form Data - với logo file):**
```
logo: [file upload]
describe: "Mô tả cập nhật về pool"
```

**Request Body (Form Data - với logo URL):**
```
logo: "https://example.com/new-logo.png"
describe: "Mô tả cập nhật về pool"
```

**Request Body (Form Data - chỉ cập nhật mô tả):**
```
describe: "Mô tả cập nhật về pool"
```

**Request Body (Form Data - chỉ cập nhật logo):**
```
logo: [file upload]
```

**Response:**
```json
{
  "success": true,
  "message": "Pool updated successfully",
  "data": {
    "poolId": 1,
    "name": "My Airdrop Pool",
    "slug": "my-airdrop-pool-1",
    "logo": "https://res.cloudinary.com/.../new-logo.jpg",
    "describe": "Mô tả cập nhật về pool",
    "status": "active"
  }
}
```

**Validation Rules:**
- `logo`: Tùy chọn, có thể là URL hoặc file upload
- `describe`: Tùy chọn
- Chỉ người tạo pool mới được cập nhật

**Business Logic:**
1. Kiểm tra pool có tồn tại không (theo ID hoặc slug)
2. Kiểm tra user có phải là creator của pool không
3. Nếu có logo file: Upload lên Cloudinary
4. Nếu có logo URL: Sử dụng URL trực tiếp
5. Cập nhật chỉ những trường được truyền vào
6. Trả về thông tin pool đã được cập nhật

### Stake Pool API

#### POST /api/v1/airdrops/stake-pool

Stake token X vào một airdrop pool đã tồn tại. Có thể stake nhiều lần.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "poolId": 1,
  "stakeAmount": 500000
}
```

**Response:**
```json
{
  "success": true,
  "message": "Stake pool thành công",
  "data": {
    "joinId": 1,
    "poolId": 1,
    "stakeAmount": 500000,
    "status": "active",
    "transactionHash": "9K8Y...def456"
  }
}
```

**Validation Rules:**
- `poolId`: Bắt buộc, ID của pool muốn stake
- `stakeAmount`: Tối thiểu 1 token X

**Business Logic:**
1. **Cho phép stake nhiều lần:**
   - Cả ví tạo pool và ví đã tham gia đều có thể stake tiếp
   - Mỗi lần stake tạo một record mới trong airdrop_pool_joins
2. Kiểm tra pool có tồn tại và đang active không
3. Kiểm tra số dư token X của wallet
4. Kiểm tra số dư SOL và chuyển phí nếu cần:
   - Nếu < 0.00002 SOL: Chuyển 0.00002 SOL từ WALLET_SUP_FREE_PRIVATE_KEY
   - Thử tối đa 3 lần nếu thất bại
   - Chờ transaction confirm thực sự (tối đa 30 giây)
   - Kiểm tra lại số dư SOL sau khi chuyển phí
   - Chờ 2 giây giữa các lần thử
5. Tạo stake record với trạng thái `pending`:
   - `apj_stake_date`: Thời gian hiện tại
   - `apj_stake_end`: Thời gian hiện tại + 365 ngày
6. Chuyển token X từ wallet người dùng đến WALLET_BITT:
   - Kiểm tra xem stake đã có transaction hash chưa (tránh trùng lặp)
   - Thử tối đa 3 lần nếu thất bại
   - Chờ transaction confirm thực sự sau mỗi lần thử
   - Chờ 3 giây giữa các lần thử
   - Tạo unique transaction với timestamp + random để tránh trùng lặp
7. Cập nhật trạng thái stake:
   - `active`: Nếu giao dịch thành công
   - `error`: Nếu giao dịch thất bại sau 3 lần thử
8. Cập nhật số lượng member và volume của pool:
   - Tăng volume theo stakeAmount
   - Chỉ tăng member nếu user chưa có stake record trước đó
9. Log kết quả cuối cùng cho monitoring

**Business Logic:**
1. **Chống trùng lặp API call:**
   - Kiểm tra xem wallet đã có pool đang pending chưa
   - Nếu có → throw error "Bạn đã có một pool đang trong quá trình tạo"
2. Kiểm tra số lượng khởi tạo tối thiểu (1,000,000)
3. Kiểm tra số dư token X của wallet (sử dụng MINT_TOKEN_AIRDROP từ .env)
4. Kiểm tra số dư SOL của wallet:
   - Nếu < 0.00002 SOL: Chuyển 0.00002 SOL từ WALLET_SUP_FREE_PRIVATE_KEY
   - Chờ transaction confirm thực sự (tối đa 30 giây)
   - Kiểm tra lại số dư SOL sau khi chuyển phí
5. Tạo pool với trạng thái `pending`:
   - `apl_creation_date`: Thời gian hiện tại
   - `apl_end_date`: Thời gian hiện tại + 365 ngày
6. Tạo slug từ name và ID pool (ví dụ: "Pool mới" + ID 5 = "pool-moi-5")
7. Chuyển token X từ wallet người dùng đến WALLET_BITT:
   - Kiểm tra xem pool đã có transaction hash chưa (tránh trùng lặp)
   - Thử tối đa 3 lần nếu thất bại
   - Chờ transaction confirm thực sự sau mỗi lần thử
   - Chờ 3 giây giữa các lần thử
   - Tạo unique transaction với timestamp + random để tránh trùng lặp
8. Cập nhật trạng thái pool và transaction hash:
   - `active` + `apl_hash`: Nếu giao dịch thành công
   - `error`: Nếu giao dịch thất bại sau 3 lần thử
9. Log kết quả cuối cùng cho monitoring

### Get Pools API

#### GET /api/v1/airdrops/pools

Lấy danh sách tất cả các airdrop pools đang hoạt động với thông tin chi tiết. Hỗ trợ sắp xếp theo nhiều trường.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Query Parameters:**
- `filterType` (optional): Bộ lọc loại pool
  - `all`: Tất cả các pool (mặc định)
  - `created`: Chỉ pools do user tạo
  - `joined`: Chỉ pools mà user đã tham gia
- `sortBy` (optional): Trường để sắp xếp danh sách pools
  - `creationDate`: Sắp xếp theo ngày tạo (mặc định)
  - `name`: Sắp xếp theo tên pool
  - `memberCount`: Sắp xếp theo số lượng member
  - `totalVolume`: Sắp xếp theo tổng volume
  - `endDate`: Sắp xếp theo ngày kết thúc
- `sortOrder` (optional): Thứ tự sắp xếp
  - `asc`: Tăng dần
  - `desc`: Giảm dần (mặc định)

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách pool thành công",
  "data": [
    {
      "poolId": 1,
      "name": "My Airdrop Pool",
      "slug": "my-airdrop-pool-1",
      "logo": "https://example.com/logo.png",
      "describe": "Mô tả chi tiết về pool",
      "memberCount": 25,
      "totalVolume": 5000000,
      "creationDate": "2024-01-15T10:30:00.000Z",
      "endDate": "2025-01-15T10:30:00.000Z",
      "status": "active",
      "creatorAddress": "4d9d4hWrrDDgqGiQctkcPwyinZhozyj2xaPRi9MSz44v",
      "creatorBittworldUid": "BW123456789",
      "userStakeInfo": {
        "isCreator": false,
        "joinStatus": "active",
        "joinDate": "2024-01-16T15:30:00.000Z",
        "totalStaked": 1000000
      }
    }
  ]
}
```

**Business Logic:**
1. **Xác định filter type: filterType**  
   - `all`: Lấy tất cả pools có trạng thái `active`
   - `created`: Chỉ lấy pools do user tạo (alp_originator = wallet_id)
   - `joined`: Lấy pools mà user đã tham gia (có record trong airdrop_pool_joins)
2. **Sắp xếp theo trường được chọn** (mặc định: ngày tạo giảm dần)
3. **Với mỗi pool, kiểm tra thông tin stake của user:**
   - Kiểm tra user có phải là creator không
   - Lấy tất cả stake records của user trong pool
   - Tính tổng volume user đã stake
   - Nếu là creator, cộng thêm volume ban đầu của pool
4. **Trả về thông tin pool kèm thông tin stake của user** (nếu có)

**Sắp xếp Pools:**
- Hỗ trợ sắp xếp theo:
  - Ngày tạo (creationDate) - mặc định
  - Tên pool (name)
  - Số lượng member (memberCount)
  - Tổng volume (totalVolume)
  - Ngày kết thúc (endDate)
- Hỗ trợ thứ tự tăng dần (asc) hoặc giảm dần (desc)

### Get Pool Detail API

#### GET /api/v1/airdrops/pool/:idOrSlug

Lấy thông tin chi tiết của một airdrop pool theo ID hoặc slug. Nếu user là creator, sẽ hiển thị thêm danh sách members (thống kê tổng hợp).

### Get Pool Detail Transactions API

#### GET /api/v1/airdrops/pool-detail/:idOrSlug

Lấy thông tin chi tiết của một airdrop pool theo ID hoặc slug kèm theo danh sách tất cả các transaction (thay vì thống kê tổng hợp như API `/pool/:id`). **Chỉ người tạo pool mới có thể truy cập endpoint này.**

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Path Parameters:**
- `idOrSlug`: ID hoặc slug của pool (ví dụ: `1` hoặc `"my-airdrop-pool-1"`)

**Query Parameters:**
- `sortBy` (optional): Trường để sắp xếp danh sách members
  - `joinDate`: Sắp xếp theo ngày tham gia
  - `totalStaked`: Sắp xếp theo tổng số lượng stake
  - `stakeCount`: Sắp xếp theo số lần stake
  - `memberId`: Sắp xếp theo ID member
- `sortOrder` (optional): Thứ tự sắp xếp
  - `asc`: Tăng dần
  - `desc`: Giảm dần

**Query Parameters (for pool-detail):**
- `sortBy` (optional): Trường để sắp xếp danh sách transactions
  - `transactionDate` (default): Sắp xếp theo ngày thực hiện transaction
  - `stakeAmount`: Sắp xếp theo số lượng token stake
  - `memberId`: Sắp xếp theo ID của member
  - `status`: Sắp xếp theo trạng thái transaction
- `sortOrder` (optional): Thứ tự sắp xếp
  - `asc`: Tăng dần
  - `desc`: Giảm dần (default)

**Ví dụ Request:**
```
GET /api/v1/airdrops/pool/my-airdrop-pool-1
GET /api/v1/airdrops/pool/1
GET /api/v1/airdrops/pool-detail/my-airdrop-pool-1
GET /api/v1/airdrops/pool-detail/1
```

**Response (User thường):**
```json
{
  "success": true,
  "message": "Lấy thông tin pool thành công",
  "data": {
    "poolId": 1,
    "name": "My Airdrop Pool",
    "slug": "my-airdrop-pool-1",
    "logo": "https://example.com/logo.png",
    "describe": "Mô tả chi tiết về pool",
    "memberCount": 25,
    "totalVolume": 5000000,
    "creationDate": "2024-01-15T10:30:00.000Z",
    "endDate": "2025-01-15T10:30:00.000Z",
    "status": "active",
    "transactionHash": "5J7X...abc123",
    "creatorAddress": "4d9d4hWrrDDgqGiQctkcPwyinZhozyj2xaPRi9MSz44v",
    "userStakeInfo": {
      "isCreator": false,
      "joinStatus": "active",
      "joinDate": "2024-01-16T15:30:00.000Z",
      "totalStaked": 1000000,
      "stakeCount": 3
    }
  }
}
```

**Response (Creator):**
```json
{
  "success": true,
  "message": "Lấy thông tin pool thành công",
  "data": {
    "poolId": 1,
    "name": "My Airdrop Pool",
    "slug": "my-airdrop-pool-1",
    "logo": "https://example.com/logo.png",
    "describe": "Mô tả chi tiết về pool",
    "memberCount": 25,
    "totalVolume": 5000000,
    "creationDate": "2024-01-15T10:30:00.000Z",
    "endDate": "2025-01-15T10:30:00.000Z",
    "status": "active",
    "transactionHash": "5J7X...abc123",
    "creatorAddress": "4d9d4hWrrDDgqGiQctkcPwyinZhozyj2xaPRi9MSz44v",
    "creatorBittworldUid": "BW123456789",
    "userStakeInfo": {
      "isCreator": true,
      "joinStatus": "creator",
      "joinDate": "2024-01-15T10:30:00.000Z",
      "totalStaked": 6000000,
      "stakeCount": 0
    },
    "members": [
      {
        "memberId": 123456,
        "solanaAddress": "4d9d4hWrrDDgqGiQctkcPwyinZhozyj2xaPRi9MSz44v",
        "bittworldUid": "BW123456789",
        "nickname": "Creator",
        "isCreator": true,
        "joinDate": "2024-01-15T10:30:00.000Z",
        "totalStaked": 5000000,
        "stakeCount": 0,
        "status": "active"
      },
      {
        "memberId": 789012,
        "solanaAddress": "9K8Y...def456",
        "bittworldUid": "BW789012345",
        "nickname": "User123",
        "isCreator": false,
        "joinDate": "2024-01-16T15:30:00.000Z",
        "totalStaked": 1000000,
        "stakeCount": 3,
        "status": "active"
      }
    ]
  }
}
```

**Response (pool-detail - Transactions - Creator only):**
```json
{
  "success": true,
  "message": "Get pool detail transactions successfully",
  "data": {
    "poolId": 1,
    "name": "My Airdrop Pool",
    "slug": "my-airdrop-pool-1",
    "logo": "https://example.com/logo.png",
    "describe": "Mô tả chi tiết về pool",
    "memberCount": 25,
    "totalVolume": 5000000,
    "creationDate": "2024-01-15T10:30:00.000Z",
    "endDate": "2025-01-15T10:30:00.000Z",
    "status": "active",
    "transactionHash": "5J7X...abc123",
    "creatorAddress": "4d9d4hWrrDDgqGiQctkcPwyinZhozyj2xaPRi9MSz44v",
    "creatorBittworldUid": "BW123456789",
    "userStakeInfo": {
      "isCreator": true,
      "joinStatus": "creator",
      "joinDate": "2024-01-15T10:30:00.000Z",
      "totalStaked": 6000000,
      "stakeCount": 0
    },
    "transactions": [
      {
        "transactionId": 0,
        "memberId": 123456,
        "solanaAddress": "4d9d4hWrrDDgqGiQctkcPwyinZhozyj2xaPRi9MSz44v",
        "bittworldUid": "BW123456789",
        "nickname": "Creator",
        "isCreator": true,
        "stakeAmount": 5000000,
        "transactionDate": "2024-01-15T10:30:00.000Z",
        "status": "active",
        "transactionHash": "5J7X...abc123"
      },
      {
        "transactionId": 1,
        "memberId": 789012,
        "solanaAddress": "9K8Y...def456",
        "bittworldUid": "BW789012345",
        "nickname": "User123",
        "isCreator": false,
        "stakeAmount": 500000,
        "transactionDate": "2024-01-16T15:30:00.000Z",
        "status": "active",
        "transactionHash": "9K8Y...def456"
      },
      {
        "transactionId": 2,
        "memberId": 789012,
        "solanaAddress": "9K8Y...def456",
        "bittworldUid": "BW789012345",
        "nickname": "User123",
        "isCreator": false,
        "stakeAmount": 300000,
        "transactionDate": "2024-01-17T10:15:00.000Z",
        "status": "active",
        "transactionHash": "7M9N...ghi789"
      },
      {
        "transactionId": 3,
        "memberId": 789012,
        "solanaAddress": "9K8Y...def456",
        "bittworldUid": "BW789012345",
        "nickname": "User123",
        "isCreator": false,
        "stakeAmount": 200000,
        "transactionDate": "2024-01-18T14:20:00.000Z",
        "status": "active",
        "transactionHash": "2P3Q...jkl012"
      }
    ]
  }
}
```

**Error Response (User không phải creator):**
```json
{
  "message": "Only the pool creator can access pool detail transactions",
  "error": "Bad Request",
  "statusCode": 400
}
```

**Business Logic:**
1. **Tìm pool theo ID hoặc slug:**
   - Kiểm tra xem `idOrSlug` có phải là số không
   - Nếu là số: Tìm theo `alp_id`
   - Nếu không phải số: Tìm theo `alp_slug`
2. Kiểm tra pool có tồn tại không
3. Kiểm tra user có phải là creator của pool không
4. Lấy thông tin stake của user trong pool:
   - Tính tổng volume đã stake
   - Đếm số lần stake
   - Nếu là creator, cộng thêm volume ban đầu
5. Nếu user là creator:
   - Lấy danh sách tất cả members (bao gồm cả creator)
   - Group theo member và tính toán thống kê
   - Sắp xếp theo yêu cầu (creator luôn ở đầu)
6. Trả về thông tin chi tiết pool kèm thông tin stake của user

**Sắp xếp Members:**
- Creator luôn được sắp xếp ở vị trí đầu tiên
- Các members khác được sắp xếp theo trường được chọn
- Hỗ trợ sắp xếp theo:
  - Ngày tham gia (joinDate)
  - Tổng số lượng stake (totalStaked)
  - Số lần stake (stakeCount)
  - ID member (memberId)

**Business Logic (pool-detail - Transactions):**
1. **Tìm pool theo ID hoặc slug** (tương tự như trên)
2. **Kiểm tra quyền truy cập:**
   - **Chỉ người tạo pool mới có thể truy cập endpoint này**
   - Nếu user không phải là creator → throw `BadRequestException` với message "Only the pool creator can access pool detail transactions"
3. **Lấy thông tin pool cơ bản** (tương tự như trên)
4. **Lấy danh sách transactions:**
   - **Creator's initial transaction**: Transaction đầu tiên khi tạo pool (transactionId = 0)
   - **Member transactions**: Tất cả các transaction stake từ bảng `airdrop_pool_joins`
   - Mỗi transaction bao gồm đầy đủ thông tin: ID, member, amount, date, hash, status
5. **Sắp xếp transactions** theo trường và thứ tự được chọn

**Sắp xếp Transactions:**
- Hỗ trợ sắp xếp theo:
  - Ngày thực hiện transaction (transactionDate) - mặc định
  - Số lượng token stake (stakeAmount)
  - ID của member (memberId)
  - Trạng thái transaction (status)
- Hỗ trợ thứ tự tăng dần (asc) hoặc giảm dần (desc)

## Environment Variables

Thêm các biến môi trường sau vào file `.env`:

```env
# Token mint address cho airdrop
MINT_TOKEN_AIRDROP=your_token_mint_address_here

# Wallet Bittworld để nhận token
WALLET_BITT=your_bittworld_wallet_address_here

# Private key của wallet hỗ trợ phí SOL
WALLET_SUP_FREE_PRIVATE_KEY=your_support_wallet_private_key_here

# Cloudinary configuration (cho upload logo)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

## Migration

Để tạo các bảng trong database, chạy migration:

```bash
npm run migration:run
```

Migration sẽ tạo:
1. Bảng `airdrop_list_pool`
2. Bảng `airdrop_pool_joins`
3. Foreign key constraints
4. Indexes cho performance

## Cấu trúc thư mục

```
src/airdrops/
├── entities/
│   ├── airdrop-list-pool.entity.ts
│   └── airdrop-pool-join.entity.ts
├── dto/
├── controllers/
├── services/
├── migrations/
│   └── 1748609023923-CreateAirdropTables.ts
├── airdrops.module.ts
└── README.md
```

## Lưu ý quan trọng

1. **Foreign Key Constraints:**
   - CASCADE: Khi xóa pool, tất cả joins sẽ bị xóa
   - RESTRICT: Không cho phép xóa wallet đang tạo pool
   - SET NULL: Không áp dụng

2. **Performance:**
   - Indexes được tạo cho tất cả foreign keys
   - Indexes cho các trường thường query: status, creation_date, stake_date

3. **Data Integrity:**
   - Foreign key constraints đảm bảo tính toàn vẹn dữ liệu
   - Enum constraints đảm bảo giá trị hợp lệ

4. **Entity Relationships:**
   - Đầy đủ bidirectional relationships
   - Có thể query theo cả hai chiều

5. **Authentication:**
   - Module sử dụng `AirdropJwtAuthGuard` thay vì `JwtAuthGuard` mặc định
   - Guard này chỉ kiểm tra JWT token và wallet tồn tại, không kiểm tra mối quan hệ phức tạp trong `wallet_auth`
   - Giải quyết vấn đề "Error validating wallet auth" khi JWT token hợp lệ nhưng không có record trong `wallet_auth`
   - Đảm bảo tính bảo mật bằng cách kiểm tra wallet status và tồn tại 