import { EventEmitter } from 'events';
import { createLogger } from '../../utils/logger.js';
import type { Alert, AlertCategory } from '../types/alerts.js';
import type {
  RawTVLData,
  RawTweet,
  RawPriceData,
  RawCryptoPanicData,
  RawSnapshotData,
  RawTokenUnlocksData,
  RawL2BeatData,
} from '../types/sources.js';

const logger = createLogger('EventBus');

// Event type definitions
export interface EventMap {
  // Raw data events from collectors
  'collector:tvl': RawTVLData;
  'collector:tweet': RawTweet;
  'collector:price': RawPriceData;
  // Phase 2 collector events
  'collector:news': RawCryptoPanicData;
  'collector:governance': RawSnapshotData;
  'collector:unlock': RawTokenUnlocksData;
  'collector:l2': RawL2BeatData;

  // Processed signal events
  'signal:alert': Alert;

  // Lifecycle events
  'collector:started': { name: string };
  'collector:stopped': { name: string };
  'collector:error': { name: string; error: Error };

  // Alert delivery events
  'alert:sent': { alertId: string; chatId: string; messageId?: number };
  'alert:failed': { alertId: string; chatId: string; error: Error };

  // System events
  'system:shutdown': void;
  'system:ready': void;
}

// Type-safe event emitter
class TypedEventEmitter extends EventEmitter {
  override emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): boolean {
    return super.emit(event as string, payload);
  }

  override on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return super.on(event as string, listener);
  }

  override once<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return super.once(event as string, listener);
  }

  override off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return super.off(event as string, listener);
  }
}

// Singleton event bus
class EventBus extends TypedEventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(50);

    // Log all events in debug mode
    if (process.env['LOG_LEVEL'] === 'debug') {
      this.onAny((event, payload) => {
        logger.debug(`Event: ${event}`, { payload: this.summarizePayload(payload) });
      });
    }
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  // Listen to all events (for debugging)
  private onAny(listener: (event: string, payload: unknown) => void): void {
    const originalEmit = this.emit.bind(this);
    this.emit = (<K extends keyof EventMap>(event: K, payload: EventMap[K]) => {
      listener(event as string, payload);
      return originalEmit(event, payload);
    }) as typeof this.emit;
  }

  // Summarize payload for logging (avoid huge log entries)
  private summarizePayload(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const obj = payload as Record<string, unknown>;

    // Summarize large arrays
    if (Array.isArray(obj)) {
      return `[Array(${obj.length})]`;
    }

    // Summarize known large objects
    if ('protocols' in obj && Array.isArray(obj.protocols)) {
      return { ...obj, protocols: `[${obj.protocols.length} protocols]` };
    }
    if ('tokens' in obj && Array.isArray(obj.tokens)) {
      return { ...obj, tokens: `[${obj.tokens.length} tokens]` };
    }
    // Phase 2 summaries
    if ('posts' in obj && Array.isArray(obj.posts)) {
      return { ...obj, posts: `[${obj.posts.length} posts]` };
    }
    if ('proposals' in obj && Array.isArray(obj.proposals)) {
      return { ...obj, proposals: `[${obj.proposals.length} proposals]` };
    }
    if ('unlocks' in obj && Array.isArray(obj.unlocks)) {
      return { ...obj, unlocks: `[${obj.unlocks.length} unlocks]` };
    }
    if ('projects' in obj && Array.isArray(obj.projects)) {
      return { ...obj, projects: `[${obj.projects.length} projects]` };
    }

    return payload;
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();
export default eventBus;
