import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SolanaTokenJoinCategory } from '../entities/solana-token-join-category.entity';

@Injectable()
export class SolanaTokenJoinCategoryRepository extends Repository<SolanaTokenJoinCategory> {
    constructor(private dataSource: DataSource) {
        super(SolanaTokenJoinCategory, dataSource.createEntityManager());
    }
} 