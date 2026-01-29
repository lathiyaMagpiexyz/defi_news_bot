import { database } from '../Database.js';
import { createLogger } from '../../utils/logger.js';
import type { ProtocolState, TVLSnapshot } from '../../core/types/protocols.js';

const logger = createLogger('ProtocolRepository');

export class ProtocolRepository {
  // Get protocol state by slug
  get(slug: string): ProtocolState | null {
    const stmt = database.prepare(`
      SELECT * FROM protocol_state WHERE slug = ?
    `);

    const row = stmt.get(slug) as any;

    if (!row) {
      return null;
    }

    return {
      slug: row.slug,
      name: row.name,
      lastTvl: row.last_tvl,
      lastTvlByChain: row.last_tvl_by_chain,
      lastCheckedAt: new Date(row.last_checked_at),
      tvlHistory24h: row.tvl_history_24h,
      tvlHistory7d: row.tvl_history_7d,
    };
  }

  // Save or update protocol state
  upsert(
    slug: string,
    name: string,
    tvl: number,
    tvlByChain: Record<string, number>
  ): ProtocolState {
    const existing = this.get(slug);
    const now = Date.now();

    // Update TVL history
    let history24h: TVLSnapshot[] = [];
    let history7d: TVLSnapshot[] = [];

    if (existing) {
      try {
        history24h = JSON.parse(existing.tvlHistory24h);
        history7d = JSON.parse(existing.tvlHistory7d);
      } catch {
        // Invalid JSON, reset history
      }
    }

    // Add new snapshot
    const snapshot: TVLSnapshot = {
      timestamp: new Date(now),
      tvl,
      tvlByChain,
    };

    history24h.push(snapshot);
    history7d.push(snapshot);

    // Prune old snapshots
    const cutoff24h = now - 24 * 60 * 60 * 1000;
    const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;

    history24h = history24h.filter((s) => new Date(s.timestamp).getTime() > cutoff24h);
    history7d = history7d.filter((s) => new Date(s.timestamp).getTime() > cutoff7d);

    // Limit array sizes
    if (history24h.length > 288) {
      history24h = history24h.slice(-288); // ~5 min intervals for 24h
    }
    if (history7d.length > 2016) {
      history7d = history7d.slice(-2016); // ~5 min intervals for 7d
    }

    const stmt = database.prepare(`
      INSERT INTO protocol_state (slug, name, last_tvl, last_tvl_by_chain, last_checked_at, tvl_history_24h, tvl_history_7d)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        name = excluded.name,
        last_tvl = excluded.last_tvl,
        last_tvl_by_chain = excluded.last_tvl_by_chain,
        last_checked_at = excluded.last_checked_at,
        tvl_history_24h = excluded.tvl_history_24h,
        tvl_history_7d = excluded.tvl_history_7d,
        updated_at = unixepoch()
    `);

    stmt.run(
      slug,
      name,
      tvl,
      JSON.stringify(tvlByChain),
      now,
      JSON.stringify(history24h),
      JSON.stringify(history7d)
    );

    return {
      slug,
      name,
      lastTvl: tvl,
      lastTvlByChain: JSON.stringify(tvlByChain),
      lastCheckedAt: new Date(now),
      tvlHistory24h: JSON.stringify(history24h),
      tvlHistory7d: JSON.stringify(history7d),
    };
  }

  // Calculate TVL change percentage
  calculateTvlChange(slug: string, hoursAgo: 24 | 48 | 168 = 24): {
    previousTvl: number;
    currentTvl: number;
    changePercent: number;
    changeAbsolute: number;
  } | null {
    const state = this.get(slug);

    if (!state) {
      return null;
    }

    let history: TVLSnapshot[] = [];
    try {
      history =
        hoursAgo <= 24
          ? JSON.parse(state.tvlHistory24h)
          : JSON.parse(state.tvlHistory7d);
    } catch {
      return null;
    }

    if (history.length < 2) {
      return null;
    }

    const cutoff = Date.now() - hoursAgo * 60 * 60 * 1000;

    // Find the oldest snapshot within the time window
    const oldSnapshot = history.find(
      (s) => new Date(s.timestamp).getTime() >= cutoff
    );

    if (!oldSnapshot) {
      return null;
    }

    const currentTvl = state.lastTvl;
    const previousTvl = oldSnapshot.tvl;

    if (previousTvl === 0) {
      return null;
    }

    const changeAbsolute = currentTvl - previousTvl;
    const changePercent = (changeAbsolute / previousTvl) * 100;

    return {
      previousTvl,
      currentTvl,
      changePercent,
      changeAbsolute,
    };
  }

  // Get all protocols with significant TVL changes
  getSignificantChanges(
    minChangePercent: number,
    minTvlUsd: number,
    hoursAgo: 24 | 48 | 168 = 24
  ): Array<{
    slug: string;
    name: string;
    previousTvl: number;
    currentTvl: number;
    changePercent: number;
    changeAbsolute: number;
  }> {
    const stmt = database.prepare(`
      SELECT slug, name, last_tvl FROM protocol_state
      WHERE last_tvl >= ?
    `);

    const rows = stmt.all(minTvlUsd) as Array<{
      slug: string;
      name: string;
      last_tvl: number;
    }>;

    const results: Array<{
      slug: string;
      name: string;
      previousTvl: number;
      currentTvl: number;
      changePercent: number;
      changeAbsolute: number;
    }> = [];

    for (const row of rows) {
      const change = this.calculateTvlChange(row.slug, hoursAgo);

      if (change && Math.abs(change.changePercent) >= minChangePercent) {
        results.push({
          slug: row.slug,
          name: row.name,
          ...change,
        });
      }
    }

    // Sort by absolute change percent descending
    return results.sort(
      (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)
    );
  }

  // Get total protocol count
  getCount(): number {
    const stmt = database.prepare(`SELECT COUNT(*) as count FROM protocol_state`);
    const row = stmt.get() as { count: number };
    return row.count;
  }
}

// Export singleton instance
export const protocolRepository = new ProtocolRepository();
export default protocolRepository;
