import { createLogger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import { DefiLlamaCollector } from './defillama/DefiLlamaCollector.js';
import { CoinGeckoCollector } from './coingecko/CoinGeckoCollector.js';
import { TwitterCollector } from './twitter/TwitterCollector.js';
import type { BaseCollector, CollectorStatus } from './BaseCollector.js';

const logger = createLogger('CollectorManager');

export class CollectorManager {
  private collectors: Map<string, BaseCollector> = new Map();

  constructor() {
    this.initializeCollectors();
  }

  private initializeCollectors(): void {
    const config = getConfig();

    // Initialize DeFiLlama collector
    if (config.collectors.defillama.enabled) {
      this.collectors.set('defillama', new DefiLlamaCollector());
      logger.info('DeFiLlama collector initialized');
    }

    // Initialize CoinGecko collector
    if (config.collectors.coingecko.enabled) {
      this.collectors.set('coingecko', new CoinGeckoCollector());
      logger.info('CoinGecko collector initialized');
    }

    // Initialize Twitter collector
    if (config.collectors.twitter.enabled) {
      this.collectors.set('twitter', new TwitterCollector());
      logger.info('Twitter collector initialized');
    }
  }

  // Start all collectors
  async startAll(): Promise<void> {
    logger.info(`Starting ${this.collectors.size} collectors...`);

    const startPromises = Array.from(this.collectors.entries()).map(
      async ([name, collector]) => {
        try {
          await collector.start();
          logger.info(`${name} collector started`);
        } catch (error) {
          logger.error(`Failed to start ${name} collector:`, error);
        }
      }
    );

    await Promise.all(startPromises);
    logger.info('All collectors started');
  }

  // Stop all collectors
  stopAll(): void {
    logger.info('Stopping all collectors...');

    for (const [name, collector] of this.collectors) {
      try {
        collector.stop();
        logger.info(`${name} collector stopped`);
      } catch (error) {
        logger.error(`Error stopping ${name} collector:`, error);
      }
    }

    logger.info('All collectors stopped');
  }

  // Get collector by name
  getCollector(name: string): BaseCollector | undefined {
    return this.collectors.get(name);
  }

  // Get status of all collectors
  getStatus(): CollectorStatus[] {
    return Array.from(this.collectors.values()).map((c) => c.getStatus());
  }

  // Get summary status
  getSummary(): {
    total: number;
    running: number;
    errors: number;
    collectors: CollectorStatus[];
  } {
    const collectors = this.getStatus();

    return {
      total: collectors.length,
      running: collectors.filter((c) => c.isRunning).length,
      errors: collectors.reduce((sum, c) => sum + c.totalErrors, 0),
      collectors,
    };
  }
}

// Export singleton instance
let collectorManager: CollectorManager | null = null;

export function getCollectorManager(): CollectorManager {
  if (!collectorManager) {
    collectorManager = new CollectorManager();
  }
  return collectorManager;
}

export default getCollectorManager;
