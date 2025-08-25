import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum SortBy {
    BLOCK_UNIX_TIME = 'block_unix_time',
    BLOCK_NUMBER = 'block_number'
}

export enum SortType {
    DESC = 'desc'
}

export enum TransactionType {
    SWAP = 'swap',
    BUY = 'buy',
    SELL = 'sell',
    ADD = 'add',
    REMOVE = 'remove',
    ALL = 'all'
}

export class GetHistoriesTransactionDto {
    @IsString()
    address: string;

    @IsOptional()
    @IsString()
    owner?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    offset?: number = 0;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number = 20;

    @IsOptional()
    @IsEnum(SortBy)
    sort_by?: SortBy = SortBy.BLOCK_UNIX_TIME;

    @IsOptional()
    @IsEnum(SortType)
    sort_type?: SortType = SortType.DESC;

    @IsOptional()
    @IsEnum(TransactionType)
    tx_type?: TransactionType = TransactionType.ALL;
} 