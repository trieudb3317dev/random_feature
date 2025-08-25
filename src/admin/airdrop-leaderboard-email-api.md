# Airdrop Pools Leaderboard Email API

## Endpoint
```
POST /api/v1/admin/airdrop-pools/send-mail-leaderboard
```

## Description
API này tự động gửi email báo cáo leaderboard của airdrop pools đến địa chỉ email được cấu hình trong biến môi trường `EMAIL_NOTIFY`.

## Authentication
- **Required**: JWT Admin Token
- **Guard**: `JwtAuthAdminGuard`

## Request
- **Method**: POST
- **Body**: Không cần body

## Response

### Success Response (200)
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

### Error Response (401)
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### Error Response (500)
```json
{
  "success": false,
  "message": "Failed to send leaderboard email: SMTP configuration is missing",
  "emailSent": false,
  "recipients": [],
  "vip5Count": 0,
  "vip6Count": 0,
  "vip7Count": 0
}
```

## Business Logic

### VIP Level Classification
1. **VIP5**: Users với staked volume từ 10,000,000 đến 19,999,999 BITT
2. **VIP6**: Users với staked volume từ 20,000,000 đến 29,999,999 BITT  
3. **VIP7**: Users với staked volume từ 30,000,000+ BITT

### Email Content Structure
Email sẽ có cấu trúc như sau:

#### VIP5 에 있는 사람들 정보
| 순위 | Bittworld UID | 닉네임 | BITT 스테이킹 수량 |
|------|---------------|--------|-------------------|
| 1.   | 373085        | 희망   | 13,000,000       |
| 2.   | 373056        | 권태석 | 10,766,888       |
| 3.   | 803754        | 정성순 | 10,320,000       |
| 4.   | 802577        | 김재희 | 10,269,185       |
| 5.   | 801140        | 장미례 | 10,252,949       |
| 6.   | 802059        | 배롱나무 | 10,231,349   |

#### VIP6 에 있는 사람들 정보
| 순위 | Bittworld UID | 이름 | BITT 스테이킹 수량 |
|------|---------------|------|-------------------|
| 1.   | 111120        | user15 | 29,500,000       |
| 2.   | 373059        | lar8890 | 27,700,000     |
| 3.   | 373049        | 이경석 | 21,000,000       |
| 4.   | 373055        | 금정자 | 20,198,000       |

#### VIP7 에 있는 사람들 정보
| 순위 | Bittworld UID | 이름 | BITT 스테이킹 수량 |
|------|---------------|------|-------------------|
| 1.   | 373050        | ohsesoon | 100,000,000      |
| 2.   | 373064        | 다비강 | 30,000,000        |

## Environment Variables Required
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_NOTIFY=khanh382@gmail.com
```

## Data Source
API sử dụng dữ liệu từ:
- `airdrop_list_pools` - Thông tin pools
- `airdrop_pool_joins` - Thông tin stake của users
- `list_wallets` - Thông tin wallets

## Notes
- API chỉ lấy dữ liệu từ các pools có status = 'active'
- Chỉ lấy các stake records có status = 'active'
- Email được gửi với format HTML đẹp mắt
- Số lượng users mỗi VIP level được giới hạn tối đa 100 để tránh email quá dài
- Thời gian tạo email được hiển thị theo múi giờ Hàn Quốc (ko-KR)
