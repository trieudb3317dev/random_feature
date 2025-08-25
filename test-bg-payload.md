# Test BG Affiliate JWT Payload

## 🔍 Kiểm tra Payload hiện tại

### **Payload đã được cập nhật:**

```json
{
  "uid": 7251125,
  "wallet_id": 3251125,
  "sol_public_key": "s4uJWXe7C3QeKsUBoMTvNDRGtrk5LJYJK1Az7jyfvdy",
  "eth_public_key": "0xf68c4644C888216995C39F82DD23a3fAb1bfF026",
  "role": "bg_affiliate",
  "iat": 1752310654,
  "exp": 1752397054
}
```

### **So sánh với yêu cầu:**

| Trường | Yêu cầu | Hiện tại | Status |
|--------|---------|----------|--------|
| `uid` | ✅ | ✅ | ✅ |
| `wallet_id` | ✅ | ✅ | ✅ |
| `sol_public_key` | ✅ | ✅ | ✅ |
| `eth_public_key` | ✅ | ✅ | ✅ |
| `iat` | ✅ | ✅ | ✅ (tự động) |
| `exp` | ✅ | ✅ | ✅ (tự động) |
| `role` | ❌ | ✅ | ✅ (thêm) |

## 🔧 Thay đổi đã thực hiện

### 1. **BgAuthService.connectTelegram()**
```typescript
// Lấy thông tin user từ wallet
const user = await this.telegramWalletsService['userWalletRepository'].findOne({
  where: { uw_telegram_id: body.id }
});

// Tạo JWT payload với đầy đủ thông tin
const payload = {
  uid: user.uw_id,
  wallet_id: walletId,
  sol_public_key: wallet.wallet_solana_address,
  eth_public_key: wallet.wallet_eth_address,
  role: 'bg_affiliate'
};
```

### 2. **BgAuthService.refreshToken()**
```typescript
// Lấy thông tin wallet để tạo payload đầy đủ
const wallet = await this.telegramWalletsService.getWalletById(payload.wallet_id);

// Tạo access token mới với payload đầy đủ
const newAccessToken = this.jwtService.sign(
  {
    uid: payload.uid,
    wallet_id: payload.wallet_id,
    sol_public_key: wallet.wallet_solana_address,
    eth_public_key: wallet.wallet_eth_address,
    role: payload.role
  },
  {
    secret: process.env.JWT_SECRET,
    expiresIn: '15m'
  }
);
```

### 3. **JwtBgStrategy.validate()**
```typescript
async validate(payload: any) {
  return {
    uid: payload.uid,
    wallet_id: payload.wallet_id,
    sol_public_key: payload.sol_public_key,
    eth_public_key: payload.eth_public_key,
    role: payload.role
  };
}
```

### 4. **RequestWithBgUser Interface**
```typescript
export interface RequestWithBgUser extends Request {
  user: {
    uid: number;
    wallet_id: number;
    sol_public_key: string;
    eth_public_key: string;
    role?: string;
  };
}
```

## 🧪 Test Cases

### **Test Case 1: Decode JWT Token**
```bash
# Lấy token từ response hoặc cookie
# Decode để kiểm tra payload
jwt.decode(bg_access_token)
```

**Expected Output:**
```json
{
  "uid": 7251125,
  "wallet_id": 3251125,
  "sol_public_key": "s4uJWXe7C3QeKsUBoMTvNDRGtrk5LJYJK1Az7jyfvdy",
  "eth_public_key": "0xf68c4644C888216995C39F82DD23a3fAb1bfF026",
  "role": "bg_affiliate",
  "iat": 1752310654,
  "exp": 1752397054
}
```

### **Test Case 2: Access Protected API**
```bash
curl -X GET http://localhost:3000/api/v1/bg-ref/my-bg-affiliate-status \
  -H "Authorization: Bearer <bg_access_token>"
```

**Expected Response:**
```json
{
  "isBgAffiliate": true,
  "currentWallet": {
    "walletId": 3251125,
    "solanaAddress": "s4uJWXe7C3QeKsUBoMTvNDRGtrk5LJYJK1Az7jyfvdy",
    "ethAddress": "0xf68c4644C888216995C39F82DD23a3fAb1bfF026"
  },
  "bgAffiliateInfo": { ... }
}
```

### **Test Case 3: Refresh Token**
```bash
curl -X POST http://localhost:3000/api/v1/bg-ref/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<bg_refresh_token>"}'
```

**Expected:**
- New access token với payload đầy đủ
- Cookie `bg_access_token` được cập nhật

## 🔍 Validation trong Guard

### **JwtBgAuthGuard.canActivate()**
1. ✅ Extract token từ header hoặc cookie
2. ✅ Verify JWT signature và expiration
3. ✅ Kiểm tra `wallet_id` tồn tại trong payload
4. ✅ Kiểm tra wallet là main wallet
5. ✅ Kiểm tra wallet thuộc BG affiliate system
6. ✅ Gán user object với đầy đủ thông tin

### **User Object trong Request**
```typescript
request.user = {
  uid: 7251125,
  wallet_id: 3251125,
  sol_public_key: "s4uJWXe7C3QeKsUBoMTvNDRGtrk5LJYJK1Az7jyfvdy",
  eth_public_key: "0xf68c4644C888216995C39F82DD23a3fAb1bfF026",
  role: "bg_affiliate"
};
```

## ✅ Kết luận

Payload JWT của BG affiliate đã được cập nhật để có đầy đủ các trường như yêu cầu:

- ✅ `uid`: User ID
- ✅ `wallet_id`: Wallet ID  
- ✅ `sol_public_key`: Solana address
- ✅ `eth_public_key`: Ethereum address
- ✅ `iat`: Issued at timestamp
- ✅ `exp`: Expiration timestamp
- ✅ `role`: BG affiliate role (thêm)

Tất cả các component liên quan đã được cập nhật để hỗ trợ payload mới này. 