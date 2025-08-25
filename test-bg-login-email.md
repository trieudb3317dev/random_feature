# Test Cases cho API bg-ref/login-email

## Mô tả
API `POST /bg-ref/login-email` dùng để đăng nhập BG affiliate thông qua Google OAuth với email.

## Các trường hợp test

### 1. Test Case: Đăng nhập thành công với email hợp lệ và ví BG affiliate
**Input:**
```json
{
  "code": "4/0AfJohXn..."
}
```

**Expected Output:**
```json
{
  "message": "BG affiliate login successful",
  "walletInfo": {
    "walletId": 12345,
    "nickName": "Test Wallet",
    "solanaAddress": "ABC123...",
    "ethAddress": "0xDEF456...",
    "email": "user@example.com"
  }
}
```

**Cookies được set:**
- `bg_access_token`: JWT token (15 phút)
- `bg_refresh_token`: Refresh token (7 ngày)

### 2. Test Case: Đăng nhập thất bại - Email không tồn tại trong hệ thống
**Input:**
```json
{
  "code": "4/0AfJohXn..."
}
```

**Expected Output:**
```json
{
  "statusCode": 400,
  "message": "Tài khoản không tồn tại trong hệ thống",
  "error": "Bad Request"
}
```

**Điều kiện:** Email từ Google OAuth không có trong bảng `user_wallets`

### 3. Test Case: Đăng nhập thất bại - Email chưa được xác thực
**Input:**
```json
{
  "code": "4/0AfJohXn..."
}
```

**Expected Output:**
```json
{
  "statusCode": 400,
  "message": "Email chưa được xác thực. Vui lòng xác thực email trước",
  "error": "Bad Request"
}
```

**Điều kiện:** Email có trong hệ thống nhưng `active_email = false`

### 4. Test Case: Đăng nhập thất bại - Không tìm thấy ví chính
**Input:**
```json
{
  "code": "4/0AfJohXn..."
}
```

**Expected Output:**
```json
{
  "statusCode": 400,
  "message": "Không tìm thấy ví chính của tài khoản",
  "error": "Bad Request"
}
```

**Điều kiện:** User có email nhưng không có ví main trong `wallet_auth`

### 5. Test Case: Đăng nhập thất bại - Ví không phải main wallet
**Input:**
```json
{
  "code": "4/0AfJohXn..."
}
```

**Expected Output:**
```json
{
  "statusCode": 400,
  "message": "Đăng nhập thất bại: Ví không phải là ví chính (main wallet)",
  "error": "Bad Request"
}
```

**Điều kiện:** Ví có trong `wallet_auth` nhưng `wa_type != 'main'`

### 6. Test Case: Đăng nhập thất bại - Ví không thuộc BG affiliate
**Input:**
```json
{
  "code": "4/0AfJohXn..."
}
```

**Expected Output:**
```json
{
  "statusCode": 400,
  "message": "Đăng nhập thất bại: Ví không thuộc hệ thống BG affiliate",
  "error": "Bad Request"
}
```

**Điều kiện:** Ví là main wallet nhưng không có trong `bg_affiliate_nodes`

### 7. Test Case: Đăng nhập thất bại - Code Google không hợp lệ
**Input:**
```json
{
  "code": "invalid_code"
}
```

**Expected Output:**
```json
{
  "statusCode": 400,
  "message": "Failed to exchange code for token",
  "error": "Bad Request"
}
```

## Các bước kiểm tra

### Bước 1: Chuẩn bị dữ liệu test
```sql
-- Tạo user wallet với email
INSERT INTO user_wallets (uw_id, uw_email, active_email) 
VALUES (1001, 'test@example.com', true);

-- Tạo list wallet
INSERT INTO list_wallets (wallet_id, wallet_private_key, wallet_solana_address, wallet_eth_address, wallet_auth, wallet_status, wallet_nick_name)
VALUES (12345, 'private_key', 'ABC123...', '0xDEF456...', 'member', true, 'Test Wallet');

-- Tạo wallet auth cho main wallet
INSERT INTO wallet_auth (wa_id, wa_user_id, wa_wallet_id, wa_type, wa_name)
VALUES (2001, 1001, 12345, 'main', 'Main Wallet');

-- Tạo BG affiliate tree và node
INSERT INTO bg_affiliate_trees (bat_id, bat_root_wallet_id, bat_total_commission_percent)
VALUES (1, 12345, 70.00);

INSERT INTO bg_affiliate_nodes (ban_id, ban_tree_id, ban_wallet_id, ban_parent_wallet_id, ban_commission_percent, ban_status)
VALUES (1, 1, 12345, NULL, 70.00, true);
```

### Bước 2: Test các trường hợp
1. **Test thành công:** Sử dụng dữ liệu trên với code Google hợp lệ
2. **Test email không tồn tại:** Sử dụng email khác không có trong database
3. **Test email chưa xác thực:** Thay đổi `active_email = false`
4. **Test không có ví main:** Xóa record trong `wallet_auth`
5. **Test ví không main:** Thay đổi `wa_type = 'sub'` trong `wallet_auth`
6. **Test không BG affiliate:** Xóa record trong `bg_affiliate_nodes`
7. **Test code sai:** Sử dụng code Google không hợp lệ

### Bước 3: Kiểm tra cookies
- Verify `bg_access_token` được set với thời gian 15 phút
- Verify `bg_refresh_token` được set với thời gian 7 ngày
- Verify cookies có `httpOnly: true`, `secure: true` (production), `sameSite: 'none'`

### Bước 4: Kiểm tra JWT payload
Decode `bg_access_token` và verify có các field:
- `uid`: User ID
- `wallet_id`: Wallet ID của ví main
- `sol_public_key`: Solana address
- `eth_public_key`: Ethereum address
- `role`: "bg_affiliate"
- `iat`: Issued at
- `exp`: Expiration time

## Lưu ý quan trọng

### 1. Redirect URL khác biệt
- **Regular login-email**: Sử dụng `URL_FRONTEND + '/login-email'`
- **BG affiliate login-email**: Sử dụng `URL_AFFILIATE_FRONTEND + '/login-email'`

### 2. JWT Secret khác biệt
- **Regular APIs**: Sử dụng `process.env.JWT_SECRET`
- **BG affiliate APIs**: Sử dụng `${process.env.JWT_SECRET}-affiliate`

### 3. Luồng xử lý
1. Exchange Google code với redirect URL BG affiliate
2. Verify ID token và lấy thông tin email
3. Kiểm tra email có tồn tại trong hệ thống không
4. Kiểm tra email đã được xác thực chưa (`active_email = true`)
5. Lấy ví main của user
6. Kiểm tra ví có phải main wallet không (`wa_type = 'main'`)
7. Kiểm tra ví có thuộc BG affiliate không
8. Tạo JWT token với secret khác biệt
9. Set cookies và trả về thông tin

### 4. Biến môi trường cần thiết
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
URL_AFFILIATE_FRONTEND=https://affiliate.memepump.vip
JWT_SECRET=your_jwt_secret
``` 