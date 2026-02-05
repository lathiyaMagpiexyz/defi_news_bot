import type { Alert } from '../../core/types/alerts.js';
import type { RawTVLData } from '../../core/types/sources.js';

export class TVLAnalyzer {
  analyze(_data: RawTVLData): Alert[] {
    return [];
  }

  analyzeChains(_data: RawTVLData): Alert[] {
    return [];
  }
}

export const tvlAnalyzer = new TVLAnalyzer();
export default tvlAnalyzer;
