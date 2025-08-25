import { IsEnum, IsOptional, IsString, IsDateString, IsNumber } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class GetOrdersDto {
    @IsOptional()
    @IsEnum(['buy', 'sell'])
    trade_type?: 'buy' | 'sell';

    @IsOptional()
    @IsEnum(['pending', 'executed', 'canceled', 'failed'])
    status?: 'pending' | 'executed' | 'canceled' | 'failed';

    @IsOptional()
    @IsEnum(['market', 'limit'])
    order_type?: 'market' | 'limit';

    @IsOptional()
    @IsString()
    token_address?: string;

    @IsOptional()
    @IsString()
    token_name?: string;

    @IsOptional()
    @IsDateString()
    @Transform(({ value }) => value ? new Date(value) : undefined)
    from_date?: Date;

    @IsOptional()
    @IsDateString()
    @Transform(({ value }) => value ? new Date(value) : undefined)
    to_date?: Date;

    @IsOptional()
    @IsString()
    token?: string;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    offset?: number;
} 