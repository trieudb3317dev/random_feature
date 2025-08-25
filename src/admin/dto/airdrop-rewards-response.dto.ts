import { ApiProperty } from '@nestjs/swagger';
import { AirdropRewardStatus, AirdropRewardType, AirdropRewardSubType } from '../../airdrops/entities/airdrop-reward.entity';

export class AirdropRewardResponseDto {
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

  // Wallet information
  @ApiProperty({ description: 'Wallet Solana address' })
  wallet_solana_address: string;

  @ApiProperty({ description: 'Wallet email', nullable: true })
  wallet_email: string | null;

  @ApiProperty({ description: 'Bittworld UID', nullable: true })
  bittworld_uid: string | null;

  // Token information
  @ApiProperty({ description: 'Token name' })
  token_name: string;

  @ApiProperty({ description: 'Token mint address' })
  token_mint: string;
}

export class AirdropRewardsListResponseDto {
  @ApiProperty({ description: 'List of airdrop rewards', type: [AirdropRewardResponseDto] })
  rewards: AirdropRewardResponseDto[];

  @ApiProperty({ description: 'Pagination information' })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
} 