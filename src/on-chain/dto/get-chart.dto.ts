import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetChartDto {
    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    @IsNumber()
    @Transform(({ value }) => parseInt(value))
    time_from?: number;

    @IsOptional()
    @IsNumber()
    @Transform(({ value }) => parseInt(value))
    time_to?: number;

    @IsOptional()
    @IsString()
    market_cap?: string;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    remove_outliers?: boolean = true;
} 