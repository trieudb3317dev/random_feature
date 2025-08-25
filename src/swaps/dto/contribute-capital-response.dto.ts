export class ContributeCapitalResponseDto {
  swap_investor_id: number;
  wallet_address: string;
  coins: string[];
  amount_sol: number;
  amount_usdt: number;
  amount_usd: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}