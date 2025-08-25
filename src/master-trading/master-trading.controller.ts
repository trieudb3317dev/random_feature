import { Controller, Post, Body, UseGuards, Request, Get, Query, Param, NotFoundException, ParseIntPipe, Put, HttpException, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MasterTradingService } from './master-trading.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AuthGroupDto } from './dto/auth-group.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { TelegramWalletsService } from '../telegram-wallets/telegram-wallets.service';
import { ChangeAuthStatusDto } from './dto/auth-group.dto';
import { ChangeGroupStatusDto } from './dto/change-group-status.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ConnectMasterDto } from './dto/connect-master.dto';
import { MasterSetConnectDto } from './dto/master-set-connect.dto';
import { MemberSetConnectDto } from './dto/member-set-connect.dto';
import { MasterCreateGroupDto } from './dto/master-create-group.dto';
import { ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { MasterSetGroupDto } from './dto/master-set-group.dto';
import { CheckMasterDto } from './dto/check-master.dto';
import { ChangeStreamDto } from './dto/change-stream.dto';

@Controller('master-trading')
export class MasterTradingController {
    constructor(
        private readonly masterTradingService: MasterTradingService,
        private readonly telegramWalletsService: TelegramWalletsService,
    ) { }

    /**
     * Master tạo group mới với option mặc định là trackingratio
     */
    @Post('master-create-group')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Create new master group with default tracking ratio option' })
    @ApiResponse({ status: 201, description: 'Group created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiBody({ type: MasterCreateGroupDto })
    async masterCreateGroup(
        @Request() req,
        @Body() createGroupDto: MasterCreateGroupDto
    ) {
        try {
            if (!createGroupDto.mg_name) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Missing required fields',
                    message: 'Group name is required'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.masterTradingService.masterCreateGroup(req.user, createGroupDto);

            if (result.status === 400) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.message,
                    message: 'Failed to create master group'
                }, HttpStatus.BAD_REQUEST);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to create master group'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Master tạo group (đã bị thay thế bởi master-create-group)
     */
    /*
    @Post('group')
    @UseGuards(JwtAuthGuard)
    async createGroup(
        @Request() req,
        @Body() createGroupDto: CreateGroupDto
    ) {
        const walletId = req.user.id;
        return await this.masterTradingService.createMasterGroup(walletId, createGroupDto);
    }
    */

    /**
     * API để member tự tham gia vào group (tạm thời đóng, giữ lại để tương thích ngược)
     */
    /*
    @Post('join-group')
    @UseGuards(JwtAuthGuard)
    async authorizeGroup(
        @Request() req,
        @Body() authGroupDto: AuthGroupDto
    ) {
        const walletId = req.user.id;
        return await this.masterTradingService.authorizeMasterGroup(walletId, authGroupDto);
    }
    */

    // @Post('change-auth-status')
    // @UseGuards(JwtAuthGuard)
    // async changeAuthStatus(
    //     @Request() req,
    //     @Body() changeStatusDto: ChangeAuthStatusDto
    // ) {
    //     return await this.masterTradingService.changeAuthStatus(req.user.wallet_id, changeStatusDto);
    // }

    @Get('groups')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get all master groups' })
    @ApiResponse({ status: 200, description: 'Groups retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getMasterGroups(@Request() req) {
        try {
            const result = await this.masterTradingService.getMasterGroups(req.user.wallet_id);

            if (!result || result.length === 0) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: 'No groups found',
                    message: 'No master groups available'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to retrieve master groups'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('transaction')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Create new master transaction' })
    @ApiResponse({ status: 201, description: 'Transaction created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    async createTransaction(
        @Request() req,
        @Body() createTransactionDto: CreateTransactionDto
    ) {
        try {
            if (!createTransactionDto.mt_token_address || !createTransactionDto.mt_trade_type) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Missing required fields',
                    message: 'Token address and trade type are required'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.masterTradingService.createMasterTransaction(req.user.wallet_id, createTransactionDto);

            if (result.status === 400) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.message,
                    message: 'Failed to create transaction'
                }, HttpStatus.BAD_REQUEST);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to create master transaction'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('transactions')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get master transactions' })
    @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
    async getTransactions(
        @Request() req,
        @Query('status') status?: 'running' | 'pause' | 'stop'
    ) {
        try {
            const result = await this.masterTradingService.getMasterTransactions(req.user.wallet_id, status);

            if (!result || !result.data) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: 'No transactions found',
                    message: 'No transactions available'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to retrieve transactions'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('transaction/:mt_id/status')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Change transaction status' })
    @ApiResponse({ status: 200, description: 'Transaction status updated successfully' })
    async changeTransactionStatus(
        @Request() req,
        @Param('mt_id') mtId: number,
        @Body('status') status: 'running' | 'pause' | 'stop'
    ) {
        try {
            if (!mtId || !status) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Missing required fields',
                    message: 'Transaction ID and status are required'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.masterTradingService.changeMasterTransactionStatus(req.user.wallet_id, mtId, status);

            if (result.status === 404) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: result.message,
                    message: 'Transaction not found'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to update transaction status'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('transactions/history')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get transaction history' })
    @ApiResponse({ status: 200, description: 'Transaction history retrieved successfully' })
    async getTransactionHistory(
        @Request() req,
        @Query() query: GetTransactionsDto
    ) {
        try {
            const result = await this.masterTradingService.getTransactionHistory(req.user.wallet_id, query);

            if (!result || !result.data) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: 'No transaction history found',
                    message: 'No transaction history available'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to retrieve transaction history'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('transactions/stats')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get transaction statistics' })
    @ApiResponse({ status: 200, description: 'Transaction stats retrieved successfully' })
    async getTransactionStats(
        @Request() req,
        @Query() query: GetTransactionsDto
    ) {
        try {
            const result = await this.masterTradingService.getTransactionStats(req.user.wallet_id, query);

            if (!result || !result.data) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: 'No transaction stats found',
                    message: 'No transaction statistics available'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to retrieve transaction statistics'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('groups/members')
    @UseGuards(JwtAuthGuard)
    async getGroupMembers(
        @Request() req,
        @Param('groupId') groupId: number
    ) {
        return await this.masterTradingService.getGroupMembers(req.user.wallet_id, groupId);
    }

    /**
     * API mới để lấy các group của master wallet từ JWT token
     */
    @Get('get-my-groups')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Get list of groups owned by master wallet',
        description: 'Trả về danh sách các group thuộc sở hữu của ví master (sử dụng JWT token).'
    })
    @ApiResponse({ status: 200, description: 'Groups retrieved successfully' })
    async getMyGroups(
        @Request() req,
        @Query('status') status?: 'active' | 'delete'
    ) {
        try {
            const result = await this.masterTradingService.getMasterGroups(
                req.user.wallet_id,
                undefined,
                status === 'active' ? ['on', 'off'] : status === 'delete' ? 'delete' : ['on', 'off', 'delete']
            );

            if (!result || result.length === 0) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: 'No groups found',
                    message: 'No groups available for this master wallet'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to retrieve master groups'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('masters')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Get list of master wallets',
        description: 'Trả về danh sách tất cả master wallets, bao gồm trạng thái kết nối với ví member hiện tại'
    })
    @ApiResponse({ status: 200, description: 'Master wallets retrieved successfully' })
    async listMasterWallets(@Request() req) {
        try {
            const result = await this.masterTradingService.listMasterWallets(req.user.wallet_id);

            if (!result || !result.data) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: 'No master wallets found',
                    message: 'No master wallets available'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to retrieve master wallets'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('groups/joined')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get joined groups' })
    @ApiResponse({ status: 200, description: 'Joined groups retrieved successfully' })
    async getJoinedGroups(
        @Request() req,
        @Query('status') status?: 'active' | 'delete'
    ) {
        try {
            const result = await this.masterTradingService.getJoinedGroups(req.user.wallet_id, status);

            if (!result || !result.data) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: 'No joined groups found',
                    message: 'No joined groups available'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to retrieve joined groups'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('groups/:groupId/join-status')
    @UseGuards(JwtAuthGuard)
    async checkGroupJoinStatus(
        @Request() req,
        @Param('groupId', ParseIntPipe) groupId: number
    ) {
        return await this.masterTradingService.checkGroupJoinStatus(req.user.wallet_id, groupId);
    }

    @Post('group/:groupId/status')
    @UseGuards(JwtAuthGuard)
    async changeGroupStatus(
        @Request() req,
        @Param('groupId', ParseIntPipe) groupId: number,
        @Body() changeStatusDto: ChangeGroupStatusDto
    ) {
        return await this.masterTradingService.changeMasterGroupStatus(req.user.wallet_id, groupId, changeStatusDto.status);
    }

    @Put('group/:groupId')
    @UseGuards(JwtAuthGuard)
    async updateGroup(
        @Request() req,
        @Param('groupId', ParseIntPipe) groupId: number,
        @Body() updateGroupDto: UpdateGroupDto
    ) {
        return await this.masterTradingService.updateMasterGroup(req.user.wallet_id, groupId, updateGroupDto);
    }

    /**
     * API đã bị ẩn
     */
    /*
    @Get('group/:groupId')
    @UseGuards(JwtAuthGuard)
    async getGroupById(
        @Request() req,
        @Param('groupId', ParseIntPipe) groupId: number
    ) {
        const walletId = req.user.id;
        return await this.masterTradingService.getGroupById(walletId, groupId);
    }
    */

    @Post('connect-master')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Connect member to master' })
    @ApiResponse({ status: 201, description: 'Connected to master successfully' })
    @ApiResponse({ status: 400, description: 'Master wallet not found or invalid request' })
    @ApiBody({ type: ConnectMasterDto })
    async connectToMaster(
        @Request() req,
        @Body() connectMasterDto: any
    ) {
        try {
            if (!connectMasterDto.master_wallet_address) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Missing master address',
                    message: 'Master wallet address is required'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.masterTradingService.connectToMaster(req.user.wallet_id, connectMasterDto);

            if (result.status === 400) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.message,
                    message: 'Failed to connect to master'
                }, HttpStatus.BAD_REQUEST);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to connect to master'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('master-set-connect')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Master sets connection status with member' })
    @ApiResponse({ status: 200, description: 'Connection status updated successfully' })
    @ApiResponse({ status: 400, description: 'Master wallet not found or member not found' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    async masterSetConnect(
        @Request() req,
        @Body() dto: MasterSetConnectDto
    ) {
        try {
            if (!dto.mc_id || !dto.status) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Missing required fields',
                    message: 'Member ID and status are required'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.masterTradingService.masterSetConnect(req.user.wallet_id, dto);

            if (result.status === 400) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.message,
                    message: result.message
                }, HttpStatus.BAD_REQUEST);
            }

            if (result.status === 403) {
                throw new HttpException({
                    status: HttpStatus.FORBIDDEN,
                    error: result.message,
                    message: result.message
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
                message: error.message
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('member-set-connect')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Member changes connection status with master' })
    @ApiResponse({ status: 200, description: 'Connection status updated successfully' })
    @ApiResponse({ status: 400, description: 'Master wallet not found or member wallet not found' })
    @ApiBody({ type: MemberSetConnectDto })
    async memberSetConnect(
        @Request() req,
        @Body() dto: MemberSetConnectDto
    ) {
        try {
            if (!dto.master_id || !dto.status) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Missing required fields',
                    message: 'Master ID and status are required'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.masterTradingService.memberSetConnect(req.user.wallet_id, dto);

            if (result.status === 400) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.message,
                    message: result.message
                }, HttpStatus.BAD_REQUEST);
            }

            return result;
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: error.message
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Master thêm member vào group
     */
    @Post('master-set-group')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Master adds member to group' })
    @ApiResponse({ status: 201, description: 'Member added to group successfully' })
    @ApiResponse({ status: 400, description: 'Master wallet not found, group not found, or member not found' })
    @ApiResponse({ status: 403, description: 'Not a master wallet' })
    @ApiBody({ type: MasterSetGroupDto })
    async masterSetGroup(
        @Request() req,
        @Body() dto: MasterSetGroupDto
    ) {
        try {
            if (!dto.mg_id || !dto.member_ids?.length) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Missing required fields',
                    message: 'Group ID and member IDs are required'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.masterTradingService.masterSetGroup(req.user.wallet_id, dto);

            if (result.status === 400) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.message,
                    message: result.message
                }, HttpStatus.BAD_REQUEST);
            }

            if (result.status === 403) {
                throw new HttpException({
                    status: HttpStatus.FORBIDDEN,
                    error: result.message,
                    message: result.message
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
                message: error.message
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * API đã bị ẩn
     */
    /*
    @Get(':wallet/list-group')
    @UseGuards(JwtAuthGuard)
    async listGroups(
        @Param('wallet') walletAddress: string,
        @Query('option') option?: 'fixedprice' | 'fixedratio',
        @Query('status') status?: 'on' | 'off' | 'delete'
    ) {
        return await this.masterTradingService.listMasterGroups(walletAddress, option, status);
    }
    */

    /**
     * Kiểm tra xem một địa chỉ wallet có phải là master không và lấy thông tin stream
     */
    @Post('check-master')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Check if wallet is master' })
    @ApiResponse({ status: 200, description: 'Wallet checked successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiBody({ type: CheckMasterDto })
    async checkMaster(
        @Body() checkMasterDto: CheckMasterDto,
        @Request() req
    ) {
        try {
            if (!checkMasterDto.wallet_address) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Missing wallet address',
                    message: 'Wallet address is required'
                }, HttpStatus.BAD_REQUEST);
            }

            if (!req.user?.wallet_id) {
                throw new HttpException({
                    status: HttpStatus.UNAUTHORIZED,
                    error: 'Unauthorized',
                    message: 'Invalid or missing JWT token'
                }, HttpStatus.UNAUTHORIZED);
            }

            const result = await this.masterTradingService.checkMaster(
                checkMasterDto.wallet_address,
                req.user.wallet_id
            );

            if (result.status === 400) {
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
                message: 'Failed to check master status'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Lấy danh sách các ví member kết nối tới master wallet
     */
    @Get('get-my-connects')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Get connected members for master wallet',
        description: 'Trả về danh sách các ví member đang kết nối tới ví master từ JWT token, bao gồm thông tin trạng thái và nhóm đã tham gia'
    })
    @ApiResponse({ status: 200, description: 'Connected members retrieved successfully' })
    async getMyConnects(@Request() req) {
        try {
            const result = await this.masterTradingService.getMyConnects(req.user.wallet_id);

            if (!result || !result.data) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: 'No connected members found',
                    message: 'No connected members available'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to retrieve connected members'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('detail-copies')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get transaction detail copies' })
    @ApiResponse({ status: 200, description: 'Transaction details retrieved successfully' })
    @ApiResponse({ status: 400, description: 'Invalid master wallet' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getDetailCopies(
        @Request() req,
        @Query('wallet_master') walletMaster?: number
    ) {
        try {
            const result = await this.masterTradingService.getDetailCopies(req.user.wallet_id, walletMaster);

            if (result.status === 400) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.message,
                    message: 'Invalid master wallet'
                }, HttpStatus.BAD_REQUEST);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to retrieve transaction details'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('change-stream')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Change master wallet stream status',
        description: 'Change stream status between normal and vip, requires password verification'
    })
    @ApiResponse({ status: 200, description: 'Stream status changed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Not a master wallet' })
    @ApiBody({ type: ChangeStreamDto })
    async changeStream(
        @Request() req,
        @Body() changeStreamDto: ChangeStreamDto
    ) {
        if (!req.user?.wallet_id) {
            throw new HttpException('Invalid or missing JWT token', HttpStatus.UNAUTHORIZED);
        }

        const result = await this.masterTradingService.changeStream(
            req.user.wallet_id,
            req.user.uid,
            changeStreamDto.password
        );

        switch (result.status) {
            case 403:
                throw new HttpException('Not a master wallet', HttpStatus.FORBIDDEN);
            case 400:
                throw new HttpException('Invalid password', HttpStatus.BAD_REQUEST);
            case 500:
                throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
            default:
                return {
                    message: result.message,
                    data: result.data
                };
        }
    }

} 