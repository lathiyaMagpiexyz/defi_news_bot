import { Telegraf, Context } from 'telegraf';
import { createLogger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
import { settingsRepository } from '../../storage/repositories/SettingsRepository.js';
import { alertRepository } from '../../storage/repositories/AlertRepository.js';
import { getCollectorManager } from '../../collectors/CollectorManager.js';
import { AlertCategory } from '../../core/types/alerts.js';

const logger = createLogger('TelegramCommands');

const ALL_CATEGORIES: AlertCategory[] = [
  AlertCategory.INCENTIVE,
  AlertCategory.TVL_CHANGE,
  AlertCategory.TOKEN_EVENT,
  AlertCategory.GOVERNANCE,
  AlertCategory.SECURITY,
  AlertCategory.NARRATIVE,
];

export function registerCommands(bot: Telegraf): void {
  // /subscribe command
  bot.command('subscribe', (ctx) => {
    const chatId = ctx.chat.id.toString();
    const args = ctx.message.text.split(' ').slice(1);
    const category = args[0]?.toUpperCase() as AlertCategory;

    if (!category) {
      ctx.reply(
        `*Usage:* /subscribe <category>\n\n` +
          `*Available categories:*\n` +
          ALL_CATEGORIES.map((c) => `• ${c}`).join('\n'),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (!ALL_CATEGORIES.includes(category)) {
      ctx.reply(
        `Invalid category: ${category}\n\n` +
          `*Available categories:*\n` +
          ALL_CATEGORIES.map((c) => `• ${c}`).join('\n'),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const success = settingsRepository.subscribe(chatId, category);

    if (success) {
      ctx.reply(`✅ Subscribed to *${category}* alerts`, { parse_mode: 'Markdown' });
      logger.info(`Chat ${chatId} subscribed to ${category}`);
    } else {
      ctx.reply(`You're already subscribed to *${category}* alerts`, { parse_mode: 'Markdown' });
    }
  });

  // /unsubscribe command
  bot.command('unsubscribe', (ctx) => {
    const chatId = ctx.chat.id.toString();
    const args = ctx.message.text.split(' ').slice(1);
    const category = args[0]?.toUpperCase() as AlertCategory;

    if (!category) {
      ctx.reply(
        `*Usage:* /unsubscribe <category>\n\n` +
          `*Available categories:*\n` +
          ALL_CATEGORIES.map((c) => `• ${c}`).join('\n'),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (!ALL_CATEGORIES.includes(category)) {
      ctx.reply(
        `Invalid category: ${category}\n\n` +
          `*Available categories:*\n` +
          ALL_CATEGORIES.map((c) => `• ${c}`).join('\n'),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const success = settingsRepository.unsubscribe(chatId, category);

    if (success) {
      ctx.reply(`❌ Unsubscribed from *${category}* alerts`, { parse_mode: 'Markdown' });
      logger.info(`Chat ${chatId} unsubscribed from ${category}`);
    } else {
      ctx.reply(`You weren't subscribed to *${category}* alerts`, { parse_mode: 'Markdown' });
    }
  });

  // /subscriptions command
  bot.command('subscriptions', (ctx) => {
    const chatId = ctx.chat.id.toString();
    const subscribed = settingsRepository.getSubscribedCategories(chatId);
    const isPaused = settingsRepository.isPaused(chatId);

    let message = `*Your Subscriptions*\n\n`;

    if (isPaused) {
      message += `⏸ *Alerts are currently PAUSED*\n\n`;
    }

    for (const category of ALL_CATEGORIES) {
      const isSubscribed = subscribed.includes(category);
      const emoji = isSubscribed ? '✅' : '❌';
      message += `${emoji} ${category}\n`;
    }

    message += `\nUse /subscribe or /unsubscribe to manage.`;

    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // /pause command
  bot.command('pause', (ctx) => {
    const chatId = ctx.chat.id.toString();
    settingsRepository.setPaused(chatId, true);
    ctx.reply(`⏸ Alerts *paused*. Use /resume to start receiving alerts again.`, {
      parse_mode: 'Markdown',
    });
    logger.info(`Chat ${chatId} paused alerts`);
  });

  // /resume command
  bot.command('resume', (ctx) => {
    const chatId = ctx.chat.id.toString();
    settingsRepository.setPaused(chatId, false);
    ctx.reply(`▶️ Alerts *resumed*. You will now receive alerts again.`, {
      parse_mode: 'Markdown',
    });
    logger.info(`Chat ${chatId} resumed alerts`);
  });

  // /recent command
  bot.command('recent', (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const limit = Math.min(parseInt(args[0] || '5', 10), 10);

    const recentAlerts = alertRepository.getRecent(limit);

    if (recentAlerts.length === 0) {
      ctx.reply('No recent alerts found.');
      return;
    }

    let message = `*Recent Alerts (${recentAlerts.length})*\n\n`;

    for (const alert of recentAlerts) {
      const time = new Date(alert.sentAt).toLocaleTimeString();
      message += `• [${alert.category}] ${alert.title.substring(0, 40)}...\n`;
      message += `  _${time}_\n\n`;
    }

    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // /status command (enhanced)
  bot.command('status', async (ctx) => {
    const config = getConfig();
    const chatId = ctx.chat.id.toString();
    const isAdmin = config.telegram.adminChatIds.includes(chatId);

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    let message =
      `*Bot Status*\n\n` +
      `✅ Status: Running\n` +
      `⏱ Uptime: ${hours}h ${minutes}m\n` +
      `📊 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n`;

    // Add collector status for admins
    if (isAdmin) {
      const collectorManager = getCollectorManager();
      const summary = collectorManager.getSummary();

      message += `\n*Collectors*\n`;
      message += `Running: ${summary.running}/${summary.total}\n`;
      message += `Total errors: ${summary.errors}\n\n`;

      for (const collector of summary.collectors) {
        const status = collector.isRunning ? '✅' : '❌';
        message += `${status} ${collector.name}`;
        if (collector.lastCollectionAt) {
          const ago = Math.round((Date.now() - collector.lastCollectionAt.getTime()) / 1000);
          message += ` (${ago}s ago)`;
        }
        message += '\n';
      }
    }

    // Add alert stats
    const stats = alertRepository.getCounts(24 * 60 * 60 * 1000);
    const total = Object.values(stats).reduce((a, b) => a + b, 0);

    message += `\n*Alerts (24h)*\n`;
    message += `Total: ${total}\n`;

    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // /threshold command
  bot.command('threshold', (ctx) => {
    const chatId = ctx.chat.id.toString();
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length < 2) {
      const thresholds = settingsRepository.getCustomThresholds(chatId);

      let message = `*Custom Thresholds*\n\n`;

      if (Object.keys(thresholds).length === 0) {
        message += `No custom thresholds set.\n`;
      } else {
        for (const [key, value] of Object.entries(thresholds)) {
          message += `• ${key}: ${value}\n`;
        }
      }

      message += `\n*Usage:* /threshold <key> <value>\n`;
      message += `*Example:* /threshold tvl_min_change 15`;

      ctx.reply(message, { parse_mode: 'Markdown' });
      return;
    }

    const key = args[0]!;
    const value = parseFloat(args[1]!);

    if (isNaN(value)) {
      ctx.reply('Invalid value. Please provide a number.');
      return;
    }

    settingsRepository.setThreshold(chatId, key, value);
    ctx.reply(`✅ Threshold *${key}* set to *${value}*`, { parse_mode: 'Markdown' });
    logger.info(`Chat ${chatId} set threshold ${key} = ${value}`);
  });

  logger.info('Telegram commands registered');
}

export default registerCommands;
