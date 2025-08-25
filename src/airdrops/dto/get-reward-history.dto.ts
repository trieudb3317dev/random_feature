import { IsOptional, IsString, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AirdropRewardType, AirdropRewardSubType, AirdropRewardStatus } from '../entities/airdrop-reward.entity';

export enum RewardHistorySortField {
  DATE = 'date',
  AMOUNT = 'amount',
  TYPE = 'type',
  STATUS = 'status'
}

export enum RewardHistorySortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

export class GetRewardHistoryDto {
  @ApiProperty({
    description: 'Page number',
    example: 1,
    required: false,
    default: 1
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    required: false,
    default: 20
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 20;

  @ApiProperty({
    description: 'Filter by reward type',
    enum: AirdropRewardType,
    required: false
  })
  @IsOptional()
  @IsEnum(AirdropRewardType)
  type?: AirdropRewardType;

  @ApiProperty({
    description: 'Filter by reward sub type (detailed classification)',
    enum: AirdropRewardSubType,
    required: false
  })
  @IsOptional()
  @IsEnum(AirdropRewardSubType)
  sub_type?: AirdropRewardSubType;

  @ApiProperty({
    description: 'Filter by reward status',
    enum: AirdropRewardStatus,
    required: false
  })
  @IsOptional()
  @IsEnum(AirdropRewardStatus)
  status?: AirdropRewardStatus;

  @ApiProperty({
    description: 'Filter by token mint address',
    example: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    required: false
  })
  @IsOptional()
  @IsString()
  token_mint?: string;

  @ApiProperty({
    description: 'Filter by token ID',
    example: 1,
    required: false
  })
  @IsOptional()
  @Type(() => Number)
  token_id?: number;

  @ApiProperty({
    description: 'Search by token name or token mint address',
    example: 'MMP',
    required: false
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter by minimum amount',
    example: 1000000,
    required: false
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0, { message: 'Min amount cannot be negative' })
  min_amount?: number;

  @ApiProperty({
    description: 'Filter by maximum amount',
    example: 10000000,
    required: false
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0, { message: 'Max amount cannot be negative' })
  max_amount?: number;

  @ApiProperty({
    description: 'Filter by start date (ISO string)',
    example: '2024-01-01T00:00:00.000Z',
    required: false
  })
  @IsOptional()
  @IsString()
  from_date?: string;

  @ApiProperty({
    description: 'Filter by end date (ISO string)',
    example: '2024-12-31T23:59:59.999Z',
    required: false
  })
  @IsOptional()
  @IsString()
  to_date?: string;

  @ApiProperty({
    description: 'Sort field',
    enum: RewardHistorySortField,
    required: false,
    default: RewardHistorySortField.DATE
  })
  @IsOptional()
  @IsEnum(RewardHistorySortField)
  sort_by?: RewardHistorySortField = RewardHistorySortField.DATE;

  @ApiProperty({
    description: 'Sort order',
    enum: RewardHistorySortOrder,
    required: false,
    default: RewardHistorySortOrder.DESC
  })
  @IsOptional()
  @IsEnum(RewardHistorySortOrder)
  sort_order?: RewardHistorySortOrder = RewardHistorySortOrder.DESC;
}
