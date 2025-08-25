import { IsEnum, IsNumber, IsString, IsOptional, IsArray, IsPositive, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderDto {
    @ApiProperty({
        enum: ['buy', 'sell'],
        description: 'Trade type (buy or sell)',
        example: 'buy'
    })
    @IsEnum(['buy', 'sell'])
    order_trade_type: 'buy' | 'sell';

    @ApiProperty({
        enum: ['market', 'limit'],
        description: 'Order type (market or limit)',
        example: 'market'
    })
    @IsEnum(['market', 'limit'])
    order_type: 'market' | 'limit';

    @ApiProperty({
        description: 'Token name',
        example: 'SOL'
    })
    @IsString()
    order_token_name: string;

    @ApiProperty({
        description: 'Token address',
        example: 'So11111111111111111111111111111111111111112'
    })
    @IsString()
    order_token_address: string;

    @ApiProperty({
        description: 'Price',
        example: 100.5
    })
    @IsNumber()
    @Min(0)
    order_price: number;

    @ApiProperty({
        description: 'Quantity',
        example: 1.5
    })
    @IsNumber()
    @IsPositive()
    order_qlty: number;

    @ApiProperty({
        description: 'Group IDs for master trading (optional)',
        example: [1, 2, 3],
        required: false,
        type: [Number]
    })
    @IsOptional()
    @IsArray()
    group_list?: number[];

    @ApiProperty({
        description: 'Member wallet IDs for master trading (optional)',
        example: [1, 2, 3],
        required: false,
        type: [Number]
    })
    @IsOptional()
    @IsArray()
    member_list?: number[];
}