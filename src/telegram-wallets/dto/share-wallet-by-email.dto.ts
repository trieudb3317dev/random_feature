import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ShareWalletByEmailDto {
  @ApiProperty({
    description: 'Email of the user to find wallet',
    example: 'user@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Type of wallet to share (main, other, import)',
    example: 'main',
    required: false
  })
  @IsOptional()
  @IsString()
  walletType?: string;
}

export class ShareWalletByEmailResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Wallet information retrieved successfully'
  })
  message: string;

  @ApiProperty({
    description: 'Wallet data',
    example: {
      walletId: 123456,
      solanaAddress: 'ABC123...',
      ethAddress: '0x123...',
      nickName: 'My Wallet',
      walletType: 'main',
      userEmail: 'user@example.com'
    }
  })
  data: {
    walletId: number;
    solanaAddress: string;
    ethAddress: string;
    nickName: string;
    walletType: string;
    userEmail: string;
  } | null;
} 