export interface LoginResponse {
    status: number;
    message: string;
    data: {
        token: string;
        user: {
            id: number;
            email: string;
            wallet: {
                id: number;
                solana: string;
                ethereum: string;
                nickname: string | null;
            };
        };
    };
} 