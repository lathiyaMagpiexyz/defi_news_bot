import { BaseCollector } from '../BaseCollector.js';
import { eventBus } from '../../core/events/EventBus.js';
import { getConfig, getKeywords } from '../../config/index.js';
import { AlertSource, AlertCategory } from '../../core/types/alerts.js';
import type { RawTweet } from '../../core/types/sources.js';

interface RapidAPITweet {
  tweet_id?: string;
  text?: string;
  created_at?: string;
  author?: {
    id?: string;
    name?: string;
    screen_name?: string;
    followers_count?: number;
  };
  user?: {
    id?: string;
    name?: string;
    screen_name?: string;
    followers_count?: number;
  };
  retweet_count?: number;
  favorite_count?: number;
  reply_count?: number;
  entities?: {
    hashtags?: Array<{ text: string }>;
    user_mentions?: Array<{ screen_name: string }>;
    urls?: Array<{ expanded_url: string }>;
  };
}

interface RapidAPISearchResponse {
  timeline?: RapidAPITweet[];
  results?: RapidAPITweet[];
}

export class TwitterCollector extends BaseCollector {
  readonly name = 'Twitter';
  readonly source = AlertSource.TWITTER;

  private rapidApiKey: string;
  private rapidApiHost = 'twitter-api45.p.rapidapi.com';
  private processedTweetIds: Set<string> = new Set();
  private maxProcessedIds = 1000;

  constructor() {
    const config = getConfig();
    super(config.collectors.twitter.pollingIntervalMs || 120000); // 2 minutes default

    this.rapidApiKey = config.collectors.twitter.rapidApiKey || '';

    if (!this.rapidApiKey) {
      this.logger.warn('RapidAPI key not configured for Twitter collector');
    }
  }

  protected async doCollect(): Promise<void> {
    if (!this.rapidApiKey) {
      this.logger.warn('Skipping Twitter collection - RapidAPI key not configured');
      return;
    }

    const config = getConfig();
    const keywords = getKeywords();

    // Collect from priority accounts
    const priorityAccounts = config.collectors.twitter.priorityAccounts;

    for (const account of priorityAccounts.slice(0, 5)) { // Limit to avoid rate limits
      try {
        await this.collectFromAccount(account);
        // Small delay between requests to respect rate limits
        await this.delay(1000);
      } catch (error) {
        this.logger.error(`Failed to collect from @${account}:`, error);
      }
    }

    // Search for DeFi security keywords
    const securityKeywords = keywords.categories[AlertCategory.SECURITY]?.primary.slice(0, 3) || [];
    for (const keyword of securityKeywords) {
      try {
        await this.searchTweets(keyword);
        await this.delay(1000);
      } catch (error) {
        this.logger.error(`Failed to search for "${keyword}":`, error);
      }
    }

    // Cleanup old processed IDs
    if (this.processedTweetIds.size > this.maxProcessedIds) {
      const idsArray = Array.from(this.processedTweetIds);
      this.processedTweetIds = new Set(idsArray.slice(-500));
    }
  }

  private async collectFromAccount(username: string): Promise<void> {
    const url = `https://${this.rapidApiHost}/timeline.php?screenname=${username}&count=10`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': this.rapidApiKey,
        'X-RapidAPI-Host': this.rapidApiHost,
      },
    });

    if (!response.ok) {
      throw new Error(`RapidAPI request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as RapidAPISearchResponse;
    const tweets = data.timeline || data.results || [];

    for (const tweet of tweets) {
      this.processTweet(tweet, `account:${username}`);
    }

    this.logger.debug(`Collected ${tweets.length} tweets from @${username}`);
  }

  private async searchTweets(query: string): Promise<void> {
    const url = `https://${this.rapidApiHost}/search.php?query=${encodeURIComponent(query)}&search_type=Latest&count=10`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': this.rapidApiKey,
        'X-RapidAPI-Host': this.rapidApiHost,
      },
    });

    if (!response.ok) {
      throw new Error(`RapidAPI search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as RapidAPISearchResponse;
    const tweets = data.timeline || data.results || [];

    for (const tweet of tweets) {
      this.processTweet(tweet, `search:${query}`);
    }

    this.logger.debug(`Found ${tweets.length} tweets for query "${query}"`);
  }

  private processTweet(tweet: RapidAPITweet, matchedRule: string): void {
    const tweetId = tweet.tweet_id;

    if (!tweetId || this.processedTweetIds.has(tweetId)) {
      return; // Skip duplicates
    }

    this.processedTweetIds.add(tweetId);

    const author = tweet.author || tweet.user;

    const rawTweet: RawTweet = {
      source: 'TWITTER',
      timestamp: new Date(tweet.created_at || Date.now()),
      tweetId: tweetId,
      authorId: author?.id || '',
      authorUsername: author?.screen_name || '',
      authorDisplayName: author?.name || '',
      text: tweet.text || '',
      isRetweet: tweet.text?.startsWith('RT @') || false,
      isQuote: false,
      isReply: false,
      replyCount: tweet.reply_count || 0,
      retweetCount: tweet.retweet_count || 0,
      likeCount: tweet.favorite_count || 0,
      hashtags: tweet.entities?.hashtags?.map((h) => h.text) || [],
      mentions: tweet.entities?.user_mentions?.map((m) => m.screen_name) || [],
      urls: tweet.entities?.urls?.map((u) => u.expanded_url) || [],
      matchedRules: [
        {
          id: matchedRule,
          tag: matchedRule,
          value: matchedRule,
        },
      ],
    };

    // Skip retweets
    if (rawTweet.isRetweet) {
      return;
    }

    eventBus.emit('collector:tweet', rawTweet);

    this.logger.debug(`Tweet from @${rawTweet.authorUsername}: ${rawTweet.text.substring(0, 50)}...`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default TwitterCollector;
