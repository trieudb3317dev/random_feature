import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum WishlistStatus {
    ON = 'on',
    OFF = 'off'
}

export class ToggleWishlistDto {
    @ApiProperty({ description: 'Token address to toggle wishlist status' })
    @IsString()
    @IsNotEmpty()
    token_address: string;

    @ApiProperty({ enum: WishlistStatus, description: 'Wishlist status (on/off)' })
    @IsEnum(WishlistStatus)
    @IsNotEmpty()
    status: WishlistStatus;
} 