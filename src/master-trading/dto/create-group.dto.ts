import { IsNotEmpty, IsString, IsEnum, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateGroupDto {
    @IsNotEmpty()
    @IsString()
    mg_name: string;

    @IsNotEmpty()
    @IsEnum(['fixedprice', 'fixedratio', 'trackingratio'])
    mg_option: 'fixedprice' | 'fixedratio' | 'trackingratio';

    @IsOptional()
    @IsNumber()
    @Min(0.01, { message: 'Fixed price must be greater than or equal to 0.01' })
    mg_fixed_price?: number;

    @IsOptional()
    @IsNumber()
    @Min(1, { message: 'Fixed ratio must be greater than or equal to 1' })
    @Max(100, { message: 'Fixed ratio must be less than or equal to 100' })
    mg_fixed_ratio?: number;
} 