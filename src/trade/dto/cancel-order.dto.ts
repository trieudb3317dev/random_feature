import { IsEnum } from 'class-validator';

export class CancelOrderDto {
    @IsEnum(['canceled'])
    status: 'canceled';
} 