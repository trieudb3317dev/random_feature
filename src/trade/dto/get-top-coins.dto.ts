import { IsOptional, IsEnum, IsInt, Min, Max, IsBoolean, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export enum SortBy {
  MARKET_CAP = 'market_cap',
  LIQUIDITY = 'liquidity',
  FDV = 'fdv',
  RECENT_LISTING_TIME = 'recent_listing_time',
  LAST_TRADE_UNIX_TIME = 'last_trade_unix_time',
  HOLDER = 'holder',
  VOLUME_1H_USD = 'volume_1h_usd',
  VOLUME_2H_USD = 'volume_2h_usd',
  VOLUME_4H_USD = 'volume_4h_usd',
  VOLUME_8H_USD = 'volume_8h_usd',
  VOLUME_24H_USD = 'volume_24h_usd',
  VOLUME_1H_CHANGE_PERCENT = 'volume_1h_change_percent',
  VOLUME_2H_CHANGE_PERCENT = 'volume_2h_change_percent',
  VOLUME_4H_CHANGE_PERCENT = 'volume_4h_change_percent',
  VOLUME_8H_CHANGE_PERCENT = 'volume_8h_change_percent',
  VOLUME_24H_CHANGE_PERCENT = 'volume_24h_change_percent',
  PRICE_CHANGE_1H_PERCENT = 'price_change_1h_percent',
  PRICE_CHANGE_2H_PERCENT = 'price_change_2h_percent',
  PRICE_CHANGE_4H_PERCENT = 'price_change_4h_percent',
  PRICE_CHANGE_8H_PERCENT = 'price_change_8h_percent',
  PRICE_CHANGE_24H_PERCENT = 'price_change_24h_percent',
  VOLUME_24H = 'volume_24h',
  PRICE = 'price',
  PRICE_CHANGE_24H = 'price_change_24h'
}

export enum SortType {
  ASC = 'asc',
  DESC = 'desc'
}

export enum TimeFrameEnum {
  FIVE_MIN = '5m',
  FIFTEEN_MIN = '15m',
  THIRTY_MIN = '30m',
  ONE_HOUR = '1h',
  SIX_HOURS = '6h',
  TWELVE_HOURS = '12h',
  TWENTYFOUR_HOURS = '24h'
}

export class GetTopCoinsDto {
  @IsOptional()
  @IsEnum(SortBy)
  sort_by?: SortBy = SortBy.MARKET_CAP;

  @IsOptional()
  @IsEnum(SortType)
  sort_type?: SortType = SortType.DESC;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 100;

  @IsOptional()
  @IsEnum(TimeFrameEnum)
  timeframe?: TimeFrameEnum = TimeFrameEnum.TWENTYFOUR_HOURS;
} 