import { Controller, Get, Post, Query, Body, UseGuards, Request, Param, UploadedFile, UseInterceptors, HttpException, HttpStatus, Logger, ParseIntPipe, Req, ForbiddenException, UnauthorizedException, NotFoundException, BadRequestException, InternalServerErrorException, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtAuthGuard as SimpleJwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TelegramWalletsService } from './telegram-wallets.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WalletPrivateKeysResponseDto } from './dto/wallet-private-keys.dto';
import { AddWalletDto, AddWalletResponseDto } from './dto/add-wallet.dto';
import { DeleteWalletDto, DeleteWalletResponseDto } from './dto/delete-wallet.dto';
import { UpdateWalletDto, UpdateWalletResponseDto } from './dto/change-wallet-name.dto';
import { GetMyWalletsResponseDto } from './dto/get-my-wallets.dto';
import { UseWalletDto, UseWalletResponseDto } from './dto/use-wallet.dto';
import { CreateTokenDto, CreateTokenResponseDto } from './dto/create-token.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetCategoriesResponseDto } from './dto/get-categories.dto';
import { GetWalletInfoResponseDto } from './dto/get-wallet-info.dto';
import { SetWalletPasswordDto } from './dto/set-wallet-password.dto';
import { VerifyWalletPasswordDto } from './dto/verify-wallet-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AddGoogleAuthDto, AddGoogleAuthResponseDto } from './dto/add-google-auth.dto';
import { VerifyGoogleAuthDto, VerifyGoogleAuthResponseDto } from './dto/verify-google-auth.dto';
import { RemoveGoogleAuthDto, RemoveGoogleAuthResponseDto } from './dto/remove-google-auth.dto';
import { AddGmailDto, AddGmailResponseDto } from './dto/add-gmail.dto';
import { SetMailCodeResponseDto } from './dto/set-mail-code.dto';
import { VerifyGmailDto, VerifyGmailResponseDto } from './dto/verify-gmail.dto';
import { ShareWalletByEmailDto, ShareWalletByEmailResponseDto } from './dto/share-wallet-by-email.dto';

@ApiTags('Telegram Wallets')
@ApiBearerAuth()
@Controller('telegram-wallets')
export class TelegramWalletsController {
    private readonly logger = new Logger(TelegramWalletsController.name);

    constructor(private readonly telegramWalletsService: TelegramWalletsService) { }

    // @Post('connect-wallets')
    // async verifyWallet(@Body() body: { id: string, code: string }) {
    //     try {
    //         if (!body.id || !body.code) {
    //             throw new HttpException({
    //                 status: HttpStatus.BAD_REQUEST,
    //                 error: 'ID and code are required',
    //                 message: 'Missing required fields'
    //             }, HttpStatus.BAD_REQUEST);
    //         }
    //         return await this.telegramWalletsService.verifyWallet(body.id, body.code);
    //     } catch (error) {
    //         throw new HttpException({
    //             status: HttpStatus.INTERNAL_SERVER_ERROR,
    //             error: error.message,
    //             message: 'Failed to verify wallet'
    //         }, HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }

    @UseGuards(JwtAuthGuard)
    @Get('info')
    async getWalletInfo(@Request() req) {
        try {
            if (!req.user.wallet_id) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Missing wallet_id in JWT token',
                    message: 'Invalid token'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.telegramWalletsService.getWalletInfo(req);

            if (result.status === 404) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: result.message,
                    message: 'Wallet or user not found'
                }, HttpStatus.NOT_FOUND);
            }

            if (result.status === 403) {
                throw new HttpException({
                    status: HttpStatus.FORBIDDEN,
                    error: result.message,
                    message: 'Wallet nickname is required'
                }, HttpStatus.FORBIDDEN);
            }

            return result;
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to get wallet info'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // @UseGuards(JwtAuthGuard)
    // @Post('private-keys')
    // @ApiOperation({ summary: 'Get wallet private keys using JWT' })
    // @ApiResponse({ status: 200, description: 'Return the wallet private keys', type: WalletPrivateKeysResponseDto })
    // @ApiResponse({ status: 404, description: 'Wallet not found' })
    // async getPrivateKeys(@Request() req) {
    //     try {
    //         const result = await this.telegramWalletsService.getPrivateKeys(req);
    //         if (result.status === 404) {
    //             throw new HttpException({
    //                 status: HttpStatus.NOT_FOUND,
    //                 error: result.message,
    //                 message: 'Wallet not found'
    //             }, HttpStatus.NOT_FOUND);
    //         }
    //         return result;
    //     } catch (error) {
    //         throw new HttpException({
    //             status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    //             error: error.message,
    //             message: 'Failed to get private keys'
    //         }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }

    // @UseGuards(JwtAuthGuard)
    // @Post('add-wallet')
    // @ApiOperation({ summary: 'Thêm ví mới hoặc import ví đã tồn tại' })
    // @ApiResponse({ status: 200, description: 'Ví đã được thêm thành công', type: AddWalletResponseDto })
    // @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
    // @ApiResponse({ status: 401, description: 'Không được phép' })
    // async addWallet(@Request() req, @Body() addWalletDto: AddWalletDto) {
    //     try {
    //         if (!addWalletDto.type || (addWalletDto.type === 'import' && !addWalletDto.private_key)) {
    //             throw new HttpException({
    //                 status: HttpStatus.BAD_REQUEST,
    //                 error: 'Missing required fields',
    //                 message: 'Type is required, and private key is required for import'
    //             }, HttpStatus.BAD_REQUEST);
    //         }
    //         const result = await this.telegramWalletsService.addWallet(req.user, addWalletDto);
    //         if (result.status === 409 && result.error_code === 'NICKNAME_EXISTS') {
    //             throw new HttpException({
    //                 status: HttpStatus.CONFLICT,
    //                 error: result.message,
    //                 error_code: result.error_code,
    //                 message: 'Wallet nickname already exists'
    //             }, HttpStatus.CONFLICT);
    //         }
    //         if (result.status === 400) {
    //             throw new HttpException({
    //                 status: HttpStatus.BAD_REQUEST,
    //                 error: result.message,
    //                 message: 'Failed to add wallet'
    //             }, HttpStatus.BAD_REQUEST);
    //         }
    //         return result;
    //     } catch (error) {
    //         throw new HttpException({
    //             status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    //             error: error.message,
    //             message: error.message
    //         }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }

    // @UseGuards(JwtAuthGuard)
    // @Post('delete-wallet')
    // @ApiOperation({ summary: 'Xóa liên kết ví' })
    // @ApiResponse({ status: 200, description: 'Ví đã được xóa liên kết thành công', type: DeleteWalletResponseDto })
    // @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
    // @ApiResponse({ status: 401, description: 'Không được phép' })
    // @ApiResponse({ status: 404, description: 'Ví không tìm thấy' })
    // async deleteWallet(@Request() req, @Body() deleteWalletDto: DeleteWalletDto) {
    //     try {
    //         if (!deleteWalletDto.wallet_id) {
    //             throw new HttpException({
    //                 status: HttpStatus.BAD_REQUEST,
    //                 error: 'Wallet ID is required',
    //                 message: 'Missing required fields'
    //             }, HttpStatus.BAD_REQUEST);
    //         }
    //         const result = await this.telegramWalletsService.deleteWallet(req.user, deleteWalletDto.wallet_id);
    //         if (result.status === 404) {
    //             throw new HttpException({
    //                 status: HttpStatus.NOT_FOUND,
    //                 error: result.message,
    //                 message: 'Wallet not found'
    //             }, HttpStatus.NOT_FOUND);
    //         }
    //         return result;
    //     } catch (error) {
    //         throw new HttpException({
    //             status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    //             error: error.message,
    //             message: 'Failed to delete wallet'
    //         }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }

    @UseGuards(SimpleJwtAuthGuard)
    @Post('update-wallet')
    @ApiOperation({ summary: 'Cập nhật thông tin ví' })
    @ApiResponse({ status: 200, description: 'Thông tin ví đã được cập nhật thành công', type: UpdateWalletResponseDto })
    @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc tên/nickname đã tồn tại' })
    @ApiResponse({ status: 401, description: 'Không được phép' })
    @ApiResponse({ status: 404, description: 'Ví không tìm thấy' })
    async updateWallet(@Request() req, @Body() updateWalletDto: UpdateWalletDto) {
        try {
            if (!updateWalletDto.wallet_id || !updateWalletDto.name) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Wallet ID and name are required',
                    message: 'Missing required fields'
                }, HttpStatus.BAD_REQUEST);
            }
            const result = await this.telegramWalletsService.updateWallet(req.user, updateWalletDto);

            if (result.status === 409 && result.error_code === 'NICKNAME_EXISTS') {
                throw new HttpException({
                    status: HttpStatus.CONFLICT,
                    error: result.message,
                    error_code: result.error_code,
                    message: 'Wallet nickname already exists'
                }, HttpStatus.CONFLICT);
            }

            if (result.status === 404) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: result.message,
                    message: 'Wallet not found'
                }, HttpStatus.NOT_FOUND);
            }

            if (result.status === 400) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.message,
                    message: 'Invalid data or duplicate name/nickname'
                }, HttpStatus.BAD_REQUEST);
            }

            if (result.status === 403) {
                throw new HttpException({
                    status: HttpStatus.FORBIDDEN,
                    error: result.message,
                    message: 'Permission denied'
                }, HttpStatus.FORBIDDEN);
            }

            return result;
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: error.message,
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // @UseGuards(SimpleJwtAuthGuard)
    // @Get('get-my-wallets')
    // @ApiOperation({ summary: 'Lấy danh sách tất cả các ví được liên kết với người dùng' })
    // @ApiResponse({ status: 200, description: 'Trả về danh sách các ví', type: GetMyWalletsResponseDto })
    // @ApiResponse({ status: 401, description: 'Không được phép' })
    // @ApiResponse({ status: 404, description: 'Không tìm thấy người dùng' })
    // async getMyWallets(@Request() req) {
    //     try {
    //         const result = await this.telegramWalletsService.getMyWallets(req.user);
    //         if (result.status === 404) {
    //             throw new HttpException({
    //                 status: HttpStatus.NOT_FOUND,
    //                 error: result.message,
    //                 message: 'User not found'
    //             }, HttpStatus.NOT_FOUND);
    //         }
    //         return result;
    //     } catch (error) {
    //         throw new HttpException({
    //             status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    //             error: error.message,
    //             message: 'Failed to get wallets'
    //         }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }

    // @UseGuards(JwtAuthGuard)
    // @Post('use-wallet')
    // @ApiOperation({ summary: 'Chuyển đổi sang ví khác và nhận token mới' })
    // @ApiResponse({ status: 200, description: 'Chuyển đổi ví thành công, trả về token mới', type: UseWalletResponseDto })
    // @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
    // @ApiResponse({ status: 401, description: 'Không được phép' })
    // @ApiResponse({ status: 404, description: 'Ví không tìm thấy hoặc không liên kết với người dùng' })
    // async useWallet(@Request() req, @Body() useWalletDto: UseWalletDto) {
    //     try {
    //         if (!useWalletDto.wallet_id) {
    //             throw new HttpException({
    //                 status: HttpStatus.BAD_REQUEST,
    //                 error: 'Wallet ID is required',
    //                 message: 'Missing required fields'
    //             }, HttpStatus.BAD_REQUEST);
    //         }
    //         const result = await this.telegramWalletsService.useWallet(req.user, useWalletDto.wallet_id);
    //         if (result.status === 404) {
    //             throw new HttpException({
    //                 status: HttpStatus.NOT_FOUND,
    //                 error: result.message,
    //                 message: 'Wallet not found'
    //             }, HttpStatus.NOT_FOUND);
    //         }
    //         return result;
    //     } catch (error) {
    //         throw new HttpException({
    //             status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    //             error: error.message,
    //             message: 'Failed to switch wallet'
    //         }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }

    // @UseGuards(JwtAuthGuard)
    // @Post('create-token-pumpfun')
    // @UseInterceptors(FileInterceptor('image'))
    // @ApiOperation({ summary: 'Tạo token mới' })
    // async createToken(
    //     @Request() req,
    //     @Body() createTokenDto: CreateTokenDto,
    //     @UploadedFile() file: any
    // ) {
    //     try {
    //         if (!createTokenDto.name || !createTokenDto.symbol || !file) {
    //             throw new HttpException({
    //                 status: HttpStatus.BAD_REQUEST,
    //                 error: 'Name, symbol and image are required',
    //                 message: 'Missing required fields'
    //             }, HttpStatus.BAD_REQUEST);
    //         }
    //         const result = await this.telegramWalletsService.createTokenPumpfun(req.user, createTokenDto, file);

    //         if (result.status === 400) {
    //             throw new HttpException({
    //                 status: HttpStatus.BAD_REQUEST,
    //                 error: result.message,
    //                 message: 'Failed to create token'
    //             }, HttpStatus.BAD_REQUEST);
    //         }

    //         if (result.status === 404) {
    //             throw new HttpException({
    //                 status: HttpStatus.NOT_FOUND,
    //                 error: result.message,
    //                 message: 'Wallet not found'
    //             }, HttpStatus.NOT_FOUND);
    //         }

    //         return {
    //             status: HttpStatus.CREATED,
    //             message: 'Token created successfully',
    //             data: 'data' in result ? result.data : null
    //         };
    //     } catch (error) {
    //         if (error instanceof HttpException) {
    //             throw error;
    //         }

    //         throw new HttpException({
    //             status: HttpStatus.INTERNAL_SERVER_ERROR,
    //             error: error.message,
    //             message: 'Failed to create token'
    //         }, HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }

    // @UseGuards(JwtAuthGuard)
    // @Post('create-token-memepump')
    // @UseInterceptors(FileInterceptor('image'))
    // @ApiOperation({ summary: 'Tạo token mới trên Solana' })
    // async createTokenMemepump(
    //     @Request() req,
    //     @Body() createTokenDto: CreateTokenDto,
    //     @UploadedFile() file: any
    // ) {
    //     try {
    //         if (!createTokenDto.name || !createTokenDto.symbol || !file) {
    //             throw new HttpException({
    //                 status: HttpStatus.BAD_REQUEST,
    //                 error: 'Name, symbol and image are required',
    //                 message: 'Missing required fields'
    //             }, HttpStatus.BAD_REQUEST);
    //         }
    //         const result = await this.telegramWalletsService.createTokenMemepump(req.user, createTokenDto, file);

    //         if (result.status === 400) {
    //             throw new HttpException({
    //                 status: HttpStatus.BAD_REQUEST,
    //                 error: result.message,
    //                 message: 'Failed to create token'
    //             }, HttpStatus.BAD_REQUEST);
    //         }

    //         if (result.status === 404) {
    //             throw new HttpException({
    //                 status: HttpStatus.NOT_FOUND,
    //                 error: result.message,
    //                 message: 'Wallet not found'
    //             }, HttpStatus.NOT_FOUND);
    //         }

    //         // Type guard for Keypair
    //         function isKeypair(obj: any): obj is { publicKey: any; secretKey: any } {
    //             return obj && obj.secretKey && obj.publicKey;
    //         }
    //         const bs58 = require('bs58');
            
    //         // Tính toán decimals mặc định dựa trên totalSupply
    //         const totalSupply = createTokenDto.totalSupply || 1000000000;
    //         const defaultDecimals = totalSupply > 3000000000 ? 6 : 9;
    //         const finalDecimals = createTokenDto.decimals !== undefined ? createTokenDto.decimals : defaultDecimals;
            
    //         return {
    //             status: HttpStatus.CREATED,
    //             message: 'Token created successfully',
    //             data: {
    //                 name: createTokenDto.name || null,
    //                 symbol: createTokenDto.symbol || null,
    //                 decimals: finalDecimals,
    //                 description: createTokenDto.description || null,
    //                 logoUrl: (result as any).logoUrl || null,
    //                 metadataUri: result.metadataUri || null,
    //                 mintPublicKey: isKeypair(result.mint) ? result.mint.publicKey.toBase58() : (result.mint?.toBase58?.() || null),
    //                 mintPrivateKey: isKeypair(result.mint) ? bs58.encode(result.mint.secretKey) : null,
    //                 metadataAddress: result.metadataAddress?.toBase58?.() || null,
    //                 transactionHash: (result as any).transactionHash || null
    //             }
    //         };
    //     } catch (error) {
    //         if (error instanceof HttpException) {
    //             throw error;
    //         }

    //         throw new HttpException({
    //             status: HttpStatus.INTERNAL_SERVER_ERROR,
    //             error: error.message,
    //             message: 'Failed to create token'
    //         }, HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }

    @Get('get-my-tokens')
    @UseGuards(JwtAuthGuard)
    async getMyTokens(@Request() req) {
        try {
            const result = await this.telegramWalletsService.getMyTokens(req.user);
            if (result.status === 404) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: result.message,
                    message: 'User or wallet not found'
                }, HttpStatus.NOT_FOUND);
            }
            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to get tokens'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('get-wallet-balance')
    @ApiOperation({ summary: 'Get wallet balance by Solana address' })
    @ApiResponse({ status: 200, description: 'Return wallet balance' })
    @ApiResponse({ status: 404, description: 'Wallet not found' })
    async getWalletBalance(@Query('wallet_address') walletAddress: string) {
        try {
            if (!walletAddress) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Wallet address is required',
                    message: 'Missing required fields'
                }, HttpStatus.BAD_REQUEST);
            }
            return await this.telegramWalletsService.getWalletBalance(walletAddress);
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to get wallet balance'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('get-list-buy-tokens')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get list of tokens held by the wallet' })
    @ApiResponse({ status: 200, description: 'Return list of tokens' })
    @ApiResponse({ status: 404, description: 'Wallet not found' })
    async getListBuyTokens(@Request() req) {
        try {
            const result = await this.telegramWalletsService.getListBuyTokens(req.user);
            if (result.status === 404) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: result.message,
                    message: 'Wallet not found'
                }, HttpStatus.NOT_FOUND);
            }
            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to get list of tokens'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('balance-info')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get SOL, USDT and BITT information for current wallet' })
    @ApiResponse({ status: 200, description: 'SOL, USDT and BITT info retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Wallet not found' })
    async getSolUsdtInfo(@Request() req) {
        try {
            const result = await this.telegramWalletsService.getSolUsdtInfo(req.user);
            if (result.status === 404) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: result.message,
                    message: 'Wallet not found'
                }, HttpStatus.NOT_FOUND);
            }
            return result;
        } catch (error) {
                            throw new HttpException({
                    status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                    error: error.message,
                    message: 'Failed to get SOL, USDT and BITT info'
                }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // @Get('get-info/:id_or_private_key')
    // @ApiOperation({
    //     summary: 'Lấy thông tin ví theo wallet_id hoặc private key',
    //     description: 'Truyền vào wallet_id hoặc Solana private key để lấy thông tin ví'
    // })
    // @ApiResponse({ status: 200, description: 'Trả về thông tin của ví', type: GetWalletInfoResponseDto })
    // @ApiResponse({ status: 404, description: 'Không tìm thấy ví' })
    // async getWalletInfoById(@Param('id_or_private_key') idOrPrivateKey: string) {
    //     try {
    //         const result = await this.telegramWalletsService.getWalletInfoById(idOrPrivateKey);
    //         if (result.status === 404) {
    //             throw new HttpException({
    //                 status: HttpStatus.NOT_FOUND,
    //                 error: result.message,
    //                 message: 'Wallet not found'
    //             }, HttpStatus.NOT_FOUND);
    //         }
    //         return result;
    //     } catch (error) {
    //         throw new HttpException({
    //             status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    //             error: error.message,
    //             message: 'Failed to get wallet info'
    //         }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }

    @UseGuards(JwtAuthGuard)
    @Post('set-password')
    @ApiOperation({ summary: 'Set wallet password' })
    @ApiResponse({ status: 200, description: 'Password set successfully' })
    @ApiResponse({ status: 404, description: 'User wallet not found' })
    async setWalletPassword(
        @Req() req,
        @Body() dto: SetWalletPasswordDto
    ) {
        return this.telegramWalletsService.setWalletPassword(req.user.uid, dto);
    }

    // @UseGuards(JwtAuthGuard)
    // @Post('private-keys')
    // @ApiOperation({ summary: 'Get wallet private keys (requires password verification)' })
    // @ApiResponse({ status: 200, description: 'Private keys retrieved successfully' })
    // @ApiResponse({ status: 401, description: 'Invalid password or password not set' })
    // @ApiResponse({ status: 404, description: 'Wallet not found' })
    // async getWalletPrivateKeys(
    //     @Req() req,
    //     @Body() dto: VerifyWalletPasswordDto
    // ) {
    //     return this.telegramWalletsService.getWalletPrivateKeys(req.user.uid, req.user.wallet_id, dto);
    // }

    @UseGuards(JwtAuthGuard)
    @Get('send-code-reset-password')
    @ApiOperation({ summary: 'Reset wallet password' })
    @ApiResponse({ status: 200, description: 'Password reset successfully' })
    async sendCodeResetPassword(
        @Req() req,
    ) {
        return this.telegramWalletsService.sendCodeResetPassword(req.user.uid);
    }

    @UseGuards(JwtAuthGuard)
    @Post('verify-code')
    @ApiOperation({ summary: 'Verify reset password code' })
    @ApiResponse({ status: 200, description: 'Code verified successfully' })
    @ApiResponse({ status: 400, description: 'Invalid or expired code' })
    @ApiResponse({ status: 404, description: 'User wallet not found' })
    async verifyResetCode(
        @Req() req,
        @Body() dto: VerifyResetCodeDto
    ) {
        return this.telegramWalletsService.verifyResetCode(req.user.uid, dto.code);
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    @ApiOperation({ summary: 'Change wallet password using reset code' })
    @ApiResponse({ status: 200, description: 'Password changed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid or expired code' })
    @ApiResponse({ status: 404, description: 'User wallet not found' })
    async changePassword(
        @Req() req,
        @Body() dto: ChangePasswordDto
    ) {
        return this.telegramWalletsService.changePassword(req.user.uid, dto);
    }

    @UseGuards(JwtAuthGuard)
    @Post('add-gg-auth')
    @HttpCode(HttpStatus.CREATED)
    async addGoogleAuth(
        @Req() req,
        @Body() dto: AddGoogleAuthDto
    ): Promise<AddGoogleAuthResponseDto> {
        const response = await this.telegramWalletsService.addGoogleAuth(req.user.uid, dto);
        
        switch (response.status) {
            case 403:
                throw new ForbiddenException(response.message);
            case 401:
                throw new UnauthorizedException(response.message);
            case 404:
                throw new NotFoundException(response.message);
            case 400:
                throw new BadRequestException(response.message);
            case 500:
                throw new InternalServerErrorException(response.message);
            default:
                return response;
        }
    }

    @UseGuards(JwtAuthGuard)
    @Post('verify-gg-auth')
    @HttpCode(HttpStatus.OK)
    async verifyGoogleAuth(
        @Req() req,
        @Body() dto: VerifyGoogleAuthDto
    ): Promise<VerifyGoogleAuthResponseDto> {
        const response = await this.telegramWalletsService.verifyAndActivateGoogleAuth(req.user.uid, dto.token);
        
        switch (response.status) {
            case 403:
                throw new ForbiddenException(response.message);
            case 401:
                throw new UnauthorizedException(response.message);
            case 404:
                throw new NotFoundException(response.message);
            case 400:
                throw new BadRequestException(response.message);
            case 500:
                throw new InternalServerErrorException(response.message);
            default:
                return response;
        }
    }

    @UseGuards(JwtAuthGuard)
    @Post('remove-gg-auth')
    @HttpCode(HttpStatus.OK)
    async removeGoogleAuth(
        @Req() req,
        @Body() dto: RemoveGoogleAuthDto
    ): Promise<RemoveGoogleAuthResponseDto> {
        const response = await this.telegramWalletsService.removeGoogleAuth(req.user.uid, dto);
        
        switch (response.status) {
            case 403:
                throw new ForbiddenException(response.message);
            case 401:
                throw new UnauthorizedException(response.message);
            case 404:
                throw new NotFoundException(response.message);
            case 400:
                throw new BadRequestException(response.message);
            case 500:
                throw new InternalServerErrorException(response.message);
            default:
                return response;
        }
    }

    @UseGuards(JwtAuthGuard)
    @Post('set-mail-code')
    @HttpCode(HttpStatus.OK)
    async setMailCode(
        @Req() req
    ): Promise<SetMailCodeResponseDto> {
        const response = await this.telegramWalletsService.setMailCode(req.user.uid);
        
        switch (response.status) {
            case 409:
                throw new ForbiddenException(response.message);
            case 404:
                throw new NotFoundException(response.message);
            case 500:
                throw new InternalServerErrorException(response.message);
            default:
                return response;
        }
    }

    @UseGuards(JwtAuthGuard)
    @Post('add-gmail')
    @HttpCode(HttpStatus.OK)
    async addGmail(
        @Req() req,
        @Body() dto: AddGmailDto
    ): Promise<AddGmailResponseDto> {
        const response = await this.telegramWalletsService.addGmail(req.user.uid, dto);
        
        switch (response.status) {
            case 409:
                throw new ForbiddenException(response.message);
            case 404:
                throw new NotFoundException(response.message);
            case 400:
                throw new BadRequestException(response.message);
            case 500:
                throw new InternalServerErrorException(response.message);
            default:
                return response;
        }
    }

    @UseGuards(JwtAuthGuard)
    @Post('verify-gmail')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify Gmail with Telegram code' })
    @ApiResponse({ status: 200, description: 'Email verified successfully' })
    @ApiResponse({ status: 400, description: 'Invalid or expired verification code' })
    @ApiResponse({ status: 403, description: 'Email is already verified' })
    @ApiResponse({ status: 404, description: 'User wallet not found' })
    async verifyGmail(
        @Req() req,
        @Body() dto: VerifyGmailDto
    ): Promise<VerifyGmailResponseDto> {
        const response = await this.telegramWalletsService.verifyGmail(req.user.uid, dto);
        
        switch (response.status) {
            case 403:
                throw new ForbiddenException(response.message);
            case 404:
                throw new NotFoundException(response.message);
            case 400:
                throw new BadRequestException(response.message);
            case 500:
                throw new InternalServerErrorException(response.message);
            default:
                return response;
        }
    }

    @Post('update-token-logos')
    async updateTokenLogos(@Request() req) {
        try {
            const result = await this.telegramWalletsService.updateExistingTokenLogoUrls();
            return {
                status: 200,
                message: 'Token logo URLs updated successfully',
                data: result
            };
        } catch (error) {
            this.logger.error(`Error updating token logos: ${error.message}`);
            return {
                status: 500,
                message: `Error updating token logos: ${error.message}`
            };
        }
    }

    @Get('share-wallet-by-email')
    async shareWalletByEmail(@Query() query: ShareWalletByEmailDto): Promise<ShareWalletByEmailResponseDto> {
        try {            
            const result = await this.telegramWalletsService.getWalletByEmail(query.email, query.walletType);
            
            return result;
        } catch (error) {
            return {
                success: false,
                message: 'An error occurred while processing the request',
                data: null
            };
        }
    }
}
