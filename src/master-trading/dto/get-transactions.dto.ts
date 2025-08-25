import { IsEnum, IsOptional, IsDateString } from 'class-validator';

export class GetTransactionsDto {
    @IsOptional()
    @IsEnum(['running', 'pause', 'stop'])
    status?: 'running' | 'pause' | 'stop';

    @IsOptional()
    @IsDateString()
    from_date?: string;

    @IsOptional()
    @IsDateString()
    to_date?: string;
} 