import { Injectable } from '@nestjs/common';
import { HttpService } from 'nestjs-axios-undici';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AppService {
  constructor(private readonly httpService: HttpService) {}

  async getData(): Promise<any> {
    const mockServiceUrl = process.env.MOCK_SERVICE_URL || 'http://localhost:3001/api/data';
    
    const requests = [
      firstValueFrom(this.httpService.request(mockServiceUrl)),
      firstValueFrom(this.httpService.request(mockServiceUrl)),
      firstValueFrom(this.httpService.request(mockServiceUrl)),
      firstValueFrom(this.httpService.request(mockServiceUrl)),
      firstValueFrom(this.httpService.request(mockServiceUrl)),
    ];

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const endTime = Date.now();

    return {
      message: 'Fastify Undici Interceptor Response',
      // nestjs-axios-undici returns axios-compatible responses with
      // the body already read and parsed into `data`.
      data: results.map((res) => res.data),
      duration: endTime - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}