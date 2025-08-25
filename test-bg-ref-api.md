# Test API BG Affiliate Module

## 1. API Connect Telegram

### Endpoint: `POST /api/v1/bg-ref/connect-telegram`

**Request:**
```json
{
  "id": "telegram_id",
  "code": "verification_code"
}
```

**Response Success:**
```json
{
  "message": "BG affiliate login successful",
  "walletInfo": {
    "walletId": 123456,
    "nickName": "User Nickname",
    "solanaAddress": "SolanaAddress...",
    "ethAddress": "0x..."
  }
}
```

**Cookies Set:**
- `bg_access_token`: JWT token (15 phút, httpOnly, secure)
- `bg_refresh_token`: Refresh token (7 ngày, httpOnly, secure)

**Validation:**
- ✅ Wallet phải là main wallet (wa_type = 'main')
- ✅ Wallet phải thuộc hệ thống BG affiliate
- ❌ Nếu không thỏa mãn điều kiện → BadRequestException

## 2. API Refresh Token

### Endpoint: `POST /api/v1/bg-ref/refresh-token`

**Request:**
```json
{
  "refreshToken": "refresh_token_string"
}
```

**Response Success:**
```json
{
  "message": "Token refreshed successfully"
}
```

**Cookies Updated:**
- `bg_access_token`: JWT token mới (15 phút)

## 3. API Logout

### Endpoint: `POST /api/v1/bg-ref/logout`

**Response Success:**
```json
{
  "message": "Logged out successfully"
}
```

**Cookies Cleared:**
- `bg_access_token`: Cleared
- `bg_refresh_token`: Cleared

## 4. Protected APIs (Sử dụng JwtBgAuthGuard)

### Endpoint: `PUT /api/v1/bg-ref/nodes/commission`
### Endpoint: `GET /api/v1/bg-ref/commission-history`
### Endpoint: `GET /api/v1/bg-ref/bg-affiliate-status/:targetWalletId`
### Endpoint: `GET /api/v1/bg-ref/my-bg-affiliate-status`
### Endpoint: `GET /api/v1/bg-ref/bg-affiliate-stats`
### Endpoint: `GET /api/v1/bg-ref/trees`
### Endpoint: `GET /api/v1/bg-ref/downline-stats`

**Authentication:**
- Sử dụng `Authorization: Bearer <bg_access_token>`
- Hoặc sử dụng cookie `bg_access_token`

**Validation trong Guard:**
1. ✅ Token hợp lệ
2. ✅ Wallet ID tồn tại trong payload
3. ✅ Wallet là main wallet
4. ✅ Wallet thuộc hệ thống BG affiliate

**Error Responses:**
- `401 Unauthorized`: Token không hợp lệ hoặc thiếu
- `401 Unauthorized`: Wallet không phải main wallet
- `401 Unauthorized`: Wallet không thuộc BG affiliate system

## 5. Test Cases

### Test Case 1: Login thành công
```bash
curl -X POST http://localhost:3000/api/v1/bg-ref/connect-telegram \
  -H "Content-Type: application/json" \
  -d '{"id": "telegram_id", "code": "valid_code"}'
```

### Test Case 2: Login với wallet không phải main
```bash
# Expected: BadRequestException - "Access denied: wallet is not main wallet"
```

### Test Case 3: Login với wallet không thuộc BG affiliate
```bash
# Expected: BadRequestException - "Access denied: wallet is not in BG affiliate system"
```

### Test Case 4: Access protected API
```bash
curl -X GET http://localhost:3000/api/v1/bg-ref/my-bg-affiliate-status \
  -H "Authorization: Bearer <bg_access_token>"
```

### Test Case 5: Access với token không hợp lệ
```bash
# Expected: 401 Unauthorized
```

## 6. Flow hoạt động

1. **Login**: User gửi telegram_id và code → Verify → Kiểm tra main wallet → Kiểm tra BG affiliate → Tạo JWT tokens → Set cookies
2. **Access API**: Guard kiểm tra token → Verify payload → Kiểm tra main wallet → Kiểm tra BG affiliate → Cho phép access
3. **Refresh**: User gửi refresh token → Verify → Tạo access token mới → Update cookie
4. **Logout**: Clear tất cả cookies

## 7. Security Features

- **HTTP-only cookies**: Tokens không thể truy cập qua JavaScript
- **Secure cookies**: Chỉ gửi qua HTTPS trong production
- **Short-lived access tokens**: 15 phút
- **Long-lived refresh tokens**: 7 ngày
- **Multiple validations**: Main wallet + BG affiliate membership
- **SameSite protection**: Ngăn CSRF attacks 