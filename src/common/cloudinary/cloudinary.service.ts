import { Injectable, Inject } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(@Inject('CLOUDINARY') private cloudinary) {}

  // Hàm upload ảnh chung
  async uploadImage(file: Express.Multer.File, folder: string = 'my_images'): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      this.cloudinary.uploader.upload_stream(
        { 
          folder: folder,
          allowed_formats: ['jpg', 'png', 'gif', 'webp'],
          transformation: [
            { width: 500, height: 500, crop: 'limit' },
            { quality: 'auto' }
          ]
        },
        (error: UploadApiErrorResponse, result: UploadApiResponse) => {
          if (error) return reject(error);
          resolve(result); // Trả về thông tin ảnh đã upload
        },
      ).end(file.buffer); // Gửi dữ liệu ảnh từ file buffer
    });
  }

  // Hàm upload logo cho airdrop pools
  async uploadAirdropLogo(file: Express.Multer.File): Promise<string> {
    try {
      const result = await this.uploadImage(file, 'memepump/airdrops');
      return result.secure_url;
    } catch (error) {
      throw new Error(`Failed to upload airdrop logo: ${error.message}`);
    }
  }

  // Hàm upload ảnh cho tokens (giữ nguyên cho backward compatibility)
  async uploadTokenImage(file: Express.Multer.File): Promise<string> {
    try {
      const result = await this.uploadImage(file, 'memepump/tokens');
      return result.secure_url;
    } catch (error) {
      throw new Error(`Failed to upload token image: ${error.message}`);
    }
  }
}