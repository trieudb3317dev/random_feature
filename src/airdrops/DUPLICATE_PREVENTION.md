# Cơ chế chống trùng lặp trong Airdrops Module

## Tổng quan

Module Airdrops đã được cải thiện với nhiều lớp bảo vệ để ngăn chặn việc trùng lặp giao dịch và API calls, đảm bảo tính toàn vẹn dữ liệu và tránh các lỗi phát sinh từ việc gọi API nhiều lần.

## 1. Redis Distributed Lock

### Mục đích
- Ngăn chặn việc gọi API đồng thời từ cùng một user
- Đảm bảo chỉ có một request được xử lý tại một thời điểm

### Cách hoạt động
```typescript
// Create Pool
const lockKey = `create_pool_${walletId}`;
return await this.redisLockService.withLock(lockKey, async () => {
    // Logic tạo pool
}, this.LOCK_TTL * 1000);

// Stake Pool  
const lockKey = `stake_pool_${walletId}_${poolId}`;
return await this.redisLockService.withLock(lockKey, async () => {
    // Logic stake pool
}, this.LOCK_TTL * 1000);
```

### Thông số
- **TTL**: 5 phút (300 giây)
- **Retry**: 3 lần với delay 1 giây
- **Auto-release**: Tự động release lock sau khi hoàn thành

## 2. Database-level Duplicate Prevention

### Create Pool
```typescript
// Kiểm tra pool pending
const existingPendingPool = await this.airdropListPoolRepository.findOne({
    where: {
        alp_originator: walletId,
        apl_status: AirdropPoolStatus.PENDING
    }
});

if (existingPendingPool) {
    throw new BadRequestException('Bạn đã có một pool đang trong quá trình tạo');
}
```

### Stake Pool
```typescript
// Kiểm tra join record đã active
const existingJoinRecord = await this.airdropPoolJoinRepository.findOne({
    where: { apj_id: savedJoin.apj_id }
});

if (existingJoinRecord && existingJoinRecord.apj_status === AirdropPoolJoinStatus.ACTIVE) {
    // Đã được xử lý thành công
    transactionHash = 'already_processed';
    success = true;
    break;
}
```

## 3. Transaction Hash Tracking

### Mục đích
- Lưu trữ transaction hash để tránh thực hiện lại giao dịch đã thành công
- Kiểm tra trước khi thực hiện giao dịch mới

### Cách hoạt động
```typescript
// Kiểm tra transaction hash đã tồn tại
const existingPool = await this.airdropListPoolRepository.findOne({
    where: { alp_id: savedPool.alp_id }
});

if (existingPool && existingPool.apl_hash) {
    this.logger.log(`Pool ${savedPool.alp_id} đã có transaction hash: ${existingPool.apl_hash}`);
    transactionHash = existingPool.apl_hash;
    success = true;
    break;
}
```

## 4. Unique Transaction ID

### Mục đích
- Tạo unique identifier cho mỗi transaction
- Tránh trùng lặp transaction trên blockchain

### Cách hoạt động
```typescript
// Create Pool
const transactionId = `pool_${savedPool.alp_id}_${Date.now()}_${Math.random()}`;

// Stake Pool
const transactionId = `stake_${savedJoin.apj_id}_${Date.now()}_${Math.random()}`;

// Sử dụng trong transfer
transactionHash = await this.transferTokenToBittWallet(
    wallet.wallet_private_key,
    mintTokenAirdrop,
    walletBittAddress,
    amount,
    transactionId
);
```

## 5. Retry Mechanism với Deduplication

### Mục đích
- Thử lại giao dịch khi thất bại
- Kiểm tra trạng thái trước mỗi lần thử

### Cách hoạt động
```typescript
for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
    try {
        // Kiểm tra trạng thái hiện tại
        const existingRecord = await this.repository.findOne({ where: { id } });
        if (existingRecord && existingRecord.status === 'ACTIVE') {
            // Đã thành công, không cần thử lại
            break;
        }
        
        // Thực hiện giao dịch
        transactionHash = await this.transferToken(...);
        
        // Chờ confirm
        await this.waitForTransactionConfirmation(transactionHash);
        success = true;
        break;
        
    } catch (error) {
        if (attempt === this.MAX_RETRY_ATTEMPTS) {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}
```

## 6. Transaction Confirmation Waiting

### Mục đích
- Đảm bảo transaction được confirm thực sự trên blockchain
- Tránh false positive

### Cách hoạt động
```typescript
private async waitForTransactionConfirmation(signature: string, maxRetries: number = 30): Promise<void> {
    let retries = 0;
    const retryDelay = 1000; // 1 giây

    while (retries < maxRetries) {
        try {
            const status = await this.solanaService.checkTransactionStatus(signature);
            
            if (status === 'confirmed' || status === 'finalized') {
                return;
            } else if (status === 'failed') {
                throw new Error(`Transaction ${signature} đã thất bại`);
            }
            
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retries++;
            
        } catch (error) {
            retries++;
            if (retries >= maxRetries) {
                throw new Error(`Không thể confirm transaction ${signature}`);
            }
        }
    }
}
```

## 7. SOL Fee Transfer Deduplication

### Mục đích
- Tránh chuyển SOL phí nhiều lần
- Kiểm tra balance sau khi chuyển

### Cách hoạt động
```typescript
// Kiểm tra balance trước
let solBalance = await this.solanaService.getBalance(wallet.wallet_solana_address);
if (solBalance < requiredSolFee) {
    // Chuyển phí
    const solTransferSignature = await this.transferSolForFee(...);
    
    // Chờ confirm
    await this.waitForTransactionConfirmation(solTransferSignature);
    
    // Kiểm tra lại balance
    await new Promise(resolve => setTimeout(resolve, 1000));
    solBalance = await this.solanaService.getBalance(wallet.wallet_solana_address);
    
    if (solBalance < requiredSolFee) {
        throw new Error(`Số dư SOL vẫn không đủ sau khi chuyển phí`);
    }
}
```

## 8. Error Handling và Logging

### Mục đích
- Ghi log chi tiết cho debugging
- Xử lý lỗi gracefully

### Cách hoạt động
```typescript
try {
    // Logic xử lý
} catch (error) {
    this.logger.error(`Lỗi tạo pool: ${error.message}`);
    throw error;
} finally {
    // Cleanup nếu cần
}
```

## Kết luận

Với các cơ chế trên, module Airdrops đảm bảo:

1. **Không có duplicate API calls** - Redis lock
2. **Không có duplicate database records** - Database checks
3. **Không có duplicate blockchain transactions** - Transaction hash tracking
4. **Retry an toàn** - Kiểm tra trạng thái trước retry
5. **Transaction confirmation** - Đảm bảo giao dịch thành công thực sự
6. **Error handling** - Xử lý lỗi gracefully

Các cơ chế này hoạt động song song để tạo ra một hệ thống robust và đáng tin cậy. 