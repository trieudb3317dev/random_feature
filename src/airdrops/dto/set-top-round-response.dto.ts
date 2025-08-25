import { ApiProperty } from '@nestjs/swagger';
import { TopRoundConfigDto } from './set-top-round.dto';

export class SetTopRoundResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Top round configuration updated successfully'
  })
  message: string;

  @ApiProperty({
    description: 'Number of top positions configured',
    example: 3
  })
  count_top: number;

  @ApiProperty({
    description: 'Array of top round configurations',
    type: [TopRoundConfigDto],
    example: [
      { atr_num_top: 1, atr_percent: 50 },
      { atr_num_top: 2, atr_percent: 30 },
      { atr_num_top: 3, atr_percent: 20 }
    ]
  })
  top_rounds: TopRoundConfigDto[];
}
