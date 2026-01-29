import { createLogger } from './utils/logger.js';
import { getConfig } from './config/index.js';
import { database } from './storage/Database.js';
import { getTelegramBot } from './telegram/TelegramBot.js';
import { getCollectorManager } from './collectors/CollectorManager.js';
import { getSignalProcessor } from './processors/SignalProcessor.js';
import { getAlertManager } from './alerting/AlertManager.js';
import { eventBus } from './core/events/EventBus.js';

const logger = createLogger('Main');

async function main(): Promise<void> {
  logger.info('Starting DeFi News Bot...');

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

    // Initialize and start Telegram bot
    logger.info('Starting Telegram bot...');
    const telegramBot = getTelegramBot();
    await telegramBot.start();

    // Initialize and start collectors
    logger.info('Starting collectors...');
    const collectorManager = getCollectorManager();
    await collectorManager.startAll();

    // Emit system ready event
    eventBus.emit('system:ready', undefined);

    logger.info('DeFi News Bot started successfully!');
    logger.info('Press Ctrl+C to stop');

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down...');

      eventBus.emit('system:shutdown', undefined);

      // Stop collectors
      collectorManager.stopAll();

      // Stop Telegram bot
      telegramBot.stop();

      // Close database
      database.close();

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep the process running
    await new Promise(() => {});
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the application
main();
