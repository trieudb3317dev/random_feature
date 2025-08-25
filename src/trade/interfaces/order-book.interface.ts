export interface PriceLevel {
    price: number;
    totalQuantity: number;
    orderCount: number;
}

export interface OrderBookDepth {
    bids: PriceLevel[];  // Buy orders
    asks: PriceLevel[];  // Sell orders
    spread: number;      // Spread between best bid and ask
    lastPrice: number;   // Last traded price
} 