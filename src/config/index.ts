import { config as dotenvConfig } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { configSchema, keywordsSchema, type AppConfig, type KeywordsConfig } from './schema.js';
import { AlertCategory, AlertPriority } from '../core/types/alerts.js';

// Load environment variables
dotenvConfig();

// Resolve environment variable placeholders in config
function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    // Replace ${VAR_NAME} with environment variable value
    return obj.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] || '';
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value);
    }
    return result;
  }
  return obj;
}

// Load YAML config file
function loadYamlConfig(path: string): unknown {
  if (!existsSync(path)) {
    return {};
  }
  const content = readFileSync(path, 'utf-8');
  return parseYaml(content) || {};
}

// Merge configs with environment variables taking precedence
function mergeConfigs(yamlConfig: Record<string, unknown>): Record<string, unknown> {
  const envConfig: Record<string, unknown> = {
    telegram: {
      botToken: process.env['TELEGRAM_BOT_TOKEN'],
      allowedChatIds: process.env['TELEGRAM_CHAT_ID'] ? [process.env['TELEGRAM_CHAT_ID']] : undefined,
      adminChatIds: process.env['TELEGRAM_ADMIN_ID'] ? [process.env['TELEGRAM_ADMIN_ID']] : undefined,
    },
    collectors: {
      twitter: {
        apiKey: process.env['TWITTER_API_KEY'],
        apiSecret: process.env['TWITTER_API_SECRET'],
        bearerToken: process.env['TWITTER_BEARER_TOKEN'],
      },
      coingecko: {
        apiKey: process.env['COINGECKO_API_KEY'],
      },
    },
    app: {
      environment: process.env['NODE_ENV'] as 'development' | 'production' | undefined,
    },
  };

  // Deep merge, with env taking precedence
  return deepMerge(yamlConfig, envConfig);
}

// Deep merge utility
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// Load and validate configuration
export function loadConfig(configPath = './config/config.yaml'): AppConfig {
  const rawYaml = loadYamlConfig(configPath);
  const resolved = resolveEnvVars(rawYaml) as Record<string, unknown>;
  const merged = mergeConfigs(resolved);

  const result = configSchema.safeParse(merged);

  if (!result.success) {
    console.error('Configuration validation failed:');
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    throw new Error('Invalid configuration');
  }

  return result.data;
}

// Load keywords configuration
export function loadKeywords(keywordsPath = './config/keywords.yaml'): KeywordsConfig {
  const rawYaml = loadYamlConfig(keywordsPath);

  // If no keywords file exists, return defaults
  if (!rawYaml || Object.keys(rawYaml).length === 0) {
    return getDefaultKeywords();
  }

  const result = keywordsSchema.safeParse(rawYaml);

  if (!result.success) {
    console.error('Keywords configuration validation failed:');
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    console.warn('Using default keywords configuration');
    return getDefaultKeywords();
  }

  return result.data;
}

// Default keywords for each category
function getDefaultKeywords(): KeywordsConfig {
  return {
    categories: {
      [AlertCategory.INCENTIVE]: {
        primary: [
          'airdrop',
          'points program',
          'season 1',
          'season 2',
          'snapshot',
          'incentive',
          'rewards program',
          'XP system',
          'points multiplier',
          'eligibility',
          'claim now',
          'token distribution',
        ],
        secondary: ['early adopter', 'retroactive', 'farming', 'boost', 'bonus', 'multiplier'],
        negative: ['scam', 'fake airdrop', 'giveaway', 'retweet to win'],
        accounts: ['layerzero_labs', 'eigenlayer', 'arbitrum', 'Optimism', 'StarkWareLtd'],
        hashtags: ['#airdrop', '#points'],
      },
      [AlertCategory.TVL_CHANGE]: {
        primary: ['TVL', 'total value locked', 'deposits surge', 'inflows', 'outflows', 'capital migration'],
        secondary: ['billion', 'million', 'growth', 'all-time high', 'ATH'],
        negative: ['prediction', 'might', 'could'],
        accounts: ['DefiLlama'],
        hashtags: ['#TVL', '#DeFi'],
      },
      [AlertCategory.TOKEN_EVENT]: {
        primary: [
          'token launch',
          'TGE',
          'token generation',
          'vesting',
          'cliff',
          'unlock',
          'emissions',
          'token release',
          'VC unlock',
          'team tokens',
        ],
        secondary: ['tokenomics', 'supply', 'circulating', 'listing'],
        negative: ['presale', 'private sale', 'whitelist'],
        accounts: ['TokenUnlocks', 'UnlocksCalendar'],
        hashtags: ['#TGE', '#unlock'],
      },
      [AlertCategory.GOVERNANCE]: {
        primary: [
          'governance proposal',
          'parameter change',
          'yield change',
          'collateral factor',
          'LTV change',
          'fee update',
          'reward rate',
          'multiplier update',
          'voting',
          'passed proposal',
        ],
        secondary: ['DAO', 'vote', 'quorum', 'executed'],
        negative: ['temperature check', 'draft'],
        accounts: ['MakerDAO', 'AaveAave', 'compikiyo', 'CurveFinance'],
        hashtags: ['#governance', '#DAO'],
      },
      [AlertCategory.SECURITY]: {
        primary: [
          'exploit',
          'hack',
          'drained',
          'stolen',
          'vulnerability',
          'paused',
          'emergency',
          'attack',
          'flash loan attack',
          'reentrancy',
          'oracle manipulation',
          'rug pull',
          'audit',
          'critical',
        ],
        secondary: ['investigating', 'funds at risk', 'warning', 'suspicious', 'abnormal'],
        negative: [],
        accounts: ['PeckShieldAlert', 'BlockSecTeam', 'certikiAlert', 'SlowMist_Team', 'samczsun'],
        hashtags: ['#exploit', '#hack', '#security'],
      },
      [AlertCategory.NARRATIVE]: {
        primary: [
          'new meta',
          'emerging trend',
          'restaking',
          'liquid restaking',
          'RWA',
          'real world assets',
          'AI crypto',
          'DePIN',
          'fund investing',
          'fund backed',
          'pivot',
          'rebranding',
          'new direction',
        ],
        secondary: ['alpha', 'thesis', 'narrative', 'sector', 'category'],
        negative: ['old news', 'dead'],
        accounts: ['DefiIgnas', 'Defi_Made_Here', 'Route2FI'],
        hashtags: ['#DeFi', '#crypto'],
      },
    },
  };
}

// Singleton config instance
let cachedConfig: AppConfig | null = null;
let cachedKeywords: KeywordsConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function getKeywords(): KeywordsConfig {
  if (!cachedKeywords) {
    cachedKeywords = loadKeywords();
  }
  return cachedKeywords;
}

// Re-export types
export type { AppConfig, KeywordsConfig };
