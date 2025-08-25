import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { ServerOptions } from 'socket.io';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log']
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 8000;
  const FRONTEND_URL = configService.get<string>('URL_FRONTEND');

  // Enable validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
  }));

  // Set global prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['/'],
  });

  app.useStaticAssets(join(process.cwd(), 'public'));

  const corsConfig = {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://bitworld-mmp-fe-production.up.railway.app','https://bitworld-mmp-admin-fe.vercel.app', 'https://bitt-world-bg-manager.vercel.app','http://localhost:3000', 'http://localhost:3001', 'http://localhost:3600', 'http://localhost:3700']
      : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8000', 'http://localhost:3600', 'http://localhost:3700'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-No-Redirect', 'token'],
    credentials: true
  };

  app.enableCors(corsConfig);

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Use cookie parser
  app.use(cookieParser());

  // Configure WebSocket with custom adapter
  class CustomIoAdapter extends IoAdapter {
    private server: any;

    createIOServer(port: number, options?: any): any {
      if (!this.server) {
        this.server = super.createIOServer(port, {
          ...options,
          cors: corsConfig,
          transports: ['websocket'],
          allowRequest: async (req, callback) => {
            try {
              // Allow all requests - actual auth is handled by WsJwtAuthGuard
              callback(null, true);
            } catch (e) {
              callback(new Error('Not authorized'), false);
            }
          },
          connectionStateRecovery: {
            // the backup duration of the sessions and the packets
            maxDisconnectionDuration: 2 * 60 * 1000,
            // whether to skip middlewares upon successful recovery
            skipMiddlewares: true,
          }
        });
      }
      return this.server;
    }
  }

  app.useWebSocketAdapter(new CustomIoAdapter(app));

  await app.listen(port);
  Logger.log(`🚀 Server is running on http://localhost:${port}`);
}

bootstrap();