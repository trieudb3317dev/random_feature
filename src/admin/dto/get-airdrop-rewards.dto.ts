import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AirdropRewardStatus, AirdropRewardType, AirdropRewardSubType } from '../../airdrops/entities/airdrop-reward.entity';

export class GetAirdropRewardsDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by token mint address' })
  @IsOptional()
  @IsString()
  token_mint?: string;

  @ApiPropertyOptional({ description: 'Filter by token ID (alt_id)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  alt_id?: number;

  @ApiPropertyOptional({ 
    description: 'Filter by reward status', 
    enum: AirdropRewardStatus,
    default: AirdropRewardStatus.CAN_WITHDRAW 
  })
  @IsOptional()
  @IsEnum(AirdropRewardStatus)
  status?: AirdropRewardStatus = AirdropRewardStatus.CAN_WITHDRAW;

  @ApiPropertyOptional({ 
    description: 'Filter by reward type: 1 = TYPE_1 (volume-based), 2 = TYPE_2 (top pool)', 
    enum: AirdropRewardType 
  })
  @IsOptional()
  @IsEnum(AirdropRewardType)
  type?: AirdropRewardType;

  @ApiPropertyOptional({ 
    description: 'Filter by reward sub type: leader_bonus (10% Leader), participation_share (90% tham gia), top_pool_reward (TOP Pool)', 
    enum: AirdropRewardSubType 
  })
  @IsOptional()
  @IsEnum(AirdropRewardSubType)
  sub_type?: AirdropRewardSubType;

  @ApiPropertyOptional({ description: 'Search by wallet address or email' })
  @IsOptional()
  @IsString()
  search?: string;
} 