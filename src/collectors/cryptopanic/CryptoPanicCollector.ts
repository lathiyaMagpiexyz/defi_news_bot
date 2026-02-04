import { BaseCollector } from '../BaseCollector.js';
import { getRateLimiter } from '../../services/RateLimiter.js';
import { eventBus } from '../../core/events/EventBus.js';
import { getConfig } from '../../config/index.js';
import { AlertSource } from '../../core/types/alerts.js';
import type { RawCryptoPanicData, CryptoPanicPost } from '../../core/types/sources.js';

// CryptoPanic API response types
interface CryptoPanicAPIResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CryptoPanicAPIPost[];
}

interface CryptoPanicAPIPost {
  kind: 'news' | 'media';
  domain: string;
  votes: {
    negative: number;
    positive: number;
    important: number;
    liked: number;
    disliked: number;
    lol: number;
    toxic: number;
    saved: number;
    comments: number;
  };
  source: {
    title: string;
    region: string;
    domain: string;
    path: string | null;
  };
  title: string;
  published_at: string;
  slug: string;
  currencies?: Array<{
    code: string;
    title: string;
    slug: string;
    url: string;
  }>;
  id: number;
  url: string;
  created_at: string;
}

export class CryptoPanicCollector extends BaseCollector {
  readonly name = 'CryptoPanic';
  readonly source = AlertSource.CRYPTOPANIC;

  private rateLimiter = getRateLimiter('cryptopanic');
  private processedPostIds: Set<number> = new Set();
  private maxProcessedIds = 500;

  constructor() {
    const config = getConfig();
    super(config.collectors.cryptopanic.pollingIntervalMs);
  }

  protected async doCollect(): Promise<void> {
    const config = getConfig();
    const apiKey = config.collectors.cryptopanic.apiKey;

    if (!apiKey) {
      this.logger.warn('CryptoPanic API key not configured, skipping collection');
      return;
    }

    const currencies = config.collectors.cryptopanic.currencies.join(',');
    const filter = config.collectors.cryptopanic.filter;

    try {
      const posts = await this.fetchPosts(apiKey, currencies, filter);

      // Filter out already processed posts
      const newPosts = posts.filter((post) => !this.processedPostIds.has(post.id));

      if (newPosts.length === 0) {
        this.logger.debug('No new posts from CryptoPanic');
        return;
      }

      // Mark posts as processed
      for (const post of newPosts) {
        this.processedPostIds.add(post.id);
      }

      // Cleanup old IDs to prevent memory leak
      if (this.processedPostIds.size > this.maxProcessedIds) {
        const idsArray = Array.from(this.processedPostIds);
        this.processedPostIds = new Set(idsArray.slice(-Math.floor(this.maxProcessedIds / 2)));
      }

      // Transform to internal types
      const transformedPosts: CryptoPanicPost[] = newPosts.map((post) => ({
        id: post.id,
        title: post.title,
        publishedAt: new Date(post.published_at),
        url: post.url,
        domain: post.domain,
        currencies: post.currencies?.map((c) => ({ code: c.code, title: c.title })),
        votes: {
          positive: post.votes.positive,
          negative: post.votes.negative,
          important: post.votes.important,
          liked: post.votes.liked,
        },
        kind: post.kind,
      }));

      // Emit raw data event
      const rawData: RawCryptoPanicData = {
        source: 'CRYPTOPANIC',
        timestamp: new Date(),
        posts: transformedPosts,
      };

      eventBus.emit('collector:news', rawData);

      this.logger.info(`Collected ${transformedPosts.length} news posts from CryptoPanic`);
    } catch (error) {
      this.logger.error('Failed to fetch from CryptoPanic:', error);
      throw error;
    }
  }

  private async fetchPosts(
    apiKey: string,
    currencies: string,
    filter: string
  ): Promise<CryptoPanicAPIPost[]> {
    return this.rateLimiter.execute(async () => {
      const url = new URL('https://cryptopanic.com/api/v1/posts/');
      url.searchParams.set('auth_token', apiKey);
      url.searchParams.set('currencies', currencies);
      url.searchParams.set('filter', filter);
      url.searchParams.set('public', 'true');

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`CryptoPanic API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as CryptoPanicAPIResponse;
      return data.results || [];
    });
  }
}

export default CryptoPanicCollector;
