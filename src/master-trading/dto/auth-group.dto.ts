import { IsNotEmpty, IsNumber, IsEnum } from 'class-validator';

export class AuthGroupDto {
    @IsNotEmpty()
    @IsNumber()
    mga_group_id: number;
}

export class ChangeAuthStatusDto {
    @IsNotEmpty()
    @IsNumber()
    mg_id: number;

    @IsNotEmpty()
    @IsNumber()
    member_id: number;

    @IsNotEmpty()
    @IsEnum(['running', 'pause'])
    status: 'running' | 'pause';
} 