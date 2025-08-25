export class GetAmountResponseDto {
    status: number;
    message: string;
    data?: {
        token_address: string;
        token_balance: number;
        sol_balance: number;
    };
} 