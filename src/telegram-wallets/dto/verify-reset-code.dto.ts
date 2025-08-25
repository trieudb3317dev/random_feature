import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyResetCodeDto {
    @ApiProperty({ description: 'Reset code received from Telegram' })
    @IsNotEmpty()
    @IsString()
    code: string;
} 