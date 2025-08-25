import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Connection } from '@solana/web3.js';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [
        {
            provide: 'SOLANA_CONNECTION',
            useFactory: async (configService: ConfigService) => {
                const rpcUrl = configService.get<string>('SOLANA_RPC_URL');
                if (!rpcUrl) {
                    throw new Error('SOLANA_RPC_URL is not defined');
                }
                return new Connection(rpcUrl, 'confirmed');
            },
            inject: [ConfigService]
        }
    ],
    exports: ['SOLANA_CONNECTION']
})
export class SolanaConnectionModule { } 