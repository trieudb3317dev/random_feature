# Summary: BG Affiliate Module

## 🎯 Mục tiêu
Tạo module BG affiliate riêng biệt với hệ thống authentication độc lập, sử dụng JWT tokens với HTTP-only cookies và kiểm tra nghiêm ngặt về wallet main và BG affiliate membership.

## 📁 Files đã tạo/cập nhật

### 1. **Guards & Strategies**
- `src/referral/guards/jwt-bg-auth.guard.ts` - JWT Guard mới cho BG affiliate
- `src/referral/strategies/jwt-bg.strategy.ts` - JWT Strategy mới

### 2. **Services**
- `src/referral/bg-auth.service.ts` - Service xử lý authentication cho BG affiliate

### 3. **Controllers**
- `src/referral/bg-ref.controller.ts` - Cập nhật với API mới và JwtBgAuthGuard

### 4. **Modules**
- `src/referral/bg-ref.module.ts` - Module mới cho BG affiliate
- `src/app.module.ts` - Thêm BgRefModule

## 🔐 Authentication Flow

### **Login Process:**

#### **Telegram Login:**
1. User gửi `telegram_id` và `code` đến `/api/v1/bg-ref/connect-telegram`
2. Verify wallet sử dụng logic từ `TelegramWalletsService`
3. **Kiểm tra wallet là main wallet** (wa_type = 'main')
4. **Kiểm tra wallet thuộc BG affiliate system**
5. Tạo JWT tokens:
   - `bg_access_token`: 15 phút
   - `bg_refresh_token`: 7 ngày
6. Set HTTP-only cookies với security flags

#### **Email Login:**
1. User gửi `code` đến `/api/v1/bg-ref/login-email`
2. Verify email code sử dụng logic từ `TelegramWalletsService`
3. **Kiểm tra wallet là main wallet** (wa_type = 'main')
4. **Kiểm tra wallet thuộc BG affiliate system**
5. Tạo JWT tokens:
   - `bg_access_token`: 15 phút
   - `bg_refresh_token`: 7 ngày
6. Set HTTP-only cookies với security flags

### **API Protection:**
Tất cả API trong module sử dụng `JwtBgAuthGuard` với validation:
- ✅ Token hợp lệ
- ✅ Wallet ID tồn tại trong payload
- ✅ Wallet là main wallet
- ✅ Wallet thuộc BG affiliate system

## 🚀 APIs

### **Public APIs:**
- `POST /api/v1/bg-ref/connect-telegram` - Login BG affiliate bằng Telegram
- `POST /api/v1/bg-ref/login-email` - Login BG affiliate bằng Email
- `POST /api/v1/bg-ref/refresh-token` - Refresh access token
- `POST /api/v1/bg-ref/logout` - Logout

### **Protected APIs (JwtBgAuthGuard):**
- `PUT /api/v1/bg-ref/nodes/commission` - Cập nhật commission
- `GET /api/v1/bg-ref/commission-history` - Lịch sử hoa hồng
- `GET /api/v1/bg-ref/bg-affiliate-status/:targetWalletId` - Kiểm tra status
- `GET /api/v1/bg-ref/my-bg-affiliate-status` - Status của wallet hiện tại
- `GET /api/v1/bg-ref/bg-affiliate-stats` - Thống kê BG affiliate
- `GET /api/v1/bg-ref/trees` - Cây affiliate
- `GET /api/v1/bg-ref/downline-stats` - Thống kê downline

## 🔒 Security Features

### **Cookie Security:**
- **HTTP-only**: Tokens không thể truy cập qua JavaScript
- **Secure**: Chỉ gửi qua HTTPS trong production
- **SameSite**: Ngăn CSRF attacks
- **Short-lived access tokens**: 15 phút
- **Long-lived refresh tokens**: 7 ngày

### **Validation Layers:**
1. **Token Validation**: JWT signature và expiration
2. **Wallet Validation**: Kiểm tra wallet tồn tại
3. **Main Wallet Check**: Chỉ cho phép wallet main
4. **BG Affiliate Check**: Chỉ cho phép wallet trong BG system

## 🔄 Token Management

### **Access Token:**
- Thời gian sống: 15 phút
- Sử dụng cho tất cả API calls
- Lưu trong cookie `bg_access_token`

### **Refresh Token:**
- Thời gian sống: 7 ngày
- Sử dụng để tạo access token mới
- Lưu trong cookie `bg_refresh_token`

### **Token Extraction:**
Guard ưu tiên lấy token từ:
1. `Authorization: Bearer <token>` header
2. `bg_access_token` cookie (fallback)

## 🧪 Testing

### **Test Cases:**
1. ✅ Login thành công với wallet main + BG affiliate
2. ❌ Login thất bại với wallet không phải main
3. ❌ Login thất bại với wallet không thuộc BG affiliate
4. ✅ Access protected API với valid token
5. ❌ Access thất bại với invalid token

### **Error Handling:**
- `400 Bad Request`: Wallet không thỏa mãn điều kiện
- `401 Unauthorized`: Token không hợp lệ hoặc thiếu
- `401 Unauthorized`: Wallet không phải main wallet
- `401 Unauthorized`: Wallet không thuộc BG affiliate system

## 🔧 Integration

### **Dependencies:**
- `TelegramWalletsService`: Verify wallet logic
- `BgRefService`: Kiểm tra BG affiliate membership
- `JwtService`: Tạo và verify tokens
- `cookie-parser`: Xử lý cookies

### **Module Structure:**
```
BgRefModule
├── Controllers: BgRefController
├── Services: BgRefService, BgAuthService
├── Guards: JwtBgAuthGuard
├── Strategies: JwtBgStrategy
└── Entities: BG Affiliate entities
```

## 📝 Usage Example

### **Frontend Integration:**
```javascript
// Telegram Login
const telegramResponse = await fetch('/api/v1/bg-ref/connect-telegram', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ id: 'telegram_id', code: 'verification_code' })
});

// Email Login
const emailResponse = await fetch('/api/v1/bg-ref/login-email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ code: 'email_verification_code' })
});

// Access protected API
const data = await fetch('/api/v1/bg-ref/my-bg-affiliate-status', {
  credentials: 'include' // Cookies sẽ được gửi tự động
});
```

## 🎉 Benefits

1. **Security**: HTTP-only cookies + multiple validation layers
2. **Isolation**: Module riêng biệt, không ảnh hưởng đến hệ thống chính
3. **Flexibility**: Có thể sử dụng cả Bearer token và cookies
4. **Maintainability**: Code được tổ chức rõ ràng, dễ bảo trì
5. **Scalability**: Có thể mở rộng thêm features dễ dàng 