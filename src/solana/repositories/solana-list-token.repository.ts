import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { SolanaListToken } from '../entities/solana-list-token.entity';

@Injectable()
export class SolanaListTokenRepository {
    constructor(
        @InjectRepository(SolanaListToken)
        private readonly repository: Repository<SolanaListToken>
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

    async findAndCount(options: any) {
        return this.repository.findAndCount(options);
    }

    async count(options: any) {
        return this.repository.count(options);
    }

    async createQueryBuilder(alias: string) {
        return this.repository.createQueryBuilder(alias);
    }

    // Add other methods as needed
} 