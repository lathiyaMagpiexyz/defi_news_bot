import { z } from 'zod';
import { AlertCategory, AlertPriority } from '../core/types/alerts.js';

// Category configuration schema
const categoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  priority: z.nativeEnum(AlertPriority).default(AlertPriority.MEDIUM),
  cooldownMs: z.number().min(0).default(300000),
  thresholds: z.record(z.string(), z.number()).default({}),
});

// Main configuration schema
export const configSchema = z.object({
  app: z.object({
    name: z.string().default('DeFi News Bot'),
    environment: z.enum(['development', 'production']).default('development'),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),

  telegram: z.object({
    botToken: z.string().min(1, 'Telegram bot token is required'),
    allowedChatIds: z.array(z.string()).default([]),
    adminChatIds: z.array(z.string()).default([]),
    pollingMode: z.boolean().default(true),
  }),

  collectors: z.object({
    defillama: z.object({
      enabled: z.boolean().default(true),
      baseUrl: z.string().url().default('https://api.llama.fi'),
      pollingIntervalMs: z.number().min(60000).default(300000),
      endpoints: z.object({
        protocols: z.boolean().default(true),
        chains: z.boolean().default(true),
        tvl: z.boolean().default(true),
      }),
      watchlist: z.array(z.string()).default([]),
    }),

    twitter: z.object({
      enabled: z.boolean().default(false),
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
      bearerToken: z.string().optional().default(''),
      useFilteredStream: z.boolean().default(true),
      pollIntervalMs: z.number().min(60000).default(60000),
      maxReconnectAttempts: z.number().min(1).default(5),
      priorityAccounts: z.array(z.string()).default([
        'DefiLlama',
        'PeckShieldAlert',
        'BlockSecTeam',
        'certikiAlert',
        'SlowMist_Team',
      ]),
    }),

    coingecko: z.object({
      enabled: z.boolean().default(true),
      baseUrl: z.string().url().default('https://api.coingecko.com/api/v3'),
      apiKey: z.string().optional(),
      pollingIntervalMs: z.number().min(60000).default(120000),
      watchlistIds: z.array(z.string()).default([
        'ethereum',
        'bitcoin',
        'arbitrum',
        'optimism',
      ]),
    }),
  }),

  alerts: z.object({
    globalCooldownMs: z.number().min(0).default(60000),
    deduplicationWindowMs: z.number().min(0).default(86400000),

    categories: z.object({
      [AlertCategory.INCENTIVE]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.HIGH,
        cooldownMs: 300000,
        thresholds: {},
      }),
      [AlertCategory.TVL_CHANGE]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.MEDIUM,
        cooldownMs: 600000,
        thresholds: {
          minChangePercent: 10,
          minTvlUsd: 1000000,
          timeframeHours: 24,
        },
      }),
      [AlertCategory.TOKEN_EVENT]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.HIGH,
        cooldownMs: 300000,
        thresholds: {
          minUnlockValueUsd: 1000000,
          daysBeforeUnlock: 7,
        },
      }),
      [AlertCategory.GOVERNANCE]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.MEDIUM,
        cooldownMs: 600000,
        thresholds: {},
      }),
      [AlertCategory.SECURITY]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.CRITICAL,
        cooldownMs: 0,
        thresholds: {
          minLossValueUsd: 100000,
        },
      }),
      [AlertCategory.NARRATIVE]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.LOW,
        cooldownMs: 3600000,
        thresholds: {
          minMentions: 5,
        },
      }),
    }),
  }),

  storage: z.object({
    databasePath: z.string().default('./data/defi_bot.db'),
    backupEnabled: z.boolean().default(true),
    backupIntervalHours: z.number().min(1).default(24),
    maxAlertHistoryDays: z.number().min(1).default(30),
  }),

  rateLimit: z.object({
    defillama: z.object({
      requestsPerMinute: z.number().min(1).default(25),
      burstLimit: z.number().min(1).default(5),
    }),
    twitter: z.object({
      requestsPerMinute: z.number().min(1).default(25),
      monthlyTweetCap: z.number().min(1).default(400000),
    }),
    coingecko: z.object({
      requestsPerMinute: z.number().min(1).default(25),
      monthlyCallLimit: z.number().min(1).default(8000),
    }),
  }),
});

// Keywords configuration schema
export const keywordsSchema = z.object({
  categories: z.record(z.nativeEnum(AlertCategory), z.object({
    primary: z.array(z.string()).default([]),
    secondary: z.array(z.string()).default([]),
    negative: z.array(z.string()).default([]),
    accounts: z.array(z.string()).default([]),
    hashtags: z.array(z.string()).default([]),
  })),
});

// Infer types from schemas
export type AppConfig = z.infer<typeof configSchema>;
export type KeywordsConfig = z.infer<typeof keywordsSchema>;
export type CategoryConfig = z.infer<typeof categoryConfigSchema>;
