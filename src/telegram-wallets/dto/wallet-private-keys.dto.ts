import { ApiProperty } from '@nestjs/swagger';

export class WalletPrivateKeysDto {
    @ApiProperty({ description: 'Solana private key' })
    sol_private_key: string;

    @ApiProperty({ description: 'Ethereum private key' })
    eth_private_key: string;

    @ApiProperty({ description: 'BNB private key (same as Ethereum)' })
    bnb_private_key: string;
}

export class WalletPrivateKeysResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty({ type: WalletPrivateKeysDto })
    data?: WalletPrivateKeysDto;

    @ApiProperty()
    message?: string;
} 