import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolanaListPool } from '../entities/solana-list-pool.entity';

@Injectable()
export class SolanaListPoolRepository {
    constructor(
        @InjectRepository(SolanaListPool)
        private readonly repository: Repository<SolanaListPool>
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

    // Add other methods as needed
} 