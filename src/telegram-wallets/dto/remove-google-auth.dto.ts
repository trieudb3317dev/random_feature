import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class RemoveGoogleAuthDto {
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

    @ApiProperty({
        description: 'Token 6 chữ số từ Google Authenticator',
        example: '123456',
        required: true
    })
    @IsString()
    @MinLength(6)
    @MinLength(6)
    token: string;
}

export class RemoveGoogleAuthResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;
} 