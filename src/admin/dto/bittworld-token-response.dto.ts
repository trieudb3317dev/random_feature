import { ApiProperty } from '@nestjs/swagger';

export class BittworldTokenResponseDto {
    @ApiProperty({
        description: 'ID của token',
        example: 1
    })
    bt_id: number;

    @ApiProperty({
        description: 'Tên token',
        example: 'Bitcoin'
    })
    bt_name: string;

    @ApiProperty({
        description: 'Ký hiệu token',
        example: 'BTC'
    })
    bt_symbol: string;

    @ApiProperty({
        description: 'Địa chỉ token',
        example: 'So11111111111111111111111111111111111111112'
    })
    bt_address: string;

    @ApiProperty({
        description: 'URL logo token',
        example: 'https://example.com/logo.png'
    })
    bt_logo_url: string;

    @ApiProperty({
        description: 'Trạng thái token',
        example: true
    })
    bt_status: boolean;

    @ApiProperty({
        description: 'Thời gian tạo',
        example: '2024-01-01T00:00:00.000Z'
    })
    created_at: Date;

    @ApiProperty({
        description: 'Thời gian cập nhật',
        example: '2024-01-01T00:00:00.000Z'
    })
    updated_at: Date;
}

export class CreateBittworldTokenResponseDto {
    @ApiProperty({
        description: 'Status code',
        example: 201
    })
    status: number;

    @ApiProperty({
        description: 'Thông báo',
        example: 'Bittworld token created successfully'
    })
    message: string;

    @ApiProperty({
        description: 'Dữ liệu token đã tạo',
        type: BittworldTokenResponseDto
    })
    data: BittworldTokenResponseDto;
}
