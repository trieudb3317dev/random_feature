import { Transform } from 'class-transformer';
import { IsOptional, IsNumber, IsString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SolanaTokenDto {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty()
    symbol: string;

    @ApiProperty()
    address: string;

    @ApiProperty()
    decimals: number;

    @ApiProperty()
    logoUrl: string;

    @ApiProperty({ required: false })
    coingeckoId?: string;

    @ApiProperty({ required: false })
    tradingviewSymbol?: string;

    @ApiProperty()
    isVerified: boolean;

    @ApiProperty()
    marketCap: number;

    @ApiProperty()
    volume24h: number;

    @ApiProperty()
    liquidity: number;

    @ApiProperty()
    holders: number;

    @ApiProperty({ required: false })
    twitter?: string;

    @ApiProperty({ required: false })
    telegram?: string;

    @ApiProperty({ required: false })
    website?: string;

    @ApiProperty()
    price: number;

    @ApiProperty({ required: false })
    transactionHash?: string;

    @ApiProperty({ required: false })
    program?: string;

    @ApiProperty({ required: false })
    events?: any;
}

export class SolanaTokensResponseDto {
    tokens: SolanaTokenDto[];
    total: number;
    page: number;
    limit: number;
}

export class SolanaTokenQueryDto {
    @IsOptional()
    @IsNumber()
    @Transform(({ value }) => parseInt(value, 10))
    page?: number;

    @IsOptional()
    @IsNumber()
    @Transform(({ value }) => parseInt(value, 10))
    limit?: number;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    })
    verified?: boolean;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    })
    random?: boolean;
} 