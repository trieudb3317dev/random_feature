# Phân tích Vấn đề Số Lượng Token

## Vấn đề hiện tại

### **1. ATA đã được fix thành công! ✅**
```
[AirdropsService] Executing token transfer transaction attempt 1 for pool 13
[AirdropsService] BITT transaction sent with signature: 4QSw5oohtSjCMBHN5mJo2U6vQtVdnvvZwwEk6WaHwQwWC2KSHLKe8Ee2tgmNhGQGn2zKgy3kipnNDp9yK3kSU6mm
```

**Không còn lỗi `Provided seeds do not result in a valid address` nữa!**

### **2. Vấn đề mới: Transaction không được confirm**
```
Transaction 4QSw5oohtSjCMBHN5mJo2U6vQtVdnvvZwwEk6WaHwQwWC2KSHLKe8Ee2tgmNhGQGn2zKgy3kipnNDp9yK3kSU6mm vẫn pending, thử lại lần 1/30
...
Transaction 4QSw5oohtSjCMBHN5mJo2U6vQtVdnvvZwwEk6WaHwQwWC2KSHLKe8Ee2tgmNhGQGn2zKgy3kipnNDp9yK3kSU6mm không được confirm trong thời gian chờ
```

### **3. Vấn đề về số lượng token:**
User báo cáo: `initialAmount = 1000000` nhưng chỉ gửi `0.01 token`

## Nguyên nhân có thể

### **1. Token Decimals**
Có thể token `Em2ornaErpkufEqHPpWTT4uDckJirq6ooPaDVaMGoMjw` có decimals = 8:
- `1,000,000 raw units` ÷ `10^8` = `0.01 tokens`

### **2. Network Congestion**
- Transaction được gửi thành công nhưng không được confirm
- Có thể do network congestion hoặc fee quá thấp

### **3. Jupiter API Issues**
```
Jupiter initialization failed (attempt 4): FetchError: invalid json response body at https://quote-api.jup.ag/v6
```

## Giải pháp đã áp dụng

### **1. Thêm logging để debug token decimals:**
```typescript
// Get token decimals to understand the amount
const { getMint } = require('@solana/spl-token');
const mintInfo = await getMint(this.connection, new PublicKey(tokenMint));
this.logger.debug(`Token decimals: ${mintInfo.decimals}`);
this.logger.debug(`Transfer amount in tokens: ${amount / Math.pow(10, mintInfo.decimals)}`);
```

### **2. Thêm logging transfer amount:**
```typescript
this.logger.debug(`Transfer amount: ${amount} (raw number)`);
```

## Expected Logs sau khi fix

### **Trường hợp 1: Token decimals = 8**
```
[AirdropsService] Transfer amount: 1000000 (raw number)
[AirdropsService] Token decimals: 8
[AirdropsService] Transfer amount in tokens: 0.01
```

### **Trường hợp 2: Token decimals = 0**
```
[AirdropsService] Transfer amount: 1000000 (raw number)
[AirdropsService] Token decimals: 0
[AirdropsService] Transfer amount in tokens: 1000000
```

## Giải pháp tiếp theo

### **1. Nếu token decimals = 8:**
Cần nhân amount với `10^decimals`:
```typescript
const adjustedAmount = createPoolDto.initialAmount * Math.pow(10, mintInfo.decimals);
```

### **2. Nếu transaction không confirm:**
- Tăng transaction fee
- Sử dụng priority fee
- Chờ network ổn định

### **3. Kiểm tra token balance:**
```typescript
const tokenBalance = await this.solanaService.getTokenBalance(
    wallet.wallet_solana_address,
    mintTokenAirdrop
);
this.logger.debug(`Token balance: ${tokenBalance} raw units`);
this.logger.debug(`Token balance in tokens: ${tokenBalance / Math.pow(10, mintInfo.decimals)}`);
```

## Test Cases

### **Test 1: Kiểm tra token decimals**
```bash
# Restart server và test lại
curl -X POST "http://localhost:3000/api/v1/airdrops/create-pool" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Pool",
    "describe": "Test description",
    "initialAmount": 1000000
  }'

# Expected logs:
# [AirdropsService] Transfer amount: 1000000 (raw number)
# [AirdropsService] Token decimals: 8
# [AirdropsService] Transfer amount in tokens: 0.01
```

### **Test 2: Nếu decimals = 8, cần fix amount**
```typescript
// Trong createPool method:
const mintInfo = await getMint(this.connection, new PublicKey(mintTokenAirdrop));
const adjustedAmount = createPoolDto.initialAmount * Math.pow(10, mintInfo.decimals);

transactionHash = await this.transferTokenToBittWallet(
    wallet.wallet_private_key,
    mintTokenAirdrop,
    walletBittAddress,
    adjustedAmount,  // Sử dụng adjustedAmount thay vì createPoolDto.initialAmount
    transactionId
);
```

## Kết luận

1. **ATA đã được fix thành công** ✅
2. **Vấn đề có thể là token decimals** - cần kiểm tra logs
3. **Transaction không confirm** - có thể do network congestion
4. **Cần restart server** để áp dụng logging mới

**🎯 Bước tiếp theo: Restart server và kiểm tra logs để xác định token decimals!** 