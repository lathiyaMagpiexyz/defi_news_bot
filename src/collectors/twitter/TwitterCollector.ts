import { TwitterApi, ETwitterStreamEvent, TweetV2SingleStreamResult } from 'twitter-api-v2';
import { BaseCollector } from '../BaseCollector.js';
import { eventBus } from '../../core/events/EventBus.js';
import { getConfig, getKeywords } from '../../config/index.js';
import { AlertSource, AlertCategory } from '../../core/types/alerts.js';
import type { RawTweet, TwitterRule } from '../../core/types/sources.js';

export class TwitterCollector extends BaseCollector {
  readonly name = 'Twitter';
  readonly source = AlertSource.TWITTER;

  private client: TwitterApi;
  private stream: ReturnType<TwitterApi['v2']['searchStream']> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;

  constructor() {
    const config = getConfig();
    // Twitter uses streaming, so we set a long interval for health checks
    super(60000);

    this.client = new TwitterApi(config.collectors.twitter.bearerToken);
    this.maxReconnectAttempts = config.collectors.twitter.maxReconnectAttempts;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Twitter collector is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting Twitter collector');

    const config = getConfig();

    if (config.collectors.twitter.useFilteredStream) {
      await this.setupStreamRules();
      await this.startStream();
    } else {
      // Fallback to polling (not recommended for production)
      await super.start();
    }

    eventBus.emit('collector:started', { name: this.name });
  }

  stop(): void {
    if (this.stream) {
      this.stream.close();
      this.stream = null;
    }
    super.stop();
  }

  // Stream-based collection
  private async startStream(): Promise<void> {
    this.logger.info('Connecting to Twitter filtered stream...');

    try {
      this.stream = await this.client.v2.searchStream({
        'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'entities', 'referenced_tweets'],
        'user.fields': ['username', 'name'],
        expansions: ['author_id', 'referenced_tweets.id'],
      });

      this.stream.autoReconnect = true;
      this.stream.autoReconnectRetries = this.maxReconnectAttempts;

      // Handle incoming tweets
      this.stream.on(ETwitterStreamEvent.Data, (tweet: TweetV2SingleStreamResult) => {
        this.processTweet(tweet);
      });

      // Handle stream errors
      this.stream.on(ETwitterStreamEvent.Error, (error) => {
        this.logger.error('Twitter stream error:', error);
        this.handleStreamError(error);
      });

      // Handle reconnection
      this.stream.on(ETwitterStreamEvent.Reconnected, () => {
        this.logger.info('Twitter stream reconnected');
        this.reconnectAttempts = 0;
      });

      this.stream.on(ETwitterStreamEvent.ConnectionClosed, () => {
        this.logger.warn('Twitter stream connection closed');
      });

      this.logger.info('Twitter stream connected');
      this.reconnectAttempts = 0;
    } catch (error) {
      this.logger.error('Failed to start Twitter stream:', error);
      this.handleStreamError(error);
    }
  }

  private async handleStreamError(error: unknown): Promise<void> {
    this.reconnectAttempts++;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `Max reconnect attempts (${this.maxReconnectAttempts}) reached. Stopping collector.`
      );
      this.stop();
      return;
    }

    // Exponential backoff
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.logger.info(`Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (this.isRunning) {
      await this.startStream();
    }
  }

  // Set up stream rules based on keywords config
  private async setupStreamRules(): Promise<void> {
    this.logger.info('Setting up Twitter stream rules...');

    const keywords = getKeywords();
    const config = getConfig();

    // Get existing rules
    const existingRules = await this.client.v2.streamRules();
    const existingIds = existingRules.data?.map((r) => r.id) || [];

    // Delete existing rules
    if (existingIds.length > 0) {
      await this.client.v2.updateStreamRules({
        delete: { ids: existingIds },
      });
      this.logger.debug(`Deleted ${existingIds.length} existing rules`);
    }

    // Build new rules
    const rules: Array<{ value: string; tag: string }> = [];

    // Add rules for each category
    for (const [category, categoryKeywords] of Object.entries(keywords.categories)) {
      const primaryKeywords = categoryKeywords.primary.slice(0, 5); // Limit to avoid rule length limits

      if (primaryKeywords.length > 0) {
        // Create OR query for keywords
        const keywordQuery = primaryKeywords
          .map((k) => `"${k}"`)
          .join(' OR ');

        rules.push({
          value: `(${keywordQuery}) lang:en -is:retweet`,
          tag: category,
        });
      }
    }

    // Add rules for priority accounts
    const priorityAccounts = config.collectors.twitter.priorityAccounts;
    if (priorityAccounts.length > 0) {
      const accountsChunks = this.chunkArray(priorityAccounts, 10);

      for (let i = 0; i < accountsChunks.length; i++) {
        const chunk = accountsChunks[i];
        const accountsQuery = chunk?.map((a) => `from:${a}`).join(' OR ') || '';

        if (accountsQuery) {
          rules.push({
            value: `(${accountsQuery}) -is:retweet`,
            tag: `priority_accounts_${i + 1}`,
          });
        }
      }
    }

    // Add rules (Twitter limits to 25 rules for free tier)
    const rulesToAdd = rules.slice(0, 25);

    if (rulesToAdd.length > 0) {
      const result = await this.client.v2.updateStreamRules({
        add: rulesToAdd,
      });

      this.logger.info(`Added ${rulesToAdd.length} stream rules`);
      this.logger.debug('Rules:', rulesToAdd.map((r) => r.tag));
    }
  }

  // Process incoming tweet
  private processTweet(streamResult: TweetV2SingleStreamResult): void {
    const tweet = streamResult.data;
    const includes = streamResult.includes;
    const matchingRules = streamResult.matching_rules || [];

    // Get author info
    const author = includes?.users?.find((u) => u.id === tweet.author_id);

    // Build raw tweet object
    const rawTweet: RawTweet = {
      source: 'TWITTER',
      timestamp: new Date(tweet.created_at || Date.now()),
      tweetId: tweet.id,
      authorId: tweet.author_id || '',
      authorUsername: author?.username || '',
      authorDisplayName: author?.name || '',
      text: tweet.text,
      isRetweet: tweet.referenced_tweets?.some((r) => r.type === 'retweeted') || false,
      isQuote: tweet.referenced_tweets?.some((r) => r.type === 'quoted') || false,
      isReply: tweet.referenced_tweets?.some((r) => r.type === 'replied_to') || false,
      replyCount: tweet.public_metrics?.reply_count || 0,
      retweetCount: tweet.public_metrics?.retweet_count || 0,
      likeCount: tweet.public_metrics?.like_count || 0,
      hashtags: tweet.entities?.hashtags?.map((h) => h.tag) || [],
      mentions: tweet.entities?.mentions?.map((m) => m.username) || [],
      urls: tweet.entities?.urls?.map((u) => u.expanded_url || u.url) || [],
      matchedRules: matchingRules.map((r) => ({
        id: r.id,
        tag: r.tag || '',
        value: '',
      })),
    };

    // Emit the tweet
    eventBus.emit('collector:tweet', rawTweet);

    this.totalCollections++;
    this.lastCollectionAt = new Date();

    this.logger.debug(`Tweet from @${rawTweet.authorUsername}: ${rawTweet.text.substring(0, 50)}...`);
  }

  // Fallback polling implementation (used if stream is disabled)
  protected async doCollect(): Promise<void> {
    // This is a fallback - streaming is preferred
    this.logger.warn('Using polling mode - filtered stream is recommended');

    const config = getConfig();
    const keywords = getKeywords();

    // Search for recent tweets with keywords
    const query = keywords.categories[AlertCategory.SECURITY]?.primary.slice(0, 3).join(' OR ') || '';

    if (!query) {
      return;
    }

    const result = await this.client.v2.search(query, {
      'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'entities'],
      'user.fields': ['username', 'name'],
      expansions: ['author_id'],
      max_results: 10,
    });

    for (const tweet of result.data?.data || []) {
      const author = result.includes?.users?.find((u) => u.id === tweet.author_id);

      const rawTweet: RawTweet = {
        source: 'TWITTER',
        timestamp: new Date(tweet.created_at || Date.now()),
        tweetId: tweet.id,
        authorId: tweet.author_id || '',
        authorUsername: author?.username || '',
        authorDisplayName: author?.name || '',
        text: tweet.text,
        isRetweet: false,
        isQuote: false,
        isReply: false,
        replyCount: tweet.public_metrics?.reply_count || 0,
        retweetCount: tweet.public_metrics?.retweet_count || 0,
        likeCount: tweet.public_metrics?.like_count || 0,
        hashtags: tweet.entities?.hashtags?.map((h) => h.tag) || [],
        mentions: tweet.entities?.mentions?.map((m) => m.username) || [],
        urls: tweet.entities?.urls?.map((u) => u.expanded_url || u.url) || [],
        matchedRules: [],
      };

      eventBus.emit('collector:tweet', rawTweet);
    }
  }

  // Utility to chunk array
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

export default TwitterCollector;
