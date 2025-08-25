import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTransactionDto {
    @IsArray()
    @IsNotEmpty()
    mt_group_list: number[];

    @IsArray()
    @IsOptional()
    mt_member_list?: number[];

    @IsString()
    @IsNotEmpty()
    mt_token_name: string;

    @IsString()
    @IsNotEmpty()
    mt_token_address: string;

    @IsEnum(['buy', 'sell'])
    @IsNotEmpty()
    mt_trade_type: 'buy' | 'sell';

    @IsEnum(['limit', 'market'])
    @IsNotEmpty()
    mt_type: 'limit' | 'market';

    @IsNumber()
    @IsNotEmpty()
    mt_price: number;

    @IsNumber()
    @IsNotEmpty()
    mt_transaction_folow: number;
} 