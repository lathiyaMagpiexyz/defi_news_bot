import { createLogger } from './utils/logger.js';
import { getConfig } from './config/index.js';
import { database } from './storage/Database.js';
import { getTelegramBot } from './telegram/TelegramBot.js';
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

    // Initialize database
    logger.info('Initializing database...');
    database.initialize();

    // Initialize signal processor (subscribes to collector events)
    logger.info('Initializing signal processor...');
    getSignalProcessor();

    // Initialize alert manager
    logger.info('Initializing alert manager...');
    getAlertManager();

    // Initialize Telegram bot (without polling - just ready to send alerts)
    logger.info('Initializing Telegram bot...');
    const telegramBot = getTelegramBot();
    telegramBot.initialize();

    // Run collectors ONCE
    logger.info('Running collectors...');
    const collectorManager = getCollectorManager();
    await collectorManager.runOnce();

    // Small delay to allow async alert processing to complete
    logger.info('Waiting for alerts to be processed...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Emit system shutdown event
    eventBus.emit('system:shutdown', undefined);

    // Close database
    database.close();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`Cron job completed successfully in ${duration}s`);

    process.exit(0);
  } catch (error) {
    logger.error('Cron job failed:', error);

    // Attempt to close database on error
    try {
      database.close();
    } catch {
      // Ignore close errors
    }

    process.exit(1);
  }
}

// Run the cron job
runCronJob();
