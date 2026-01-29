import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { database } from '../Database.js';
import { createLogger } from '../../utils/logger.js';
import type { Alert, AlertRecord, AlertCategory, AlertSource } from '../../core/types/alerts.js';
import { getConfig } from '../../config/index.js';

const logger = createLogger('AlertRepository');

export class AlertRepository {
  // Generate deduplication key from alert content
  private generateDeduplicationKey(alert: Alert): string {
    const content = `${alert.category}:${alert.source}:${alert.title}:${JSON.stringify(alert.metadata)}`;
    return createHash('sha256').update(content).digest('hex').substring(0, 32);
  }

  // Check if alert was already sent within deduplication window
  isDuplicate(alert: Alert): boolean {
    const config = getConfig();
    const deduplicationKey = this.generateDeduplicationKey(alert);
    const windowStart = Date.now() - config.alerts.deduplicationWindowMs;

    const stmt = database.prepare(`
      SELECT id FROM alerts
      WHERE deduplication_key = ? AND sent_at > ?
      LIMIT 1
    `);

    const existing = stmt.get(deduplicationKey, windowStart);
    return existing !== undefined;
  }

  // Save alert to database
  save(alert: Alert, chatId: string, telegramMessageId?: number): AlertRecord {
    const record: AlertRecord = {
      id: alert.id || uuidv4(),
      category: alert.category,
      priority: alert.priority,
      source: alert.source,
      title: alert.title,
      summary: alert.summary,
      detailsJson: JSON.stringify(alert.details),
      metadataJson: JSON.stringify(alert.metadata),
      deduplicationKey: this.generateDeduplicationKey(alert),
      sentAt: new Date(),
      telegramMessageId,
      chatId,
    };

    const stmt = database.prepare(`
      INSERT INTO alerts (
        id, category, priority, source, title, summary,
        details_json, metadata_json, deduplication_key,
        sent_at, telegram_message_id, chat_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.id,
      record.category,
      record.priority,
      record.source,
      record.title,
      record.summary,
      record.detailsJson,
      record.metadataJson,
      record.deduplicationKey,
      record.sentAt.getTime(),
      record.telegramMessageId ?? null,
      record.chatId
    );

    logger.debug(`Alert saved: ${record.id}`);
    return record;
  }

  // Get recent alerts
  getRecent(limit = 10, category?: AlertCategory): AlertRecord[] {
    let sql = `
      SELECT * FROM alerts
      ${category ? 'WHERE category = ?' : ''}
      ORDER BY sent_at DESC
      LIMIT ?
    `;

    const stmt = database.prepare(sql);
    const rows = category ? stmt.all(category, limit) : stmt.all(limit);

    return rows.map((row: any) => ({
      ...row,
      sentAt: new Date(row.sent_at),
    })) as AlertRecord[];
  }

  // Get alert counts by category
  getCounts(sinceMs?: number): Record<AlertCategory, number> {
    const since = sinceMs ? Date.now() - sinceMs : 0;

    const stmt = database.prepare(`
      SELECT category, COUNT(*) as count
      FROM alerts
      WHERE sent_at > ?
      GROUP BY category
    `);

    const rows = stmt.all(since) as Array<{ category: AlertCategory; count: number }>;

    const counts: Partial<Record<AlertCategory, number>> = {};
    for (const row of rows) {
      counts[row.category] = row.count;
    }

    return counts as Record<AlertCategory, number>;
  }

  // Clean up old alerts
  cleanup(maxDays: number): number {
    const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;

    const stmt = database.prepare(`
      DELETE FROM alerts WHERE sent_at < ?
    `);

    const result = stmt.run(cutoff);
    const deleted = result.changes;

    if (deleted > 0) {
      logger.info(`Cleaned up ${deleted} old alerts`);
    }

    return deleted;
  }

  // Get last alert time for cooldown check
  getLastAlertTime(category?: AlertCategory): number | null {
    let sql = `
      SELECT MAX(sent_at) as last_sent
      FROM alerts
      ${category ? 'WHERE category = ?' : ''}
    `;

    const stmt = database.prepare(sql);
    const row = category ? stmt.get(category) : stmt.get();

    return (row as { last_sent: number | null } | undefined)?.last_sent ?? null;
  }
}

// Export singleton instance
export const alertRepository = new AlertRepository();
export default alertRepository;
