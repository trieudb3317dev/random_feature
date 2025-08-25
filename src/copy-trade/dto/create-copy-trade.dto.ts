import { IsNumber, IsString, IsEnum, IsOptional, IsBoolean, Matches } from 'class-validator';

export class CreateCopyTradeDto {
    @IsString()
    @Matches(/^([1-9A-HJ-NP-Za-km-z]{32,44})$/, {
        message: 'Invalid Solana wallet address format',
    })
    tracking_wallet: string;

    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'amount must be a decimal with up to 6 decimal places' })
    amount: number;

    @IsEnum(['maxbuy', 'fixedbuy', 'fixedratio'])
    buy_option: 'maxbuy' | 'fixedbuy' | 'fixedratio';

    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'fixed_ratio must be a decimal with up to 6 decimal places' })
    fixed_ratio: number;

    @IsEnum(['auto', 'notsell', 'manual'])
    sell_method: 'auto' | 'notsell' | 'manual';

    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'tp must be a decimal with up to 6 decimal places' })
    tp: number;

    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'sl_value must be a decimal with up to 6 decimal places' })
    sl_value: number;

    @IsBoolean()
    tp_sl: boolean;

    @IsBoolean()
    status: boolean;
}
