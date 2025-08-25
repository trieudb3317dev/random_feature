import { ApiProperty } from '@nestjs/swagger';
import { AirdropPoolStatus } from '../../airdrops/entities/airdrop-list-pool.entity';

export class AirdropPoolResponseDto {
  @ApiProperty({ description: 'Pool ID' })
  alp_id: number;

  @ApiProperty({ description: 'Originator wallet ID' })
  alp_originator: number;

  @ApiProperty({ description: 'Pool name' })
  alp_name: string;

  @ApiProperty({ description: 'Pool slug' })
  alp_slug: string;

  @ApiProperty({ description: 'Pool description', required: false })
  alp_describe?: string;

  @ApiProperty({ description: 'Pool logo URL', required: false })
  alp_logo?: string;

  @ApiProperty({ description: 'Number of members' })
  alp_member_num: number;

  @ApiProperty({ description: 'Initial volume' })
  apl_volume: number;

  @ApiProperty({ description: 'Total volume (initial + stake volume)' })
  apl_total_volume: number;

  @ApiProperty({ description: 'Creation date' })
  apl_creation_date: Date;

  @ApiProperty({ description: 'End date', required: false })
  apl_end_date?: Date;

  @ApiProperty({ description: 'Pool status', enum: AirdropPoolStatus })
  apl_status: AirdropPoolStatus;

  @ApiProperty({ description: 'Pool hash', required: false })
  apl_hash?: string | null;

  @ApiProperty({ description: 'Originator wallet info', required: false })
  originator?: {
    wallet_id: number;
    solana_address: string;
    nick_name?: string;
    isBittworld?: boolean;
    bittworldUid?: string | null;
  };
}

export class AirdropPoolListResponseDto {
  @ApiProperty({ description: 'List of airdrop pools', type: [AirdropPoolResponseDto] })
  data: AirdropPoolResponseDto[];

  @ApiProperty({ description: 'Total number of pools' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages' })
  totalPages: number;
} 