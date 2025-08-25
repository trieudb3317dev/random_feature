import { IsNotEmpty, IsNumber, IsString, IsOptional, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWalletDto {
    @ApiProperty({
        description: 'ID của ví cần cập nhật',
        example: 123
    })
    @IsNumber()
    @IsNotEmpty()
    wallet_id: number;

    @ApiProperty({
        description: 'Tên mới của ví',
        example: 'Ví chính của tôi'
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ 
        description: 'Nickname mới của ví (không bắt buộc)', 
        example: 'my_wallet_1',
        required: false 
    })
    @IsString()
    @IsOptional()
    @MinLength(1, {
        message: 'Nickname phải có ít nhất 1 ký tự'
    })

    nick_name?: string;

    @ApiProperty({ 
        description: 'Quốc gia của ví (không bắt buộc)', 
        example: 'Vietnam',
        required: false 
    })
    @IsString()
    @IsOptional()
    country?: string;

    @ApiProperty({
        description: 'Bittworld UID (unique, optional)',
        example: 'BWT123456789',
        required: false
    })
    @IsString()
    @IsOptional()
    bittworld_uid?: string;
}

export class UpdateWalletResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;

    @ApiProperty({
        description: 'Dữ liệu ví sau khi cập nhật',
        required: false,
        example: {
            wallet_id: 123,
            wallet_type: 'main',
            wallet_name: 'Ví chính của tôi',
            wallet_nick_name: 'my_wallet_1',
            wallet_country: 'Vietnam',
            solana_address: 'FkGizKvw3PSZ1SFgVJpotee5o6Jm3XEZ1JGobhXTgbds',
            eth_address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
        }
    })
    data?: {
        wallet_id: number;
        wallet_type: string;
        wallet_name: string;
        wallet_nick_name: string;
        wallet_country: string | null;
        solana_address: string | null;
        eth_address: string | null;
    };
} 