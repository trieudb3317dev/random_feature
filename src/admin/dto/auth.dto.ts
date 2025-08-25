import { IsEmail, IsString, MinLength, IsEnum, IsNotEmpty } from 'class-validator';
import { AdminRole } from '../entities/user-admin.entity';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RegisterDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(4)
  password: string;

  @IsEmail()
  email: string;

  @IsEnum(AdminRole)
  role: AdminRole;
} 