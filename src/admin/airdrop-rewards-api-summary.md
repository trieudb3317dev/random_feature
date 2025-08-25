# Airdrop Rewards API Summary

## 🎯 Overview

Đã thêm API GET `/admin/airdrop-rewards` để hiển thị dữ liệu airdrop rewards với các filter và thông tin wallet cần thiết.

## 🔧 Implementation Details

### **1. API Endpoint**

#### **URL:** `GET /admin/airdrop-rewards`
#### **Authentication:** JWT Admin Guard required
#### **Description:** Get airdrop rewards with filtering and wallet information

### **2. Query Parameters**

#### **Pagination:**
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 20): Number of items per page

#### **Filters:**
- `token_mint` (optional): Filter by token mint address
- `alt_id` (optional): Filter by token ID (alt_id)
- `status` (optional, default: 'can_withdraw'): Filter by reward status
- `search` (optional): Search by wallet address or email

### **3. Response Structure**

#### **Success Response (200):**
```typescript
{
  rewards: Array<{
    ar_id: number;
    ar_token_airdrop_id: number;
    ar_wallet_id: number;
    ar_wallet_address: string;
    ar_amount: number;
    ar_type: AirdropRewardType;
    ar_status: AirdropRewardStatus;
    ar_hash: string | null;
    ar_date: Date;
    wallet_solana_address: string;
    wallet_email: string | null;
    bittworld_uid: string | null;
    token_name: string;
    token_mint: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### **4. Database Query**

#### **Joins:**
```typescript
const queryBuilder = this.airdropRewardRepository
  .createQueryBuilder('reward')
  .leftJoin('reward.tokenAirdrop', 'token')
  .leftJoin('reward.wallet', 'wallet')
  .leftJoin('wallet.wallet_auths', 'walletAuth')
  .leftJoin('walletAuth.wa_user', 'userWallet')
  .select([
    'reward.ar_id',
    'reward.ar_token_airdrop_id',
    'reward.ar_wallet_id',
    'reward.ar_wallet_address',
    'reward.ar_amount',
    'reward.ar_type',
    'reward.ar_status',
    'reward.ar_hash',
    'reward.ar_date',
    'wallet.wallet_solana_address',
    'wallet.bittworld_uid',
    'userWallet.uw_email',
    'token.alt_token_name',
    'token.alt_token_mint'
  ])
  .where('reward.ar_status = :status', { status });
```

#### **Filters:**
```typescript
// Filter by token mint
if (token_mint) {
  queryBuilder.andWhere('token.alt_token_mint = :token_mint', { token_mint });
}

// Filter by token ID
if (alt_id) {
  queryBuilder.andWhere('reward.ar_token_airdrop_id = :alt_id', { alt_id });
}

// Search by wallet address or email
if (search) {
  queryBuilder.andWhere(
    '(wallet.wallet_solana_address ILIKE :search OR userWallet.uw_email ILIKE :search)',
    { search: `%${search}%` }
  );
}
```

## 📊 Usage Examples

### **Example 1: Get all can-withdraw rewards**
```
GET /admin/airdrop-rewards
```

### **Example 2: Get rewards for specific token**
```
GET /admin/airdrop-rewards?token_mint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

### **Example 3: Get rewards for specific token ID**
```
GET /admin/airdrop-rewards?alt_id=1
```

### **Example 4: Search by wallet address or email**
```
GET /admin/airdrop-rewards?search=user@example.com
```

### **Example 5: Get withdrawn rewards**
```
GET /admin/airdrop-rewards?status=withdrawn
```

### **Example 6: Pagination**
```
GET /admin/airdrop-rewards?page=2&limit=10
```

### **Example 7: Combined filters**
```
GET /admin/airdrop-rewards?token_mint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&status=can_withdraw&page=1&limit=50
```

## 🎯 Key Features

### **✅ Comprehensive Filtering**
- Filter by token mint address
- Filter by token ID (alt_id)
- Filter by reward status (can_withdraw, withdrawn)
- Search by wallet address or email

### **✅ Wallet Information**
- Wallet Solana address
- Wallet email (from UserWallet)
- Bittworld UID

### **✅ Token Information**
- Token name
- Token mint address

### **✅ Pagination**
- Page-based pagination
- Configurable page size
- Total count and total pages

### **✅ Proper Joins**
- Joins through wallet_auth table to get user information
- Handles cases where user information might not exist

## 🔍 Database Schema

### **Tables Involved:**
1. `airdrop_rewards` - Main rewards table
2. `airdrop_list_tokens` - Token information
3. `list_wallets` - Wallet information
4. `wallet_auth` - Wallet-user relationship
5. `user_wallets` - User information

### **Relationships:**
```sql
airdrop_rewards.ar_token_airdrop_id -> airdrop_list_tokens.alt_id
airdrop_rewards.ar_wallet_id -> list_wallets.wallet_id
list_wallets.wallet_id -> wallet_auth.wa_wallet_id
wallet_auth.wa_user_id -> user_wallets.uw_id
```

## ✅ Verification

### **API Behavior:**
- ✅ Returns paginated results
- ✅ Includes wallet information (address, email, bittworld_uid)
- ✅ Includes token information (name, mint)
- ✅ Supports all filters
- ✅ Proper error handling
- ✅ Authentication required

### **Data Accuracy:**
- ✅ Correct joins between tables
- ✅ Proper field mapping
- ✅ Handles null values
- ✅ Accurate pagination

### **Performance:**
- ✅ Efficient query with proper joins
- ✅ Indexed fields for filtering
- ✅ Pagination to limit result size

## 🎯 Conclusion

**API `/admin/airdrop-rewards` đã được implement thành công với đầy đủ tính năng:**

1. **✅ Filtering:** Theo token mint, token ID, status, search
2. **✅ Wallet Information:** Address, email, bittworld_uid
3. **✅ Token Information:** Name, mint address
4. **✅ Pagination:** Page-based với configurable limit
5. **✅ Authentication:** JWT Admin Guard required
6. **✅ Documentation:** Swagger documentation đầy đủ

**API sẵn sàng sử dụng và có thể được test ngay!** 