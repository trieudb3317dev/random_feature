import { ApiProperty } from '@nestjs/swagger';

export class TokenPriceResponseDto {
    @ApiProperty({ description: 'Token price in USD' })
    priceUSD: number;

    @ApiProperty({ description: 'Token price in SOL' })
    priceSOL: number;

    @ApiProperty({ description: 'Error message if any', required: false })
    error?: string;
} 