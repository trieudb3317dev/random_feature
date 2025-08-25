import { ApiProperty } from '@nestjs/swagger';

export class CategoryDto {
    @ApiProperty({ description: 'Category ID' })
    id: number;

    @ApiProperty({ description: 'Category name' })
    name: string;

    @ApiProperty({ description: 'Category slug', required: false })
    slug?: string;

    @ApiProperty({ description: 'Category priority', enum: ['yes', 'no'] })
    prioritize: 'yes' | 'no';

    @ApiProperty({ description: 'Category status', enum: ['active', 'hidden'] })
    status: 'active' | 'hidden';
}

export class GetCategoriesResponseDto {
    @ApiProperty({ description: 'HTTP status code' })
    status: number;

    @ApiProperty({ description: 'Response message' })
    message: string;

    @ApiProperty({ description: 'List of categories', type: [CategoryDto] })
    data: CategoryDto[];
} 