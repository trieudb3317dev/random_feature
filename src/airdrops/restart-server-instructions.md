# Hướng dẫn Restart Server

## Vấn đề hiện tại

Code đã được sửa nhưng server chưa restart, nên vẫn sử dụng code cũ và gây ra lỗi:
```
Error: Simulation failed. 
Message: Transaction simulation failed: Error processing Instruction 0: Provided seeds do not result in a valid address.
```

## Giải pháp

### 1. Restart Server

```bash
# Dừng server hiện tại
Ctrl + C

# Khởi động lại server
npm run start:dev
```

### 2. Kiểm tra logs sau khi restart

Sau khi restart, logs sẽ hiển thị:
```
[AirdropsService] Getting ATA for mint: Em2ornaErpkufEqHPpWTT4uDckJirq6ooPaDVaMGoMjw, owner: 4HND2bdKBTT5uxmGWTgZLhSn8Xvm4LTP1XXVvXyrGT8N
[AirdropsService] ATA address: [ATA_ADDRESS]
[AirdropsService] Executing token transfer transaction attempt 1 for pool 12
```

### 3. Test API

```bash
curl -X POST "http://localhost:3000/api/v1/airdrops/create-pool" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Pool",
    "describe": "Test description",
    "initialAmount": 1000000
  }'
```

## Thay đổi đã thực hiện

### 1. Sử dụng getOrCreateAssociatedTokenAccount
```typescript
// Thay vì tự tạo ATA, sử dụng function có sẵn
const { getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');

const tokenAccount = await getOrCreateAssociatedTokenAccount(
    this.connection,
    owner,
    mint,
    ownerAddress
);
```

### 2. Đơn giản hóa logic
- Không cần kiểm tra ATA tồn tại
- Không cần tự tạo transaction
- Sử dụng function có sẵn từ @solana/spl-token

## Kết quả mong đợi

✅ **Sau khi restart:**
- Không còn lỗi "Provided seeds do not result in a valid address"
- ATA được tạo tự động nếu cần
- Transfer token thành công
- Logging chi tiết để debug

**🎉 Restart server để áp dụng thay đổi!** 