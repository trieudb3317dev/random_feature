import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { SwapOrderType } from '../entities/swap-order.entity';

export class CreateSwapDto {
  @IsEnum(SwapOrderType)
  swap_type: SwapOrderType;

  @IsNumber()
  @Min(0.000001)
  input_amount: number;
} 