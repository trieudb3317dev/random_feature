import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
    @ApiProperty({
        description: 'Mã xác thực reset password',
        example: '1234'
    })
    @IsNotEmpty()
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Mật khẩu mới',
        example: 'password123'
    })
    @IsNotEmpty()
    @IsString()
    @MinLength(6)
    password: string;
}

export class ChangePasswordResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;
} 