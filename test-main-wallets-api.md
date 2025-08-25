# Test API chỉ hiển thị ví main

## Thay đổi đã thực hiện

### 1. API `/api/v1/admin/list-wallets`
**Thay đổi**: Chỉ hiển thị những ví có `wa_type = 'main'` trong bảng `wallet_auth`

**Logic mới**:
```sql
SELECT wallet.* FROM list_wallets wallet
INNER JOIN wallet_auth wa ON wa.wa_wallet_id = wallet.wallet_id
WHERE wa.wa_type = 'main'
```

### 2. API `/api/v1/admin/wallet-statistics`
**Thay đổi**: Chỉ đếm những ví main

**Logic mới**:
```sql
SELECT COUNT(*) FROM list_wallets wallet
INNER JOIN wallet_auth wa ON wa.wa_wallet_id = wallet.wallet_id
WHERE wa.wa_type = 'main'
```

### 3. API `/api/v1/admin/order-statistics`
**Thay đổi**: Chỉ đếm orders của những ví main

**Logic mới**:
```sql
-- Tổng orders
SELECT COUNT(*) FROM trading_orders o
INNER JOIN wallet_auth wa ON wa.wa_wallet_id = o.order_wallet_id
WHERE wa.wa_type = 'main'

-- Orders thành công
SELECT COUNT(*) FROM trading_orders o
INNER JOIN wallet_auth wa ON wa.wa_wallet_id = o.order_wallet_id
WHERE wa.wa_type = 'main' AND o.order_status = 'executed'

-- Ví giao dịch nhiều nhất
SELECT o.order_wallet_id, COUNT(*), wallet.wallet_solana_address
FROM trading_orders o
INNER JOIN wallet_auth wa ON wa.wa_wallet_id = o.order_wallet_id
LEFT JOIN list_wallets wallet ON wallet.wallet_id = o.order_wallet_id
WHERE wa.wa_type = 'main'
GROUP BY o.order_wallet_id, wallet.wallet_solana_address
ORDER BY COUNT(*) DESC
LIMIT 1
```

### 4. API `/api/v1/admin/order-history`
**Thay đổi**: Chỉ hiển thị orders của những ví main

**Logic mới**:
```sql
SELECT o.*, wallet.* FROM trading_orders o
LEFT JOIN list_wallets wallet ON wallet.wallet_id = o.order_wallet_id
INNER JOIN wallet_auth wa ON wa.wa_wallet_id = o.order_wallet_id
WHERE wa.wa_type = 'main'
```

## Test Cases

### 1. Kiểm tra API list-wallets
```bash
GET /api/v1/admin/list-wallets?page=1&limit=10
Authorization: Bearer <admin_token>
```

**Expected Result**: Chỉ trả về những ví có `wa_type = 'main'`

### 2. Kiểm tra API wallet-statistics
```bash
GET /api/v1/admin/wallet-statistics
Authorization: Bearer <admin_token>
```

**Expected Result**: `totalWallets` chỉ đếm những ví main

### 3. Kiểm tra API order-statistics
```bash
GET /api/v1/admin/order-statistics
Authorization: Bearer <admin_token>
```

**Expected Result**: 
- `total` chỉ đếm orders của ví main
- `executed` chỉ đếm orders thành công của ví main
- `mostActiveWallet` chỉ xét những ví main

### 4. Kiểm tra API order-history
```bash
GET /api/v1/admin/order-history?page=1&limit=10
Authorization: Bearer <admin_token>
```

**Expected Result**: Chỉ trả về orders của những ví main

## Database Queries để kiểm tra

### Kiểm tra ví main:
```sql
SELECT wallet.wallet_id, wallet.wallet_solana_address, wa.wa_type
FROM list_wallets wallet
INNER JOIN wallet_auth wa ON wa.wa_wallet_id = wallet.wallet_id
WHERE wa.wa_type = 'main'
ORDER BY wallet.wallet_id DESC
LIMIT 10;
```

### Kiểm tra ví không phải main:
```sql
SELECT wallet.wallet_id, wallet.wallet_solana_address, wa.wa_type
FROM list_wallets wallet
INNER JOIN wallet_auth wa ON wa.wa_wallet_id = wallet.wallet_id
WHERE wa.wa_type != 'main'
ORDER BY wallet.wallet_id DESC
LIMIT 10;
```

### Kiểm tra orders của ví main:
```sql
SELECT o.order_id, o.order_wallet_id, wallet.wallet_solana_address, wa.wa_type
FROM trading_orders o
INNER JOIN wallet_auth wa ON wa.wa_wallet_id = o.order_wallet_id
LEFT JOIN list_wallets wallet ON wallet.wallet_id = o.order_wallet_id
WHERE wa.wa_type = 'main'
ORDER BY o.order_created_at DESC
LIMIT 10;
```

## Lưu ý

1. **Không ảnh hưởng đến dữ liệu**: Chỉ thay đổi logic query, không xóa dữ liệu
2. **Backward compatible**: Các API khác vẫn hoạt động bình thường
3. **Performance**: Sử dụng INNER JOIN để tối ưu performance
4. **Consistency**: Tất cả các API liên quan đến wallet đều chỉ xét ví main 