import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, ValidateIf, MinLength } from 'class-validator';

export class AddGmailDto {
    @ApiProperty({
        description: 'Authorization code từ Google OAuth',
        example: '4/0AfJohXn...'
    })
    @IsNotEmpty()
    @IsString()
    code: string;
}

export class AddGmailResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;
} 