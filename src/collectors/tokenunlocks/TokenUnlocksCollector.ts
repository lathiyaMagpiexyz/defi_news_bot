import { BaseCollector } from '../BaseCollector.js';
import { getRateLimiter } from '../../services/RateLimiter.js';
import { eventBus } from '../../core/events/EventBus.js';
import { getConfig } from '../../config/index.js';
import { AlertSource } from '../../core/types/alerts.js';
import type { RawTokenUnlocksData, TokenUnlockEvent } from '../../core/types/sources.js';

// Token Unlocks API response types
interface TokenUnlocksAPIResponse {
  unlocks: TokenUnlocksAPIEvent[];
}

interface TokenUnlocksAPIEvent {
  project: string;
  symbol: string;
  unlock_date: string;
  amount: number;
  usd_value: number;
  unlock_type: string;
  percent_of_circulating: number;
}

export class TokenUnlocksCollector extends BaseCollector {
  readonly name = 'TokenUnlocks';
  readonly source = AlertSource.TOKEN_UNLOCKS;

  private rateLimiter = getRateLimiter('tokenUnlocks');
  private processedUnlockIds: Set<string> = new Set();
  private maxProcessedIds = 200;

  constructor() {
    const config = getConfig();
    super(config.collectors.tokenUnlocks.pollingIntervalMs);
  }

  protected async doCollect(): Promise<void> {
    const config = getConfig();
    const apiKey = config.collectors.tokenUnlocks.apiKey;
    const minUnlockValueUsd = config.collectors.tokenUnlocks.minUnlockValueUsd;
    const daysAhead = config.collectors.tokenUnlocks.daysAhead;

    if (!apiKey) {
      this.logger.warn('Token Unlocks API key not configured, skipping collection');
      return;
    }

    try {
      const unlocks = await this.fetchUpcomingUnlocks(apiKey, daysAhead);

      // Filter by minimum value
      const filteredUnlocks = unlocks.filter((u) => u.usd_value >= minUnlockValueUsd);

      // Create unique ID for each unlock
      const getUnlockId = (u: TokenUnlocksAPIEvent) =>
        `${u.project}-${u.symbol}-${u.unlock_date}-${u.amount}`;

      // Filter out already processed unlocks
      const newUnlocks = filteredUnlocks.filter((u) => !this.processedUnlockIds.has(getUnlockId(u)));

      if (newUnlocks.length === 0) {
        this.logger.debug('No new token unlocks');
        return;
      }

      // Mark unlocks as processed
      for (const unlock of newUnlocks) {
        this.processedUnlockIds.add(getUnlockId(unlock));
      }

      // Cleanup old IDs
      if (this.processedUnlockIds.size > this.maxProcessedIds) {
        const idsArray = Array.from(this.processedUnlockIds);
        this.processedUnlockIds = new Set(idsArray.slice(-Math.floor(this.maxProcessedIds / 2)));
      }

      // Transform to internal types
      const transformedUnlocks: TokenUnlockEvent[] = newUnlocks.map((u) => ({
        project: u.project,
        symbol: u.symbol,
        unlockDate: new Date(u.unlock_date),
        amount: u.amount,
        usdValue: u.usd_value,
        unlockType: this.mapUnlockType(u.unlock_type),
        percentOfCirculating: u.percent_of_circulating,
      }));

      // Emit raw data event
      const rawData: RawTokenUnlocksData = {
        source: 'TOKEN_UNLOCKS',
        timestamp: new Date(),
        unlocks: transformedUnlocks,
      };

      eventBus.emit('collector:unlock', rawData);

      this.logger.info(`Collected ${transformedUnlocks.length} upcoming token unlocks`);
    } catch (error) {
      this.logger.error('Failed to fetch from Token Unlocks:', error);
      throw error;
    }
  }

  private async fetchUpcomingUnlocks(
    apiKey: string,
    daysAhead: number
  ): Promise<TokenUnlocksAPIEvent[]> {
    return this.rateLimiter.execute(async () => {
      const config = getConfig();
      const baseUrl = config.collectors.tokenUnlocks.baseUrl;

      // Calculate date range
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + daysAhead);

      const startDateStr = startDate.toISOString().split('T')[0] || '';
      const endDateStr = endDate.toISOString().split('T')[0] || '';

      const url = new URL(`${baseUrl}/unlocks`);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('start_date', startDateStr);
      url.searchParams.set('end_date', endDateStr);

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`Token Unlocks API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as TokenUnlocksAPIResponse;
      return data.unlocks || [];
    });
  }

  private mapUnlockType(
    type: string
  ): 'cliff' | 'linear' | 'team' | 'investor' | 'ecosystem' | 'other' {
    const normalizedType = type.toLowerCase();

    if (normalizedType.includes('cliff')) return 'cliff';
    if (normalizedType.includes('linear')) return 'linear';
    if (normalizedType.includes('team')) return 'team';
    if (normalizedType.includes('investor') || normalizedType.includes('vc')) return 'investor';
    if (normalizedType.includes('ecosystem') || normalizedType.includes('community')) return 'ecosystem';
    return 'other';
  }
}

export default TokenUnlocksCollector;
