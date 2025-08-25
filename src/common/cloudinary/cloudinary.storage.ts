import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';

// Cấu hình Multer với Cloudinary
export const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'my_images', // Thư mục lưu ảnh trên Cloudinary
    format: 'png', // Định dạng file (png, jpg, v.v.)
    public_id: file.originalname.split('.')[0], // Đặt tên file dựa trên tên gốc
  }),
});