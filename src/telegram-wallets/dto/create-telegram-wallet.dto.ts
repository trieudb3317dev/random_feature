import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CreateTelegramWalletDto {
    @IsNotEmpty()
    @IsString()
    wallet_telegram_id: string;

    @IsNotEmpty()
    @IsString()
    wallet_pravite_key: string;

    @IsBoolean()
    wallet_status: boolean;
}
