export interface ManualLoginResponseDto {
    status: number;
    message: string;
    data?: {
        token: string;
        user: {
            id: number;
            email: string;
            name: string;
            country: string;
            bittworld_uid?: string;
        };
        wallet: {
            id: number;
            solana_address: string;
            eth_address: string;
            nick_name: string;
            country: string;
        };
    };
} 