import { Controller, Get, Post, Body, UseGuards, Request, Param, Query, Put } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CopyTradeService } from './copy-trade.service';
import { CreateCopyTradeDto } from './dto/create-copy-trade.dto';
import { UpdateCopyTradeDto } from './dto/update-copy-trade.dto';

@Controller('copy-trade')
export class CopyTradeController {
    constructor(private readonly copyTradeService: CopyTradeService) { }

    // @UseGuards(JwtAuthGuard)
    // @Post()
    // async createCopyTrade(@Request() req, @Body() createCopyTradeDto: CreateCopyTradeDto) {
    //     return await this.copyTradeService.createCopyTrade(req.user, createCopyTradeDto);
    // }

    // @UseGuards(JwtAuthGuard)
    // @Get()
    // async getCopyTrades(@Request() req) {
    //     return await this.copyTradeService.getCopyTrades(req.user);
    // }

    // @UseGuards(JwtAuthGuard)
    // @Post('change-status')
    // async changeCopyTradeStatus(
    //     @Request() req,
    //     @Body() body: { ct_id: number, status: 'running' | 'pause' | 'stop' }
    // ) {
    //     return await this.copyTradeService.changeCopyTradeStatus(req.user, body.ct_id, body.status);
    // }

    // @UseGuards(JwtAuthGuard)
    // @Get('details/:wallet_tracking')
    // async getCopyTradeDetails(
    //     @Request() req,
    //     @Param('wallet_tracking') walletTracking: string,
    //     @Query('status') status?: 'failed' | 'success',
    //     @Query('id') id?: number
    // ) {
    //     return await this.copyTradeService.getCopyTradeDetails(req.user, walletTracking, status, id);
    // }

    // @UseGuards(JwtAuthGuard)
    // @Post('change-name')
    // async changeCopyTradeName(
    //     @Request() req,
    //     @Body() body: { ct_id: number, tracking_name: string }
    // ) {
    //     return await this.copyTradeService.changeCopyTradeName(req.user, body.ct_id, body.tracking_name);
    // }

    // @UseGuards(JwtAuthGuard)
    // @Get('positions')
    // async getPositions(@Request() req) {
    //     return await this.copyTradeService.getPositions(req.user);
    // }

    // @UseGuards(JwtAuthGuard)
    // @Put(':id')
    // async updateCopyTrade(
    //     @Request() req,
    //     @Param('id') id: number,
    //     @Body() updateCopyTradeDto: UpdateCopyTradeDto
    // ) {
    //     return await this.copyTradeService.updateCopyTrade(req.user, id, updateCopyTradeDto);
    // }

    // @UseGuards(JwtAuthGuard)
    // @Get(':id')
    // async getCopyTradeById(
    //     @Request() req,
    //     @Param('id') id: number
    // ) {
    //     return await this.copyTradeService.getCopyTradeById(req.user, id);
    // }
}