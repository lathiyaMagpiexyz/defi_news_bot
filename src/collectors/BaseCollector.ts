import { createLogger } from '../utils/logger.js';
import { eventBus } from '../core/events/EventBus.js';
import type { AlertSource } from '../core/types/alerts.js';

const logger = createLogger('BaseCollector');

export interface CollectorStatus {
  name: string;
  source: AlertSource;
  isRunning: boolean;
  lastCollectionAt?: Date;
  lastErrorAt?: Date;
  lastError?: string;
  totalCollections: number;
  totalErrors: number;
}

export abstract class BaseCollector {
  abstract readonly name: string;
  abstract readonly source: AlertSource;

  protected isRunning = false;
  protected intervalId: NodeJS.Timeout | null = null;
  protected lastCollectionAt?: Date;
  protected lastErrorAt?: Date;
  protected lastError?: string;
  protected totalCollections = 0;
  protected totalErrors = 0;
  protected pollingIntervalMs: number;
  protected logger = logger;

  constructor(pollingIntervalMs: number) {
    this.pollingIntervalMs = pollingIntervalMs;
    this.logger = createLogger(this.constructor.name);
  }

  // Abstract method that subclasses must implement
  protected abstract doCollect(): Promise<void>;

  // Start the collector
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(`${this.name} is already running`);
      return;
    }

    this.isRunning = true;
    this.logger.info(`Starting ${this.name} collector`);

    eventBus.emit('collector:started', { name: this.name });

    // Run initial collection
    await this.collect();

    // Set up polling interval
    this.intervalId = setInterval(async () => {
      await this.collect();
    }, this.pollingIntervalMs);

    this.logger.info(
      `${this.name} collector started (polling every ${this.pollingIntervalMs / 1000}s)`
    );
  }

  // Stop the collector
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    eventBus.emit('collector:stopped', { name: this.name });
    this.logger.info(`${this.name} collector stopped`);
  }

  // Perform a single collection cycle
  async collect(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.doCollect();
      this.lastCollectionAt = new Date();
      this.totalCollections++;
      this.lastError = undefined;
    } catch (error) {
      this.totalErrors++;
      this.lastErrorAt = new Date();
      this.lastError = error instanceof Error ? error.message : String(error);

      const err = error instanceof Error ? error : new Error(String(error));
      eventBus.emit('collector:error', { name: this.name, error: err });

      this.logger.error(`${this.name} collection failed:`, error);
    }
  }

  // Get collector status
  getStatus(): CollectorStatus {
    return {
      name: this.name,
      source: this.source,
      isRunning: this.isRunning,
      lastCollectionAt: this.lastCollectionAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
      totalCollections: this.totalCollections,
      totalErrors: this.totalErrors,
    };
  }
}

export default BaseCollector;
