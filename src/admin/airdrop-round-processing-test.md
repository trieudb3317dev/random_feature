# Airdrop Round Processing Test

## 🔍 Logic Overview

### **Step 1: Check Active Round**
- Tìm kiếm record trong `airdrop_pool_rounds` có `apr_status = 'active'`
- Nếu không có → bỏ qua và tiếp tục tính toán như bình thường
- Nếu có → tiếp tục xử lý

### **Step 2: Process Active Pools**
- Lấy tất cả pools có `apl_status = 'active'`
- Với mỗi pool:
  - Nếu `apl_round_end = null` → cộng `apl_volume` vào tổng volume và cập nhật `apl_round_end = current_time`
  - Nếu `apl_round_end != null` → bỏ qua (đã xử lý trước đó)

### **Step 3: Process Active Stakes**
- Với mỗi stake trong pool có `apj_status = 'active'`:
  - Nếu `apj_round_end = null` → cộng `apj_volume` vào tổng volume và cập nhật `apj_round_end = current_time`
  - Nếu `apj_round_end != null` → bỏ qua (đã xử lý trước đó)

### **Step 4: Create Round Details**
- Tạo record trong `airdrop_round_details` với:
  - `ard_pool_id`: ID của pool
  - `ard_round_id`: ID của active round
  - `ard_total_volume`: Tổng volume đã tính được

## 📊 Test Scenarios

### **Scenario 1: No Active Round**
```
Input: Không có record nào trong airdrop_pool_rounds có apr_status = 'active'
Expected: Bỏ qua round processing, tiếp tục tính toán airdrop như bình thường
```

### **Scenario 2: Active Round - First Time Processing**
```
Input: 
- Có active round (apr_id = 1)
- Pool A: apl_volume = 500,000, apl_round_end = null
- Stake 1: apj_volume = 100,000, apj_round_end = null
- Stake 2: apj_volume = 200,000, apj_round_end = null

Expected:
- Pool A: apl_round_end = current_time, volume = 500,000
- Stake 1: apj_round_end = current_time, volume = 100,000
- Stake 2: apj_round_end = current_time, volume = 200,000
- Round Detail: ard_total_volume = 800,000
```

### **Scenario 3: Active Round - Partial Processing**
```
Input:
- Có active round (apr_id = 1)
- Pool A: apl_volume = 500,000, apl_round_end = null
- Stake 1: apj_volume = 100,000, apj_round_end = null
- Stake 2: apj_volume = 200,000, apj_round_end = 2024-01-01 (đã xử lý)

Expected:
- Pool A: apl_round_end = current_time, volume = 500,000
- Stake 1: apj_round_end = current_time, volume = 100,000
- Stake 2: bỏ qua (đã có apj_round_end)
- Round Detail: ard_total_volume = 600,000
```

### **Scenario 4: Active Round - Already Processed**
```
Input:
- Có active round (apr_id = 1)
- Pool A: apl_volume = 500,000, apl_round_end = 2024-01-01 (đã xử lý)
- Stake 1: apj_volume = 100,000, apj_round_end = 2024-01-01 (đã xử lý)

Expected:
- Pool A: bỏ qua (đã có apl_round_end)
- Stake 1: bỏ qua (đã có apj_round_end)
- Không tạo round detail mới
```

## 🎯 Key Points

1. **Chỉ xử lý active pools và active stakes**
2. **Chỉ cộng volume cho các record chưa được xử lý (round_end = null)**
3. **Tránh tạo duplicate round details**
4. **Logging chi tiết cho debugging**
5. **Return thông tin về round processing result**

## ✅ Verification

### **Database Changes:**
- `airdrop_list_pool.apl_round_end` được cập nhật cho active pools chưa xử lý
- `airdrop_pool_joins.apj_round_end` được cập nhật cho active stakes chưa xử lý
- `airdrop_round_details` được tạo cho các pools đã xử lý

### **Return Value:**
```typescript
{
  hasActiveRound: boolean;
  activeRoundId?: number;
  processedPools: number;
  totalVolume: number;
}
```

## 🔧 Integration

Hàm `processActiveRounds()` được gọi trong `calculateAirdropRewards()` trước khi bắt đầu tính toán airdrop rewards. 