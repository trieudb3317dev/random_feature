import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsOptional, IsBoolean, Min, Max, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTokenDto {
    @ApiProperty({
        description: 'Tên của token',
        example: 'PPTest'
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Symbol của token',
        example: 'TEST'
    })
    @IsString()
    @IsNotEmpty()
    symbol: string;

    @ApiProperty({
        description: 'Mô tả về token',
        example: 'This is an example token created via PumpPortal.fun'
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        description: 'URL Twitter của dự án',
        example: 'https://x.com/example'
    })
    @IsString()
    @IsOptional()
    twitter?: string;

    @ApiProperty({
        description: 'URL Telegram của dự án',
        example: 'https://t.me/example'
    })
    @IsString()
    @IsOptional()
    telegram?: string;

    @ApiProperty({
        description: 'URL Website của dự án',
        example: 'https://example.com'
    })
    @IsString()
    @IsOptional()
    website?: string;

    @ApiProperty({
        description: 'Số lượng SOL để mua token (initial liquidity). Không bắt buộc với PumpFun.',
        example: 1,
        required: false
    })
    amount?: any;

    @ApiProperty({
        description: 'Slippage cho giao dịch (phần trăm)',
        example: 10
    })
    @IsNumber()
    @Min(0)
    @Max(100)
    @IsOptional()
    slippage?: number;

    @ApiProperty({
        description: 'Priority fee cho giao dịch (SOL)',
        example: 0.0005
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    priorityFee?: number;

    @ApiProperty({
        description: 'Hiển thị tên token hay không',
        example: true
    })
    @IsBoolean()
    @IsOptional()
    showName?: boolean;

    @ApiProperty({ description: 'List of category IDs', required: false, type: [Number] })
    @IsOptional()
    category_list?: number[];

    @ApiProperty({ 
        description: 'Total supply of token (in base units)', 
        example: 1000000000,
        default: 1000000000,
        required: false 
    })
    @Transform(({ value }) => {
        // Chuyển đổi string thành number
        if (typeof value === 'string') {
            // Loại bỏ dấu phẩy và khoảng trắng
            const cleanValue = value.replace(/[,\s]/g, '');
            return Number(cleanValue);
        }
        return value;
    })
    @IsNumber()
    @Min(1)
    @IsOptional()
    totalSupply?: number;

    @ApiProperty({ 
        description: 'Number of decimals for token. If totalSupply > 3B, decimals must be <= 6', 
        example: 9,
        required: false 
    })
    @IsNumber()
    @IsOptional()
    @Transform(({ value, obj }) => {
        // Nếu không truyền decimals, sẽ được tính toán trong service
        if (value === undefined || value === null) {
            return undefined;
        }
        
        // Kiểm tra nếu totalSupply > 3B và decimals > 6
        const totalSupply = obj?.totalSupply;
        if (totalSupply && totalSupply > 3000000000 && value > 6) {
            throw new Error('Decimals must be <= 6 when totalSupply > 3,000,000,000');
        }
        
        return value;
    })
    decimals?: number;

    @ApiProperty({
        description: 'Cho phép đúc thêm token hay không. Nếu true, wallet tạo token sẽ là mint authority. Nếu false, token sẽ có supply cố định.',
        example: false,
        default: false
    })
    @IsBoolean()
    @IsOptional()
    allowMinting?: boolean = false;
}

export class CreateTokenResponseDto {
    @ApiProperty()
    status: number;

    @ApiProperty()
    message: string;

    @ApiProperty({
        description: 'Thông tin về token đã tạo',
        required: false
    })
    data?: {
        tokenAddress: string;
        transaction: string;
        name: string;
        symbol: string;
        metadataUri: string;
    };
} 