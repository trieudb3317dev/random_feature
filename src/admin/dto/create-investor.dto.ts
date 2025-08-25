import { IsString } from 'class-validator';

export class CreateInvestorDto {
  @IsString()
  wallet_address: string;
} 