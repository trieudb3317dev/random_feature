# Traditional Referral Withdrawal API Documentation

## Tổng quan

Tài liệu này mô tả các API liên quan đến việc rút tiền hoa hồng từ hệ thống Referral truyền thống. Đây là hệ thống referral cũ, khác với hệ thống BG Affiliate. Tất cả các API này yêu cầu xác thực JWT token thông qua `JwtAuthGuard`.

## Base URL
```
GET/POST /referent
```

## Authentication
Tất cả các API yêu cầu JWT token hợp lệ được gửi trong header:
```
Authorization: Bearer <jwt_token>
```

---

## 1. Lấy thông tin phần thưởng referral

### Endpoint
```
GET /referent/rewards
```

### Mô tả
Lấy thông tin chi tiết về phần thưởng referral mà wallet hiện tại đã nhận được từ các thành viên được giới thiệu.

### Headers
```
Authorization: Bearer <jwt_token>
```

### Query Parameters
Không có

### Response

#### Success Response (200)
```json
{
  "success": true,
  "message": "Lấy thông tin phần thưởng thành công",
  "data": {
    "walletId": 456,
    "totalRewards": 1500.75,
    "rewardsCount": 25,
    "rewards": [
      {
        "wrr_id": 201,
        "wrr_ref_id": 124,
        "wrr_use_reward": 50.25,
        "wrr_created_at": "2024-01-22T11:30:00Z",
        "wrr_withdraw_status": false,
        "wrr_withdraw_id": null,
        "memberInfo": {
          "walletId": 101,
          "solanaAddress": "DEF456...",
          "nickName": "Member 1"
        }
      },
      {
        "wrr_id": 202,
        "wrr_ref_id": 125,
        "wrr_use_reward": 75.50,
        "wrr_created_at": "2024-01-26T16:45:00Z",
        "wrr_withdraw_status": false,
        "wrr_withdraw_id": null,
        "memberInfo": {
          "walletId": 102,
          "solanaAddress": "GHI789...",
          "nickName": "Member 2"
        }
      }
    ]
  }
}
```

#### Error Response (200) - Không có wallet_id
```json
{
  "success": false,
  "message": "Không tìm thấy thông tin ví trong token",
  "data": null
}
```

---

## 2. Tạo yêu cầu rút tiền referral

### Endpoint
```
POST /referent/withdraw
```

### Mô tả
Tạo yêu cầu rút tiền hoa hồng referral cho wallet hiện tại. Hệ thống sẽ tính toán số tiền có thể rút và tạo yêu cầu rút tiền.

### Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Request Body
Không cần request body (sử dụng thông tin wallet từ JWT token)

### Response

#### Success Response (200)
```json
{
  "success": true,
  "message": "Tạo yêu cầu rút tiền thành công",
  "data": {
    "withdrawId": 301,
    "amountUSD": 800.25,
    "amountSOL": 13.50
  }
}
```

#### Error Response (200) - Không đủ số dư
```json
{
  "success": false,
  "message": "Không đủ số dư để rút tiền",
  "data": null
}
```

#### Error Response (200) - Không có wallet_id
```json
{
  "success": false,
  "message": "Không tìm thấy thông tin ví trong token",
  "data": null
}
```

### Lưu ý
- API sẽ tự động tính toán số tiền có thể rút từ hệ thống referral truyền thống
- Số tiền rút sẽ được chuyển đổi từ USD sang SOL theo tỷ giá hiện tại
- Yêu cầu rút tiền sẽ được xử lý bởi admin

---

## 3. Lấy lịch sử rút tiền referral

### Endpoint
```
GET /referent/withdraw-history
```

### Mô tả
Lấy danh sách lịch sử các yêu cầu rút tiền referral của wallet hiện tại.

### Headers
```
Authorization: Bearer <jwt_token>
```

### Query Parameters
Không có

### Response

#### Success Response (200)
```json
{
  "success": true,
  "message": "Lấy lịch sử rút tiền thành công",
  "data": [
    {
      "withdrawId": 301,
      "walletId": 456,
      "amountUSD": 800.25,
      "amountSOL": 13.50,
      "status": "pending",
      "createdAt": "2024-01-28T10:30:00Z",
      "processedAt": null,
      "rewardIds": [201, 202, 203]
    },
    {
      "withdrawId": 300,
      "walletId": 456,
      "amountUSD": 500.00,
      "amountSOL": 8.45,
      "status": "completed",
      "createdAt": "2024-01-20T14:20:00Z",
      "processedAt": "2024-01-21T09:15:00Z",
      "rewardIds": [198, 199, 200]
    }
  ]
}
```

#### Error Response (200) - Không có wallet_id
```json
{
  "success": false,
  "message": "Không tìm thấy thông tin ví trong token",
  "data": null
}
```

### Trạng thái rút tiền
- `pending`: Đang chờ xử lý
- `completed`: Đã hoàn thành
- `rejected`: Đã từ chối
- `processing`: Đang xử lý

---

## 4. Lấy thông tin số tiền có thể rút referral

### Endpoint
```
GET /referent/available-withdrawal
```

### Mô tả
Lấy thông tin chi tiết về số tiền có thể rút từ hệ thống referral truyền thống.

### Headers
```
Authorization: Bearer <jwt_token>
```

### Query Parameters
Không có

### Response

#### Success Response (200)
```json
{
  "success": true,
  "message": "Lấy thông tin rút tiền khả dụng thành công",
  "data": {
    "walletId": 456,
    "totalAvailableUSD": 1200.75,
    "totalAvailableSOL": 20.25,
    "rewardsCount": 15,
    "rewards": [
      {
        "wrr_id": 201,
        "wrr_use_reward": 50.25,
        "wrr_created_at": "2024-01-22T11:30:00Z",
        "memberInfo": {
          "walletId": 101,
          "solanaAddress": "DEF456...",
          "nickName": "Member 1"
        }
      },
      {
        "wrr_id": 202,
        "wrr_use_reward": 75.50,
        "wrr_created_at": "2024-01-26T16:45:00Z",
        "memberInfo": {
          "walletId": 102,
          "solanaAddress": "GHI789...",
          "nickName": "Member 2"
        }
      }
    ],
    "walletInfo": {
      "solanaAddress": "ABC123...",
      "nickName": "My Wallet",
      "ethAddress": "0x123..."
    }
  }
}
```

#### Error Response (200) - Không có wallet_id
```json
{
  "success": false,
  "message": "Không tìm thấy thông tin ví trong token",
  "data": null
}
```

### Chi tiết dữ liệu
- `totalAvailableUSD`: Tổng số tiền có thể rút (USD)
- `totalAvailableSOL`: Tổng số tiền có thể rút (SOL)
- `rewardsCount`: Số lượng phần thưởng chưa rút
- `rewards`: Danh sách chi tiết các phần thưởng

---

## So sánh với BG Affiliate System

| Tính năng | Traditional Referral | BG Affiliate |
|-----------|---------------------|--------------|
| **Cấu trúc** | 1 cấp (referrer → referent) | Nhiều cấp (tree structure) |
| **Commission** | Cố định theo level | Linh hoạt, có thể thay đổi |
| **Authentication** | JwtAuthGuard | JwtBgAuthGuard |
| **Base URL** | `/referent` | `/bg-ref` |
| **Phạm vi** | Chỉ referral truyền thống | Cả BG affiliate + referral truyền thống |

---

## Error Codes

| Code | Mô tả |
|------|-------|
| 200 | Thành công (cả success và error cases) |
| 401 | Unauthorized - Token không hợp lệ hoặc thiếu |

## Lưu ý quan trọng

1. **Xác thực**: Tất cả API đều yêu cầu JWT token hợp lệ
2. **Wallet ID**: Wallet ID được lấy từ JWT token, không cần truyền trong request
3. **Đơn vị tiền tệ**: Hệ thống hỗ trợ cả USD và SOL
4. **Tỷ giá**: Tỷ giá USD/SOL được cập nhật theo thời gian thực
5. **Xử lý rút tiền**: Yêu cầu rút tiền sẽ được admin xử lý thủ công
6. **Phạm vi**: Chỉ xử lý phần thưởng từ hệ thống referral truyền thống
7. **Response format**: Tất cả response đều có format `{success, message, data}`

## Ví dụ sử dụng

### Lấy phần thưởng
```bash
curl -X GET http://localhost:3000/referent/rewards \
  -H "Authorization: Bearer <your_jwt_token>"
```

### Tạo yêu cầu rút tiền
```bash
curl -X POST http://localhost:3000/referent/withdraw \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json"
```

### Lấy lịch sử rút tiền
```bash
curl -X GET http://localhost:3000/referent/withdraw-history \
  -H "Authorization: Bearer <your_jwt_token>"
```

### Lấy thông tin có thể rút
```bash
curl -X GET http://localhost:3000/referent/available-withdrawal \
  -H "Authorization: Bearer <your_jwt_token>"
```

## Migration Notes

Nếu bạn đang sử dụng hệ thống referral truyền thống và muốn chuyển sang BG Affiliate:

1. **Tương thích**: Cả hai hệ thống có thể hoạt động song song
2. **Dữ liệu**: Dữ liệu referral truyền thống vẫn được giữ nguyên
3. **Rút tiền**: Có thể rút tiền từ cả hai hệ thống
4. **API**: Sử dụng endpoint tương ứng cho từng hệ thống 