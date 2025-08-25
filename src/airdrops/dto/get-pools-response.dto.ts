import { ApiProperty } from '@nestjs/swagger';

export class PoolInfoDto {
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
        description: 'Volume của round hiện tại (chỉ tính cho active round - apl_round_end và apj_round_end = null)',
        example: 3000000
    })
    roundVolume: number;

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
        description: 'Thông tin stake của user hiện tại (nếu có)',
        required: false
    })
    userStakeInfo?: {
        isCreator: boolean;
        joinStatus: string;
        joinDate: Date;
        totalStaked: number;
    };
}

export class GetPoolsResponseDto {
    @ApiProperty({
        description: 'Success status',
        example: true
    })
    success: boolean;

    @ApiProperty({
        description: 'Result message',
        example: 'Get pools list successfully'
    })
    message: string;

    @ApiProperty({
        description: 'Pools list data',
        type: [PoolInfoDto]
    })
    data: PoolInfoDto[];
} 