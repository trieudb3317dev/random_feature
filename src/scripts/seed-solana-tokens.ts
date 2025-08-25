import { createConnection } from 'typeorm';
import { SolanaListToken } from '../solana/entities/solana-list-token.entity';

async function seed() {
    const connection = await createConnection();
    const repository = connection.getRepository(SolanaListToken);

    const tokens = [
        {
            slt_name: 'Solana',
            slt_symbol: 'SOL',
            slt_address: 'So11111111111111111111111111111111111111112',
            slt_decimals: 9,
            slt_logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
            slt_coingecko_id: 'solana',
            slt_tradingview_symbol: 'SOLUSD',
            slt_is_verified: true,
            slt_market_cap: 20000000000,
        },
        {
            slt_name: 'USD Coin',
            slt_symbol: 'USDC',
            slt_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            slt_decimals: 6,
            slt_logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
            slt_coingecko_id: 'usd-coin',
            slt_tradingview_symbol: 'USDCUSD',
            slt_is_verified: true,
            slt_market_cap: 30000000000,
        },
        // Thêm các token khác nếu cần
    ];

    for (const token of tokens) {
        const exists = await repository.findOne({ where: { slt_address: token.slt_address } });
        if (!exists) {
            await repository.save(token);
            console.log(`Added token: ${token.slt_symbol}`);
        } else {
            console.log(`Token ${token.slt_symbol} already exists`);
        }
    }

    await connection.close();
    console.log('Seed completed');
}

seed().catch(console.error); 