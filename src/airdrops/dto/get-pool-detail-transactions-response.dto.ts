import { ApiProperty } from '@nestjs/swagger';

export class TransactionInfoDto {
    @ApiProperty({
        description: 'ID của transaction',
        example: 1
    })
    transactionId: number;

    @ApiProperty({
        description: 'ID của member thực hiện transaction',
        example: 123456
    })
    memberId: number;

    @ApiProperty({
        description: 'Solana address của member',
        example: '4d9d4hWrrDDgqGiQctkcPwyinZhozyj2xaPRi9MSz44v'
    })
    solanaAddress: string;

    @ApiProperty({
        description: 'Bittworld UID của member',
        example: 'BW123456789',
        required: false
    })
    bittworldUid: string | null;

    @ApiProperty({
        description: 'Nickname của member',
        example: 'User123'
    })
    nickname: string;

    @ApiProperty({
        description: 'Có phải là creator không',
        example: false
    })
    isCreator: boolean;

    @ApiProperty({
        description: 'Số lượng token stake trong transaction này',
        example: 500000
    })
    stakeAmount: number;

    @ApiProperty({
        description: 'Ngày thực hiện transaction',
        example: '2024-01-16T15:30:00.000Z'
    })
    transactionDate: Date;

    @ApiProperty({
        description: 'Trạng thái transaction',
        example: 'active',
        enum: ['pending', 'active', 'withdraw', 'error']
    })
    status: string;

    @ApiProperty({
        description: 'Transaction hash trên blockchain',
        example: '9K8Y...def456',
        required: false
    })
    transactionHash: string | null;
}

export class PoolDetailTransactionsDto {
    @ApiProperty({
        description: 'ID của pool',
        example: 1
    })
    poolId: number;

    @ApiProperty({
        description: 'Tên pool',
        example: 'My Airdrop Pool'
    })
    name: string;

    @ApiProperty({
        description: 'Slug của pool',
        example: 'my-airdrop-pool-1'
    })
    slug: string;

    @ApiProperty({
        description: 'Logo của pool',
        example: 'https://example.com/logo.png'
    })
    logo: string;

    @ApiProperty({
        description: 'Mô tả pool',
        example: 'Mô tả chi tiết về pool'
    })
    describe: string;

    @ApiProperty({
        description: 'Số lượng member tham gia',
        example: 25
    })
    memberCount: number;

    @ApiProperty({
        description: 'Tổng volume trong pool',
        example: 5000000
    })
    totalVolume: number;

    @ApiProperty({
        description: 'Ngày tạo pool',
        example: '2024-01-15T10:30:00.000Z'
    })
    creationDate: Date;

    @ApiProperty({
        description: 'Ngày kết thúc pool',
        example: '2025-01-15T10:30:00.000Z'
    })
    endDate: Date;

    @ApiProperty({
        description: 'Trạng thái pool',
        example: 'active',
        enum: ['pending', 'active', 'end', 'error']
    })
    status: string;

    @ApiProperty({
        description: 'Transaction hash khi tạo pool',
        example: '5J7X...abc123'
    })
    transactionHash: string | null;

    @ApiProperty({
        description: 'Solana address của ví khởi tạo pool',
        example: '4d9d4hWrrDDgqGiQctkcPwyinZhozyj2xaPRi9MSz44v'
    })
    creatorAddress: string;

    @ApiProperty({
        description: 'Bittworld UID của ví khởi tạo pool',
        example: 'BW123456789',
        required: false
    })
    creatorBittworldUid: string | null;

    @ApiProperty({
        description: 'Thông tin stake của user hiện tại',
        required: false
    })
    userStakeInfo?: {
        isCreator: boolean;
        joinStatus: string;
        joinDate: Date;
        totalStaked: number;
        stakeCount: number;
    };

    @ApiProperty({
        description: 'Danh sách tất cả các transaction trong pool',
        type: [TransactionInfoDto]
    })
    transactions: TransactionInfoDto[];
}

export class GetPoolDetailTransactionsResponseDto {
    @ApiProperty({
        description: 'Trạng thái response',
        example: true
    })
    success: boolean;

    @ApiProperty({
        description: 'Thông báo',
        example: 'Get pool detail transactions successfully'
    })
    message: string;

    @ApiProperty({
        description: 'Dữ liệu pool và transactions',
        type: PoolDetailTransactionsDto
    })
    data: PoolDetailTransactionsDto;
} 