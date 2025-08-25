import { ApiProperty } from '@nestjs/swagger';

export class StakePoolResponseDto {
    @ApiProperty({
        description: 'Success status',
        example: true
    })
    success: boolean;

    @ApiProperty({
        description: 'Result message',
        example: 'Stake pool successfully'
    })
    message: string;

    @ApiProperty({
        description: 'Result data',
        type: 'object',
        properties: {
            joinId: { type: 'number', example: 1 },
            poolId: { type: 'number', example: 1 },
            stakeAmount: { type: 'number', example: 500000 },
            status: { type: 'string', example: 'active' },
            transactionHash: { type: 'string', example: '5J7X...abc123' }
        }
    })
    data: {
        joinId: number;
        poolId: number;
        stakeAmount: number;
        status: string;
        transactionHash: string | null;
    };
} 