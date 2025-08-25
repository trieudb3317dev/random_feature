import { IsString, IsEmail, IsOptional, MinLength, MaxLength } from 'class-validator';

export class ManualRegisterDto {
    @IsString()
    @MinLength(1)
    @MaxLength(45)
    name: string;

    @IsString()
    @MinLength(1)
    @MaxLength(45)
    nick_name: string;

    @IsString()
    @MinLength(1)
    @MaxLength(50)
    country: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    bittworld_uid?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    refCode?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    referrer_bittworld_uid?: string;

    @IsString()
    @MinLength(4)
    @MaxLength(50)
    password: string;

    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    @MaxLength(6)
    verificationCode: string;
} 