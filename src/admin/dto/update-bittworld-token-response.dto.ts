import { ApiProperty } from '@nestjs/swagger';

export class UpdateBittworldTokenResponseDto {
    @ApiProperty({
        description: 'Status code',
        example: 200
    })
    status: number;

    @ApiProperty({
        description: 'Thông báo',
        example: 'Bittworld token updated successfully'
    })
    message: string;

    @ApiProperty({
        description: 'Dữ liệu token đã cập nhật'
    })
    data: {
        bt_id: number;
        bt_name: string;
        bt_symbol: string;
        bt_address: string;
        bt_logo_url: string;
        bt_status: boolean;
        updated_at: Date;
    };
}
