import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PumpFunService } from './pump-fun.service';
import { PumpfunDexService } from './pumpfun-dex.service';
import { SolanaConnectionModule } from '../solana/solana-connection.module';

@Module({
    imports: [
        HttpModule,
        ConfigModule,
        SolanaConnectionModule
    ],
    providers: [PumpFunService, PumpfunDexService],
    exports: [PumpFunService, PumpfunDexService]
})
export class PumpFunModule { } 