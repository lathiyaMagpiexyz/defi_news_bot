import type { Context, ScheduledEvent } from 'aws-lambda';
import { createLogger } from './utils/logger.js';
import { getConfig } from './config/index.js';
import { database } from './storage/Database.js';
import { getTelegramSender } from './telegram/TelegramSender.js';
import { getCollectorManager } from './collectors/CollectorManager.js';
import { getSignalProcessor } from './processors/SignalProcessor.js';
import { getAlertManager } from './alerting/AlertManager.js';
import { eventBus } from './core/events/EventBus.js';

const logger = createLogger('Lambda');

export interface LambdaResponse {
  statusCode: number;
  body: string;
}

export async function handler(
  event: ScheduledEvent,
  context: Context
): Promise<LambdaResponse> {
  const startTime = Date.now();
  logger.info('Lambda handler started', {
    requestId: context.awsRequestId,
    functionName: context.functionName,
  });

  try {
    // Load configuration
    const config = getConfig();
    logger.info(`Environment: ${config.app.environment}`);

    // Initialize database
    logger.info('Initializing database...');
    database.initialize();

    // Initialize signal processor (subscribes to collector events)
    logger.info('Initializing signal processor...');
    getSignalProcessor();

    // Initialize alert manager
    logger.info('Initializing alert manager...');
    getAlertManager();

    // Initialize Telegram sender (broadcast-only mode)
    logger.info('Initializing Telegram sender...');
    getTelegramSender();

    // Run collectors ONCE
    logger.info('Running collectors...');
    const collectorManager = getCollectorManager();
    await collectorManager.runOnce();

    // Wait for async alert processing to complete
    logger.info('Waiting for alerts to be processed...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Cleanup
    eventBus.emit('system:shutdown', undefined);
    database.close();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`Lambda completed successfully in ${duration}s`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'DeFi News Bot cron completed',
        duration: `${duration}s`,
        requestId: context.awsRequestId,
      }),
    };
  } catch (error) {
    logger.error('Lambda handler failed:', error);

    // Attempt cleanup on error
    try {
      database.close();
    } catch {
      // Ignore close errors
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'DeFi News Bot cron failed',
        error: error instanceof Error ? error.message : String(error),
        requestId: context.awsRequestId,
      }),
    };
  }
}
