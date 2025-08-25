import { IsOptional, IsString, IsEnum, IsNumber, Min, Max } from 'class-validator';

export class UpdateGroupDto {
    @IsOptional()
    @IsString()
    mg_name?: string;

    @IsOptional()
    @IsEnum(['fixedprice', 'fixedratio', 'trackingratio'])
    mg_option?: 'fixedprice' | 'fixedratio' | 'trackingratio';

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    mg_fixed_price?: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    mg_fixed_ratio?: number;
} 