# BG Ref Withdraw API Improvements

## Vấn đề đã được khắc phục

### 1. Vấn đề gốc
- API `bg-ref/withdraw` không có cơ chế chống trùng lặp (idempotency)
- Gây ra việc gửi giao dịch trùng 3-4 lần khi user click nhiều lần
- Thất thoát tiền do gửi nhiều lần cùng một số tiền
- **Vấn đề mới phát hiện**: Không có cơ chế chống trùng lặp khi retry transaction onchain

### 2. Các cải tiến đã thực hiện

#### 2.1. Thêm Redis Lock
- Sử dụng `RedisLockService` để đảm bảo chỉ một request được xử lý tại một thời điểm
- Lock key: `bg-ref-withdraw:${walletId}`
- Timeout: 30 giây

#### 2.2. Thêm Database Transaction
- Wrap toàn bộ logic tạo withdrawal request trong database transaction
- Đảm bảo tính nhất quán dữ liệu
- Rollback tự động nếu có lỗi

#### 2.3. Kiểm tra Pending Withdrawal
- Kiểm tra xem wallet đã có yêu cầu rút tiền đang pending chưa
- Ngăn chặn tạo nhiều yêu cầu rút tiền cùng lúc
- Trả về thông báo rõ ràng cho user

#### 2.4. Thêm Unique Constraint
- Thêm unique index trên `(rwh_wallet_id, rwh_status)` với điều kiện `rwh_status = 'pending'`
- Ngăn chặn duplicate records ở database level
- Migration: `1748609023923-AddUniqueConstraintToRefWithdrawHistory.ts`

#### 2.5. Cải tiến xử lý Transaction Onchain ⭐ **MỚI**

##### 2.5.1. Kiểm tra Transaction Status
- Kiểm tra transaction đã được gửi chưa trước khi retry
- Verify transaction status trên blockchain trước khi gửi lại
- Tránh gửi duplicate transaction

##### 2.5.2. Lưu Transaction Signature ngay khi gửi
- Lưu signature ngay khi `sendTransaction` thành công
- Không đợi confirmation mới lưu signature
- Đảm bảo tracking đầy đủ

##### 2.5.3. Redis Lock cho Processing
- Sử dụng lock `withdrawal-processing:${withdrawalId}` cho mỗi withdrawal
- Đảm bảo chỉ một process xử lý withdrawal tại một thời điểm
- Tránh race condition khi retry

##### 2.5.4. Giới hạn Retry với Exponential Backoff
- Giới hạn tối đa 5 lần retry
- Exponential backoff: 1m, 2m, 4m, 8m, 16m (tối đa 5 phút)
- Thêm fields `rwh_retry_count` và `rwh_next_retry_at`
- Migration: `1748609023924-AddRetryFieldsToRefWithdrawHistory.ts`

##### 2.5.5. Transaction Confirmation với Timeout
- Wait for confirmation với timeout 30 giây
- Kiểm tra status mỗi 2 giây
- Xử lý cả `confirmed` và `finalized` status

#### 2.6. Thêm API mới

##### API hủy yêu cầu rút tiền
```
POST /bg-ref/cancel-withdraw/:withdrawId
```

##### API lấy thông tin pending withdrawal
```
GET /bg-ref/pending-withdrawal
```

##### API lấy thông tin transaction status ⭐ **MỚI**
```
GET /bg-ref/transaction-status/:withdrawId
```

## Cách sử dụng

### 1. Tạo yêu cầu rút tiền
```javascript
POST /bg-ref/withdraw
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "BG affiliate withdrawal request created successfully",
  "data": {
    "withdrawId": 123,
    "amountUSD": 50.00,
    "amountSOL": 0.5,
    "breakdown": {
      "walletRefRewardsUSD": 30.00,
      "bgAffiliateRewardsUSD": 20.00
    }
  }
}
```

### 2. Kiểm tra yêu cầu đang pending
```javascript
GET /bg-ref/pending-withdrawal
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "hasPendingWithdrawal": true,
    "withdrawal": {
      "withdrawId": 123,
      "amountUSD": 50.00,
      "amountSOL": 0.5,
      "createdAt": "2024-01-01T10:00:00Z",
      "expiresAt": "2024-01-01T10:30:00Z",
      "breakdown": {
        "walletRefRewardsUSD": 30.00,
        "bgAffiliateRewardsUSD": 20.00
      }
    }
  }
}
```

### 3. Hủy yêu cầu rút tiền
```javascript
POST /bg-ref/cancel-withdraw/123
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Hủy yêu cầu rút tiền thành công",
  "data": {
    "withdrawId": 123,
    "cancelledAt": "2024-01-01T10:15:00Z"
  }
}
```

### 4. Kiểm tra transaction status ⭐ **MỚI**
```javascript
GET /bg-ref/transaction-status/123
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "withdrawal": {
      "withdrawId": 123,
      "status": "retry",
      "amountUSD": 50.00,
      "amountSOL": 0.5,
      "createdAt": "2024-01-01T10:00:00Z",
      "retryCount": 2,
      "nextRetryAt": "2024-01-01T10:08:00Z"
    },
    "transaction": {
      "signature": "5J7X...",
      "confirmed": false,
      "finalized": false,
      "pending": true,
      "error": null,
      "lastChecked": "2024-01-01T10:05:00Z"
    }
  }
}
```

## Lưu ý quan trọng

1. **Migration cần chạy**: 
   - `1748609023923-AddUniqueConstraintToRefWithdrawHistory.ts`
   - `1748609023924-AddRetryFieldsToRefWithdrawHistory.ts`
2. **Redis cần có**: Đảm bảo Redis service đang hoạt động
3. **SharedModule**: Đã import `SharedModule` để sử dụng `RedisLockService`
4. **Timeout**: 
   - Lock timeout: 30 giây (create), 60 giây (processing)
   - Withdrawal timeout: 30 phút
   - Transaction confirmation timeout: 30 giây
5. **Retry limit**: Tối đa 5 lần retry với exponential backoff

## Cơ chế chống trùng lặp Transaction

### 1. Kiểm tra trước khi gửi
```typescript
// Kiểm tra xem transaction đã được gửi chưa
if (withdrawal.rwh_hash) {
  const transactionStatus = await this.checkTransactionStatus(withdrawal.rwh_hash);
  
  if (transactionStatus.confirmed || transactionStatus.finalized) {
    // Transaction đã thành công, cập nhật status
    await this.handleSuccessfulWithdrawal(withdrawal);
    return;
  }
}
```

### 2. Redis Lock cho Processing
```typescript
return this.redisLockService.withLock(
  `withdrawal-processing:${withdrawal.rwh_id}`,
  async () => {
    // Chỉ một process xử lý withdrawal này tại một thời điểm
  },
  60000 // 60 seconds timeout
);
```

### 3. Lưu Signature ngay khi gửi
```typescript
if (result.success && result.signature) {
  // Lưu signature ngay khi gửi transaction thành công
  await this.refWithdrawHistoryRepository.update(
    { rwh_id: withdrawal.rwh_id },
    { rwh_hash: result.signature }
  );
}
```

### 4. Giới hạn Retry
```typescript
const retryCount = withdrawal.rwh_retry_count || 0;
const maxRetries = 5;

if (retryCount >= maxRetries) {
  await this.handleFailedWithdrawal(withdrawal, `Exceeded maximum retry attempts (${maxRetries})`);
  return;
}
```

## Testing

### Test case 1: Chống trùng lặp API
1. Gọi API withdraw
2. Ngay lập tức gọi lại API withdraw (trong vòng 30 giây)
3. Request thứ 2 sẽ bị từ chối với thông báo về pending withdrawal

### Test case 2: Chống trùng lặp Transaction ⭐ **MỚI**
1. Tạo yêu cầu rút tiền
2. Giả lập transaction failed
3. Hệ thống retry với exponential backoff
4. Kiểm tra không có duplicate transaction được gửi

### Test case 3: Transaction Status Tracking ⭐ **MỚI**
1. Tạo yêu cầu rút tiền
2. Gọi API transaction-status
3. Kiểm tra thông tin retry count và next retry time
4. Verify transaction status trên blockchain

### Test case 4: Concurrent Processing
1. Gửi nhiều requests đồng thời
2. Chỉ một request được xử lý
3. Các request khác sẽ chờ hoặc bị từ chối
4. Kiểm tra Redis lock hoạt động đúng 