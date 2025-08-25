import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddWalletDto {
    @ApiProperty({
        description: 'Tên ví (có thể null)',
        example: 'Ví chính của tôi',
        required: false
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ description: 'Loại ví', enum: ['other', 'import'], example: 'other' })
    @IsEnum(['other', 'import'])
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'Private key của ví (chỉ cần thiết khi type=import)',
        example: '3q9Mck1DYsWracqakBzJExNeAHr83vZs3tWNaJpEaEMtgEcrbrjQXTFi7uPjkeuvhT8M6g7LzQmy',
        required: false
    })
    @IsString()
    @IsOptional()
    private_key?: string;

    @ApiProperty({
        description: 'Nickname của ví (bắt buộc khi type=other hoặc khi import ví mới). Chỉ chấp nhận chữ cái không dấu, số và dấu gạch dưới',
        example: 'my_wallet_1',
        required: false
    })
    @IsString()
    @IsNotEmpty()
    @ValidateIf((o) => o.type === 'other' || (o.type === 'import' && !o.private_key))
    @MinLength(1, {
        message: 'Nickname phải có ít nhất 1 ký tự'
    })
    nick_name?: string;

    @ApiProperty({
        description: 'Quốc gia của người dùng (không bắt buộc)',
        example: 'Vietnam',
        required: false
    })
    @IsString()
    @IsOptional()
    country?: string;
}

export class AddWalletResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;

    @ApiProperty({
        description: 'Dữ liệu ví mới được thêm',
        required: false,
        example: {
            wallet_id: 123,
            solana_address: 'FkGizKvw3PSZ1SFgVJpotee5o6Jm3XEZ1JGobhXTgbds',
            eth_address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            wallet_type: 'other',
            wallet_name: 'Ví chính của tôi',
            wallet_nick_name: 'my_wallet_1',
            wallet_country: 'Vietnam'
        }
    })
    data?: {
        wallet_id: number;
        solana_address: string;
        eth_address: string;
        wallet_type: string;
        wallet_name: string | null;
        wallet_nick_name: string;
        wallet_country: string | null;
    };
} 