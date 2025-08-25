import { IsEnum, IsNumber, IsPositive } from 'class-validator';

export class MasterSetConnectDto {
    @IsNumber()
    @IsPositive()
    mc_id: number;

    @IsEnum(['connect', 'block', 'pause'])
    status: 'connect' | 'block' | 'pause';
} 