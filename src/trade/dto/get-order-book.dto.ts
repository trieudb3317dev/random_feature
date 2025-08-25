import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetOrderBookDto {
    @IsString()
    token_address: string;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    depth?: number = 10;

    @IsOptional()
    @IsNumber()
    @Min(0)
    min_quantity?: number;

    @IsOptional()
    @IsNumber()
    price_range_percentage?: number = 10; // Default 10% from current price
} 