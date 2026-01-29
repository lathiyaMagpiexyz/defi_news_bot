import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
import { protocolRepository } from '../../storage/repositories/ProtocolRepository.js';
import {
  Alert,
  AlertCategory,
  AlertPriority,
  AlertSource,
} from '../../core/types/alerts.js';
import type { RawTVLData } from '../../core/types/sources.js';

const logger = createLogger('TVLAnalyzer');

export class TVLAnalyzer {
  // Analyze TVL data and generate alerts for significant changes
  analyze(data: RawTVLData): Alert[] {
    const config = getConfig();
    const categoryConfig = config.alerts.categories[AlertCategory.TVL_CHANGE];

    if (!categoryConfig.enabled) {
      return [];
    }

    const thresholds = categoryConfig.thresholds;
    const minChangePercent = thresholds['minChangePercent'] || 10;
    const minTvlUsd = thresholds['minTvlUsd'] || 1000000;
    const timeframeHours = (thresholds['timeframeHours'] as 24 | 48 | 168) || 24;

    // Get protocols with significant changes
    const significantChanges = protocolRepository.getSignificantChanges(
      minChangePercent,
      minTvlUsd,
      timeframeHours
    );

    const alerts: Alert[] = [];

    for (const change of significantChanges) {
      const isIncrease = change.changePercent > 0;
      const direction = isIncrease ? 'surge' : 'drop';
      const emoji = isIncrease ? '📈' : '📉';

      // Determine priority based on change magnitude
      let priority = AlertPriority.MEDIUM;
      if (Math.abs(change.changePercent) >= 50) {
        priority = AlertPriority.HIGH;
      } else if (Math.abs(change.changePercent) >= 100) {
        priority = AlertPriority.CRITICAL;
      }

      const alert: Alert = {
        id: uuidv4(),
        category: AlertCategory.TVL_CHANGE,
        priority,
        source: AlertSource.DEFILLAMA,
        title: `${emoji} TVL ${direction.toUpperCase()} - ${change.name}`,
        summary: `${change.name} TVL ${isIncrease ? 'increased' : 'decreased'} by ${Math.abs(change.changePercent).toFixed(1)}% in the last ${timeframeHours} hours.`,
        details: {
          tvlChange: {
            protocol: change.name,
            chain: 'All', // Multi-chain total
            previousTVL: change.previousTvl,
            currentTVL: change.currentTvl,
            changePercent: change.changePercent,
            changeAbsolute: change.changeAbsolute,
            timeframeHours,
          },
          sourceUrl: `https://defillama.com/protocol/${change.slug}`,
        },
        metadata: {
          defillamaSlug: change.slug,
          tags: ['tvl', change.slug, isIncrease ? 'inflow' : 'outflow'],
        },
        createdAt: new Date(),
      };

      alerts.push(alert);

      logger.info(
        `TVL alert: ${change.name} ${direction} ${Math.abs(change.changePercent).toFixed(1)}%`
      );
    }

    return alerts;
  }

  // Analyze chain-level TVL changes
  analyzeChains(data: RawTVLData): Alert[] {
    // This could be expanded to track chain-level TVL changes
    // For now, we focus on protocol-level analysis
    return [];
  }
}

export const tvlAnalyzer = new TVLAnalyzer();
export default tvlAnalyzer;
