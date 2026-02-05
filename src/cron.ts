import { createLogger } from './utils/logger.js';
import { getConfig } from './config/index.js';
import { getTelegramSender } from './telegram/TelegramSender.js';
import { getCollectorManager } from './collectors/CollectorManager.js';
import { getSignalProcessor } from './processors/SignalProcessor.js';
import { getAlertManager } from './alerting/AlertManager.js';
import { eventBus } from './core/events/EventBus.js';

const logger = createLogger('Cron');

async function runCronJob(): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting DeFi News Bot (cron mode)...');

  try {
    // Load configuration
    const config = getConfig();
    logger.info(`Environment: ${config.app.environment}`);

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

    // Small delay to allow async alert processing to complete
    logger.info('Waiting for alerts to be processed...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Emit system shutdown event
    eventBus.emit('system:shutdown', undefined);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`Cron job completed successfully in ${duration}s`);

    process.exit(0);
  } catch (error) {
    logger.error('Cron job failed:', error);
    process.exit(1);
  }
}

// Run the cron job
runCronJob();
