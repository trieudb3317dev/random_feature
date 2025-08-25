import { ApiProperty } from '@nestjs/swagger';

export class WalletItemDto {
    @ApiProperty({
        description: 'ID của ví',
        example: 3251125
    })
    wallet_id: number;

    @ApiProperty({
        description: 'Loại ví (main, other, import)',
        example: 'main'
    })
    wallet_type: string;

    @ApiProperty({
        description: 'Tên ví',
        example: 'Ví trading',
        nullable: true
    })
    wallet_name: string | null;

    @ApiProperty({
        description: 'Địa chỉ Solana',
        example: 'FkGizKvw3PSZ1SFgVJpotee5o6Jm3XEZ1JGobhXTgbds',
        nullable: true
    })
    solana_address: string | null;

    @ApiProperty({
        description: 'Địa chỉ Ethereum',
        example: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        nullable: true
    })
    eth_address: string | null;

    @ApiProperty({
        description: 'Quyền hạn của ví (member, admin, ...)',
        example: 'member'
    })
    wallet_auth: string;
}

export class GetMyWalletsResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;

    @ApiProperty({
        description: 'Danh sách ví của người dùng',
        type: [WalletItemDto]
    })
    data: WalletItemDto[];
} 