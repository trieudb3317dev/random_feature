import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getHello() {
    return {
      status: 200,
      message: 'Welcome to Michosso API',
      version: '1.0.0',
      prefix: '/api/v1'
    };
  }
}
