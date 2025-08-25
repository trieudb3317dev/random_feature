import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ListWallet } from './entities/list-wallet.entity';

@Injectable()
export class TelegramWalletRepository {
    constructor(
        @InjectRepository(ListWallet)
        private readonly repository: Repository<ListWallet>
    ) { }

    async findOne(options: any): Promise<ListWallet | null> {
        return this.repository.findOne(options);
    }
} 