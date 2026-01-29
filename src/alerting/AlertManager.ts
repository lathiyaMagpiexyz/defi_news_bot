import { createLogger } from '../utils/logger.js';
import { eventBus } from '../core/events/EventBus.js';
import { getConfig } from '../config/index.js';
import { alertRepository } from '../storage/repositories/AlertRepository.js';
import { settingsRepository } from '../storage/repositories/SettingsRepository.js';
import type { Alert, AlertCategory } from '../core/types/alerts.js';

const logger = createLogger('AlertManager');

export class AlertManager {
  constructor() {
    // Listen for sent alerts to save them
    eventBus.on('alert:sent', ({ alertId, chatId, messageId }) => {
      this.onAlertSent(alertId, chatId, messageId);
    });

    eventBus.on('alert:failed', ({ alertId, chatId, error }) => {
      this.onAlertFailed(alertId, chatId, error);
    });

    logger.info('AlertManager initialized');
  }

  // Store alert in database after successful send
  private onAlertSent(alertId: string, chatId: string, messageId?: number): void {
    // The alert is saved in TelegramBot after sending
    logger.debug(`Alert ${alertId} sent to ${chatId}`, { messageId });
  }

  // Log failed alert delivery
  private onAlertFailed(alertId: string, chatId: string, error: Error): void {
    logger.error(`Alert ${alertId} failed to send to ${chatId}:`, error);
  }

  // Check if a chat should receive alerts for a category
  shouldReceiveAlert(chatId: string, category: AlertCategory): boolean {
    // Check if paused
    if (settingsRepository.isPaused(chatId)) {
      return false;
    }

    // Check subscription
    const subscribedCategories = settingsRepository.getSubscribedCategories(chatId);
    return subscribedCategories.includes(category);
  }

  // Get alert statistics
  getStats(chatId?: string): {
    total24h: number;
    byCategory: Record<AlertCategory, number>;
  } {
    const counts = alertRepository.getCounts(24 * 60 * 60 * 1000);

    return {
      total24h: Object.values(counts).reduce((a, b) => a + b, 0),
      byCategory: counts,
    };
  }

  // Clean up old alerts
  cleanup(): number {
    const config = getConfig();
    const maxDays = config.storage.maxAlertHistoryDays;
    return alertRepository.cleanup(maxDays);
  }
}

// Export singleton instance
let alertManager: AlertManager | null = null;

export function getAlertManager(): AlertManager {
  if (!alertManager) {
    alertManager = new AlertManager();
  }
  return alertManager;
}

export default getAlertManager;
