import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class AddGoogleAuthDto {
    @ApiProperty({
        description: 'Password của ví (chỉ cần thiết nếu user đã có password)',
        example: 'your_password',
        required: false
    })
    @IsOptional()
    @ValidateIf((o) => o.password !== undefined && o.password !== null)
    @IsString()
    @MinLength(6)
    password?: string;
}

export class AddGoogleAuthResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;

    @ApiProperty({
        description: 'URL QR code để quét với Google Authenticator app',
        example: 'otpauth://totp/Memepump:123456789?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ&issuer=Memepump'
    })
    qr_code_url?: string;

    @ApiProperty({
        description: 'Secret key để nhập thủ công vào Google Authenticator app',
        example: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    })
    secret_key?: string;
} 