import { CategoryPrioritize, CategoryStatus } from '../../solana/entities/solana-list-categories-token.entity';

export class CategoryResponseDto {
    slct_id: number;
    slct_name: string;
    slct_slug: string;
    slct_prioritize: CategoryPrioritize;
    sltc_status: CategoryStatus;
    slct_created_at: Date;
    slct_updated_at: Date;
} 