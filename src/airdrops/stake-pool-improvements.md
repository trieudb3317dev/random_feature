# Cải Tiến API /stake-pool

## Tổng quan

API `/stake-pool` đã được cải tiến để tránh các lỗi tương tự như API `/create-pool`, bao gồm:

1. **Xử lý token decimals linh hoạt**
2. **Validation chi tiết hơn**
3. **Logging chi tiết hơn**
4. **Error handling tốt hơn**
5. **Transaction confirmation cải thiện**

## Các Cải Tiến Đã Áp Dụng

### **1. Validation Stake Amount**

```typescript
// 0. Validate stake amount
if (!stakePoolDto.stakeAmount || stakePoolDto.stakeAmount <= 0) {
    throw new BadRequestException('Stake amount must be greater than 0');
}

if (stakePoolDto.stakeAmount < 1) {
    throw new BadRequestException('Minimum stake amount is 1 token');
}
```

**Lợi ích:**
- Ngăn chặn stake amount không hợp lệ
- Đảm bảo minimum stake amount
- Error message rõ ràng

### **2. Xử Lý Token Decimals Linh Hoạt**

```typescript
// Get token info for proper balance comparison
const tokenInfo = await this.getTokenInfo(mintTokenAirdrop);
this.logger.debug(`Token info for stake: decimals=${tokenInfo.decimals}, supply=${tokenInfo.supply}`);

const tokenBalance = await this.solanaService.getTokenBalance(
    wallet.wallet_solana_address,
    mintTokenAirdrop
);

this.logger.debug(`Wallet ${wallet.wallet_solana_address} token balance: ${tokenBalance} (raw units)`);
this.logger.debug(`Requested stake amount: ${stakePoolDto.stakeAmount} tokens`);

// Calculate required raw units for stake
const requiredRawUnits = stakePoolDto.stakeAmount * Math.pow(10, tokenInfo.decimals);
this.logger.debug(`Required raw units for stake: ${requiredRawUnits}`);

if (tokenBalance < requiredRawUnits) {
    const balanceInTokens = tokenBalance / Math.pow(10, tokenInfo.decimals);
    throw new BadRequestException(
        `Insufficient token X balance. Current: ${balanceInTokens.toFixed(tokenInfo.decimals)} tokens, Required: ${stakePoolDto.stakeAmount} tokens`
    );
}
```

**Lợi ích:**
- So sánh balance chính xác với decimals
- Error message hiển thị balance theo tokens thay vì raw units
- Logging chi tiết để debug

### **3. Logging Chi Tiết Hơn**

#### **Logging bắt đầu process:**
```typescript
this.logger.log(`Starting stake pool process for wallet ${walletId}, pool ${stakePoolDto.poolId}, amount ${stakePoolDto.stakeAmount}`);
```

#### **Logging transaction details:**
```typescript
this.logger.debug(`Starting stake token transfer for join ${savedJoin.apj_id}`);
this.logger.debug(`Wallet: ${wallet.wallet_solana_address}`);
this.logger.debug(`Destination: ${walletBittAddress}`);
this.logger.debug(`Transaction ID: ${transactionId}`);
this.logger.debug(`Original stake amount: ${stakePoolDto.stakeAmount} tokens`);
this.logger.debug(`Adjusted stake amount: ${adjustedStakeAmount} raw units`);
this.logger.debug(`Token mint: ${mintTokenAirdrop}`);
```

#### **Logging kết quả:**
```typescript
if (success) {
    this.logger.log(`✅ Join ${savedJoin.apj_id} created successfully with transaction hash: ${transactionHash}`);
    this.logger.log(`📊 Pool ${stakePoolDto.poolId} updated: +${stakePoolDto.stakeAmount} tokens, member increment: ${existingJoin ? 0 : 1}`);
} else {
    this.logger.error(`❌ Join ${savedJoin.apj_id} creation failed due to onchain transaction failure`);
    this.logger.error(`🔍 Final transaction hash: ${transactionHash}`);
}
```

### **4. Error Handling Cải Thiện**

#### **Pool status validation:**
```typescript
if (pool.apl_status !== AirdropPoolStatus.ACTIVE) {
    throw new BadRequestException(`Pool is not in active status. Current status: ${pool.apl_status}`);
}
```

#### **Transaction retry logging:**
```typescript
this.logger.log(`Executing stake token transaction attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS} for join ${savedJoin.apj_id}`);
this.logger.error(`Stake transaction attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS} failed: ${error.message}`);
this.logger.log(`Waiting 3 seconds before retry ${attempt + 1}...`);
```

### **5. Transaction Confirmation Cải Thiện**

Sử dụng method `waitForTransactionConfirmation` đã được cải thiện:

```typescript
// Wait for transaction to be confirmed
await this.waitForTransactionConfirmation(transactionHash);
this.logger.log(`Stake BITT transaction confirmed: ${transactionHash}`);
```

**Lợi ích:**
- Kiểm tra trực tiếp từ Solana connection
- Logging chi tiết transaction status
- Xử lý lỗi tốt hơn

## Expected Logs

### **Stake Pool Thành Công:**
```
[AirdropsService] Starting stake pool process for wallet 123456, pool 1, amount 500000
[AirdropsService] Token info for stake: decimals=8, supply=1000000000000000
[AirdropsService] Wallet 4HND2bdKBTT5uxmGWTgZLhSn8Xvm4LTP1XXVvXyrGT8N token balance: 1000000000000000 (raw units)
[AirdropsService] Requested stake amount: 500000 tokens
[AirdropsService] Required raw units for stake: 50000000000000
[AirdropsService] Executing stake token transaction attempt 1/3 for join 25
[AirdropsService] Starting stake token transfer for join 25
[AirdropsService] Wallet: 4HND2bdKBTT5uxmGWTgZLhSn8Xvm4LTP1XXVvXyrGT8N
[AirdropsService] Destination: 3wLs323SvtV9iD5HWTtJHGFdmRVGv4xDq3LXKRBdciE2
[AirdropsService] Transaction ID: stake_25_1753869618418_0.3245731522187343
[AirdropsService] Original stake amount: 500000 tokens
[AirdropsService] Adjusted stake amount: 50000000000000 raw units
[AirdropsService] Token mint: Em2ornaErpkufEqHPpWTT4uDckJirq6ooPaDVaMGoMjw
[AirdropsService] Stake transaction sent with signature: 9K8Y...def456, transactionId: stake_25_1753869618418_0.3245731522187343
[AirdropsService] Transaction 9K8Y...def456 đã được gửi thành công, đang chờ confirm...
[AirdropsService] Transaction 9K8Y...def456 đã được confirm với status: confirmed
[AirdropsService] Stake BITT transaction confirmed: 9K8Y...def456
[AirdropsService] ✅ Join 25 created successfully with transaction hash: 9K8Y...def456
[AirdropsService] 📊 Pool 1 updated: +500000 tokens, member increment: 1
[AirdropsService] 🎯 Stake pool response: { joinId: 25, poolId: 1, stakeAmount: 500000, status: 'active', transactionHash: '9K8Y...def456' }
```

### **Stake Pool Thất Bại (Insufficient Balance):**
```
[AirdropsService] Starting stake pool process for wallet 123456, pool 1, amount 999999999999999
[AirdropsService] Token info for stake: decimals=8, supply=1000000000000000
[AirdropsService] Wallet 4HND2bdKBTT5uxmGWTgZLhSn8Xvm4LTP1XXVvXyrGT8N token balance: 1000000000000000 (raw units)
[AirdropsService] Requested stake amount: 999999999999999 tokens
[AirdropsService] Required raw units for stake: 99999999999999900000000
[AirdropsService] BadRequestException: Insufficient token X balance. Current: 10.00000000 tokens, Required: 999999999999999 tokens
```

### **Stake Pool Thất Bại (Transaction Failed):**
```
[AirdropsService] Starting stake pool process for wallet 123456, pool 1, amount 500000
[AirdropsService] Executing stake token transaction attempt 1/3 for join 26
[AirdropsService] Stake transaction attempt 1/3 failed: Transaction 9K8Y...def456 đã thất bại: [error details]
[AirdropsService] Waiting 3 seconds before retry 2...
[AirdropsService] Executing stake token transaction attempt 2/3 for join 26
[AirdropsService] Stake transaction attempt 2/3 failed: Transaction 7M9N...ghi789 đã thất bại: [error details]
[AirdropsService] Waiting 3 seconds before retry 3...
[AirdropsService] Executing stake token transaction attempt 3/3 for join 26
[AirdropsService] Stake transaction attempt 3/3 failed: Transaction 2P3Q...jkl012 đã thất bại: [error details]
[AirdropsService] Tried maximum 3 times but stake transaction still failed
[AirdropsService] ❌ Join 26 creation failed due to onchain transaction failure
[AirdropsService] 🔍 Final transaction hash: 2P3Q...jkl012
[AirdropsService] 🎯 Stake pool response: { joinId: 26, poolId: 1, stakeAmount: 500000, status: 'error', transactionHash: '2P3Q...jkl012' }
```

## Test Cases

### **Test 1: Stake Pool Thành Công**
```bash
curl -X POST "http://localhost:3000/api/v1/airdrops/stake-pool" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": 1,
    "stakeAmount": 500000
  }'

# Expected: Join được tạo thành công với status = ACTIVE
```

### **Test 2: Stake Pool với Insufficient Balance**
```bash
curl -X POST "http://localhost:3000/api/v1/airdrops/stake-pool" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": 1,
    "stakeAmount": 999999999999999
  }'

# Expected: BadRequestException với thông báo insufficient balance
```

### **Test 3: Stake Pool với Invalid Amount**
```bash
curl -X POST "http://localhost:3000/api/v1/airdrops/stake-pool" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": 1,
    "stakeAmount": 0
  }'

# Expected: BadRequestException với thông báo invalid amount
```

### **Test 4: Stake Pool với Pool Không Tồn Tại**
```bash
curl -X POST "http://localhost:3000/api/v1/airdrops/stake-pool" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": 999999,
    "stakeAmount": 500000
  }'

# Expected: BadRequestException với thông báo pool không tồn tại
```

## Kết Luận

### ✅ **API /stake-pool đã được cải tiến:**

1. **Validation chi tiết**: Kiểm tra stake amount, pool status
2. **Token decimals linh hoạt**: Tự động thích ứng với bất kỳ token nào
3. **Logging chi tiết**: Để debug và monitor
4. **Error handling tốt hơn**: Thông báo lỗi rõ ràng
5. **Transaction confirmation cải thiện**: Sử dụng method đã được fix

### 🎯 **Kết quả mong đợi:**

- **Stake thành công**: Join được tạo với status = ACTIVE
- **Stake thất bại**: Join được tạo với status = ERROR
- **Validation**: Ngăn chặn các request không hợp lệ
- **Logging**: Chi tiết để debug và monitor
- **Không còn lỗi**: Tương tự như API /create-pool

**🎉 API /stake-pool đã sẵn sàng xử lý các trường hợp phức tạp!** 