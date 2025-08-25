export interface SwapResult {
    signature: string;
    dex: string;
    outputAmount: number;
    receivedAmount?: number;
    priceImpact?: number;
    route?: {
        marketInfos: Array<{
            label: string;
            ammName: string;
            [key: string]: any;
        }>;
        [key: string]: any;
    };
} 