import { ApiProperty } from '@nestjs/swagger';
import { AirdropPoolStatus } from '../../airdrops/entities/airdrop-list-pool.entity';

export class AirdropPoolMemberDto {
  @ApiProperty({ description: 'Member ID' })
  memberId: number;

  @ApiProperty({ description: 'Solana address' })
  solanaAddress: string;

  @ApiProperty({ description: 'Bittworld UID', required: false })
  bittworldUid?: string | null;

  @ApiProperty({ description: 'Nickname' })
  nickname: string;

  @ApiProperty({ description: 'Is creator' })
  isCreator: boolean;

  @ApiProperty({ description: 'Join date' })
  joinDate: Date;

  @ApiProperty({ description: 'Total staked amount' })
  totalStaked: number;

  @ApiProperty({ description: 'Stake count' })
  stakeCount: number;

  @ApiProperty({ description: 'Status' })
  status: string;
}

export class AirdropPoolTransactionDto {
  @ApiProperty({ description: 'Transaction ID' })
  transactionId: number;

  @ApiProperty({ description: 'Member ID' })
  memberId: number;

  @ApiProperty({ description: 'Solana address' })
  solanaAddress: string;

  @ApiProperty({ description: 'Bittworld UID', required: false })
  bittworldUid?: string | null;

  @ApiProperty({ description: 'Nickname' })
  nickname: string;

  @ApiProperty({ description: 'Is creator' })
  isCreator: boolean;

  @ApiProperty({ description: 'Stake amount' })
  stakeAmount: number;

  @ApiProperty({ description: 'Transaction date' })
  transactionDate: Date;

  @ApiProperty({ description: 'Status' })
  status: string;

  @ApiProperty({ description: 'Transaction hash', required: false })
  transactionHash?: string | null;
}

export class AirdropPoolDetailResponseDto {
  @ApiProperty({ description: 'Pool ID' })
  poolId: number;

  @ApiProperty({ description: 'Pool name' })
  name: string;

  @ApiProperty({ description: 'Pool slug' })
  slug: string;

  @ApiProperty({ description: 'Pool logo', required: false })
  logo?: string;

  @ApiProperty({ description: 'Pool description', required: false })
  describe?: string;

  @ApiProperty({ description: 'Member count' })
  memberCount: number;

  @ApiProperty({ description: 'Total volume' })
  totalVolume: number;

  @ApiProperty({ description: 'Creation date' })
  creationDate: Date;

  @ApiProperty({ description: 'End date', required: false })
  endDate?: Date;

  @ApiProperty({ description: 'Pool status', enum: AirdropPoolStatus })
  status: AirdropPoolStatus;

  @ApiProperty({ description: 'Transaction hash', required: false })
  transactionHash?: string | null;

  @ApiProperty({ description: 'Creator address' })
  creatorAddress: string;

  @ApiProperty({ description: 'Creator is Bittworld' })
  creatorIsBittworld: boolean;

  @ApiProperty({ description: 'Creator Bittworld UID', required: false })
  creatorBittworldUid?: string | null;

  @ApiProperty({ description: 'List of members', type: [AirdropPoolMemberDto] })
  members: AirdropPoolMemberDto[];

  @ApiProperty({ description: 'List of transactions', type: [AirdropPoolTransactionDto] })
  transactions: AirdropPoolTransactionDto[];
} 