import { BaseCollector } from '../BaseCollector.js';
import { getCoingeckoClient } from '../../services/HttpClient.js';
import { getRateLimiter } from '../../services/RateLimiter.js';
import { eventBus } from '../../core/events/EventBus.js';
import { database } from '../../storage/Database.js';
import { getConfig } from '../../config/index.js';
import { AlertSource } from '../../core/types/alerts.js';
import type { RawPriceData, CoinGeckoToken } from '../../core/types/sources.js';

// CoinGecko API response types
interface MarketDataResponse {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  roi: null | {
    times: number;
    currency: string;
    percentage: number;
  };
  last_updated: string;
}

export class CoinGeckoCollector extends BaseCollector {
  readonly name = 'CoinGecko';
  readonly source = AlertSource.COINGECKO;

  private client;
  private rateLimiter = getRateLimiter('coingecko');

  constructor() {
    const config = getConfig();
    super(config.collectors.coingecko.pollingIntervalMs);
    this.client = getCoingeckoClient(config.collectors.coingecko.apiKey);
  }

  protected async doCollect(): Promise<void> {
    const config = getConfig();
    const watchlistIds = config.collectors.coingecko.watchlistIds;

    if (watchlistIds.length === 0) {
      this.logger.debug('No tokens in watchlist, skipping collection');
      return;
    }

    // Fetch market data for watchlist tokens
    const marketData = await this.fetchMarketData(watchlistIds);

    // Transform to internal types
    const tokens: CoinGeckoToken[] = marketData.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      name: t.name,
      current_price: t.current_price,
      market_cap: t.market_cap,
      market_cap_rank: t.market_cap_rank,
      price_change_percentage_24h: t.price_change_percentage_24h,
      total_volume: t.total_volume,
      circulating_supply: t.circulating_supply,
      total_supply: t.total_supply,
    }));

    // Store token prices in database
    for (const token of tokens) {
      this.storeTokenPrice(token);
    }

    // Emit raw data event
    const rawData: RawPriceData = {
      source: 'COINGECKO',
      timestamp: new Date(),
      tokens,
    };

    eventBus.emit('collector:price', rawData);

    this.logger.info(`Collected price data for ${tokens.length} tokens`);
  }

  private async fetchMarketData(ids: string[]): Promise<MarketDataResponse[]> {
    return this.rateLimiter.execute(async () => {
      const idsParam = ids.join(',');
      const data = await this.client.get<MarketDataResponse[]>(
        `/coins/markets`,
        {
          params: {
            vs_currency: 'usd',
            ids: idsParam,
            order: 'market_cap_desc',
            per_page: 100,
            page: 1,
            sparkline: false,
          },
        }
      );
      return data;
    });
  }

  private storeTokenPrice(token: CoinGeckoToken): void {
    const stmt = database.prepare(`
      INSERT INTO token_prices (coingecko_id, symbol, name, current_price, price_change_24h, market_cap, last_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(coingecko_id) DO UPDATE SET
        symbol = excluded.symbol,
        name = excluded.name,
        current_price = excluded.current_price,
        price_change_24h = excluded.price_change_24h,
        market_cap = excluded.market_cap,
        last_updated_at = excluded.last_updated_at
    `);

    stmt.run(
      token.id,
      token.symbol,
      token.name,
      token.current_price,
      token.price_change_percentage_24h,
      token.market_cap,
      Date.now()
    );
  }
}

export default CoinGeckoCollector;
