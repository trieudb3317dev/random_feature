# Test Validation và Hoạt động của Filter API

## Kiểm tra Validation

### 1. Test với filterType hợp lệ
```bash
# Test filterType=all
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=all" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"

# Test filterType=created
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=created" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"

# Test filterType=joined
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=joined" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 2. Test với filterType không hợp lệ
```bash
# Test filterType=invalid
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=invalid" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"

# Expected: 400 Bad Request với validation error
```

### 3. Test không có filterType (mặc định)
```bash
# Test không có filterType
curl -X GET "http://localhost:3000/api/v1/airdrops/pools" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"

# Expected: Sử dụng filterType=all mặc định
```

## Kiểm tra Kết hợp Filter và Sorting

### 1. Test filterType=all với các sorting khác nhau
```bash
# Tất cả pools, sắp xếp theo tên tăng dần
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=all&sortBy=name&sortOrder=asc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"

# Tất cả pools, sắp xếp theo volume giảm dần
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=all&sortBy=totalVolume&sortOrder=desc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 2. Test filterType=created với các sorting khác nhau
```bash
# Pools đã tạo, sắp xếp theo ngày tạo giảm dần
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=created&sortBy=creationDate&sortOrder=desc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"

# Pools đã tạo, sắp xếp theo member count tăng dần
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=created&sortBy=memberCount&sortOrder=asc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

### 3. Test filterType=joined với các sorting khác nhau
```bash
# Pools đã tham gia, sắp xếp theo ngày kết thúc tăng dần
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=joined&sortBy=endDate&sortOrder=asc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"

# Pools đã tham gia, sắp xếp theo tên giảm dần
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=joined&sortBy=name&sortOrder=desc" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcyNTQ0NjAsIndhbGxldF9pZCI6MzI1NTEyNSwic29sX3B1YmxpY19rZXkiOiI0ZDlkNGhXcnJERGdxR2lRY3RrY3BXeXluWmhveHlqMnhhUFJpOU1TejQ0diIsImV0aF9wdWJsaWNfa2V5IjoiMHgwY2EzMGVlNDVkYzEyNEE1QThhRTA4NEI0OWNCYkRDMkNCRjcyYzAzIiwiaWF0IjoxNzUzNjcyNzQzLCJleHAiOjE3NTM3NTkxNDN9.RTlNcPe0WsYVCUOA4g7DC9RMJAfhPMcTwRpB6mF4FSo"
```

## Kiểm tra Performance và Logic

### 1. Test với user không có pool nào
```bash
# Sử dụng JWT của user khác không có pool
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=created" \
  -H "Authorization: Bearer [JWT_CỦA_USER_KHÁC]"

# Expected: Trả về array rỗng
```

### 2. Test với user không tham gia pool nào
```bash
# User không tham gia pool nào
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=joined" \
  -H "Authorization: Bearer [JWT_CỦA_USER_KHÁC]"

# Expected: Trả về array rỗng
```

### 3. Test với user có cả pool đã tạo và đã tham gia
```bash
# Test filterType=all (nên hiển thị cả 2 loại)
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=all" \
  -H "Authorization: Bearer [JWT_CỦA_USER_CÓ_CẢ_2_LOẠI]"

# Test filterType=created (chỉ hiển thị pool đã tạo)
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=created" \
  -H "Authorization: Bearer [JWT_CỦA_USER_CÓ_CẢ_2_LOẠI]"

# Test filterType=joined (chỉ hiển thị pool đã tham gia)
curl -X GET "http://localhost:3000/api/v1/airdrops/pools?filterType=joined" \
  -H "Authorization: Bearer [JWT_CỦA_USER_CÓ_CẢ_2_LOẠI]"
```

## Expected Responses

### 1. Validation Error (filterType=invalid)
```json
{
  "statusCode": 400,
  "message": [
    "filterType must be one of the following values: all, created, joined"
  ],
  "error": "Bad Request"
}
```

### 2. Success Response với Log
```json
{
  "success": true,
  "message": "Lấy danh sách pool thành công",
  "data": [...]
}
```

### 3. Empty Response
```json
{
  "success": true,
  "message": "Lấy danh sách pool thành công",
  "data": []
}
```

## Kiểm tra Logs

Trong console/logs, bạn sẽ thấy:
```
[Log] Filter: all, Sort: creationDate, Order: desc
[Log] Filter: created, Sort: name, Order: asc
[Log] Filter: joined, Sort: totalVolume, Order: desc
[Warn] Invalid filterType: invalid, falling back to ALL
```

## Test Cases Summary

| Test Case | Expected Result |
|-----------|----------------|
| filterType=all | Hiển thị tất cả pools |
| filterType=created | Chỉ hiển thị pools do user tạo |
| filterType=joined | Chỉ hiển thị pools user đã tham gia |
| filterType=invalid | 400 Bad Request với validation error |
| Không có filterType | Sử dụng mặc định 'all' |
| Kết hợp với sorting | Hoạt động đúng với mọi filter |
| User không có pool | Trả về array rỗng |
| User không tham gia pool | Trả về array rỗng cho joined filter |
| Performance | Query tối ưu với JOIN cho joined filter | 