import { Test, TestingModule } from '@nestjs/testing';
import {
  Injectable,
  Module,
  DynamicModule,
  Global,
  OnModuleInit,
} from '@nestjs/common';
import { HttpModule, HttpService } from '../src';

describe('Module Import Patterns', () => {
  it('should work when storing HttpModule.register() result in a variable', async () => {
    @Global()
    @Module({})
    class TestConfigModule implements OnModuleInit {
      static forRoot(): DynamicModule {
        const httpModule = HttpModule.register({
          timeout: 5000,
        });

        return {
          module: TestConfigModule,
          imports: [httpModule],
          exports: [httpModule],
        };
      }

      constructor(private readonly httpService: HttpService) {}

      onModuleInit() {
        console.log('TestConfigModule initialized with HttpService');
      }
    }

    // This is the pattern that's failing in the real app
    const module: TestingModule = await Test.createTestingModule({
      imports: [TestConfigModule.forRoot()],
    }).compile();

    await module.init();

    const httpService = module.get<HttpService>(HttpService);
    expect(httpService).toBeDefined();

    await module.close();
  });

  it('should work with different export patterns', async () => {
    // Test 1: Export the module class
    @Module({})
    class Test1Module {
      static forRoot(): DynamicModule {
        const httpMod = HttpModule.register({ timeout: 1000 });
        return {
          module: Test1Module,
          imports: [httpMod],
          exports: [HttpModule], // Export the class
        };
      }
    }

    // Test 2: Export the dynamic module instance
    @Module({})
    class Test2Module {
      static forRoot(): DynamicModule {
        const httpMod = HttpModule.register({ timeout: 2000 });
        return {
          module: Test2Module,
          imports: [httpMod],
          exports: [httpMod], // Export the instance
        };
      }
    }

    // Test 3: Export HttpService directly
    @Module({})
    class Test3Module {
      static forRoot(): DynamicModule {
        const httpMod = HttpModule.register({ timeout: 3000 });
        return {
          module: Test3Module,
          imports: [httpMod],
          exports: [HttpService], // Export the service
        };
      }
    }

    // Pattern 1 (export the module class): compiles and provides HttpService
    const module1 = await Test.createTestingModule({
      imports: [Test1Module.forRoot()],
    }).compile();
    expect(module1.get(HttpService)).toBeInstanceOf(HttpService);
    await module1.close();

    // Pattern 2 (export the dynamic module instance): compiles and provides HttpService
    const module2 = await Test.createTestingModule({
      imports: [Test2Module.forRoot()],
    }).compile();
    expect(module2.get(HttpService)).toBeInstanceOf(HttpService);
    await module2.close();

    // Pattern 3 (export HttpService directly without re-exporting the module):
    // Nest rejects exporting a provider that belongs to an imported module
    await expect(
      Test.createTestingModule({
        imports: [Test3Module.forRoot()],
      }).compile(),
    ).rejects.toThrow(
      'Nest cannot export a provider/module that is not a part of the currently processed module (Test3Module)',
    );
  });

  it('should handle the exact user pattern', async () => {
    @Global()
    @Module({})
    class HttpConfigModule implements OnModuleInit {
      public static forRoot(): DynamicModule {
        const httpModule = HttpModule.register({
          timeout: 5000,
          maxRedirects: 5,
        });

        return {
          module: HttpConfigModule,
          imports: [httpModule],
          exports: [httpModule],
        };
      }

      private readonly httpService: HttpService;

      constructor(httpService: HttpService) {
        this.httpService = httpService;
      }

      public onModuleInit() {
        this.httpService.axiosRef.interceptors.request.use(config => {
          console.log('Interceptor called');
          return config;
        });
      }
    }

    // Test with a consumer module
    @Injectable()
    class ConsumerService {
      constructor(private readonly httpService: HttpService) {}

      makeRequest() {
        return this.httpService.get('https://example.com');
      }
    }

    @Module({
      imports: [HttpConfigModule.forRoot()],
      providers: [ConsumerService],
    })
    class AppModule {}

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await module.init();

    const consumerService = module.get<ConsumerService>(ConsumerService);
    expect(consumerService).toBeDefined();

    await module.close();
  });
});
