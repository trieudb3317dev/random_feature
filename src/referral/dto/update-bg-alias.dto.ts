import { IsNumber, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateBgAliasDto {
  @IsNumber()
  @IsNotEmpty()
  toWalletId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255, { message: 'Alias không được vượt quá 255 ký tự' })
  newAlias: string;
} 