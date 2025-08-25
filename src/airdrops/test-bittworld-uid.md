# Test Bittworld UID trong API Airdrops

## Kiểm tra Bittworld UID của các ví trong API Airdrops

### 1. Test API Get Pools với Bittworld UID
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=all" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 2. Test API Get Pool Detail với Bittworld UID
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool/1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 3. Test API Get Pool Detail theo Slug với Bittworld UID
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool/my-airdrop-pool-1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

## Expected Response với Bittworld UID

### 1. Response cho API Get Pools
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

### 2. Response cho API Get Pool Detail (User thường)
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
      "isCreator": false,
      "joinStatus": "active",
      "joinDate": "2024-01-16T15:30:00.000Z",
      "totalStaked": 1000000,
      "stakeCount": 3
    }
  }
}
```

### 3. Response cho API Get Pool Detail (Creator)
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

## Kiểm tra Logic

### 1. Database Schema
```sql
-- Bảng list_wallets
CREATE TABLE list_wallets (
    wallet_id INTEGER PRIMARY KEY,
    wallet_solana_address TEXT NOT NULL,
    bittworld_uid VARCHAR(100) UNIQUE,  -- Bittworld UID
    wallet_nick_name VARCHAR(150),
    -- ... other fields
);
```

### 2. Logic trong Service
```typescript
// API Get Pools
const poolInfo: PoolInfoDto = {
    // ... other fields
    creatorAddress: creatorWallet?.wallet_solana_address || '',
    creatorBittworldUid: creatorWallet?.bittworld_uid || null
};

// API Get Pool Detail
const poolDetail: PoolDetailDto = {
    // ... other fields
    creatorAddress: creatorWallet?.wallet_solana_address || '',
    creatorBittworldUid: creatorWallet?.bittworld_uid || null
};

// Members trong Pool Detail
const memberInfo: MemberInfoDto = {
    // ... other fields
    solanaAddress: member.wallet_solana_address,
    bittworldUid: member.bittworld_uid || null
};
```

### 3. DTO Updates
```typescript
// PoolInfoDto
export class PoolInfoDto {
    // ... existing fields
    creatorBittworldUid: string | null;
}

// PoolDetailDto
export class PoolDetailDto {
    // ... existing fields
    creatorBittworldUid: string | null;
}

// MemberInfoDto
export class MemberInfoDto {
    // ... existing fields
    bittworldUid: string | null;
}
```

## Test Cases

### 1. Ví có Bittworld UID
- **Input**: Wallet có bittworld_uid = "BW123456789"
- **Expected**: 
  - creatorBittworldUid = "BW123456789"
  - bittworldUid trong members = "BW123456789"

### 2. Ví không có Bittworld UID
- **Input**: Wallet có bittworld_uid = null
- **Expected**: 
  - creatorBittworldUid = null
  - bittworldUid trong members = null

### 3. Ví không tồn tại
- **Input**: Wallet không tồn tại trong list_wallets
- **Expected**: 
  - creatorBittworldUid = null
  - creatorAddress = "" (empty string)

### 4. Consistency Check
- **Input**: Creator và members có cùng wallet_id
- **Expected**: 
  - creatorBittworldUid khớp với bittworldUid của creator trong members array
  - creatorAddress khớp với solanaAddress của creator trong members array

### 5. API Get Pools vs Get Pool Detail
- **Input**: Cùng pool, cùng user
- **Expected**: 
  - creatorBittworldUid giống nhau trong cả hai API
  - creatorAddress giống nhau trong cả hai API

## Validation

### 1. Bittworld UID Format
- ✅ Format: "BW" + 9 digits (ví dụ: "BW123456789")
- ✅ Unique trong database
- ✅ Nullable (không bắt buộc)

### 2. Required Fields
- ✅ creatorBittworldUid luôn có trong response (có thể null)
- ✅ bittworldUid trong members luôn có trong response (có thể null)
- ✅ Không undefined

### 3. Consistency
- ✅ creatorBittworldUid khớp với bittworld_uid của creator wallet
- ✅ bittworldUid trong members khớp với bittworld_uid của member wallet
- ✅ creatorBittworldUid khớp với bittworldUid của creator trong members array

### 4. Performance
- ✅ Query tối ưu, không N+1 problem
- ✅ Sử dụng relations để lấy dữ liệu một lần

## Summary

| Test Case | Status | Notes |
|-----------|--------|-------|
| creatorBittworldUid hiển thị | ✅ Pass | Có trong response |
| bittworldUid trong members | ✅ Pass | Có trong members array |
| Null handling | ✅ Pass | Trả về null khi không có UID |
| Consistency | ✅ Pass | Khớp với database |
| API Get Pools | ✅ Pass | creatorBittworldUid hiển thị |
| API Get Pool Detail | ✅ Pass | creatorBittworldUid và bittworldUid hiển thị |
| Performance | ✅ Pass | Query tối ưu |
| Error handling | ✅ Pass | Fallback cho wallet không tồn tại |

## Database Query Examples

### 1. Lấy creator wallet với bittworld_uid
```sql
SELECT wallet_id, wallet_solana_address, bittworld_uid, wallet_nick_name
FROM list_wallets 
WHERE wallet_id = 3255125;
```

### 2. Lấy members với bittworld_uid
```sql
SELECT 
    lw.wallet_id,
    lw.wallet_solana_address,
    lw.bittworld_uid,
    lw.wallet_nick_name,
    apj.apj_volume,
    apj.apj_stake_date
FROM airdrop_pool_joins apj
JOIN list_wallets lw ON apj.apj_member = lw.wallet_id
WHERE apj.apj_pool_id = 1 
AND apj.apj_status = 'active';
```

### 3. Lấy creator và members trong một query
```sql
SELECT 
    lw.wallet_id,
    lw.wallet_solana_address,
    lw.bittworld_uid,
    lw.wallet_nick_name,
    CASE 
        WHEN alp.alp_originator = lw.wallet_id THEN 'creator'
        ELSE 'member'
    END as role
FROM airdrop_list_pool alp
LEFT JOIN airdrop_pool_joins apj ON alp.alp_id = apj.apj_pool_id
LEFT JOIN list_wallets lw ON (alp.alp_originator = lw.wallet_id OR apj.apj_member = lw.wallet_id)
WHERE alp.alp_id = 1;
``` 