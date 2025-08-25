import { Controller, Get, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { BittworldsService } from '../services/bittworlds.service';
import { TokenListResponseDto } from '../dto/token-list.dto';

@Controller('bittworlds')
export class BittworldsController {
    constructor(private readonly bittworldsService: BittworldsService) {}

    /**
     * GET /bittworlds/token-list
     * Lấy danh sách token từ bảng bittworld_token và bổ sung dữ liệu từ Solana Tracker
     */
    @Get('token-list')
    @HttpCode(HttpStatus.OK)
    async getTokenList(
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20'
    ): Promise<TokenListResponseDto> {
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 20;
        
        return await this.bittworldsService.getTokenList(pageNum, limitNum);
    }

    // Controller methods khác sẽ được thêm sau khi cần tạo API
} 