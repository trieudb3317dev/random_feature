import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckMasterDto {
    @ApiProperty({
        description: 'Địa chỉ wallet cần kiểm tra',
        example: '8ZxXpnYm4qHjGV3cLx7e5iosAJpXXXXXXXXXXXXXX'
    })
    @IsString()
    @IsNotEmpty()
    wallet_address: string;
} 