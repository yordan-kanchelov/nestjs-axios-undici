import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

@Injectable()
export class AxiosInterceptorProvider implements OnModuleInit {
  private readonly logger = new Logger(AxiosInterceptorProvider.name);

  constructor(private readonly httpService: HttpService) {}

  onModuleInit() {
    const axios = this.httpService.axiosRef;

    // Request interceptor
    axios.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const now = Date.now();
        config['metadata'] = { startTime: now };
        
        this.logger.log(
          `Outgoing HTTP Request: ${config.method?.toUpperCase()} ${config.url}`
        );
        
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    axios.interceptors.response.use(
      (response: AxiosResponse) => {
        const duration = Date.now() - response.config['metadata']?.startTime;
        
        this.logger.log(
          `HTTP Response: ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status} - Duration: ${duration}ms`
        );
        
        return response;
      },
      (error) => {
        if (error.config && error.config['metadata']) {
          const duration = Date.now() - error.config['metadata'].startTime;
          this.logger.error(
            `HTTP Error: ${error.config.method?.toUpperCase()} ${error.config.url} - Status: ${error.response?.status || 'N/A'} - Duration: ${duration}ms`
          );
        }
        return Promise.reject(error);
      }
    );
  }
}