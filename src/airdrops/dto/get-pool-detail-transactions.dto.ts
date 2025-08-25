import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';

export enum TransactionSortField {
    TRANSACTION_DATE = 'transactionDate',
    STAKE_AMOUNT = 'stakeAmount',
    MEMBER_ID = 'memberId',
    STATUS = 'status'
}

export enum TransactionSortOrder {
    ASC = 'asc',
    DESC = 'desc'
}

export class GetPoolDetailTransactionsDto {
    @ApiProperty({
        description: 'Trường để sắp xếp danh sách transactions',
        enum: TransactionSortField,
        required: false,
        example: TransactionSortField.TRANSACTION_DATE,
        default: TransactionSortField.TRANSACTION_DATE
    })
    @IsOptional()
    @IsEnum(TransactionSortField)
    sortBy?: TransactionSortField = TransactionSortField.TRANSACTION_DATE;

    @ApiProperty({
        description: 'Thứ tự sắp xếp',
        enum: TransactionSortOrder,
        required: false,
        example: TransactionSortOrder.DESC,
        default: TransactionSortOrder.DESC
    })
    @IsOptional()
    @IsEnum(TransactionSortOrder)
    sortOrder?: TransactionSortOrder = TransactionSortOrder.DESC;
} 