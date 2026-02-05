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
    allowedChatIds: z.array(z.string()).min(1, 'At least one chat ID is required'),
    adminChatIds: z.array(z.string()).default([]),
    pollingMode: z.boolean().default(true),
    messageThreadId: z.number({ required_error: 'Message thread ID is required for topic-based groups' }),
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
      rapidApiKey: z.string().optional().default(''),
      pollingIntervalMs: z.number().min(60000).default(120000),
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

    // Phase 2 collectors
    cryptopanic: z.object({
      enabled: z.boolean().default(false),
      apiKey: z.string().optional().default(''),
      baseUrl: z.string().url().default('https://cryptopanic.com/api/v1'),
      pollingIntervalMs: z.number().min(60000).default(180000),
      currencies: z.array(z.string()).default(['ETH', 'BTC', 'SOL', 'ARB', 'OP']),
      filter: z.enum(['rising', 'hot', 'bullish', 'bearish', 'important', 'lol']).default('important'),
    }),

    snapshot: z.object({
      enabled: z.boolean().default(false),
      graphqlUrl: z.string().url().default('https://hub.snapshot.org/graphql'),
      pollingIntervalMs: z.number().min(60000).default(600000),
      watchedSpaces: z.array(z.string()).default([
        'aave.eth',
        'uniswap',
        'ens.eth',
        'lido-snapshot.eth',
        'safe.eth',
        'arbitrumfoundation.eth',
      ]),
    }),

    tokenUnlocks: z.object({
      enabled: z.boolean().default(false),
      apiKey: z.string().optional().default(''),
      baseUrl: z.string().url().default('https://token.unlocks.app/api'),
      pollingIntervalMs: z.number().min(60000).default(3600000),
      minUnlockValueUsd: z.number().default(10000000),
      daysAhead: z.number().default(7),
    }),

    l2beat: z.object({
      enabled: z.boolean().default(false),
      baseUrl: z.string().url().default('https://l2beat.com/api'),
      pollingIntervalMs: z.number().min(60000).default(600000),
      minTvlUsd: z.number().default(100000000),
      minChangePercent: z.number().default(10),
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
      [AlertCategory.NARRATIVE]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.LOW,
        cooldownMs: 3600000,
        thresholds: {
          minMentions: 5,
        },
      }),
      [AlertCategory.STABLECOIN_DEPEG]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.CRITICAL,
        cooldownMs: 60000,
        thresholds: {
          minDeviationPercent: 1,
        },
      }),
      // Phase 2 alert categories
      [AlertCategory.LIQUIDATION]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.HIGH,
        cooldownMs: 300000,
        thresholds: {
          minValueUsd: 100000,
        },
      }),
      [AlertCategory.GAS_PRICE]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.MEDIUM,
        cooldownMs: 1800000,
        thresholds: {
          minGwei: 50,
          minPercentIncrease: 100,
        },
      }),
      [AlertCategory.DEX_VOLUME]: categoryConfigSchema.default({
        enabled: true,
        priority: AlertPriority.MEDIUM,
        cooldownMs: 3600000,
        thresholds: {
          minPercentIncrease: 200,
        },
      }),
    }),
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
    // Phase 2 rate limits
    cryptopanic: z.object({
      requestsPerMinute: z.number().min(1).default(5),
      burstLimit: z.number().min(1).default(1),
    }),
    snapshot: z.object({
      requestsPerMinute: z.number().min(1).default(30),
      burstLimit: z.number().min(1).default(5),
    }),
    tokenUnlocks: z.object({
      requestsPerMinute: z.number().min(1).default(10),
      burstLimit: z.number().min(1).default(2),
    }),
    l2beat: z.object({
      requestsPerMinute: z.number().min(1).default(10),
      burstLimit: z.number().min(1).default(2),
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
