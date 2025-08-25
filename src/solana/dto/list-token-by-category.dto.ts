import { ApiProperty } from '@nestjs/swagger';

export class ListTokenByCategoryQueryDto {
    @ApiProperty({ description: 'Category name or slug', required: true })
    category: string;
}

export class TokenByCategoryDto {
    @ApiProperty({ description: 'Token ID' })
    id: number;

    @ApiProperty({ description: 'Token name' })
    name: string;

    @ApiProperty({ description: 'Token symbol' })
    symbol: string;

    @ApiProperty({ description: 'Token address' })
    address: string;

    @ApiProperty({ description: 'Token decimals' })
    decimals: number;

    @ApiProperty({ description: 'Token logo URL', required: false })
    logoUrl?: string;

    @ApiProperty({ description: 'Token price in USD', required: false })
    price?: number;

    @ApiProperty({ description: 'Token market cap', required: false })
    marketCap?: number;

    @ApiProperty({ description: 'Token volume 24h', required: false })
    volume24h?: number;

    @ApiProperty({ description: 'Token liquidity', required: false })
    liquidity?: number;

    @ApiProperty({ description: 'Token holders count', required: false })
    holders?: number;

    @ApiProperty({ description: 'Token twitter', required: false })
    twitter?: string;

    @ApiProperty({ description: 'Token telegram', required: false })
    telegram?: string;

    @ApiProperty({ description: 'Token website', required: false })
    website?: string;

    @ApiProperty({ description: 'Token program', required: false })
    program?: string;

    @ApiProperty({ description: 'Token is verified', required: false })
    isVerified?: boolean;
}

export class ListTokenByCategoryResponseDto {
    @ApiProperty({ description: 'HTTP status code' })
    status: number;

    @ApiProperty({ description: 'Response message' })
    message: string;

    @ApiProperty({ description: 'List of tokens', type: [TokenByCategoryDto] })
    data: TokenByCategoryDto[];
} 