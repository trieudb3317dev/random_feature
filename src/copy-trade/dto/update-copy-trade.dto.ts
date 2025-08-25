import { IsOptional, IsNumber, IsString, IsEnum, Min, Max } from 'class-validator';

export class UpdateCopyTradeDto {
    @IsOptional()
    @IsNumber()
    @Min(0.01)
    amount?: number;

    @IsOptional()
    @IsEnum(['maxbuy', 'fixedbuy', 'fixedratio'])
    buy_option?: 'maxbuy' | 'fixedbuy' | 'fixedratio';

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    fixed_ratio?: number;

    @IsOptional()
    @IsEnum(['auto', 'manual', 'notsell'])
    sell_method?: 'auto' | 'manual' | 'notsell';

    @IsOptional()
    @IsNumber()
    @Min(0)
    tp?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    sl_value?: number;
} 