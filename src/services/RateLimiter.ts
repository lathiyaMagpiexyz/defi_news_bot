import PQueue from 'p-queue';
import { createLogger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';

const logger = createLogger('RateLimiter');

interface RateLimiterOptions {
  requestsPerMinute: number;
  burstLimit?: number;
}

class RateLimiter {
  private queue: PQueue;
  private name: string;
  private requestCount = 0;
  private windowStart: number;
  private requestsPerMinute: number;

  constructor(name: string, options: RateLimiterOptions) {
    this.name = name;
    this.requestsPerMinute = options.requestsPerMinute;
    this.windowStart = Date.now();

    // Create queue with concurrency based on burst limit
    this.queue = new PQueue({
      concurrency: options.burstLimit || 1,
      intervalCap: options.requestsPerMinute,
      interval: 60000, // 1 minute
    });

    logger.debug(`RateLimiter ${name} initialized: ${options.requestsPerMinute} req/min`);
  }

  // Execute a function with rate limiting
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(async () => {
      this.requestCount++;

      // Reset counter every minute
      const now = Date.now();
      if (now - this.windowStart >= 60000) {
        logger.debug(`${this.name}: Reset rate limit counter (was ${this.requestCount})`);
        this.requestCount = 1;
        this.windowStart = now;
      }

      return fn();
    }) as Promise<T>;
  }

  // Get current queue size
  getQueueSize(): number {
    return this.queue.size;
  }

  // Get pending count
  getPending(): number {
    return this.queue.pending;
  }

  // Get remaining requests in current window
  getRemainingRequests(): number {
    const now = Date.now();
    if (now - this.windowStart >= 60000) {
      return this.requestsPerMinute;
    }
    return Math.max(0, this.requestsPerMinute - this.requestCount);
  }

  // Pause the queue
  pause(): void {
    this.queue.pause();
    logger.info(`${this.name}: Rate limiter paused`);
  }

  // Resume the queue
  resume(): void {
    this.queue.start();
    logger.info(`${this.name}: Rate limiter resumed`);
  }

  // Clear the queue
  clear(): void {
    this.queue.clear();
    logger.info(`${this.name}: Rate limiter queue cleared`);
  }
}

// Singleton rate limiters for each service
const rateLimiters: Map<string, RateLimiter> = new Map();

export function getRateLimiter(service: 'defillama' | 'twitter' | 'coingecko'): RateLimiter {
  if (!rateLimiters.has(service)) {
    const config = getConfig();
    const serviceConfig = config.rateLimit[service];

    rateLimiters.set(
      service,
      new RateLimiter(service, {
        requestsPerMinute: serviceConfig.requestsPerMinute,
        burstLimit: 'burstLimit' in serviceConfig ? serviceConfig.burstLimit : 5,
      })
    );
  }

  return rateLimiters.get(service)!;
}

export { RateLimiter };
export default getRateLimiter;
