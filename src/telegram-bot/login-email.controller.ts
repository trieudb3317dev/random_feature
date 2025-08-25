import { Controller, Post, Body, BadRequestException, Logger, Req, HttpCode, HttpStatus, ConflictException, InternalServerErrorException, UnauthorizedException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { LoginEmailService } from './login-email.service';
import { Request } from 'express';
import { GoogleLoginDto, LoginResponse, ManualRegisterDto, ManualRegisterResponseDto, ManualLoginDto, ManualLoginResponseDto, SendVerificationCodeDto, SendVerificationCodeResponseDto, ForgotPasswordDto, ForgotPasswordResponseDto, ChangePasswordDto, ChangePasswordResponseDto } from './dto';

@Controller('login-email')
export class LoginEmailController {
    private readonly logger = new Logger(LoginEmailController.name);

    constructor(
        private readonly loginEmailService: LoginEmailService,
    ) {}

    @Post()
    async loginWithEmail(@Body() googleData: GoogleLoginDto, @Req() req: Request): Promise<LoginResponse> {
        try {
            this.logger.log(`Received login request for email: ${googleData.code}`);
            return await this.loginEmailService.handleGoogleLogin(googleData, req);
        } catch (error) {
            this.logger.error(`Error in loginWithEmail: ${error.message}`, error.stack);
            throw new BadRequestException({
                statusCode: 400,
                message: error.message || 'Login failed',
                error: 'Bad Request'
            });
        }
    }

    @Post('send-verification-code')
    @HttpCode(HttpStatus.OK)
    async sendVerificationCode(@Body() dto: SendVerificationCodeDto): Promise<SendVerificationCodeResponseDto> {
        try {
            this.logger.log(`Received send verification code request for email: ${dto.email}`);
            const response = await this.loginEmailService.sendVerificationCode(dto);
            
            switch (response.status) {
                case 409:
                    throw new ConflictException(response.message);
                case 403:
                    throw new ForbiddenException(response.message);
                case 500:
                    throw new InternalServerErrorException(response.message);
                default:
                    return response;
            }
        } catch (error) {
            if (error instanceof ConflictException || error instanceof ForbiddenException || error instanceof InternalServerErrorException) {
                throw error;
            }
            this.logger.error(`Error in sendVerificationCode: ${error.message}`, error.stack);
            throw new BadRequestException({
                statusCode: 400,
                message: error.message || 'Failed to send verification code',
                error: 'Bad Request'
            });
        }
    }

    @Post('forgot-password')
    @HttpCode(HttpStatus.OK)
    async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<ForgotPasswordResponseDto> {
        try {
            this.logger.log(`Received forgot password request for email: ${dto.email}`);
            const response = await this.loginEmailService.forgotPassword(dto);
            
            switch (response.status) {
                case 404:
                    throw new NotFoundException(response.message);
                case 403:
                    throw new ForbiddenException(response.message);
                case 400:
                    throw new BadRequestException(response.message);
                case 500:
                    throw new InternalServerErrorException(response.message);
                default:
                    return response;
            }
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            this.logger.error(`Error in forgotPassword: ${error.message}`, error.stack);
            throw new BadRequestException({
                statusCode: 400,
                message: error.message || 'Failed to send reset code',
                error: 'Bad Request'
            });
        }
    }

    @Post('change-password')
    @HttpCode(HttpStatus.OK)
    async changePassword(@Body() dto: ChangePasswordDto): Promise<ChangePasswordResponseDto> {
        try {
            this.logger.log(`Received change password request for email: ${dto.email}`);
            const response = await this.loginEmailService.changePassword(dto);
            
            switch (response.status) {
                case 404:
                    throw new NotFoundException(response.message);
                case 400:
                    throw new BadRequestException(response.message);
                case 500:
                    throw new InternalServerErrorException(response.message);
                default:
                    return response;
            }
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            this.logger.error(`Error in changePassword: ${error.message}`, error.stack);
            throw new BadRequestException({
                statusCode: 400,
                message: error.message || 'Failed to change password',
                error: 'Bad Request'
            });
        }
    }

    @Post('manual-register')
    @HttpCode(HttpStatus.CREATED)
    async manualRegister(@Body() dto: ManualRegisterDto, @Req() req: Request): Promise<ManualRegisterResponseDto> {
        try {
            this.logger.log(`Received manual registration request for email: ${dto.email}`);
            const response = await this.loginEmailService.manualRegister(dto, req);
            
            switch (response.status) {
                case 409:
                    throw new ConflictException(response.message);
                case 400:
                    throw new BadRequestException(response.message);
                case 500:
                    throw new InternalServerErrorException(response.message);
                default:
                    return response;
            }
        } catch (error) {
            if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            this.logger.error(`Error in manualRegister: ${error.message}`, error.stack);
            throw new BadRequestException({
                statusCode: 400,
                message: error.message || 'Registration failed',
                error: 'Bad Request'
            });
        }
    }

    @Post('manual-login')
    @HttpCode(HttpStatus.OK)
    async manualLogin(@Body() dto: ManualLoginDto): Promise<ManualLoginResponseDto> {
        try {
            this.logger.log(`Received manual login request for email: ${dto.email}`);
            const response = await this.loginEmailService.manualLogin(dto);
            
            switch (response.status) {
                case 404:
                    throw new NotFoundException(response.message);
                case 403:
                    throw new ForbiddenException(response.message);
                case 401:
                    throw new UnauthorizedException(response.message);
                case 400:
                    throw new BadRequestException(response.message);
                case 500:
                    throw new InternalServerErrorException(response.message);
                default:
                    return response;
            }
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof UnauthorizedException || error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            this.logger.error(`Error in manualLogin: ${error.message}`, error.stack);
            throw new BadRequestException({
                statusCode: 400,
                message: error.message || 'Login failed',
                error: 'Bad Request'
            });
        }
    }
} 