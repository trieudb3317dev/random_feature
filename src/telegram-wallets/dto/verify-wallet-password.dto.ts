import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyWalletPasswordDto {
    @IsNotEmpty()
    @IsString()
    password: string;
} 