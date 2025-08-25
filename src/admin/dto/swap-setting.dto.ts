import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwapSettingDto {
  @ApiProperty({
    description: 'Swap fee percentage (0.00 - 100.00)',
    example: 3.00,
    minimum: 0,
    maximum: 100
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  swap_fee_percent: number;

  @ApiProperty({
    description: 'Investor share percentage (0.00 - 100.00)',
    example: 2.00,
    minimum: 0,
    maximum: 100
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  investor_share_percent: number;
}

export class UpdateSwapSettingDto {
  @ApiProperty({
    description: 'Swap fee percentage (0.00 - 100.00)',
    example: 3.00,
    minimum: 0,
    maximum: 100,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  swap_fee_percent?: number;

  @ApiProperty({
    description: 'Investor share percentage (0.00 - 100.00)',
    example: 2.00,
    minimum: 0,
    maximum: 100,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  investor_share_percent?: number;
}