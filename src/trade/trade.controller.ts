import { Controller, Post, Get, Body, Query, UseGuards, Request, HttpStatus, Param, Req, ForbiddenException, HttpException, Logger } from '@nestjs/common';
import { TradeService } from './trade.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetOrdersDto } from './dto/get-orders.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { CircuitBreakerGuard } from './guards/circuit-breaker.guard';
import { GetOrderBookDto } from './dto/get-order-book.dto';
import { OrderBookDepth } from './interfaces/order-book.interface';
import { OrderBookService } from './order-book.service';
import { StandardResponse } from './interfaces/standard-response.interface';
import { AuthRequest } from '../auth/interfaces/auth-request.interface';
import { GetAmountResponseDto } from './dto/get-amount.dto';

@Controller('trade')
@UseGuards(JwtAuthGuard)
export class TradeController {
    private readonly logger = new Logger(TradeController.name);

    constructor(
        private readonly tradeService: TradeService,
        private readonly orderBookService: OrderBookService
    ) { }

    @Post('orders')
    @UseGuards(RateLimitGuard, CircuitBreakerGuard)
    async createOrder(
        @Req() req: AuthRequest,
        @Body() createOrderDto: CreateOrderDto
    ) {
        try {
            if (!createOrderDto.order_token_address || !createOrderDto.order_trade_type || !createOrderDto.order_qlty) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Missing required fields',
                    message: 'Token address, trade type and quantity are required'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.tradeService.createOrder(req.user, createOrderDto);
            
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
                    error: result.error,
                    message: result.message,
                    data: result.data
                }, HttpStatus.BAD_REQUEST);
            }

            if (result.status === 500) {
                throw new HttpException({
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    error: result.message,
                    message: 'Failed to create order'
                }, HttpStatus.INTERNAL_SERVER_ERROR);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to create order'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('orders')
    async getOrders(
        @Request() req,
        @Query() query: GetOrdersDto
    ) {
        try {
            const result = await this.tradeService.getOrders(req.user, query);
            
            if (result.status === 400) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.message,
                    message: 'Invalid request parameters'
                }, HttpStatus.BAD_REQUEST);
            }

            if (result.status === 500) {
                throw new HttpException({
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    error: result.message,
                    message: 'Failed to retrieve orders'
                }, HttpStatus.INTERNAL_SERVER_ERROR);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to get orders'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('orders/:orderId/cancel')
    async cancelOrder(
        @Request() req,
        @Param('orderId') orderId: number,
        @Body() cancelOrderDto: CancelOrderDto
    ) {
        try {
            if (!orderId) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Order ID is required',
                    message: 'Missing required fields'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.tradeService.cancelOrder(req.user, orderId, cancelOrderDto);

            if (result.status === HttpStatus.NOT_FOUND) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: result.message,
                    message: 'Order not found'
                }, HttpStatus.NOT_FOUND);
            }

            if (result.status === HttpStatus.FORBIDDEN) {
                throw new HttpException({
                    status: HttpStatus.FORBIDDEN,
                    error: result.message,
                    message: 'You do not have permission to cancel this order'
                }, HttpStatus.FORBIDDEN);
            }

            if (result.status === HttpStatus.BAD_REQUEST) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: result.message,
                    message: 'Cannot cancel this order'
                }, HttpStatus.BAD_REQUEST);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to cancel order'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('order-book')
    async getOrderBook(@Query() params: GetOrderBookDto): Promise<StandardResponse<OrderBookDepth>> {
        try {
            if (!params.token_address) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Token address is required',
                    message: 'Missing required fields'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.orderBookService.getOrderBookDepth(params);
            
            if (!result) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: 'Order book not found',
                    message: 'No order book data available for this token'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to get order book'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('amount/:tokenAddress')
    @UseGuards(JwtAuthGuard)
    async getAmount(
        @Request() req,
        @Param('tokenAddress') tokenAddress: string
    ): Promise<GetAmountResponseDto> {
        try {
            if (!tokenAddress) {
                throw new HttpException({
                    status: HttpStatus.BAD_REQUEST,
                    error: 'Token address is required',
                    message: 'Missing required fields'
                }, HttpStatus.BAD_REQUEST);
            }

            const result = await this.tradeService.getAmount(req.user, tokenAddress);

            if (result.status === 404) {
                throw new HttpException({
                    status: HttpStatus.NOT_FOUND,
                    error: result.message,
                    message: 'Wallet not found or invalid address'
                }, HttpStatus.NOT_FOUND);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to get token amount'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('orders-all')
    async getAllOrders(
        @Request() req,
        @Query() query: GetOrdersDto
    ) {
        try {
            const result = await this.tradeService.getAllOrders(query);

            if (result.status === 500) {
                throw new HttpException({
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    error: result.message,
                    message: 'Failed to retrieve all orders'
                }, HttpStatus.INTERNAL_SERVER_ERROR);
            }

            return result;
        } catch (error) {
            throw new HttpException({
                status: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error: error.message,
                message: 'Failed to get all orders'
            }, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
} 