# Test Instructions for Airdrop Leaderboard Email API

## Prerequisites
1. Đảm bảo server đang chạy
2. Có JWT admin token hợp lệ
3. Cấu hình SMTP trong .env file

## Test Steps

### 1. Kiểm tra cấu hình SMTP
Đảm bảo các biến môi trường sau được cấu hình trong `.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_NOTIFY=khanh382@gmail.com
```

### 2. Lấy Admin JWT Token
```bash
# Login để lấy token
curl -X POST http://localhost:8000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }'
```

### 3. Test API Endpoint
```bash
# Gửi request với JWT token
curl -X POST http://localhost:8000/api/v1/admin/airdrop-pools/send-mail-leaderboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### 4. Kiểm tra Response
Response thành công sẽ có dạng:
```json
{
  "success": true,
  "message": "Leaderboard email sent successfully",
  "emailSent": true,
  "recipients": ["khanh382@gmail.com"],
  "vip5Count": 6,
  "vip6Count": 5,
  "vip7Count": 2
}
```

### 5. Kiểm tra Email
- Kiểm tra inbox của `khanh382@gmail.com`
- Email sẽ có subject: "Airdrop Pools Leaderboard Report"
- Nội dung email sẽ có bảng VIP5, VIP6, VIP7

## Troubleshooting

### Lỗi SMTP Configuration
```
{
  "success": false,
  "message": "Failed to send leaderboard email: SMTP configuration is missing",
  "emailSent": false
}
```
**Giải pháp**: Kiểm tra lại các biến môi trường SMTP

### Lỗi Unauthorized
```
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```
**Giải pháp**: Kiểm tra JWT token có hợp lệ không

### Lỗi Internal Server Error
```
{
  "success": false,
  "message": "Failed to send leaderboard email: [specific error]",
  "emailSent": false
}
```
**Giải pháp**: Kiểm tra logs server để xem lỗi cụ thể

## Expected Email Content

Email sẽ có cấu trúc HTML với:
1. Header với tiêu đề và thời gian
2. Bảng tóm tắt số lượng users mỗi VIP level
3. Bảng chi tiết VIP5 (10M-19.9M BITT)
4. Bảng chi tiết VIP6 (20M-29.9M BITT)  
5. Bảng chi tiết VIP7 (30M+ BITT)
6. Footer với thông tin tự động

## Performance Notes
- API có thể mất vài giây để xử lý do cần query nhiều bảng
- Email được gửi bất đồng bộ
- Giới hạn 100 users mỗi VIP level để tránh email quá dài
