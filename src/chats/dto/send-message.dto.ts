import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class SendMessageDto {
    @ApiProperty({ description: 'Content of the message' })
    @IsString()
    @IsNotEmpty()
    content: string;

    @ApiProperty({ description: 'Wallet ID of the sender', required: true })
    @IsNumber()
    @IsNotEmpty()
    wallet_id: number;
} 