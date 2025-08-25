# Test API Get Pools với Filter

## Endpoint
```
GET /api/v1/airdrops/pools
```

## Filter Types

### 1. Tất cả pools (mặc định)
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pools" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 2. Pools đã tạo (created)
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=created" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 3. Pools đã tham gia (joined)
```bash
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=joined" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 4. Kết hợp filter và sorting
```bash
# Pools đã tạo, sắp xếp theo volume giảm dần
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=created&sortBy=totalVolume&sortOrder=desc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"

# Pools đã tham gia, sắp xếp theo tên tăng dần
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=joined&sortBy=name&sortOrder=asc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

## Expected Responses

### Success Response (filterType=all)
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
      "userStakeInfo": {
        "isCreator": true,
        "joinStatus": "creator",
        "joinDate": "2024-01-15T10:30:00.000Z",
        "totalStaked": 6000000
      }
    },
    {
      "poolId": 2,
      "name": "Another Pool",
      "slug": "another-pool-2",
      "logo": "",
      "describe": "Pool khác",
      "memberCount": 10,
      "totalVolume": 2000000,
      "creationDate": "2024-01-16T15:30:00.000Z",
      "endDate": "2025-01-16T15:30:00.000Z",
      "status": "active",
      "userStakeInfo": {
        "isCreator": false,
        "joinStatus": "active",
        "joinDate": "2024-01-17T12:00:00.000Z",
        "totalStaked": 500000
      }
    }
  ]
}
```

### Success Response (filterType=created)
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
      "userStakeInfo": {
        "isCreator": true,
        "joinStatus": "creator",
        "joinDate": "2024-01-15T10:30:00.000Z",
        "totalStaked": 6000000
      }
    }
  ]
}
```

### Success Response (filterType=joined)
```json
{
  "success": true,
  "message": "Lấy danh sách pool thành công",
  "data": [
    {
      "poolId": 2,
      "name": "Another Pool",
      "slug": "another-pool-2",
      "logo": "",
      "describe": "Pool khác",
      "memberCount": 10,
      "totalVolume": 2000000,
      "creationDate": "2024-01-16T15:30:00.000Z",
      "endDate": "2025-01-16T15:30:00.000Z",
      "status": "active",
      "userStakeInfo": {
        "isCreator": false,
        "joinStatus": "active",
        "joinDate": "2024-01-17T12:00:00.000Z",
        "totalStaked": 500000
      }
    }
  ]
}
```

### Success Response (không có pool nào)
```json
{
  "success": true,
  "message": "Lấy danh sách pool thành công",
  "data": []
}
```

## Filter Logic

### 1. filterType=all (mặc định)
- Lấy tất cả pools có `apl_status = 'active'`
- Không có điều kiện lọc thêm

### 2. filterType=created
- Lấy pools có `apl_status = 'active'` VÀ `alp_originator = wallet_id`
- Chỉ hiển thị pools do user tạo

### 3. filterType=joined
- Lấy pools có `apl_status = 'active'` VÀ có record trong `airdrop_pool_joins` với `apj_member = wallet_id` VÀ `apj_status = 'active'`
- Chỉ hiển thị pools mà user đã tham gia (không phải creator)

## Test Scenarios

1. **filterType=all**: ✅ Hiển thị tất cả pools
2. **filterType=created**: ✅ Chỉ hiển thị pools do user tạo
3. **filterType=joined**: ✅ Chỉ hiển thị pools user đã tham gia
4. **Kết hợp với sorting**: ✅ Hoạt động đúng với mọi filter
5. **User không có pool nào**: ✅ Trả về array rỗng
6. **User không tham gia pool nào**: ✅ Trả về array rỗng cho joined filter
7. **Invalid filterType**: ❌ Trả về lỗi validation

## Query Parameters Summary

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| filterType | string | No | 'all' | Bộ lọc loại pool |
| sortBy | string | No | 'creationDate' | Trường sắp xếp |
| sortOrder | string | No | 'desc' | Thứ tự sắp xếp |

## Filter Types

| Value | Description |
|-------|-------------|
| all | Tất cả pools (mặc định) |
| created | Chỉ pools do user tạo |
| joined | Chỉ pools user đã tham gia | 