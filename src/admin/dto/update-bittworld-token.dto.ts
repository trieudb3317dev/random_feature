import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBittworldTokenDto {
    @ApiProperty({
        description: 'Tên token',
        example: 'Bitcoin Updated',
        maxLength: 100,
        required: false
    })
    @IsString()
    @IsOptional()
    bt_name?: string;

    @ApiProperty({
        description: 'Ký hiệu token',
        example: 'BTC',
        maxLength: 20,
        required: false
    })
    @IsString()
    @IsOptional()
    bt_symbol?: string;

    @ApiProperty({
        description: 'URL logo token',
        example: 'https://example.com/new-logo.png',
        required: false
    })
    @IsString()
    @IsOptional()
    bt_logo_url?: string;

    @ApiProperty({
        description: 'Trạng thái token',
        example: false,
        required: false
    })
    @IsBoolean()
    @IsOptional()
    bt_status?: boolean;
}
