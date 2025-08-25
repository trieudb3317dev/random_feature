import { ApiProperty } from '@nestjs/swagger';

export class CategoryDto {
    @ApiProperty({ description: 'ID của category' })
    id: number;

    @ApiProperty({ description: 'Tên category' })
    name: string;

    @ApiProperty({ description: 'Slug của category', required: false })
    slug?: string;

    @ApiProperty({ description: 'Trạng thái ưu tiên của category' })
    prioritize: 'yes' | 'no';

    @ApiProperty({ description: 'Trạng thái của category' })
    status: 'active' | 'hidden';
}

export class GetCategoriesResponseDto {
    @ApiProperty({ description: 'Mã trạng thái HTTP' })
    status: number;

    @ApiProperty({ description: 'Thông báo kết quả' })
    message: string;

    @ApiProperty({ description: 'Danh sách categories', type: [CategoryDto] })
    data: CategoryDto[];
} 