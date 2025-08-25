# Test API Get Pool Detail

## Endpoint
```
GET /api/v1/airdrops/pool/:idOrSlug
```

## Test Cases

### 1. Tìm pool theo ID
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool/1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 2. Tìm pool theo Slug
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool/my-airdrop-pool-1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 3. Tìm pool với sorting
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pool/1?sortBy=totalStaked&sortOrder=desc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

## Expected Responses

### Success Response (User thường)
```json
{
  "success": true,
  "message": "Lấy thông tin pool thành công",
  "data": {
    "poolId": 1,
    "name": "My Airdrop Pool",
    "slug": "my-airdrop-pool-1",
    "logo": "",
    "describe": "Mô tả chi tiết về pool",
    "memberCount": 25,
    "totalVolume": 5000000,
    "creationDate": "2024-01-15T10:30:00.000Z",
    "endDate": "2025-01-15T10:30:00.000Z",
    "status": "active",
    "transactionHash": "5J7X...abc123",
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

### Success Response (Creator)
```json
{
  "success": true,
  "message": "Lấy thông tin pool thành công",
  "data": {
    "poolId": 1,
    "name": "My Airdrop Pool",
    "slug": "my-airdrop-pool-1",
    "logo": "",
    "describe": "Mô tả chi tiết về pool",
    "memberCount": 25,
    "totalVolume": 5000000,
    "creationDate": "2024-01-15T10:30:00.000Z",
    "endDate": "2025-01-15T10:30:00.000Z",
    "status": "active",
    "transactionHash": "5J7X...abc123",
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
        "solanaAddress": "9K8Y...abc123",
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

### Error Response (Pool không tồn tại)
```json
{
  "success": false,
  "message": "Pool không tồn tại",
  "error": "Bad Request",
  "statusCode": 400
}
```

### Error Response (Unauthorized)
```json
{
  "message": "Error validating wallet auth",
  "error": "Unauthorized",
  "statusCode": 401
}
```

## Test Scenarios

1. **Pool tồn tại theo ID**: ✅
2. **Pool tồn tại theo Slug**: ✅
3. **Pool không tồn tại**: ❌
4. **User là creator**: ✅ (có members list)
5. **User không phải creator**: ✅ (không có members list)
6. **User đã stake**: ✅ (có userStakeInfo)
7. **User chưa stake**: ✅ (không có userStakeInfo)
8. **Với sorting**: ✅
9. **JWT token không hợp lệ**: ❌ 