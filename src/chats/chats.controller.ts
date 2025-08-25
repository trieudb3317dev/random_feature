import { Controller, Post, Get, Param, Body, UseGuards, Query, Request, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatsService } from './chats.service';
import { SendMessageDto } from './dto/send-message.dto';

@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatsController {
    constructor(private readonly chatsService: ChatsService) { }

    @Post('send-message/token/:token_address')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FilesInterceptor('images', 10))
    async sendMessage(
        @Param('token_address') tokenAddress: string,
        @Body() sendMessageDto: { content?: string, lang?: string },
        @UploadedFiles() files: Express.Multer.File[],
        @Request() req: any
    ) {
        try {
            const walletId = req.user.wallet_id;
            
            // Nếu có files hình ảnh, upload lên Cloudinary trước
            let imageUrls: string[] = [];
            if (files && files.length > 0) {
                for (const file of files) {
                    const uploadResult = await this.chatsService.uploadImageToCloudinary(file);
                    imageUrls.push(uploadResult.secure_url);
                }
            }
            
            const chatHistory = await this.chatsService.sendMessage(
                tokenAddress,
                sendMessageDto.content || '',
                walletId,
                sendMessageDto.lang,
                imageUrls.length > 0 ? imageUrls : undefined
            );
            return {
                status: 200,
                data: chatHistory
            };
        } catch (error) {
            return {
                status: 500,
                message: error.message
            };
        }
    }

    @Post('send-message/all')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FilesInterceptor('images', 10))
    async sendMessageToAll(
        @Body() sendMessageDto: { content?: string, lang?: string },
        @UploadedFiles() files: Express.Multer.File[],
        @Request() req: any
    ) {
        try {
            const walletId = req.user.wallet_id;
            
            // Nếu có files hình ảnh, upload lên Cloudinary trước
            let imageUrls: string[] = [];
            if (files && files.length > 0) {
                for (const file of files) {
                    const uploadResult = await this.chatsService.uploadImageToCloudinary(file);
                    imageUrls.push(uploadResult.secure_url);
                }
            }
            
            const chatHistory = await this.chatsService.sendMessageToAll(
                sendMessageDto.content || '',
                walletId,
                sendMessageDto.lang,
                imageUrls.length > 0 ? imageUrls : undefined
            );
            return {
                status: 200,
                data: chatHistory
            };
        } catch (error) {
            return {
                status: 500,
                message: error.message
            };
        }
    }

    @Post('send-message/group/:group_id')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FilesInterceptor('images', 10))
    async sendMessageToGroup(
        @Param('group_id') groupId: number,
        @Body() sendMessageDto: { content?: string, lang?: string },
        @UploadedFiles() files: Express.Multer.File[],
        @Request() req: any
    ) {
        try {
            const walletId = req.user.wallet_id;
            
            // Nếu có files hình ảnh, upload lên Cloudinary trước
            let imageUrls: string[] = [];
            if (files && files.length > 0) {
                for (const file of files) {
                    const uploadResult = await this.chatsService.uploadImageToCloudinary(file);
                    imageUrls.push(uploadResult.secure_url);
                }
            }
            
            const chatHistory = await this.chatsService.sendMessageToGroup(
                groupId,
                sendMessageDto.content || '',
                walletId,
                sendMessageDto.lang,
                imageUrls.length > 0 ? imageUrls : undefined
            );
            return {
                status: 200,
                data: chatHistory
            };
        } catch (error) {
            return {
                status: 500,
                message: error.message
            };
        }
    }

    @Get('all-histories')
    @UseGuards(JwtAuthGuard)
    async getAllChatHistories(
        @Request() req: any
    ) {
        try {
            const walletId = req.user.wallet_id;
            const { histories, last_read } = await this.chatsService.getAllChatHistories(50, 0, walletId);
            return {
                status: 200,
                last_read,
                data: histories
            };
        } catch (error) {
            return {
                status: 500,
                message: error.message
            };
        }
    }

    @Get('token-histories/:token_address')
    @UseGuards(JwtAuthGuard)
    async getTokenChatHistories(
        @Param('token_address') tokenAddress: string,
        @Request() req: any
    ) {
        try {
            const walletId = req.user.wallet_id;
            const { histories, last_read } = await this.chatsService.getTokenChatHistories(tokenAddress, 50, 0, walletId);
            return {
                status: 200,
                last_read,
                data: histories
            };
        } catch (error) {
            return {
                status: 500,
                message: error.message
            };
        }
    }

    @Get('group-histories/:group_id')
    @UseGuards(JwtAuthGuard)
    async getGroupChatHistories(
        @Param('group_id') groupId: number,
        @Query('limit') limit: number = 50,
        @Query('skip') skip: number = 0,
        @Request() req: any
    ) {
        try {
            const walletId = req.user.wallet_id;
            const { histories, last_read } = await this.chatsService.getGroupChatHistories(
                groupId,
                walletId,
                limit,
                skip
            );
            return {
                status: 200,
                last_read,
                data: histories
            };
        } catch (error) {
            return {
                status: 500,
                message: error.message
            };
        }
    }

    @Post('read-all')
    @UseGuards(JwtAuthGuard)
    async markAllAsRead(@Request() req: any) {
        try {
            const walletId = req.user.wallet_id;
            const result = await this.chatsService.markAllAsRead(walletId);
            return {
                status: 200,
                data: result
            };
        } catch (error) {
            return {
                status: 500,
                message: error.message
            };
        }
    }

    @Post('read-token/:token_address')
    @UseGuards(JwtAuthGuard)
    async markTokenAsRead(
        @Param('token_address') tokenAddress: string,
        @Request() req: any
    ) {
        try {
            const walletId = req.user.wallet_id;
            const result = await this.chatsService.markTokenAsRead(walletId, tokenAddress);
            return {
                status: 200,
                data: result
            };
        } catch (error) {
            return {
                status: 500,
                message: error.message
            };
        }
    }

    @Post('read-group/:group_id')
    @UseGuards(JwtAuthGuard)
    async markGroupAsRead(
        @Param('group_id') groupId: number,
        @Request() req: any
    ) {
        try {
            const walletId = req.user.wallet_id;
            const result = await this.chatsService.markGroupAsRead(walletId, groupId);
            return {
                status: 200,
                data: result
            };
        } catch (error) {
            return {
                status: 500,
                message: error.message
            };
        }
    }
} 