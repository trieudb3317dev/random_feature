import { ApiProperty } from '@nestjs/swagger';

export class SetMailCodeResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;

    @ApiProperty({ required: false })
    code?: string;

    @ApiProperty({ required: false })
    expires_at?: Date;
} 