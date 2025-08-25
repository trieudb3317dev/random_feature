import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class UseWalletDto {
    @ApiProperty({
        description: 'ID của ví cần chuyển đổi',
        example: 3251125
    })
    @IsNumber()
    @IsNotEmpty()
    wallet_id: number;
}

export class UseWalletResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;

    @ApiProperty({
        description: 'Token JWT mới với wallet_id đã chọn',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    })
    token?: string;
} 