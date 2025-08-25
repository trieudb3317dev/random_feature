import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateTradingviewSymbolDto {
    @ApiProperty({ description: 'Token address' })
    @IsString()
    @IsNotEmpty()
    address: string;

    @ApiProperty({ description: 'TradingView symbol' })
    @IsString()
    @IsNotEmpty()
    tradingviewSymbol: string;
} 