import { IsEmail, IsString, MinLength, IsNotEmpty, IsEnum } from 'class-validator';
import { AdminRole } from '../entities/user-admin.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsEnum([AdminRole.MEMBER, AdminRole.PARTNER], {
    message: 'Role must be either member or partner'
  })
  role: AdminRole.MEMBER | AdminRole.PARTNER;
} 