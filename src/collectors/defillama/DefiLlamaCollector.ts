import { BaseCollector } from '../BaseCollector.js';
import { getDefillamaClient } from '../../services/HttpClient.js';
import { getRateLimiter } from '../../services/RateLimiter.js';
import { eventBus } from '../../core/events/EventBus.js';
import { protocolRepository } from '../../storage/repositories/ProtocolRepository.js';
import { getConfig } from '../../config/index.js';
import { AlertSource } from '../../core/types/alerts.js';
import type {
  RawTVLData,
  DefiLlamaProtocol,
  DefiLlamaChain,
} from '../../core/types/sources.js';

// DeFiLlama API response types
interface ProtocolsResponse {
  id: string;
  name: string;
  address?: string;
  symbol?: string;
  url?: string;
  description?: string;
  chain?: string;
  logo?: string;
  audits?: string;
  audit_note?: string;
  gecko_id?: string;
  cmcId?: string;
  category?: string;
  chains?: string[];
  module?: string;
  twitter?: string;
  forkedFrom?: string[];
  oracles?: string[];
  listedAt?: number;
  methodology?: string;
  slug: string;
  tvl: number;
  chainTvls: Record<string, number>;
  change_1h?: number;
  change_1d?: number;
  change_7d?: number;
  fdv?: number;
  mcap?: number;
}

interface ChainsResponse {
  gecko_id?: string;
  tvl: number;
  tokenSymbol?: string;
  cmcId?: string;
  name: string;
  chainId?: number;
}

export class DefiLlamaCollector extends BaseCollector {
  readonly name = 'DeFiLlama';
  readonly source = AlertSource.DEFILLAMA;

  private client = getDefillamaClient();
  private rateLimiter = getRateLimiter('defillama');

  constructor() {
    const config = getConfig();
    super(config.collectors.defillama.pollingIntervalMs);
  }

  protected async doCollect(): Promise<void> {
    const config = getConfig();

    // Fetch protocols and chains in parallel
    const [protocols, chains] = await Promise.all([
      config.collectors.defillama.endpoints.protocols
        ? this.fetchProtocols()
        : Promise.resolve([]),
      config.collectors.defillama.endpoints.chains
        ? this.fetchChains()
        : Promise.resolve([]),
    ]);

    // Transform to internal types
    const transformedProtocols: DefiLlamaProtocol[] = protocols.map((p) => ({
      id: p.id || p.slug,
      name: p.name,
      slug: p.slug,
      tvl: p.tvl || 0,
      chainTvls: p.chainTvls || {},
      change_1h: p.change_1h,
      change_1d: p.change_1d,
      change_7d: p.change_7d,
      category: p.category,
      chains: p.chains,
      twitter: p.twitter,
      url: p.url,
    }));

    const transformedChains: DefiLlamaChain[] = chains.map((c) => ({
      name: c.name,
      tvl: c.tvl || 0,
      tokenSymbol: c.tokenSymbol,
    }));

    // Store protocol states for TVL tracking
    const watchlist = config.collectors.defillama.watchlist;

    for (const protocol of transformedProtocols) {
      // Skip if watchlist is set and protocol is not in it
      if (watchlist.length > 0 && !watchlist.includes(protocol.slug)) {
        continue;
      }

      // Skip protocols with very low TVL
      if (protocol.tvl < 100000) {
        continue;
      }

      protocolRepository.upsert(
        protocol.slug,
        protocol.name,
        protocol.tvl,
        protocol.chainTvls
      );
    }

    // Emit raw data event
    const rawData: RawTVLData = {
      source: 'DEFILLAMA',
      timestamp: new Date(),
      protocols: transformedProtocols,
      chains: transformedChains,
    };

    eventBus.emit('collector:tvl', rawData);

    this.logger.info(
      `Collected ${protocols.length} protocols, ${chains.length} chains`
    );
  }

  private async fetchProtocols(): Promise<ProtocolsResponse[]> {
    return this.rateLimiter.execute(async () => {
      const data = await this.client.get<ProtocolsResponse[]>('/protocols');
      return data;
    });
  }

  private async fetchChains(): Promise<ChainsResponse[]> {
    return this.rateLimiter.execute(async () => {
      const data = await this.client.get<ChainsResponse[]>('/v2/chains');
      return data;
    });
  }
}

export default DefiLlamaCollector;
