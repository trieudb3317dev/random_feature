import { ApiProperty } from '@nestjs/swagger';

export class ConnectMasterDto {
    @ApiProperty({
        description: 'Địa chỉ wallet của master (Solana hoặc ETH)',
        example: '8ZxXpnYm4qHjGV3cLx7e5iosAJpXXXXXXXXXXXXXX'
    })
    master_wallet_address: string;

    @ApiProperty({
        description: 'Loại giới hạn: price, ratio hoặc default. Lưu ý: Với VIP master, luôn sử dụng giá trị "default" bất kể giá trị được gửi lên',
        enum: ['price', 'ratio', 'default'],
        example: 'price'
    })
    option_limit: 'price' | 'ratio' | 'default';

    @ApiProperty({
        description: 'Giới hạn giá (khi option_limit là price và master là normal). Đối với VIP master, giá trị này không được sử dụng',
        required: false,
        example: 10.5
    })
    price_limit: number;

    @ApiProperty({
        description: 'Giới hạn tỷ lệ % (khi option_limit là ratio và master là normal, từ 5-100%). Đối với VIP master, giá trị này không được sử dụng',
        required: false,
        example: 20
    })
    ratio_limit: number;
} 