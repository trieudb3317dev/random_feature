import { ApiProperty } from '@nestjs/swagger';

export class GetWalletInfoResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;

    @ApiProperty({
        description: 'Thông tin của ví',
        required: false,
        example: {
            wallet_id: 123,
            wallet_name: 'Ví chính của tôi',
            wallet_nick_name: 'my_wallet_1',
            wallet_country: 'Vietnam',
            solana_address: 'FkGizKvw3PSZ1SFgVJpotee5o6Jm3XEZ1JGobhXTgbds',
            role: 'member'
        }
    })
    data?: {
        wallet_id: number;
        wallet_name: string | null;
        wallet_nick_name: string;
        wallet_country: string | null;
        solana_address: string;
        role: string;
    };
} 