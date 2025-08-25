-- Script sửa sequence wallet_auth_wa_id_seq

-- Lấy giá trị ID lớn nhất hiện tại từ bảng wallet_auth
SELECT MAX(wa_id) as max_id FROM wallet_auth;

-- Reset sequence với giá trị lớn hơn max_id để đảm bảo không còn xung đột
-- Thay thế 100 với giá trị max_id tìm được + một số buffer (ví dụ: 20)
ALTER SEQUENCE wallet_auth_wa_id_seq RESTART WITH 100;

-- Kiểm tra giá trị mới của sequence sau khi reset
SELECT last_value FROM wallet_auth_wa_id_seq;

-- Kiểm tra các constraint của bảng wallet_auth
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'wallet_auth';

-- Script kiểm tra xem có record trùng lặp nào không
SELECT wa_user_id, wa_wallet_id, COUNT(*) 
FROM wallet_auth 
GROUP BY wa_user_id, wa_wallet_id 
HAVING COUNT(*) > 1;

-- Tùy chọn: Script xóa các record trùng lặp (chỉ giữ lại bản ghi có wa_id nhỏ nhất)
WITH duplicates AS (
    SELECT wa_id, wa_user_id, wa_wallet_id,
           ROW_NUMBER() OVER (PARTITION BY wa_user_id, wa_wallet_id ORDER BY wa_id) as row_num
    FROM wallet_auth
)
DELETE FROM wallet_auth
WHERE wa_id IN (
    SELECT wa_id FROM duplicates WHERE row_num > 1
);

-- Tạo unique constraint (nếu chưa có) để ngăn trùng lặp trong tương lai
ALTER TABLE wallet_auth ADD CONSTRAINT wallet_auth_user_wallet_unique UNIQUE (wa_user_id, wa_wallet_id); 