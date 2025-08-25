import { ApiProperty } from '@nestjs/swagger';

export class UpdatePoolResponseDto {
    @ApiProperty({
        description: 'Success status',
        example: true
    })
    success: boolean;

    @ApiProperty({
        description: 'Response message',
        example: 'Pool updated successfully'
    })
    message: string;

    @ApiProperty({
        description: 'Updated pool data',
        type: 'object',
        properties: {
            poolId: { type: 'number', example: 1 },
            name: { type: 'string', example: 'My Airdrop Pool' },
            slug: { type: 'string', example: 'my-airdrop-pool-1' },
            logo: { type: 'string', example: 'https://example.com/logo.png' },
            describe: { type: 'string', example: 'Updated description' },
            status: { type: 'string', example: 'active' }
        }
    })
    data: {
        poolId: number;
        name: string;
        slug: string;
        logo?: string;
        describe?: string;
        status: string;
    };
} 