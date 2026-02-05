import { createLogger } from '../../utils/logger.js';
import type { Alert } from '../../core/types/alerts.js';
import type { RawTVLData } from '../../core/types/sources.js';

const logger = createLogger('TVLAnalyzer');

export class TVLAnalyzer {
  // Analyze TVL data and generate alerts for significant changes
  // Note: TVL change detection requires persistent state (e.g. DynamoDB) to compare previous vs current TVL.
  // Currently returns empty as no persistent storage is configured.
  analyze(_data: RawTVLData): Alert[] {
    return [];
  }

  // Analyze chain-level TVL changes
  analyzeChains(_data: RawTVLData): Alert[] {
    return [];
  }
}

export const tvlAnalyzer = new TVLAnalyzer();
export default tvlAnalyzer;
