import { Module } from '@nestjs/common';
import { HttpModule } from 'nestjs-undici';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [HttpModule.register({})],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
