import { Module } from '@nestjs/common';
import { HttpModule } from 'nestjs-axios-undici';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggingInterceptor } from './logging.interceptor';

@Module({
  imports: [
    HttpModule.register({
      interceptors: [LoggingInterceptor],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}