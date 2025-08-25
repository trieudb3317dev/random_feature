import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolanaListCategoriesToken } from '../entities/solana-list-categories-token.entity';
import { CategoryStatus } from '../entities/solana-list-categories-token.entity';

@Injectable()
export class SolanaListCategoriesTokenRepository {
    constructor(
        @InjectRepository(SolanaListCategoriesToken)
        private readonly repository: Repository<SolanaListCategoriesToken>
    ) { }

    async findAll() {
        return this.repository.find();
    }

    async find(options: any) {
        return this.repository.find(options);
    }

    async findOne(options: any) {
        return this.repository.findOne(options);
    }

    async save(data: any) {
        return this.repository.save(data);
    }

    async findActiveCategories() {
        return this.repository.find({
            where: {
                sltc_status: CategoryStatus.ACTIVE
            },
            order: {
                slct_prioritize: 'DESC',
                slct_id: 'ASC'
            }
        });
    }

    async findById(id: number) {
        return this.repository.findOne({
            where: { slct_id: id }
        });
    }

    async create(data: Partial<SolanaListCategoriesToken>) {
        const category = this.repository.create(data);
        return this.repository.save(category);
    }

    async update(id: number, data: Partial<SolanaListCategoriesToken>) {
        await this.repository.update(id, data);
        return this.findById(id);
    }

    async delete(id: number) {
        return this.repository.delete(id);
    }

    // Add other methods as needed
} 