# Airdrop Withdraw API

## Tổng quan

API `admin/airdrop-withdraw` được sử dụng để xử lý việc rút airdrop rewards từ bảng `airdrop_rewards` có `ar_status = "can-withdraw"`.

## Endpoint

```
POST /api/v1/admin/airdrop-withdraw
```

## Quyền truy cập

- Chỉ admin mới có thể gọi API này
- Sử dụng `JwtAuthAdminGuard`

## Chức năng

### 1. Tìm kiếm rewards cần rút
- Tìm tất cả rewards có `ar_status = "can-withdraw"`
- Lấy thông tin token mint và wallet address

### 2. Xử lý từng reward
- Sử dụng private key từ biến môi trường `WALLET_WITHDRAW_REWARD`
- Gửi token từ ví withdraw đến ví người nhận
- Cập nhật trạng thái reward thành `"withdrawn"`

### 3. Cập nhật database
- Cập nhật `ar_status = "withdrawn"`
- Cập nhật `ar_hash` với transaction hash
- Ghi log kết quả xử lý

## Biến môi trường cần thiết

Thêm vào file `.env`:

```env
# Private key của ví để rút rewards (format: base58 hoặc JSON)
WALLET_WITHDRAW_REWARD=your_private_key_here

# Solana RPC URL (optional, default: mainnet)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Request Body

Không cần request body, chỉ cần admin authentication.

## Response

### Success Response
```json
{
  "success": true,
  "message": "Airdrop withdrawal process completed",
  "processed": 5,
  "success_count": 4,
  "error_count": 1,
  "results": [
    {
      "reward_id": 1,
      "status": "success",
      "transaction_hash": "5J7X...abc123",
      "amount": 1000000
    },
    {
      "reward_id": 2,
      "status": "error",
      "error": "Insufficient balance"
    }
  ]
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message here"
}
```

## Flow xử lý

```
1. Tìm rewards có ar_status = "can-withdraw"
2. Với mỗi reward:
   - Lấy token mint address
   - Kiểm tra số dư ví withdraw
   - Tạo transaction chuyển token
   - Gửi transaction lên Solana
   - Chờ confirmation
   - Cập nhật database
3. Trả về kết quả tổng hợp
```

## Lưu ý quan trọng

1. **Private Key Security**: Biến `WALLET_WITHDRAW_REWARD` phải được bảo mật tuyệt đối
2. **Token Balance**: Ví withdraw phải có đủ số dư token để rút
3. **Network Fees**: Cần có đủ SOL để trả phí transaction
4. **Error Handling**: API xử lý từng reward riêng biệt, lỗi một reward không ảnh hưởng đến các reward khác
5. **Transaction Confirmation**: Chờ transaction được confirm trước khi cập nhật database

## Logging

API ghi log chi tiết cho:
- Quá trình xử lý từng reward
- Kết quả transaction
- Lỗi xảy ra
- Thống kê tổng hợp

## Dependencies

- `@solana/web3.js`: Solana connection và transaction
- `@solana/spl-token`: Token transfer và ATA management (hỗ trợ cả SPL Token cũ và SPL Token-2022)
- TypeORM: Database operations
- Redis: Lock management (nếu cần)

## Tính năng đặc biệt

### **Hỗ trợ đa chương trình token:**
- **SPL Token cũ** (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
- **SPL Token-2022** (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`)

### **Tự động phát hiện:**
- API tự động phát hiện loại chương trình token dựa trên `owner` của mint account
- Sử dụng đúng program ID cho ATA creation và token transfer
- Logging chi tiết về loại chương trình được sử dụng

### **Tương thích ngược:**
- Hỗ trợ đầy đủ cả hai loại token
- Không cần cấu hình thêm
- Tự động xử lý theo loại token được phát hiện
