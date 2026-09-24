import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AppService {
  constructor(private readonly httpService: HttpService) {}

  async getData(): Promise<any> {
    const mockServiceUrl = process.env.MOCK_SERVICE_URL || 'http://localhost:3001/api/data';
    
    const requests = [
      firstValueFrom(this.httpService.get(mockServiceUrl)),
      firstValueFrom(this.httpService.get(mockServiceUrl)),
      firstValueFrom(this.httpService.get(mockServiceUrl)),
      firstValueFrom(this.httpService.get(mockServiceUrl)),
      firstValueFrom(this.httpService.get(mockServiceUrl)),
    ];

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const endTime = Date.now();

    return {
      message: 'Standard HTTP Module Response',
      data: results.map(res => res.data),
      duration: endTime - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}