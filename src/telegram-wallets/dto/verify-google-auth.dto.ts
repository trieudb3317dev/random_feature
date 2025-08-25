import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyGoogleAuthDto {
    @ApiProperty({
        description: 'Mã xác thực 6 số từ Google Authenticator',
        example: '123456'
    })
    @IsNotEmpty()
    @IsString()
    @Length(6, 6)
    token: string;
}

export class VerifyGoogleAuthResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;
} 