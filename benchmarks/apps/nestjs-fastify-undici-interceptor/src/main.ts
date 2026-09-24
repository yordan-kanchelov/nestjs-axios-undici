import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  app.setGlobalPrefix('api');
  
  const port = process.env.PORT || 3007;
  await app.listen(port, '0.0.0.0');
  console.log(`Fastify Undici Interceptor app is running on: http://localhost:${port}/api`);
}

bootstrap();