import { IsEnum, IsOptional } from 'class-validator';

export class GetCopyTradeDetailDto {
    @IsOptional()
    @IsEnum(['failed', 'success'])
    status?: 'failed' | 'success';
} 