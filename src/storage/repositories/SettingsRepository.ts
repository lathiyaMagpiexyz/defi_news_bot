import { database } from '../Database.js';
import { createLogger } from '../../utils/logger.js';
import type { AlertCategory } from '../../core/types/alerts.js';
import type { UserSettings } from '../../core/types/protocols.js';

const logger = createLogger('SettingsRepository');

const ALL_CATEGORIES: AlertCategory[] = [
  'INCENTIVE' as AlertCategory,
  'TVL_CHANGE' as AlertCategory,
  'TOKEN_EVENT' as AlertCategory,
  'GOVERNANCE' as AlertCategory,
  'SECURITY' as AlertCategory,
  'NARRATIVE' as AlertCategory,
];

export class SettingsRepository {
  // Get or create user settings
  getOrCreate(chatId: string): UserSettings {
    const stmt = database.prepare(`
      SELECT * FROM user_settings WHERE chat_id = ?
    `);

    let row = stmt.get(chatId) as any;

    if (!row) {
      // Create default settings
      const insertStmt = database.prepare(`
        INSERT INTO user_settings (chat_id, subscribed_categories, custom_thresholds, is_paused)
        VALUES (?, ?, '{}', 0)
      `);
      insertStmt.run(chatId, JSON.stringify(ALL_CATEGORIES));

      row = stmt.get(chatId);
      logger.info(`Created default settings for chat: ${chatId}`);
    }

    return {
      chatId: row.chat_id,
      subscribedCategories: row.subscribed_categories,
      customThresholds: row.custom_thresholds,
      isPaused: row.is_paused === 1,
      createdAt: new Date(row.created_at * 1000),
      updatedAt: new Date(row.updated_at * 1000),
    };
  }

  // Get subscribed categories for a chat
  getSubscribedCategories(chatId: string): AlertCategory[] {
    const settings = this.getOrCreate(chatId);
    try {
      return JSON.parse(settings.subscribedCategories) as AlertCategory[];
    } catch {
      return ALL_CATEGORIES;
    }
  }

  // Subscribe to a category
  subscribe(chatId: string, category: AlertCategory): boolean {
    const categories = this.getSubscribedCategories(chatId);

    if (categories.includes(category)) {
      return false; // Already subscribed
    }

    categories.push(category);

    const stmt = database.prepare(`
      UPDATE user_settings
      SET subscribed_categories = ?, updated_at = unixepoch()
      WHERE chat_id = ?
    `);

    stmt.run(JSON.stringify(categories), chatId);
    logger.info(`Chat ${chatId} subscribed to ${category}`);
    return true;
  }

  // Unsubscribe from a category
  unsubscribe(chatId: string, category: AlertCategory): boolean {
    const categories = this.getSubscribedCategories(chatId);
    const index = categories.indexOf(category);

    if (index === -1) {
      return false; // Not subscribed
    }

    categories.splice(index, 1);

    const stmt = database.prepare(`
      UPDATE user_settings
      SET subscribed_categories = ?, updated_at = unixepoch()
      WHERE chat_id = ?
    `);

    stmt.run(JSON.stringify(categories), chatId);
    logger.info(`Chat ${chatId} unsubscribed from ${category}`);
    return true;
  }

  // Get custom thresholds
  getCustomThresholds(chatId: string): Record<string, number> {
    const settings = this.getOrCreate(chatId);
    try {
      return JSON.parse(settings.customThresholds) as Record<string, number>;
    } catch {
      return {};
    }
  }

  // Set a custom threshold
  setThreshold(chatId: string, key: string, value: number): void {
    const thresholds = this.getCustomThresholds(chatId);
    thresholds[key] = value;

    const stmt = database.prepare(`
      UPDATE user_settings
      SET custom_thresholds = ?, updated_at = unixepoch()
      WHERE chat_id = ?
    `);

    stmt.run(JSON.stringify(thresholds), chatId);
    logger.info(`Chat ${chatId} set threshold ${key} = ${value}`);
  }

  // Pause/resume alerts
  setPaused(chatId: string, paused: boolean): void {
    this.getOrCreate(chatId); // Ensure settings exist

    const stmt = database.prepare(`
      UPDATE user_settings
      SET is_paused = ?, updated_at = unixepoch()
      WHERE chat_id = ?
    `);

    stmt.run(paused ? 1 : 0, chatId);
    logger.info(`Chat ${chatId} ${paused ? 'paused' : 'resumed'} alerts`);
  }

  // Check if chat is paused
  isPaused(chatId: string): boolean {
    const settings = this.getOrCreate(chatId);
    return settings.isPaused;
  }

  // Get all active chat IDs (not paused)
  getActiveChatIds(): string[] {
    const stmt = database.prepare(`
      SELECT chat_id FROM user_settings WHERE is_paused = 0
    `);

    const rows = stmt.all() as Array<{ chat_id: string }>;
    return rows.map((row) => row.chat_id);
  }
}

// Export singleton instance
export const settingsRepository = new SettingsRepository();
export default settingsRepository;
