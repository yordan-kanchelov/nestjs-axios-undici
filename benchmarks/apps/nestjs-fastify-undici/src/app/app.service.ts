import { Injectable } from '@nestjs/common';
import { HttpService } from 'nestjs-undici';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class AppService {
  constructor(private readonly httpService: HttpService) {}

  async getData(): Promise<any> {
    const mockServiceUrl = process.env.MOCK_SERVICE_URL || 'http://localhost:3001/api/data';

    const requests = [
      lastValueFrom(this.httpService.request(mockServiceUrl)),
      lastValueFrom(this.httpService.request(mockServiceUrl)),
      lastValueFrom(this.httpService.request(mockServiceUrl)),
      lastValueFrom(this.httpService.request(mockServiceUrl)),
      lastValueFrom(this.httpService.request(mockServiceUrl)),
    ];

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const endTime = Date.now();

    const parsedResults = await Promise.all(
      results.map(async (res) => {
        const body = await res.body.json();
        return body;
      })
    );

    return {
      message: 'Undici HTTP Module Response',
      data: parsedResults,
      duration: endTime - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}
