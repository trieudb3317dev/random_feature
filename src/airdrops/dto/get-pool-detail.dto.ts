import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsIn } from 'class-validator';

export enum SortField {
    JOIN_DATE = 'joinDate',
    TOTAL_STAKED = 'totalStaked',
    STAKE_COUNT = 'stakeCount',
    MEMBER_ID = 'memberId'
}

export enum SortOrder {
    ASC = 'asc',
    DESC = 'desc'
}

export class GetPoolDetailDto {
    @ApiProperty({
        description: 'Field to sort members list',
        enum: SortField,
        required: false,
        example: SortField.TOTAL_STAKED
    })
    @IsOptional()
    @IsEnum(SortField)
    sortBy?: SortField;

    @ApiProperty({
        description: 'Sort order',
        enum: SortOrder,
        required: false,
        example: SortOrder.DESC
    })
    @IsOptional()
    @IsEnum(SortOrder)
    sortOrder?: SortOrder;
} 