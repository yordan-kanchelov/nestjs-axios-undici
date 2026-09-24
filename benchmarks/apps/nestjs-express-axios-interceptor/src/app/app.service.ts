import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { InternalAxiosRequestConfig } from 'axios';

interface AxiosRequestConfigWithMetadata extends InternalAxiosRequestConfig {
  metadata?: {
    startTime: number;
  };
}

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly httpService: HttpService) {}

  onModuleInit() {
    // Add request interceptor
    this.httpService.axiosRef.interceptors.request.use(
      (config) => {
        const now = Date.now();
        const configWithMetadata = config as AxiosRequestConfigWithMetadata;
        configWithMetadata.metadata = { startTime: now };
        this.logger.log(`Outgoing HTTP Request: ${config.method?.toUpperCase()} ${config.url}`);
        return configWithMetadata;
      },
      (error) => {
        this.logger.error('Request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor
    this.httpService.axiosRef.interceptors.response.use(
      (response) => {
        const configWithMetadata = response.config as AxiosRequestConfigWithMetadata;
        const duration = Date.now() - (configWithMetadata.metadata?.startTime || Date.now());
        this.logger.log(
          `HTTP Response: ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status} - Duration: ${duration}ms`
        );
        return response;
      },
      (error) => {
        const configWithMetadata = error.config as AxiosRequestConfigWithMetadata;
        const duration = Date.now() - (configWithMetadata?.metadata?.startTime || Date.now());
        this.logger.error(
          `HTTP Error: ${error.config?.method?.toUpperCase()} ${error.config?.url} - Status: ${error.response?.status} - Duration: ${duration}ms`
        );
        return Promise.reject(error);
      }
    );
  }

  async getData(): Promise<any> {
    const mockServiceUrl = process.env.MOCK_SERVICE_URL || 'http://localhost:4000/api/data';

    const requests = [
      lastValueFrom(this.httpService.get(mockServiceUrl)),
      lastValueFrom(this.httpService.get(mockServiceUrl)),
      lastValueFrom(this.httpService.get(mockServiceUrl)),
      lastValueFrom(this.httpService.get(mockServiceUrl)),
      lastValueFrom(this.httpService.get(mockServiceUrl)),
    ];

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const endTime = Date.now();

    const parsedResults = results.map((res) => res.data);

    return {
      message: 'Express Axios HTTP Module with Interceptors Response',
      data: parsedResults,
      duration: endTime - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}