import { createLogger } from '../utils/logger.js';
import { eventBus } from '../core/events/EventBus.js';
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

  getStats(): { total24h: number; byCategory: Record<AlertCategory, number> } {
    return { total24h: 0, byCategory: {} as Record<AlertCategory, number> };
  }

  cleanup(): number {
    return 0;
  }
}

// Singleton
let alertManager: AlertManager | null = null;

export function getAlertManager(): AlertManager {
  if (!alertManager) alertManager = new AlertManager();
  return alertManager;
}

export default getAlertManager;
