import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';

const logger = createLogger('Database');

// Initial schema migration
const INITIAL_SCHEMA = `
-- Alert history table
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    priority INTEGER NOT NULL,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    details_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    deduplication_key TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    telegram_message_id INTEGER,
    chat_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_alerts_dedup ON alerts(deduplication_key);
CREATE INDEX IF NOT EXISTS idx_alerts_sent_at ON alerts(sent_at);
CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category);

-- Protocol state tracking
CREATE TABLE IF NOT EXISTS protocol_state (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    last_tvl REAL NOT NULL,
    last_tvl_by_chain TEXT NOT NULL,
    last_checked_at INTEGER NOT NULL,
    tvl_history_24h TEXT NOT NULL DEFAULT '[]',
    tvl_history_7d TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_protocol_state_checked ON protocol_state(last_checked_at);

-- User/chat settings
CREATE TABLE IF NOT EXISTS user_settings (
    chat_id TEXT PRIMARY KEY,
    subscribed_categories TEXT NOT NULL DEFAULT '["INCENTIVE","TVL_CHANGE","TOKEN_EVENT","GOVERNANCE","SECURITY","NARRATIVE"]',
    custom_thresholds TEXT NOT NULL DEFAULT '{}',
    is_paused INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- Token watchlist with prices
CREATE TABLE IF NOT EXISTS token_prices (
    coingecko_id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    current_price REAL,
    price_change_24h REAL,
    market_cap REAL,
    last_updated_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_token_prices_updated ON token_prices(last_updated_at);

-- Rate limit tracking
CREATE TABLE IF NOT EXISTS rate_limit_state (
    source TEXT PRIMARY KEY,
    requests_this_minute INTEGER NOT NULL DEFAULT 0,
    requests_this_month INTEGER NOT NULL DEFAULT 0,
    minute_reset_at INTEGER NOT NULL,
    month_reset_at INTEGER NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
);

-- System state and metadata
CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
);

-- Migrations tracking
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER DEFAULT (unixepoch())
);
`;

// Database wrapper class
class DatabaseWrapper {
  private static instance: DatabaseWrapper;
  private db: Database.Database | null = null;
  private dbPath: string;

  private constructor() {
    const config = getConfig();
    this.dbPath = config.storage.databasePath;
  }

  static getInstance(): DatabaseWrapper {
    if (!DatabaseWrapper.instance) {
      DatabaseWrapper.instance = new DatabaseWrapper();
    }
    return DatabaseWrapper.instance;
  }

  // Initialize database connection
  initialize(): void {
    if (this.db) {
      return;
    }

    // Ensure data directory exists
    const dir = path.dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.info(`Created database directory: ${dir}`);
    }

    // Open database connection
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    logger.info(`Connected to database: ${this.dbPath}`);

    // Run migrations
    this.runMigrations();
  }

  // Run database migrations
  private runMigrations(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Check if initial schema has been applied
    const migrationExists = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
      .get();

    if (!migrationExists) {
      logger.info('Applying initial schema...');
      this.db.exec(INITIAL_SCHEMA);
      this.db
        .prepare('INSERT INTO migrations (name) VALUES (?)')
        .run('001_initial_schema');
      logger.info('Initial schema applied');
    }
  }

  // Get database instance
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  // Prepare statement with caching
  prepare(sql: string): Database.Statement {
    return this.getDb().prepare(sql);
  }

  // Execute raw SQL
  exec(sql: string): void {
    this.getDb().exec(sql);
  }

  // Run in transaction
  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn)();
  }

  // Close database connection
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('Database connection closed');
    }
  }
}

// Export singleton instance
export const database = DatabaseWrapper.getInstance();
export default database;
