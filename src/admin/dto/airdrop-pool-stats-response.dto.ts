import { ApiProperty } from '@nestjs/swagger';

export class AirdropPoolStatsResponseDto {
  @ApiProperty({ description: 'Total number of pools' })
  totalPools: number;

  @ApiProperty({ description: 'Number of active pools' })
  activePools: number;

  @ApiProperty({ description: 'Total members across all pools' })
  totalMembers: number;

  @ApiProperty({ description: 'Combined volume across all pools' })
  totalVolume: number;

  @ApiProperty({ description: 'Currently running pools' })
  currentlyRunning: number;
} 