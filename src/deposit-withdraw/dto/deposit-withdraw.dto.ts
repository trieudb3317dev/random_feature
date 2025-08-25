import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsEnum, IsOptional, Min, MaxLength } from 'class-validator';
import { TransactionType, TransactionStatus } from '../entities/deposit-withdraw-history.entity';

export class CreateDepositWithdrawDto {
    @ApiProperty({
        description: 'Địa chỉ ví Solana nhận tiền',
        example: '7YttLkHGczovz8Zb1XSyjJ8Q9ZxW5WJZqKJYqKJYqKJYqK'
    })
    @IsNotEmpty()
    @IsString()
    wallet_address_to: string;

    @ApiProperty({
        description: 'Số lượng token',
        example: 1.5
    })
    @IsNotEmpty()
    @IsNumber()
    @Min(0.000001)
    amount: number;

    @ApiProperty({
        description: 'Loại giao dịch',
        enum: TransactionType,
        example: TransactionType.WITHDRAW
    })
    @IsNotEmpty()
    @IsEnum(TransactionType)
    type: TransactionType;

    @ApiProperty({
        description: 'Biểu tượng token (e.g., SOL, USDT, USDC)',
        example: 'SOL',
        required: false
    })
    @IsOptional()
    @IsString()
    @MaxLength(10)
    token_symbol?: string;

    @ApiProperty({
        description: 'Địa chỉ mint của token (cho SPL tokens)',
        example: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        required: false
    })
    @IsOptional()
    @IsString()
    @MaxLength(44)
    token_mint_address?: string;

    @ApiProperty({
        description: 'Mã xác thực Google Authenticator (chỉ cần khi rút tiền và đã bật Google Auth)',
        example: '123456',
        required: false
    })
    @IsOptional()
    @IsString()
    google_auth_token?: string;
}

export class CreateMultiTokenDepositWithdrawDto {
    @ApiProperty({
        description: 'Địa chỉ ví Solana nhận tiền',
        example: '7YttLkHGczovz8Zb1XSyjJ8Q9ZxW5WJZqKJYqKJYqKJYqK'
    })
    @IsNotEmpty()
    @IsString()
    wallet_address_to: string;

    @ApiProperty({
        description: 'Số lượng token',
        example: 1.5
    })
    @IsNotEmpty()
    @IsNumber()
    @Min(0.000001)
    amount: number;

    @ApiProperty({
        description: 'Loại giao dịch',
        enum: TransactionType,
        example: TransactionType.WITHDRAW
    })
    @IsNotEmpty()
    @IsEnum(TransactionType)
    type: TransactionType;

    @ApiProperty({
        description: 'Biểu tượng token (e.g., SOL, USDT, USDC)',
        example: 'SOL',
        required: true
    })
    @IsNotEmpty()
    @IsString()
    @MaxLength(10)
    token_symbol: string;

    @ApiProperty({
        description: 'Địa chỉ mint của token (bắt buộc cho SPL tokens, để trống cho SOL)',
        example: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        required: false
    })
    @IsOptional()
    @IsString()
    @MaxLength(44)
    token_mint_address?: string;

    @ApiProperty({
        description: 'Mã xác thực Google Authenticator (chỉ cần khi rút tiền và đã bật Google Auth)',
        example: '123456',
        required: false
    })
    @IsOptional()
    @IsString()
    google_auth_token?: string;
}

export class DepositWithdrawResponseDto {
  id: number;
  type: TransactionType;
  amount: number;
  status: string;
  wallet_address_from: string;
  wallet_address_to: string;
  token_symbol?: string;
  token_mint_address?: string;
  transaction_hash?: string;
  created_at: Date;
}

export class GetHistoryDto {
  wallet_address_from?: string;
  wallet_address_to?: string;
  type?: TransactionType;
  token_symbol?: string;
} 