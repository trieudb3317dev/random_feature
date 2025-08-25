import { IsEnum, IsNumber, IsPositive } from 'class-validator';

export enum ContributionType {
  SOL = 'sol',
  USDT = 'usdt',
}

export class ContributeCapitalDto {
  @IsEnum(ContributionType)
  contribution_type: ContributionType;

  @IsNumber()
  @IsPositive()
  amount: number;
}