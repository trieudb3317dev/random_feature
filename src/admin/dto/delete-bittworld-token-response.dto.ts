import { ApiProperty } from '@nestjs/swagger';

export class DeleteBittworldTokenResponseDto {
    @ApiProperty({
        description: 'Status code',
        example: 200
    })
    status: number;

    @ApiProperty({
        description: 'Thông báo',
        example: 'Bittworld token deleted successfully'
    })
    message: string;

    @ApiProperty({
        description: 'ID của token đã xóa',
        example: 1
    })
    data: {
        deletedTokenId: number;
        deletedAt: Date;
    };
}
