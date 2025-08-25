# Test API Get Pool Detail Transactions

## Endpoint
```
GET /api/v1/airdrops/pool-detail/:idOrSlug
```

## Description
API này trả về thông tin chi tiết của pool kèm theo danh sách tất cả các transaction (thay vì thống kê tổng hợp như API `/pool/:id`).

## Test Cases

### 1. Tìm pool theo ID
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool-detail/1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 2. Tìm pool theo Slug
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool-detail/my-airdrop-pool-1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 3. Sắp xếp theo ngày transaction (mặc định)
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool-detail/1?sortBy=transactionDate&sortOrder=desc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 4. Sắp xếp theo số lượng stake
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool-detail/1?sortBy=stakeAmount&sortOrder=desc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 5. Sắp xếp theo ID member
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool-detail/1?sortBy=memberId&sortOrder=asc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 6. Sắp xếp theo trạng thái
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool-detail/1?sortBy=status&sortOrder=asc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

## Expected Responses

### Success Response
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
      "isCreator": false,
      "joinStatus": "active",
      "joinDate": "2024-01-16T15:30:00.000Z",
      "totalStaked": 1000000,
      "stakeCount": 3
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

### Error Response - Pool Not Found
```json
{
  "statusCode": 400,
  "message": "Pool does not exist",
  "error": "Bad Request"
}
```

### Error Response - Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

## Query Parameters

### sortBy
- `transactionDate` (default): Sắp xếp theo ngày thực hiện transaction
- `stakeAmount`: Sắp xếp theo số lượng token stake
- `memberId`: Sắp xếp theo ID của member
- `status`: Sắp xếp theo trạng thái transaction

### sortOrder
- `asc`: Tăng dần
- `desc`: Giảm dần (default)

## Business Logic

### 1. Tìm pool theo ID hoặc slug
- Kiểm tra xem `idOrSlug` có phải là số không
- Nếu là số: Tìm theo `alp_id`
- Nếu không phải số: Tìm theo `alp_slug`

### 2. Lấy thông tin pool cơ bản
- Thông tin pool (name, slug, logo, describe, etc.)
- Thông tin creator (address, bittworld_uid)
- Thông tin stake của user hiện tại (nếu có)

### 3. Lấy danh sách transactions
- **Creator's initial transaction**: Transaction đầu tiên khi tạo pool (transactionId = 0)
- **Member transactions**: Tất cả các transaction stake từ bảng `airdrop_pool_joins`
- Mỗi transaction bao gồm:
  - `transactionId`: ID của transaction (0 cho creator, apj_id cho members)
  - `memberId`: ID của member thực hiện
  - `solanaAddress`: Địa chỉ Solana
  - `bittworldUid`: Bittworld UID
  - `nickname`: Tên hiển thị
  - `isCreator`: Có phải creator không
  - `stakeAmount`: Số lượng token stake trong transaction này
  - `transactionDate`: Ngày thực hiện transaction
  - `status`: Trạng thái transaction
  - `transactionHash`: Hash của transaction trên blockchain

### 4. Sắp xếp transactions
- Theo trường được chọn trong `sortBy`
- Theo thứ tự được chọn trong `sortOrder`

## So sánh với API `/pool/:id`

| Feature | `/pool/:id` | `/pool-detail/:id` |
|---------|-------------|-------------------|
| **Data Type** | Aggregated member data | Individual transactions |
| **Creator Info** | Tổng hợp trong members list | Transaction riêng biệt |
| **Member Data** | Tổng stake amount, stake count | Từng transaction riêng lẻ |
| **Transaction Hash** | Không hiển thị | Hiển thị cho từng transaction |
| **Use Case** | Overview, summary | Detailed analysis, audit |

## Test Scenarios

### Scenario 1: Pool với nhiều transactions
- Creator stake 5,000,000 token (initial)
- User A stake 3 lần: 500,000, 300,000, 200,000
- User B stake 2 lần: 1,000,000, 500,000
- **Expected**: 6 transactions trong danh sách

### Scenario 2: Sắp xếp theo stakeAmount DESC
- **Expected**: Creator transaction (5,000,000) ở đầu, sau đó User B (1,000,000), User A (500,000), etc.

### Scenario 3: Sắp xếp theo transactionDate ASC
- **Expected**: Creator transaction (creation date) ở đầu, sau đó theo thứ tự thời gian

### Scenario 4: Pool không tồn tại
- **Expected**: Error "Pool does not exist"

### Scenario 5: User không có quyền truy cập
- **Expected**: Error "Unauthorized" 