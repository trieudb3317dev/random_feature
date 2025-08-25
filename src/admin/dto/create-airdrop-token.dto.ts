import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAirdropTokenDto {
  @ApiProperty({
    description: 'Token name',
    example: 'Bitcoin AI Trading Token'
  })
  @IsString()
  @IsNotEmpty()
  token_name: string;

  @ApiProperty({
    description: 'Token mint address',
    example: '4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN'
  })
  @IsString()
  @IsNotEmpty()
  token_mint: string;

  @ApiProperty({
    description: 'Amount for round 1 (must be greater than 0)',
    example: 1000000
  })
  @IsNumber()
  @Min(1, { message: 'Amount for round 1 must be greater than 0' })
  amount_round_1: number;

  @ApiProperty({
    description: 'Amount for round 2 (optional)',
    example: 500000,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount_round_2?: number;
} 