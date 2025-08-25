# BG Affiliate System Documentation

## Tổng quan
Hệ thống BG Affiliate cho phép tạo cây affiliate với cấu trúc phân cấp, tính toán và phân chia hoa hồng tự động từ các giao dịch.

## API Endpoints

### User APIs

#### 1. Cập nhật commission percent
```
PUT /bg-ref/nodes/commission
```
**Body:**
```json
{
  "toWalletId": 789012,
  "newPercent": 25.00
}
```

#### 2. Cập nhật bg_alias
```
PUT /bg-ref/nodes/alias
```
**Body:**
```json
{
  "toWalletId": 789012,
  "newAlias": "My Custom Alias"
}
```

**Mô tả:**
- Chỉ người tuyến trên mới có thể cập nhật alias cho người tuyến dưới
- Cả hai wallet phải thuộc cùng một cây affiliate
- Alias không được vượt quá 255 ký tự

**Response:**
```json
{
  "success": true,
  "message": "BG alias updated successfully",
  "fromWallet": {
    "walletId": 123456,
    "solanaAddress": "ABC123...",
    "nickName": "Upline User"
  },
  "toWallet": {
    "walletId": 789012,
    "solanaAddress": "DEF456...",
    "nickName": "Downline User"
  },
  "oldAlias": "Previous Alias",
  "newAlias": "My Custom Alias"
}
```

#### 3. Lấy lịch sử hoa hồng
```
GET /bg-ref/commission-history
```

#### 4. Kiểm tra status BG affiliate
```
GET /bg-ref/my-bg-affiliate-status
```

#### 5. Lấy thống kê BG affiliate
```
GET /bg-ref/bg-affiliate-stats
```

#### 6. Lấy cây affiliate của mình
```
GET /bg-ref/trees
```

#### 7. Lấy thống kê downline
```
GET /bg-ref/downline-stats
```

**Query Parameters:**
- `startDate`: Ngày bắt đầu (YYYY-MM-DD)
- `endDate`: Ngày kết thúc (YYYY-MM-DD)
- `minCommission`: Commission tối thiểu
- `maxCommission`: Commission tối đa
- `minVolume`: Volume tối thiểu
- `maxVolume`: Volume tối đa
- `level`: Cấp độ cụ thể
- `sortBy`: Sắp xếp theo (commission, volume, transactions, level)
- `sortOrder`: Thứ tự sắp xếp (asc, desc)

**Response:**
```json
{
  "isBgAffiliate": true,
  "totalMembers": 15,
  "membersByLevel": {
    "level1": 5,
    "level2": 8,
    "level3": 2
  },
  "totalCommissionEarned": 1250.75,
  "totalVolume": 50000.00,
  "totalTransactions": 150,
  "stats": {
    "level1": {
      "count": 5,
      "totalCommission": 500.25,
      "totalVolume": 20000.00,
      "totalTransactions": 50
    }
  },
  "detailedMembers": [
    {
      "walletId": 789012,
      "level": 1,
      "commissionPercent": 25.00,
      "totalCommission": 100.50,
      "totalVolume": 5000.00,
      "totalTransactions": 10,
      "lastTransactionDate": "2024-01-28T10:30:00Z",
      "bgAlias": "My Custom Alias",
      "walletInfo": {
        "nickName": "Member 1",
        "solanaAddress": "DEF456...",
        "ethAddress": "0x123...",
        "createdAt": "2024-01-15T09:00:00Z"
      }
    }
  ]
}
```

## Logic hoạt động

### 1. Tạo cây affiliate
- Admin tạo BG affiliate cho wallet chưa thuộc hệ thống referral nào
- Tự động tạo root node với `ban_parent_wallet_id = null`
- Root BG nhận toàn bộ commission percent

### 2. Thêm node mới
- Khi user mới được giới thiệu bởi BG affiliate member
- Tự động thêm vào cây affiliate với commission percent mặc định
- Commission percent không được vượt quá giới hạn của parent

### 3. Cập nhật commission percent
- Chỉ người giới thiệu trực tiếp mới có quyền thay đổi
- Kiểm tra giới hạn để không ảnh hưởng tuyến dưới
- Lưu log thay đổi

### 4. Cập nhật bg_alias
- Chỉ người tuyến trên mới có thể cập nhật alias cho người tuyến dưới
- Cả hai wallet phải thuộc cùng một cây affiliate
- Kiểm tra quan hệ tuyến trên - tuyến dưới

### 5. Tính toán hoa hồng
- Chỉ tính cho tuyến trên của người giao dịch
- Chỉ tính cho các node có `ban_status = true`
- Tự động phân chia theo commission percent

### 6. Tích hợp với hệ thống referral truyền thống
- Nếu wallet thuộc BG affiliate, bỏ qua referral truyền thống
- Nếu gặp BG affiliate trong chuỗi referral, dừng chuỗi

## Lưu ý quan trọng

1. **Quyền cập nhật alias:**
   - Chỉ người tuyến trên mới có thể cập nhật alias cho người tuyến dưới
   - Không thể cập nhật alias cho chính mình
   - Không thể cập nhật alias cho người cùng cấp hoặc tuyến trên

2. **Validation:**
   - Alias không được vượt quá 255 ký tự
   - Cả hai wallet phải thuộc cùng một cây affiliate
   - Wallet thực hiện thay đổi phải thuộc hệ thống BG affiliate

3. **Error Handling:**
   - Trả về lỗi nếu wallet không thuộc hệ thống BG affiliate
   - Trả về lỗi nếu không có quyền cập nhật (không phải tuyến trên)
   - Trả về lỗi nếu hai wallet không cùng cây affiliate

4. **Downline Stats với bgAlias:**
   - API `downline-stats` hiện bao gồm thông tin `bgAlias` cho mỗi member
   - `bgAlias` có thể là `null` nếu chưa được cập nhật
   - Thông tin alias được lấy từ bảng `bg_affiliate_nodes` 