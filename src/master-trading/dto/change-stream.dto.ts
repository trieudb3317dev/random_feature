import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ChangeStreamDto {
    @ApiProperty({
        description: 'Password to verify master wallet',
        example: 'your-password'
    })
    @IsString()
    @IsNotEmpty()
    password: string;
} 