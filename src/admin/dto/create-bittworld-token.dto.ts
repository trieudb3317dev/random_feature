import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBittworldTokenDto {
    @ApiProperty({
        description: 'Tên token',
        example: 'Bitcoin',
        maxLength: 100
    })
    @IsString()
    @IsNotEmpty()
    bt_name: string;

    @ApiProperty({
        description: 'Ký hiệu token',
        example: 'BTC',
        maxLength: 20
    })
    @IsString()
    @IsNotEmpty()
    bt_symbol: string;

    @ApiProperty({
        description: 'Địa chỉ token (Solana address)',
        example: 'So11111111111111111111111111111111111111112'
    })
    @IsString()
    @IsNotEmpty()
    bt_address: string;

    @ApiProperty({
        description: 'URL logo token',
        example: 'https://example.com/logo.png',
        required: false
    })
    @IsString()
    @IsOptional()
    bt_logo_url?: string;

    @ApiProperty({
        description: 'Trạng thái token',
        example: true,
        default: true
    })
    @IsBoolean()
    @IsOptional()
    bt_status?: boolean;
}
