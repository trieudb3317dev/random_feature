import { ApiProperty } from '@nestjs/swagger';

export class SwapInvestorRewardResponseDto {
  @ApiProperty({
    description: 'Reward ID',
    example: 1
  })
  swap_investor_reward_id: number;

  @ApiProperty({
    description: 'Reward SOL amount',
    example: 0.001234
  })
  reward_sol_amount: number;

  @ApiProperty({
    description: 'Swap order ID',
    example: 123
  })
  swap_order_id: number;

  @ApiProperty({
    description: 'Investor ID',
    example: 456
  })
  investor_id: number;

  @ApiProperty({
    description: 'Created date',
    example: '2025-01-28T04:30:00.000Z'
  })
  created_at: Date;

  @ApiProperty({
    description: 'Investor wallet address',
    example: '4d9d4hWrrDDgqGiQctkcpWyynZhoxyj2xaPRi9MSz44v'
  })
  investor_wallet_address?: string;

  @ApiProperty({
    description: 'Swap order details',
    example: {
      swap_order_id: 123,
      input_amount: 100,
      output_amount: 95,
      swap_type: 'USDT_TO_SOL'
    }
  })
  swap_order?: any;
}