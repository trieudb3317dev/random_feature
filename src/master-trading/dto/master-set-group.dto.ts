import { IsNotEmpty, IsNumber, IsPositive, IsArray, ArrayMinSize, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MasterSetGroupDto {
    @ApiProperty({
        description: 'ID của group mà master muốn thêm các member vào',
        example: 1
    })
    @IsNumber()
    @IsPositive()
    @IsNotEmpty()
    mg_id: number;

    @ApiProperty({
        description: 'Mảng các ID của member (wallet_id) mà master muốn thêm vào group',
        type: [Number],
        example: [2, 3, 4]
    })
    @IsArray()
    @ArrayNotEmpty()
    member_ids: number[];
} 