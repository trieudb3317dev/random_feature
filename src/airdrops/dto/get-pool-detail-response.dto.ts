import { ApiProperty } from '@nestjs/swagger';

export class MemberInfoDto {
    @ApiProperty({
        description: 'ID của member',
        example: 1
    })
    memberId: number;

    @ApiProperty({
        description: 'Solana address của member',
        example: '9K8Y...abc123'
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
        description: 'Có phải là creator của pool không',
        example: false
    })
    isCreator: boolean;

    @ApiProperty({
        description: 'Ngày tham gia đầu tiên',
        example: '2024-01-16T15:30:00.000Z'
    })
    joinDate: Date;

    @ApiProperty({
        description: 'Tổng số lượng stake trong pool',
        example: 1000000
    })
    totalStaked: number;

    @ApiProperty({
        description: 'Số lần stake',
        example: 3
    })
    stakeCount: number;

    @ApiProperty({
        description: 'Trạng thái stake',
        example: 'active',
        enum: ['pending', 'active', 'withdraw', 'error']
    })
    status: string;
}

export class PoolDetailDto {
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
        description: 'Thông tin stake của user hiện tại (nếu có)',
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
        description: 'Danh sách members (chỉ hiển thị cho creator)',
        required: false,
        type: [MemberInfoDto]
    })
    members?: MemberInfoDto[];
}

export class GetPoolDetailResponseDto {
    @ApiProperty({
        description: 'Success status',
        example: true
    })
    success: boolean;

    @ApiProperty({
        description: 'Result message',
        example: 'Get pool details successfully'
    })
    message: string;

    @ApiProperty({
        description: 'Pool details data',
        type: PoolDetailDto
    })
    data: PoolDetailDto;
} 