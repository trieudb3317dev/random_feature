# Get Top Round API

## Tổng quan

API `admin/get-top-round` được sử dụng để lấy cấu hình top round hiện tại cho airdrop rewards.

## Endpoint

```
GET /api/v1/admin/get-top-round
```

## Quyền truy cập

- Chỉ admin mới có thể gọi API này
- Sử dụng `JwtAuthAdminGuard`

## Chức năng

### 1. Lấy cấu hình hiện tại
- Truy vấn bảng `airdrop_top_round`
- Sắp xếp theo `atr_num_top` tăng dần
- Trả về số lượng top và phần trăm tương ứng

### 2. Xử lý trường hợp không có cấu hình
- Nếu không có cấu hình nào: trả về `count_top: 0`
- Nếu có cấu hình: trả về danh sách đầy đủ

## Request

Không cần request body, chỉ cần admin authentication.

## Response

### Success Response (có cấu hình)
```json
{
  "success": true,
  "message": "Top round configuration retrieved successfully",
  "data": {
    "count_top": 3,
    "top_rounds": [
      {
        "atr_num_top": 1,
        "atr_percent": 50
      },
      {
        "atr_num_top": 2,
        "atr_percent": 30
      },
      {
        "atr_num_top": 3,
        "atr_percent": 20
      }
    ]
  }
}
```

### Success Response (không có cấu hình)
```json
{
  "success": true,
  "message": "No top round configuration found",
  "data": {
    "count_top": 0,
    "top_rounds": []
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message here"
}
```

## Cấu trúc dữ liệu

### Response Fields
- `count_top`: Số lượng vị trí top được cấu hình
- `top_rounds`: Mảng các cấu hình top round
  - `atr_num_top`: Số thứ tự top (1, 2, 3...)
  - `atr_percent`: Phần trăm reward tương ứng

### Database Fields
- `atr_id`: Primary key
- `atr_num_top`: Số thứ tự top
- `atr_percent`: Phần trăm reward

## Ví dụ sử dụng

### 1. Lấy cấu hình hiện tại
```bash
GET /api/v1/admin/get-top-round
Authorization: Bearer <admin_jwt_token>
```

### 2. Kết quả trả về
```json
{
  "success": true,
  "message": "Top round configuration retrieved successfully",
  "data": {
    "count_top": 5,
    "top_rounds": [
      { "atr_num_top": 1, "atr_percent": 40 },
      { "atr_num_top": 2, "atr_percent": 25 },
      { "atr_num_top": 3, "atr_percent": 20 },
      { "atr_num_top": 4, "atr_percent": 10 },
      { "atr_num_top": 5, "atr_percent": 5 }
    ]
  }
}
```

## Lưu ý

1. **Sắp xếp**: Kết quả luôn được sắp xếp theo `atr_num_top` tăng dần
2. **Validation**: API không thực hiện validation dữ liệu, chỉ đọc và trả về
3. **Permissions**: Chỉ admin mới có thể truy cập
4. **Real-time**: Kết quả luôn là dữ liệu hiện tại từ database

## Sử dụng kết hợp

API này thường được sử dụng kết hợp với:
- **`POST /admin/set-top-round`**: Để cập nhật cấu hình
- **`POST /admin/airdrop-calculate`**: Để tính toán rewards dựa trên cấu hình
- **Frontend**: Để hiển thị cấu hình hiện tại cho admin

## Logging

API ghi log cho:
- Quá trình truy vấn cấu hình
- Số lượng cấu hình tìm thấy
- Lỗi xảy ra (nếu có)
