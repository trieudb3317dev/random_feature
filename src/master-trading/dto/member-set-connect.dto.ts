import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MemberSetConnectDto {
    @ApiProperty({
        description: 'ID của master wallet',
        example: 123
    })
    @IsNumber()
    @IsPositive()
    master_id: number;

    @ApiProperty({
        description: 'Trạng thái kết nối mới',
        enum: ['connect', 'disconnect', 'pause'],
        example: 'pause'
    })
    @IsEnum(['connect', 'disconnect', 'pause'])
    status: 'connect' | 'disconnect' | 'pause';
} 