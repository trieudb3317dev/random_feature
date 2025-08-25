import { ApiProperty } from '@nestjs/swagger';
import { AirdropRewardType, AirdropRewardSubType, AirdropRewardStatus } from '../entities/airdrop-reward.entity';

export class RewardHistoryItemDto {
  @ApiProperty({ description: 'Reward ID' })
  ar_id: number;

  @ApiProperty({ description: 'Token airdrop ID' })
  ar_token_airdrop_id: number;

  @ApiProperty({ description: 'Wallet ID' })
  ar_wallet_id: number;

  @ApiProperty({ description: 'Wallet address' })
  ar_wallet_address: string;

  @ApiProperty({ description: 'Reward amount' })
  ar_amount: number;

  @ApiProperty({ description: 'Reward type', enum: AirdropRewardType })
  ar_type: AirdropRewardType;

  @ApiProperty({ description: 'Reward sub type (detailed classification)', enum: AirdropRewardSubType, nullable: true })
  ar_sub_type: AirdropRewardSubType | null;

  @ApiProperty({ description: 'Reward status', enum: AirdropRewardStatus })
  ar_status: AirdropRewardStatus;

  @ApiProperty({ description: 'Transaction hash', nullable: true })
  ar_hash: string | null;

  @ApiProperty({ description: 'Created date' })
  ar_date: Date;

  // Token information
  @ApiProperty({ description: 'Token name' })
  token_name: string;

  @ApiProperty({ description: 'Token mint address' })
  token_mint: string;

  // Wallet information
  @ApiProperty({ description: 'Bittworld UID', nullable: true })
  bittworld_uid: string | null;

  @ApiProperty({ description: 'User email', nullable: true })
  email: string | null;

  // Pool information (if available)
  @ApiProperty({ description: 'Pool name (if from pool)', nullable: true })
  pool_name?: string | null;

  @ApiProperty({ description: 'Pool slug (if from pool)', nullable: true })
  pool_slug?: string | null;

  // Additional metadata
  @ApiProperty({ description: 'Reward description based on type and sub_type' })
  reward_description: string;

  @ApiProperty({ description: 'Formatted amount with token symbol' })
  formatted_amount: string;
}

export class RewardHistoryStatsDto {
  @ApiProperty({ description: 'Total number of rewards' })
  total_rewards: number;

  @ApiProperty({ description: 'Total amount of all rewards' })
  total_amount: number;

  @ApiProperty({ description: 'Total amount of can_withdraw rewards' })
  total_can_withdraw_amount: number;

  @ApiProperty({ description: 'Total amount of withdrawn rewards' })
  total_withdrawn_amount: number;

  @ApiProperty({ description: 'Number of can_withdraw rewards' })
  can_withdraw_count: number;

  @ApiProperty({ description: 'Number of withdrawn rewards' })
  withdrawn_count: number;

  @ApiProperty({ description: 'Breakdown by reward type' })
  breakdown_by_type: {
    [key in AirdropRewardType]: {
      count: number;
      total_amount: number;
    };
  };

  @ApiProperty({ description: 'Breakdown by reward sub type' })
  breakdown_by_sub_type: {
    [key in AirdropRewardSubType]: {
      count: number;
      total_amount: number;
    };
  };

  @ApiProperty({ description: 'Breakdown by token' })
  breakdown_by_token: Array<{
    token_id: number;
    token_name: string;
    token_mint: string;
    count: number;
    total_amount: number;
  }>;
}

export class GetRewardHistoryResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'List of reward history items', type: [RewardHistoryItemDto] })
  data: {
    rewards: RewardHistoryItemDto[];
    stats: RewardHistoryStatsDto;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}
