import { IsEnum, IsNumber } from 'class-validator';

export class ChangeStatusDto {
    @IsNumber()
    ct_id: number;

    @IsEnum(['running', 'pause', 'stop'])
    status: 'running' | 'pause' | 'stop';
} 