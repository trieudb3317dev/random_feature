import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyGmailDto {
    @ApiProperty({
        description: 'Mã xác thực email từ Telegram',
        example: 'AbCd1234'
    })
    @IsNotEmpty()
    @IsString()
    telegram_code: string;
}

export class VerifyGmailResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;
} 