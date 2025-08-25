import { ApiProperty } from '@nestjs/swagger';

export class CreatePoolResponseDto {
    @ApiProperty({
        description: 'Success status',
        example: true
    })
    success: boolean;

    @ApiProperty({
        description: 'Message',
        example: 'Pool created successfully'
    })
    message: string;

    @ApiProperty({
        description: 'Created pool data',
        example: {
            poolId: 1,
            name: 'My Airdrop Pool',
            slug: 'my-airdrop-pool-1',
            status: 'active',
            initialAmount: 1000000
        }
    })
    data?: {
        poolId: number;
        name: string;
        slug: string;
        logo: string;
        status: string;
        initialAmount: number;
        transactionHash?: string;
    };
} 