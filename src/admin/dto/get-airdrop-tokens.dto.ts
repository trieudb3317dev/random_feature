import { IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AirdropListTokenStatus } from '../../airdrops/entities/airdrop-list-token.entity';
import { Type } from 'class-transformer';

export class GetAirdropTokensDto {
  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    required: false,
    default: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    required: false,
    default: 20
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({
    description: 'Filter by status of round 1',
    enum: AirdropListTokenStatus,
    example: AirdropListTokenStatus.ACTIVE,
    required: false
  })
  @IsOptional()
  @IsEnum(AirdropListTokenStatus)
  status_1?: AirdropListTokenStatus;

  @ApiProperty({
    description: 'Filter by status of round 2',
    enum: AirdropListTokenStatus,
    example: AirdropListTokenStatus.ACTIVE,
    required: false
  })
  @IsOptional()
  @IsEnum(AirdropListTokenStatus)
  status_2?: AirdropListTokenStatus;

  @ApiProperty({
    description: 'Search by token name or mint address',
    example: 'Bitcoin',
    required: false
  })
  @IsOptional()
  search?: string;
} 