import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MasterCreateGroupDto {
    @ApiProperty({
        description: 'Tên của group',
        example: 'My Trading Group',
        minLength: 3,
        maxLength: 100
    })
    @IsString()
    @IsNotEmpty()
    @Length(3, 100)
    mg_name: string;
} 