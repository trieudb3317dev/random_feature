import { IsString, IsEmail, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    @MaxLength(6)
    code: string;

    @IsString()
    @MinLength(4)
    @MaxLength(50)
    newPassword: string;
} 