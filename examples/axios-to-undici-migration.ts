/**
 * Migrating from @nestjs/axios
 *
 * The same service code runs on @nestjs/axios and on nestjs-axios-undici:
 * only the import of HttpModule / HttpService changes. axios options passed to
 * register() and axiosRef interceptors keep working.
 */

import 'reflect-metadata';
import { Injectable, Module, OnModuleInit, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as AxiosNest from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as UndiciNest from '../lib';

// `npm run test:examples` points this at a local echo server
const API =
  process.env.EXAMPLES_BASE_URL ?? 'https://jsonplaceholder.typicode.com';

type AnyHttpService = AxiosNest.HttpService | UndiciNest.HttpService;

// The service body is identical for both libraries
function createPostsService(HttpServiceClass: Type<AnyHttpService>) {
  @Injectable()
  class PostsService implements OnModuleInit {
    constructor(readonly httpService: AnyHttpService) {}

    onModuleInit() {
      this.httpService.axiosRef.interceptors.request.use(config => {
        config.headers['x-request-id'] = 'example-request-id';
        return config;
      });
    }

    async getPost(id: number) {
      const { data, status } = await firstValueFrom(
        (this.httpService as UndiciNest.HttpService).get(`/posts/${id}`),
      );
      return { data, status };
    }
  }
  Reflect.defineMetadata('design:paramtypes', [HttpServiceClass], PostsService);
  return PostsService;
}

// axios options work with both modules
const options = {
  baseURL: API,
  timeout: 5000,
  maxRedirects: 5,
  headers: { 'user-agent': 'migration-example' },
};

const AxiosPostsService = createPostsService(AxiosNest.HttpService);
@Module({
  imports: [AxiosNest.HttpModule.register(options)],
  providers: [AxiosPostsService],
})
class BeforeModule {}

const UndiciPostsService = createPostsService(UndiciNest.HttpService);
@Module({
  imports: [UndiciNest.HttpModule.register(options)],
  providers: [UndiciPostsService],
})
class AfterModule {}

export async function demonstrateMigration() {
  const before = await NestFactory.createApplicationContext(BeforeModule, {
    logger: false,
  });
  const after = await NestFactory.createApplicationContext(AfterModule, {
    logger: false,
  });

  try {
    const axiosResult = await before.get(AxiosPostsService).getPost(1);
    const undiciResult = await after.get(UndiciPostsService).getPost(1);

    console.log('@nestjs/axios       ->', axiosResult.status, axiosResult.data);
    console.log(
      'nestjs-axios-undici ->',
      undiciResult.status,
      undiciResult.data,
    );

    if (axiosResult.status !== undiciResult.status) {
      throw new Error(
        'Status codes differ between @nestjs/axios and nestjs-axios-undici',
      );
    }
    console.log('✅ Same service code, same response shape');
  } finally {
    await before.close();
    await after.close();
  }
}

if (require.main === module) {
  demonstrateMigration().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
