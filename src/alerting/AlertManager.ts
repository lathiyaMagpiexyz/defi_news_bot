import { createLogger } from '../utils/logger.js';
import { eventBus } from '../core/events/EventBus.js';
import { getConfig } from '../config/index.js';
import { alertRepository } from '../storage/repositories/AlertRepository.js';
import type { AlertCategory } from '../core/types/alerts.js';

const logger = createLogger('AlertManager');

export class AlertManager {
  constructor() {
    eventBus.on('alert:sent', ({ alertId, chatId, messageId }) => {
      logger.debug(`Alert ${alertId} sent to ${chatId}`, { messageId });
    });

    eventBus.on('alert:failed', ({ alertId, chatId, error }) => {
      logger.error(`Alert ${alertId} failed to send to ${chatId}:`, error);
    });

    logger.info('AlertManager initialized');
  }

  // Get alert statistics
  getStats(): { total24h: number; byCategory: Record<AlertCategory, number> } {
    const counts = alertRepository.getCounts(24 * 60 * 60 * 1000);
    return {
      total24h: Object.values(counts).reduce((a, b) => a + b, 0),
      byCategory: counts,
    };
  }

  // Clean up old alerts
  cleanup(): number {
    const config = getConfig();
    return alertRepository.cleanup(config.storage.maxAlertHistoryDays);
  }
}

// Singleton
let alertManager: AlertManager | null = null;

export function getAlertManager(): AlertManager {
  if (!alertManager) alertManager = new AlertManager();
  return alertManager;
}

export default getAlertManager;
