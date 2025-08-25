import { IsString, IsNumber, IsNotEmpty, Min, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreatePoolDto {
    @ApiProperty({
        description: 'Name of the airdrop pool',
        example: 'My Airdrop Pool'
    })
    @IsString()
    @IsNotEmpty()
    name: string;

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
        example: 'This is a description of the airdrop pool'
    })
    @IsString()
    @IsOptional()
    describe?: string;

    @ApiProperty({
        description: 'Amount of token X to initialize pool (minimum 1,000,000)',
        example: 1000000,
        minimum: 1000000
    })
    @Transform(({ value }) => {
        // Chuyển đổi thành số
        const num = Number(value);
        // Kiểm tra nếu không phải số hợp lệ
        if (isNaN(num)) {
            throw new Error('Initial amount must be a valid number');
        }
        return num;
    })
    @IsNumber()
    @Min(1000000, { message: 'Initial amount must be at least 1,000,000' })
    initialAmount: number;
} 