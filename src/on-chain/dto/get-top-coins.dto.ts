import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';

export enum SortBy {
    MARKET_CAP = 'market_cap',
    VOLUME_24H = 'volume_24h',
    PRICE_CHANGE_24H = 'price_change_24h'
}

export enum SortType {
    ASC = 'asc',
    DESC = 'desc'
}

export class GetTopCoinsDto {
    @IsOptional()
    @IsEnum(SortBy)
    sort_by?: SortBy = SortBy.MARKET_CAP;

    @IsOptional()
    @IsEnum(SortType)
    sort_type?: SortType = SortType.DESC;

    @IsOptional()
    @IsNumber()
    offset?: number = 0;

    @IsOptional()
    @IsNumber()
    limit?: number = 100;
} 