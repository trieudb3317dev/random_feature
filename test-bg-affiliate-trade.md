# Test BG Affiliate Trading Logic

## Mô tả
Kiểm tra logic tính toán phần thưởng BG affiliate khi có giao dịch thành công.

## Các trường hợp test

### 1. Wallet thuộc BG Affiliate System
**Kịch bản:**
- Wallet A thuộc BG affiliate tree với commission 70%
- Wallet B là tuyến dưới của A với commission 40%
- Wallet C là tuyến dưới của B với commission 20%
- Wallet C thực hiện giao dịch $1000

**Kết quả mong đợi:**
- Wallet C: Không nhận commission (người giao dịch)
- Wallet B: Nhận $4 (40% của $10 phí giao dịch)
- Wallet A: Nhận $3 (30% của $10 phí giao dịch)

### 2. Wallet không thuộc BG Affiliate System
**Kịch bản:**
- Wallet X thuộc traditional referral system
- Wallet Y là referrer level 1 của X (5% commission)
- Wallet Z là referrer level 2 của X (3% commission)
- Wallet X thực hiện giao dịch $1000

**Kết quả mong đợi:**
- Wallet Y: Nhận $0.5 (5% của $10 phí giao dịch)
- Wallet Z: Nhận $0.3 (3% của $10 phí giao dịch)

### 3. Wallet thuộc BG Affiliate nhưng không có tuyến dưới
**Kịch bản:**
- Wallet M là root BG với commission 70%
- Wallet M thực hiện giao dịch $1000

**Kết quả mong đợi:**
- Wallet M: Nhận $7 (70% của $10 phí giao dịch)

## API Test

### Test API `/api/v1/trade/orders`
```bash
# Tạo order mua token
POST /api/v1/trade/orders
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "order_token_address": "TokenAddress123",
  "order_token_name": "TestToken",
  "order_trade_type": "buy",
  "order_type": "market",
  "order_qlty": 1.0,
  "order_price": 0.001
}
```

**Kiểm tra:**
1. Order được tạo thành công
2. Giao dịch được thực hiện
3. Commission được tính toán đúng theo hệ thống (BG hoặc traditional)
4. Dữ liệu được lưu vào database

## Database Check

### Kiểm tra bảng `bg_affiliate_commission_rewards`
```sql
SELECT 
  bacr_id,
  bacr_tree_id,
  bacr_order_id,
  bacr_wallet_id,
  bacr_commission_amount,
  bacr_level,
  bacr_created_at
FROM bg_affiliate_commission_rewards
WHERE bacr_order_id = <ORDER_ID>
ORDER BY bacr_level ASC;
```

### Kiểm tra bảng `wallet_ref_rewards`
```sql
SELECT 
  wrr_id,
  wrr_ref_id,
  wrr_sol_reward,
  wrr_use_reward,
  wrr_signature,
  wrr_created_at
FROM wallet_ref_rewards
WHERE wrr_signature = '<TX_HASH>'
ORDER BY wrr_created_at ASC;
```

## Log Check

Kiểm tra log để đảm bảo:
1. `Calculated BG affiliate rewards for wallet X, tree Y` - cho BG affiliate
2. `Calculated traditional referral rewards for wallet X` - cho traditional referral
3. Không có lỗi trong quá trình tính toán

## Kết luận

Logic đã được cập nhật để:
1. ✅ Kiểm tra wallet có thuộc BG affiliate không
2. ✅ Nếu có: Tính toán BG affiliate rewards
3. ✅ Nếu không: Tính toán traditional referral rewards
4. ✅ Lưu dữ liệu vào database tương ứng
5. ✅ Log đầy đủ để debug 