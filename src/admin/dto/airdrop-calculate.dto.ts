import { ApiProperty } from '@nestjs/swagger';

export class AirdropCalculateDto {
  @ApiProperty({
    description: 'Optional: Force recalculate even if rewards already exist',
    example: false,
    required: false,
    default: false
  })
  forceRecalculate?: boolean = false;
} 