import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePoolDto {
    @ApiProperty({
        description: 'Logo URL of the pool (optional - can be uploaded as file or provided as URL)',
        example: 'https://example.com/logo.png',
        required: false
    })
    @IsOptional()
    @IsString()
    logo?: string;

    @ApiProperty({
        description: 'Detailed description of the pool',
        example: 'This is a description of the airdrop pool',
        required: false
    })
    @IsString()
    @IsOptional()
    describe?: string;
} 