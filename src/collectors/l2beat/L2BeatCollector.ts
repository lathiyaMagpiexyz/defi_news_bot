import { BaseCollector } from '../BaseCollector.js';
import { getRateLimiter } from '../../services/RateLimiter.js';
import { eventBus } from '../../core/events/EventBus.js';
import { getConfig } from '../../config/index.js';
import { AlertSource } from '../../core/types/alerts.js';
import type { RawL2BeatData, L2BeatProject } from '../../core/types/sources.js';

// L2Beat API response types
interface L2BeatAPIProject {
  id: string;
  name: string;
  slug: string;
  category: string;
  provider?: string;
  purposes: string[];
  tvl: {
    value: number;
    displayValue: string;
  };
  tvlChange7d?: number;
  stage?: {
    stage: string;
    summary?: string[];
  };
}

interface L2BeatAPIResponse {
  projects: L2BeatAPIProject[];
}

export class L2BeatCollector extends BaseCollector {
  readonly name = 'L2Beat';
  readonly source = AlertSource.L2BEAT;

  private rateLimiter = getRateLimiter('l2beat');

  constructor() {
    const config = getConfig();
    super(config.collectors.l2beat.pollingIntervalMs);
  }

  protected async doCollect(): Promise<void> {
    const config = getConfig();
    const minTvlUsd = config.collectors.l2beat.minTvlUsd;

    try {
      const projects = await this.fetchProjects();

      // Filter by minimum TVL
      const filteredProjects = projects.filter((p) => p.tvl.value >= minTvlUsd);

      // Transform to internal types
      const transformedProjects: L2BeatProject[] = filteredProjects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        tvl: p.tvl.value,
        tvlChange7d: p.tvlChange7d || 0,
        category: this.mapCategory(p.category),
        stage: p.stage?.stage,
      }));

      // Emit raw data event
      const rawData: RawL2BeatData = {
        source: 'L2BEAT',
        timestamp: new Date(),
        projects: transformedProjects,
      };

      eventBus.emit('collector:l2', rawData);

      this.logger.info(`Collected ${transformedProjects.length} L2 projects from L2Beat`);
    } catch (error) {
      this.logger.error('Failed to fetch from L2Beat:', error);
      throw error;
    }
  }

  private async fetchProjects(): Promise<L2BeatAPIProject[]> {
    return this.rateLimiter.execute(async () => {
      // L2Beat provides a public API for scaling solutions
      const response = await fetch('https://l2beat.com/api/scaling/tvl');

      if (!response.ok) {
        throw new Error(`L2Beat API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as L2BeatAPIResponse;
      return data.projects || [];
    });
  }

  private mapCategory(
    category: string
  ): 'Optimistic Rollup' | 'ZK Rollup' | 'Validium' | 'Optimium' | 'Other' {
    const normalizedCategory = category.toLowerCase();

    if (normalizedCategory.includes('optimistic') || normalizedCategory.includes('op')) {
      return 'Optimistic Rollup';
    }
    if (normalizedCategory.includes('zk') || normalizedCategory.includes('zero knowledge')) {
      return 'ZK Rollup';
    }
    if (normalizedCategory.includes('validium')) {
      return 'Validium';
    }
    if (normalizedCategory.includes('optimium')) {
      return 'Optimium';
    }
    return 'Other';
  }
}

export default L2BeatCollector;
