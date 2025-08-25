import { IsNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteWalletDto {
    @ApiProperty({
        description: 'ID của ví cần xóa liên kết',
        example: 3251125
    })
    @IsNumber()
    @IsNotEmpty()
    wallet_id: number;
}

export class DeleteWalletResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;

    @ApiProperty({
        description: 'Thông tin ví đã xóa liên kết',
        required: false,
        example: {
            wallet_id: 3251125,
            wallet_type: 'other',
            wallet_name: 'Ví phụ',
            solana_address: 'FkGizKvw3PSZ1SFgVJpotee5o6Jm3XEZ1JGobhXTgbds',
            eth_address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
        }
    })
    data?: {
        wallet_id: number;
        wallet_type: string;
        wallet_name: string | null;
        solana_address: string | null;
        eth_address: string | null;
    };
} 