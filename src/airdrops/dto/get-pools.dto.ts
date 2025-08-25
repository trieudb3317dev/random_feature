import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export enum PoolSortField {
    CREATION_DATE = 'creationDate',
    NAME = 'name',
    MEMBER_COUNT = 'memberCount',
    TOTAL_VOLUME = 'totalVolume',
    END_DATE = 'endDate'
}

export enum PoolSortOrder {
    ASC = 'asc',
    DESC = 'desc'
}

export enum PoolFilterType {
    ALL = 'all',
    CREATED = 'created',
    JOINED = 'joined'
}

export class GetPoolsDto {
    @ApiProperty({
        description: 'Pool filter type',
        enum: PoolFilterType,
        required: false,
        example: PoolFilterType.ALL,
        default: PoolFilterType.ALL
    })
    @IsOptional()
    @IsEnum(PoolFilterType)
    @Transform(({ value }) => value || PoolFilterType.ALL)
    filterType?: PoolFilterType;

    @ApiProperty({
        description: 'Field to sort pools list',
        enum: PoolSortField,
        required: false,
        example: PoolSortField.CREATION_DATE
    })
    @IsOptional()
    @IsEnum(PoolSortField)
    sortBy?: PoolSortField;

    @ApiProperty({
        description: 'Sort order',
        enum: PoolSortOrder,
        required: false,
        example: PoolSortOrder.DESC
    })
    @IsOptional()
    @IsEnum(PoolSortOrder)
    sortOrder?: PoolSortOrder;
} 