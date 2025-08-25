import { IsEnum } from 'class-validator';

export class ChangeGroupStatusDto {
    @IsEnum(['on', 'off', 'delete'])
    status: 'on' | 'off' | 'delete';
} 