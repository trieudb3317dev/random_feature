import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AirdropListTokenStatus } from '../../airdrops/entities/airdrop-list-token.entity';

export class UpdateAirdropTokenDto {
  @ApiProperty({
    description: 'Token name',
    example: 'Bitcoin AI Trading Token',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  token_name?: string;

  @ApiProperty({
    description: 'Token mint address',
    example: '4DaQEZKVnRiTZjN5HS9TdsuRiknCWPX6Ux6tDRRLvtAN',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  token_mint?: string;

  @ApiProperty({
    description: 'Amount for round 1 (must be greater than 0)',
    example: 1000000,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Amount for round 1 must be greater than 0' })
  amount_round_1?: number;

  @ApiProperty({
    description: 'Status for round 1 (active or pause only)',
    enum: [AirdropListTokenStatus.ACTIVE, AirdropListTokenStatus.PAUSE],
    example: AirdropListTokenStatus.ACTIVE,
    required: false
  })
  @IsOptional()
  @IsEnum([AirdropListTokenStatus.ACTIVE, AirdropListTokenStatus.PAUSE], {
    message: 'Status for round 1 must be either active or pause'
  })
  status_round_1?: AirdropListTokenStatus.ACTIVE | AirdropListTokenStatus.PAUSE;

  @ApiProperty({
    description: 'Amount for round 2 (optional)',
    example: 500000,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount_round_2?: number;

  @ApiProperty({
    description: 'Status for round 2 (active or pause only)',
    enum: [AirdropListTokenStatus.ACTIVE, AirdropListTokenStatus.PAUSE],
    example: AirdropListTokenStatus.ACTIVE,
    required: false
  })
  @IsOptional()
  @IsEnum([AirdropListTokenStatus.ACTIVE, AirdropListTokenStatus.PAUSE], {
    message: 'Status for round 2 must be either active or pause'
  })
  status_round_2?: AirdropListTokenStatus.ACTIVE | AirdropListTokenStatus.PAUSE;
} 