# Test English Messages trong API Airdrops

## Kiểm tra các message và error bằng tiếng Anh

### 1. Test API Create Pool với English Messages
```bash
curl -X POST "http://localhost:3000/api/v1/airdrops/create-pool" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Pool",
    "describe": "Test description",
    "initialAmount": 1000000
  }'
```

### 2. Test API Stake Pool với English Messages
```bash
curl -X POST "http://localhost:3000/api/v1/airdrops/stake-pool" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo" \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": 1,
    "stakeAmount": 500000
  }'
```

### 3. Test API Get Pools với English Messages
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=all" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 4. Test API Get Pool Detail với English Messages
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool/1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

## Expected Response với English Messages

### 1. API Create Pool Success Response
```json
{
  "success": true,
  "message": "Pool created successfully",
  "data": {
    "poolId": 1,
    "name": "Test Pool",
    "slug": "test-pool-1",
    "logo": "https://res.cloudinary.com/.../logo.jpg",
    "status": "active",
    "initialAmount": 1000000,
    "transactionHash": "5J7X...abc123"
  }
}
```

### 2. API Create Pool Error Response (Invalid Amount)
```json
{
  "statusCode": 400,
  "message": [
    "Initial amount must be at least 1,000,000"
  ],
  "error": "Bad Request"
}
```

### 3. API Create Pool Error Response (Invalid Logo URL)
```json
{
  "statusCode": 400,
  "message": [
    "Logo must be a valid URL"
  ],
  "error": "Bad Request"
}
```

### 4. API Create Pool Error Response (Wallet ID not found)
```json
{
  "statusCode": 500,
  "message": "Wallet ID not found in token",
  "error": "Internal Server Error"
}
```

### 5. API Get Pools Success Response
```json
{
  "success": true,
  "message": "Get pools list successfully",
  "data": [
    {
      "poolId": 1,
      "name": "Test Pool",
      "slug": "test-pool-1",
      "logo": "https://example.com/logo.png",
      "describe": "Test description",
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

### 6. API Get Pool Detail Success Response
```json
{
  "success": true,
  "message": "Get pool details successfully",
  "data": {
    "poolId": 1,
    "name": "Test Pool",
    "slug": "test-pool-1",
    "logo": "https://example.com/logo.png",
    "describe": "Test description",
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
      }
    ]
  }
}
```

## Swagger Documentation Updates

### 1. API Operation Summaries
- ✅ `Create new airdrop pool` (thay vì "Tạo airdrop pool mới")
- ✅ `Stake into airdrop pool` (thay vì "Stake vào airdrop pool")
- ✅ `Get airdrop pools list` (thay vì "Lấy danh sách airdrop pools")
- ✅ `Get airdrop pool details` (thay vì "Lấy thông tin chi tiết airdrop pool")

### 2. API Descriptions
- ✅ `Create a new airdrop pool with token X. Supports logo file upload or URL. Requires minimum 1,000,000 token X.`
- ✅ `Stake token X into an existing airdrop pool. Can stake multiple times.`
- ✅ `Get list of airdrop pools with filtering and sorting. Supports filtering by: all pools, created pools, joined pools.`
- ✅ `Get detailed information of an airdrop pool by ID or slug. If user is creator, will show additional members list.`

### 3. API Response Descriptions
- ✅ `Pool created successfully`
- ✅ `Stake pool successfully`
- ✅ `Get pools list successfully`
- ✅ `Get pool details successfully`
- ✅ `Invalid data or insufficient balance`
- ✅ `Invalid data, pool not found, or insufficient balance`
- ✅ `Pool not found`
- ✅ `Unauthorized access`
- ✅ `Server error`

### 4. DTO Field Descriptions
- ✅ `Name of the airdrop pool`
- ✅ `Logo URL of the pool (supports URL or file upload)`
- ✅ `Detailed description of the pool`
- ✅ `Amount of token X to initialize pool (minimum 1,000,000)`
- ✅ `ID of the pool to stake`
- ✅ `Amount of tokens to stake in the pool`
- ✅ `Pool filter type`
- ✅ `Field to sort pools list`
- ✅ `Sort order`
- ✅ `Field to sort members list`

## Validation Messages

### 1. Create Pool Validation
- ✅ `Initial amount must be at least 1,000,000` (thay vì "Số lượng khởi tạo phải tối thiểu là 1,000,000")
- ✅ `Logo must be a valid URL` (thay vì "Logo phải là URL hợp lệ")

### 2. Error Messages
- ✅ `Wallet ID not found in token` (thay vì "Không tìm thấy wallet_id trong token")

## Test Cases

### 1. Success Messages
- **Input**: Valid create pool request
- **Expected**: `"message": "Pool created successfully"`

- **Input**: Valid stake pool request
- **Expected**: `"message": "Stake pool successfully"`

- **Input**: Valid get pools request
- **Expected**: `"message": "Get pools list successfully"`

- **Input**: Valid get pool detail request
- **Expected**: `"message": "Get pool details successfully"`

### 2. Validation Error Messages
- **Input**: initialAmount < 1,000,000
- **Expected**: `"Initial amount must be at least 1,000,000"`

- **Input**: Invalid logo URL
- **Expected**: `"Logo must be a valid URL"`

### 3. System Error Messages
- **Input**: Missing wallet_id in token
- **Expected**: `"Wallet ID not found in token"`

### 4. Swagger Documentation
- **Input**: Access Swagger UI
- **Expected**: All descriptions in English

## Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Controller Messages | ✅ Pass | All success/error messages in English |
| Swagger Documentation | ✅ Pass | All descriptions in English |
| Validation Messages | ✅ Pass | All validation errors in English |
| DTO Descriptions | ✅ Pass | All field descriptions in English |
| API Operations | ✅ Pass | All operation summaries in English |
| Error Handling | ✅ Pass | All error messages in English |

## Files Updated

### 1. Controller
- `src/airdrops/controllers/airdrops.controller.ts`
  - API operation summaries
  - API descriptions
  - Response descriptions
  - Error messages

### 2. DTOs
- `src/airdrops/dto/create-pool.dto.ts`
- `src/airdrops/dto/join-pool.dto.ts`
- `src/airdrops/dto/get-pools.dto.ts`
- `src/airdrops/dto/get-pool-detail.dto.ts`
- `src/airdrops/dto/create-pool-response.dto.ts`
- `src/airdrops/dto/join-pool-response.dto.ts`
- `src/airdrops/dto/get-pools-response.dto.ts`
- `src/airdrops/dto/get-pool-detail-response.dto.ts`

### 3. Validation Messages
- All validation decorators now use English messages
- Error handling uses English messages
- Swagger documentation fully in English 