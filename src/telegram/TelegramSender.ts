import axios from 'axios';
import { createLogger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
import { eventBus } from '../core/events/EventBus.js';
import { alertRepository } from '../storage/repositories/AlertRepository.js';
import type { Alert } from '../core/types/alerts.js';

const logger = createLogger('TelegramSender');

// Send message to Telegram group topic
async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  messageThreadId: number,
  text: string
) {
  const response = await axios.post(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      chat_id: chatId,
      message_thread_id: messageThreadId,
      text,
    }
  );

  return {
    statusCode: response.status,
    messageId: response.data?.result?.message_id,
    data: response.data,
  };
}

// Format alert to simple text
function formatAlert(alert: Alert): string {
  const emojis: Record<string, string> = {
    INCENTIVE: '🎁',
    TVL_CHANGE: '📈',
    TOKEN_EVENT: '🪙',
    GOVERNANCE: '🏛',
    SECURITY: '🚨',
    NARRATIVE: '📊',
  };

  const emoji = emojis[alert.category] || '📢';
  const priority = alert.priority >= 4 ? ' 🔴' : alert.priority >= 3 ? ' 🟠' : '';

  let msg = `${emoji} ${alert.title}${priority}\n\n`;
  msg += `${alert.summary}\n`;

  if (alert.details.tvlChange) {
    const { changePercent, previousTVL, currentTVL } = alert.details.tvlChange;
    const sign = changePercent >= 0 ? '+' : '';
    msg += `\nTVL: ${sign}${changePercent.toFixed(1)}% ($${formatNum(previousTVL)} → $${formatNum(currentTVL)})\n`;
  }

  if (alert.details.security?.severityLevel) {
    msg += `\nSeverity: ${alert.details.security.severityLevel}\n`;
  }

  if (alert.details.sourceUrl) {
    msg += `\n${alert.details.sourceUrl}`;
  }

  return msg;
}

function formatNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

// Telegram Sender class
export class TelegramSender {
  private botToken: string;
  private chatIds: string[];
  private messageThreadId: number;

  constructor() {
    const config = getConfig();
    this.botToken = config.telegram.botToken;
    this.chatIds = config.telegram.allowedChatIds;
    this.messageThreadId = config.telegram.messageThreadId;

    // Subscribe to alert events
    eventBus.on('signal:alert', (alert) => this.sendAlert(alert));

    logger.info(`TelegramSender initialized (thread: ${this.messageThreadId})`);
  }

  async sendAlert(alert: Alert): Promise<void> {
    const text = formatAlert(alert);

    for (const chatId of this.chatIds) {
      try {
        const result = await sendTelegramMessage(
          this.botToken,
          chatId,
          this.messageThreadId,
          text
        );

        if (result.messageId) {
          alertRepository.save(alert, chatId, result.messageId);
          eventBus.emit('alert:sent', { alertId: alert.id, chatId, messageId: result.messageId });
          logger.info(`Alert sent to ${chatId}/${this.messageThreadId}: ${alert.title}`);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        eventBus.emit('alert:failed', { alertId: alert.id, chatId, error: err });
        logger.error(`Failed to send to ${chatId}/${this.messageThreadId}:`, error);
      }
    }
  }

  // Direct message send
  async send(chatId: string, message: string): Promise<void> {
    await sendTelegramMessage(this.botToken, chatId, this.messageThreadId, message);
  }
}

// Singleton
let sender: TelegramSender | null = null;

export function getTelegramSender(): TelegramSender {
  if (!sender) sender = new TelegramSender();
  return sender;
}

export default getTelegramSender;
