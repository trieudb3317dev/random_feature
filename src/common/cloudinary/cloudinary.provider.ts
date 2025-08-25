import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';

export const CloudinaryProvider = {
  provide: 'CLOUDINARY',
  useFactory: async (configService: ConfigService) => {
    try {
      // Lấy các giá trị từ ConfigService một lần
      const cloudName = configService.get<string>('CLOUDINARY_CLOUD_NAME');
      const apiKey = configService.get<string>('CLOUDINARY_API_KEY');
      const apiSecret = configService.get<string>('CLOUDINARY_API_SECRET');

      // Cấu hình Cloudinary nếu có đủ thông tin
      if (cloudName && apiKey && apiSecret) {
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
        });

        console.log('☁️ Cloudinary connected successfully');
      } else {
        console.log('⚠️ Cloudinary configuration is missing, skipping initialization');
      }

      return cloudinary;
    } catch (error) {
      console.error('❌ Cloudinary configuration error:', error);
      throw error; // Ném lỗi nếu cấu hình không thành công
    }
  },
  inject: [ConfigService],
};
