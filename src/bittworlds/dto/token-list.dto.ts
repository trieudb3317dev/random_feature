export interface BittworldTokenDto {
    id: number;
    name: string;
    symbol: string;
    address: string;
    logo_url: string;
    status: boolean;
    // Các trường bổ sung từ Solana Tracker
    market_cap: number;
    fdv: number;
    liquidity: number;
    last_trade_unix_time: number;
    volume_1h_usd: number;
    volume_1h_change_percent: number;
    volume_24h_usd: number;
    volume_24h_change_percent: number;
    trade_24h_count: number;
    price: number;
    price_change_24h_percent: number;
    holder: number;
    recent_listing_time: number;
    buys: number;
    sells: number;
    txns: number;
    volume_5m_change_percent: number;
    volume_4h_change_percent: number;
}

export interface TokenListResponseDto {
    status: number;
    message: string;
    data: {
        tokens: BittworldTokenDto[];
        total: number;
        page: number;
        limit: number;
    };
}
