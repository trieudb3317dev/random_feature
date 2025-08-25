import { IsInt, Min, Max, IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class TopRoundConfigDto {
  @ApiProperty({
    description: 'Top position number (1-10)',
    example: 1,
    minimum: 1,
    maximum: 10
  })
  @IsInt()
  @Min(1)
  @Max(10)
  atr_num_top: number;

  @ApiProperty({
    description: 'Percentage for this top position (1-99)',
    example: 50,
    minimum: 1,
    maximum: 99
  })
  @IsInt()
  @Min(1)
  @Max(99)
  atr_percent: number;
}

export class SetTopRoundDto {
  @ApiProperty({
    description: 'Number of top positions (0-10). If 0, all records will be deleted.',
    example: 3,
    minimum: 0,
    maximum: 10
  })
  @IsInt()
  @Min(0)
  @Max(10)
  count_top: number;

  @ApiProperty({
    description: 'Array of top round configurations. Required when count_top > 0.',
    type: [TopRoundConfigDto],
    example: [
      { atr_num_top: 1, atr_percent: 50 },
      { atr_num_top: 2, atr_percent: 30 },
      { atr_num_top: 3, atr_percent: 20 }
    ],
    required: false
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TopRoundConfigDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  top_rounds?: TopRoundConfigDto[];
}
