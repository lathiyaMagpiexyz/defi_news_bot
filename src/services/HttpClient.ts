import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import axiosRetry from 'axios-retry';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('HttpClient');

interface HttpClientOptions {
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export class HttpClient {
  private client: AxiosInstance;
  private name: string;

  constructor(name: string, options: HttpClientOptions = {}) {
    this.name = name;

    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DeFi-News-Bot/1.0',
        ...options.headers,
      },
    });

    // Configure retry logic
    axiosRetry(this.client, {
      retries: options.maxRetries || 3,
      retryDelay: (retryCount) => {
        const delay = (options.retryDelay || 1000) * Math.pow(2, retryCount - 1);
        logger.debug(`${this.name}: Retry ${retryCount}, waiting ${delay}ms`);
        return delay;
      },
      retryCondition: (error: AxiosError) => {
        // Retry on network errors and 5xx responses
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status !== undefined && error.response.status >= 500)
        );
      },
      onRetry: (retryCount, error) => {
        logger.warn(`${this.name}: Retrying request (${retryCount})`, {
          url: error.config?.url,
          status: error.response?.status,
        });
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`${this.name}: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error(`${this.name}: Request error`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`${this.name}: Response ${response.status} from ${response.config.url}`);
        return response;
      },
      (error: AxiosError) => {
        if (error.response) {
          logger.error(`${this.name}: HTTP ${error.response.status}`, {
            url: error.config?.url,
            data: error.response.data,
          });
        } else if (error.request) {
          logger.error(`${this.name}: No response received`, {
            url: error.config?.url,
          });
        } else {
          logger.error(`${this.name}: Request setup error`, {
            message: error.message,
          });
        }
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  // Get raw axios response
  async request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.request<T>(config);
  }
}

// Pre-configured clients for each service
let defillamaClient: HttpClient | null = null;
let coingeckoClient: HttpClient | null = null;

export function getDefillamaClient(): HttpClient {
  if (!defillamaClient) {
    defillamaClient = new HttpClient('DeFiLlama', {
      baseURL: 'https://api.llama.fi',
      timeout: 30000,
      maxRetries: 3,
    });
  }
  return defillamaClient;
}

export function getCoingeckoClient(apiKey?: string): HttpClient {
  if (!coingeckoClient) {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }

    coingeckoClient = new HttpClient('CoinGecko', {
      baseURL: 'https://api.coingecko.com/api/v3',
      timeout: 30000,
      maxRetries: 3,
      headers,
    });
  }
  return coingeckoClient;
}

export default HttpClient;
