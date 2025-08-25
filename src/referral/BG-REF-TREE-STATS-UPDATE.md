# BG Ref Tree API - Thêm thống kê

## Tổng quan

Đã cập nhật API `/bg-ref/trees` để thêm các trường thống kê cho mỗi node trong cây affiliate:
- `totalVolume`: Tổng khối lượng giao dịch của node
- `totalReward`: Tổng hoa hồng wallet hiện tại nhận được từ node
- `totalTrans`: Tổng số giao dịch của node

## Thay đổi trong code

### 1. Cập nhật BgRefService.getMyAffiliateTree()

**File:** `src/referral/bg-ref.service.ts`

**Thay đổi chính:**
- Thêm function `getNodeStats()` để tính toán thống kê cho mỗi node
- Cập nhật response structure để bao gồm các trường thống kê mới

**Logic tính toán:**

```typescript
// Lấy tổng khối lượng giao dịch và số giao dịch
const volumeStats = await this.dataSource.createQueryBuilder()
  .select('COALESCE(SUM(orders.order_total_value), 0)', 'totalVolume')
  .addSelect('COUNT(orders.order_id)', 'totalTrans')
  .from('trading_orders', 'orders')
  .where('orders.order_wallet_id = :walletId', { walletId: nodeWalletId })
  .getRawOne();

// Lấy tổng hoa hồng wallet hiện tại nhận được từ node
const rewardStats = await this.bgAffiliateCommissionRewardRepository.createQueryBuilder('reward')
  .innerJoin('trading_orders', 'order', 'order.order_id = reward.bacr_order_id')
  .select('COALESCE(SUM(reward.bacr_commission_amount), 0)', 'totalReward')
  .where('reward.bacr_wallet_id = :currentWalletId', { currentWalletId: walletId })
  .andWhere('order.order_wallet_id = :nodeWalletId', { nodeWalletId: nodeWalletId })
  .getRawOne();
```

## API Response Structure

### Trước khi cập nhật:
```json
{
  "nodeId": 2,
  "solanaAddress": "ABC123...",
  "commissionPercent": 50.00,
  "effectiveFrom": "2024-01-15T10:30:00Z",
  "walletInfo": {
    "walletId": 456,
    "nickName": "User1",
    "solanaAddress": "ABC123...",
    "ethAddress": "0x123..."
  },
  "children": [...]
}
```

### Sau khi cập nhật:
```json
{
  "nodeId": 2,
  "solanaAddress": "ABC123...",
  "commissionPercent": 50.00,
  "effectiveFrom": "2024-01-15T10:30:00Z",
  "totalVolume": 1500.75,
  "totalReward": 15.01,
  "totalTrans": 25,
  "walletInfo": {
    "walletId": 456,
    "nickName": "User1",
    "solanaAddress": "ABC123...",
    "ethAddress": "0x123..."
  },
  "children": [...]
}
```

## Các trường thống kê

### 1. totalVolume
- **Mô tả:** Tổng khối lượng giao dịch của node (USD)
- **Nguồn dữ liệu:** `trading_orders.order_total_value`
- **Logic:** SUM của tất cả giao dịch của node đó
- **Đơn vị:** USD

### 2. totalReward
- **Mô tả:** Tổng hoa hồng wallet hiện tại nhận được từ node
- **Nguồn dữ liệu:** `bg_affiliate_commission_rewards.bacr_commission_amount`
- **Logic:** SUM của hoa hồng mà wallet hiện tại nhận được từ giao dịch của node đó
- **Đơn vị:** USD

### 3. totalTrans
- **Mô tả:** Tổng số giao dịch của node
- **Nguồn dữ liệu:** `trading_orders`
- **Logic:** COUNT của tất cả giao dịch của node đó
- **Đơn vị:** Số lượng giao dịch

## Performance Considerations

### 1. Database Queries
- Mỗi node sẽ có 2 queries riêng biệt
- Sử dụng JOIN để tối ưu hóa query hoa hồng
- Sử dụng COALESCE để xử lý NULL values

### 2. Caching Strategy
- Có thể implement caching cho thống kê nếu cần
- Cache có thể được invalidate khi có giao dịch mới

### 3. Pagination
- API hiện tại trả về toàn bộ tree
- Có thể cần pagination nếu tree quá lớn

## Test Cases

### 1. Basic Functionality
- [x] Wallet có downline và giao dịch
- [x] Wallet không có downline
- [x] Wallet không thuộc BG affiliate

### 2. Data Accuracy
- [x] totalVolume tính chính xác
- [x] totalReward tính chính xác
- [x] totalTrans tính chính xác

### 3. Edge Cases
- [x] Node không có giao dịch nào
- [x] Node không có hoa hồng nào
- [x] Tree có nhiều levels

## Database Schema Dependencies

### Tables Used:
1. `bg_affiliate_nodes` - Thông tin nodes
2. `trading_orders` - Giao dịch để tính volume và transactions
3. `bg_affiliate_commission_rewards` - Hoa hồng để tính rewards
4. `list_wallets` - Thông tin wallet

### Indexes Required:
```sql
-- Để tối ưu performance
CREATE INDEX idx_trading_orders_wallet_id ON trading_orders(order_wallet_id);
CREATE INDEX idx_bg_affiliate_commission_rewards_wallet_id ON bg_affiliate_commission_rewards(bacr_wallet_id);
CREATE INDEX idx_bg_affiliate_commission_rewards_order_id ON bg_affiliate_commission_rewards(bacr_order_id);
```

## Error Handling

### 1. Database Errors
- Sử dụng try-catch để xử lý database errors
- Trả về giá trị mặc định (0) nếu có lỗi

### 2. Invalid Data
- Sử dụng COALESCE để xử lý NULL values
- Parse số an toàn với parseFloat và parseInt

### 3. Performance Issues
- Có thể implement timeout cho queries
- Có thể implement circuit breaker pattern

## Future Enhancements

### 1. Caching
```typescript
// Implement Redis caching
const cacheKey = `node_stats_${nodeWalletId}`;
const cachedStats = await this.cacheService.get(cacheKey);
if (cachedStats) return cachedStats;
```

### 2. Real-time Updates
```typescript
// WebSocket để cập nhật real-time
this.eventEmitter.emit('node_stats_updated', { nodeId, stats });
```

### 3. Advanced Filtering
```typescript
// Thêm filters cho date range
const filters = {
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31')
};
```

## Monitoring

### 1. Performance Metrics
- Response time của API
- Database query time
- Memory usage

### 2. Business Metrics
- Số lượng nodes có giao dịch
- Tổng volume của tree
- Tổng rewards của wallet

### 3. Error Tracking
- Database connection errors
- Query timeout errors
- Data validation errors

## Deployment Notes

### 1. Database Migration
- Không cần migration vì chỉ sử dụng tables hiện có
- Đảm bảo indexes được tạo

### 2. Environment Variables
- Không cần thêm environment variables mới

### 3. Dependencies
- Không cần thêm dependencies mới

## Rollback Plan

### 1. Code Rollback
- Revert changes trong `bg-ref.service.ts`
- Deploy lại version cũ

### 2. Database Rollback
- Không cần database rollback vì không thay đổi schema

### 3. Monitoring
- Monitor error rates sau rollback
- Verify API functionality 