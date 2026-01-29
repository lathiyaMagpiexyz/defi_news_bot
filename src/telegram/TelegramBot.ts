import { Telegraf, Context } from 'telegraf';
import { createLogger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import { eventBus } from '../core/events/EventBus.js';
import { alertRepository } from '../storage/repositories/AlertRepository.js';
import { settingsRepository } from '../storage/repositories/SettingsRepository.js';
import { registerCommands } from './commands/index.js';
import type { Alert, AlertCategory, AlertPriority } from '../core/types/alerts.js';

const logger = createLogger('TelegramBot');

export class TelegramBot {
  private bot: Telegraf;
  private isRunning = false;

  constructor() {
    const config = getConfig();
    this.bot = new Telegraf(config.telegram.botToken);

    // Set up error handling
    this.bot.catch((err, ctx) => {
      logger.error(`Telegram error for ${ctx.updateType}:`, err);
    });

    // Register basic commands
    this.registerBasicCommands();

    // Register additional commands
    registerCommands(this.bot);

    // Subscribe to alert events
    eventBus.on('signal:alert', (alert) => {
      this.sendAlert(alert);
    });
  }

  private registerBasicCommands(): void {
    // /start command
    this.bot.command('start', (ctx) => {
      const chatId = ctx.chat.id.toString();
      logger.info(`/start from chat ${chatId}`);

      ctx.reply(
        `*Welcome to DeFi News Bot!* 🚀\n\n` +
          `I monitor DeFi protocols and send you alerts about:\n\n` +
          `🎁 *Incentives* - Airdrops, points, snapshots\n` +
          `📈 *TVL Changes* - Significant capital movements\n` +
          `🪙 *Token Events* - Launches, unlocks, vesting\n` +
          `🏛 *Governance* - Parameter changes, proposals\n` +
          `🚨 *Security* - Exploits, hacks, pauses\n` +
          `📊 *Narratives* - Emerging trends, sector shifts\n\n` +
          `Use /help to see available commands.`,
        { parse_mode: 'Markdown' }
      );
    });

    // /help command
    this.bot.command('help', (ctx) => {
      ctx.reply(
        `*Available Commands:*\n\n` +
          `/start - Welcome message\n` +
          `/help - Show this help\n` +
          `/status - Bot status and stats\n` +
          `/subscribe <category> - Subscribe to alerts\n` +
          `/unsubscribe <category> - Unsubscribe from alerts\n` +
          `/subscriptions - View your subscriptions\n` +
          `/pause - Pause all alerts\n` +
          `/resume - Resume alerts\n` +
          `/recent [n] - Show recent alerts\n\n` +
          `*Categories:*\n` +
          `INCENTIVE, TVL_CHANGE, TOKEN_EVENT,\n` +
          `GOVERNANCE, SECURITY, NARRATIVE`,
        { parse_mode: 'Markdown' }
      );
    });

    // /status command
    this.bot.command('status', async (ctx) => {
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);

      ctx.reply(
        `*Bot Status*\n\n` +
          `✅ Status: Running\n` +
          `⏱ Uptime: ${hours}h ${minutes}m\n` +
          `📊 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        { parse_mode: 'Markdown' }
      );
    });
  }

  // Send an alert to all allowed chats
  async sendAlert(alert: Alert): Promise<void> {
    const config = getConfig();

    for (const chatId of config.telegram.allowedChatIds) {
      if (!chatId) continue;

      // Check if user is paused
      if (settingsRepository.isPaused(chatId)) {
        logger.debug(`Chat ${chatId} is paused, skipping alert`);
        continue;
      }

      // Check if user is subscribed to this category
      const subscribed = settingsRepository.getSubscribedCategories(chatId);
      if (!subscribed.includes(alert.category)) {
        logger.debug(`Chat ${chatId} not subscribed to ${alert.category}, skipping`);
        continue;
      }

      try {
        const message = this.formatAlert(alert);
        const result = await this.bot.telegram.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        });

        // Save to database
        alertRepository.save(alert, chatId, result.message_id);

        eventBus.emit('alert:sent', {
          alertId: alert.id,
          chatId,
          messageId: result.message_id,
        });

        logger.info(`Alert sent to ${chatId}: ${alert.title}`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        eventBus.emit('alert:failed', { alertId: alert.id, chatId, error: err });
        logger.error(`Failed to send alert to ${chatId}:`, error);
      }
    }
  }

  // Format alert for Telegram
  private formatAlert(alert: Alert): string {
    const emoji = this.getCategoryEmoji(alert.category);
    const priorityIndicator = this.getPriorityIndicator(alert.priority);

    let message = `${emoji} *${alert.title}*${priorityIndicator}\n\n`;
    message += `${alert.summary}\n`;

    // Add details based on category
    if (alert.details.tvlChange) {
      const tvl = alert.details.tvlChange;
      const changeSign = tvl.changePercent >= 0 ? '+' : '';
      message += `\n📊 *TVL Change:* ${changeSign}${tvl.changePercent.toFixed(1)}%\n`;
      message += `• Previous: $${this.formatNumber(tvl.previousTVL)}\n`;
      message += `• Current: $${this.formatNumber(tvl.currentTVL)}\n`;
    }

    if (alert.details.security) {
      const sec = alert.details.security;
      message += `\n⚠️ *Severity:* ${sec.severityLevel}\n`;
      if (sec.estimatedLoss) {
        message += `💰 *Est. Loss:* $${this.formatNumber(sec.estimatedLoss)}\n`;
      }
    }

    if (alert.details.sourceUrl) {
      message += `\n🔗 [Source](${alert.details.sourceUrl})`;
    }

    // Add tags
    if (alert.metadata.tags.length > 0) {
      message += `\n\n${alert.metadata.tags.map((t) => `#${t}`).join(' ')}`;
    }

    return message;
  }

  private getCategoryEmoji(category: AlertCategory): string {
    const emojis: Record<AlertCategory, string> = {
      INCENTIVE: '🎁',
      TVL_CHANGE: '📈',
      TOKEN_EVENT: '🪙',
      GOVERNANCE: '🏛',
      SECURITY: '🚨',
      NARRATIVE: '📊',
    };
    return emojis[category] || '📢';
  }

  private getPriorityIndicator(priority: AlertPriority): string {
    if (priority >= 4) return ' 🔴';
    if (priority >= 3) return ' 🟠';
    return '';
  }

  private formatNumber(num: number): string {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  }

  // Send a simple message to a chat
  async sendMessage(chatId: string, message: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (error) {
      logger.error(`Failed to send message to ${chatId}:`, error);
    }
  }

  // Start the bot
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const config = getConfig();

    logger.info('Starting Telegram bot...');

    if (config.telegram.pollingMode) {
      await this.bot.launch();
    } else {
      // Webhook mode - not implemented yet
      throw new Error('Webhook mode not yet implemented');
    }

    this.isRunning = true;
    logger.info('Telegram bot started');

    // Handle graceful shutdown
    process.once('SIGINT', () => this.stop());
    process.once('SIGTERM', () => this.stop());
  }

  // Stop the bot
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Telegram bot...');
    this.bot.stop();
    this.isRunning = false;
    logger.info('Telegram bot stopped');
  }

  // Get bot instance for adding more commands
  getBot(): Telegraf {
    return this.bot;
  }
}

// Export singleton instance
let telegramBot: TelegramBot | null = null;

export function getTelegramBot(): TelegramBot {
  if (!telegramBot) {
    telegramBot = new TelegramBot();
  }
  return telegramBot;
}

export default getTelegramBot;
