// Raw data types from external sources

// DeFiLlama types
export interface RawTVLData {
  source: 'DEFILLAMA';
  timestamp: Date;
  protocols: DefiLlamaProtocol[];
  chains: DefiLlamaChain[];
}

export interface DefiLlamaProtocol {
  id: string;
  name: string;
  slug: string;
  tvl: number;
  chainTvls: Record<string, number>;
  change_1h?: number;
  change_1d?: number;
  change_7d?: number;
  category?: string;
  chains?: string[];
  twitter?: string;
  url?: string;
}

export interface DefiLlamaChain {
  name: string;
  tvl: number;
  tokenSymbol?: string;
}

// Twitter types
export interface RawTweet {
  source: 'TWITTER';
  timestamp: Date;
  tweetId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  text: string;
  isRetweet: boolean;
  isQuote: boolean;
  isReply: boolean;
  replyCount: number;
  retweetCount: number;
  likeCount: number;
  hashtags: string[];
  mentions: string[];
  urls: string[];
  matchedRules: TwitterRule[];
}

export interface TwitterRule {
  id: string;
  tag: string;
  value: string;
}

// CoinGecko types
export interface RawPriceData {
  source: 'COINGECKO';
  timestamp: Date;
  tokens: CoinGeckoToken[];
}

export interface CoinGeckoToken {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
  total_volume: number;
  circulating_supply: number;
  total_supply: number | null;
}

// Phase 2: CryptoPanic types
export interface RawCryptoPanicData {
  source: 'CRYPTOPANIC';
  timestamp: Date;
  posts: CryptoPanicPost[];
}

export interface CryptoPanicPost {
  id: number;
  title: string;
  publishedAt: Date;
  url: string;
  domain: string;
  currencies?: Array<{ code: string; title: string }>;
  votes: { positive: number; negative: number; important: number; liked: number };
  kind: 'news' | 'media';
}

// Phase 2: Snapshot types
export interface RawSnapshotData {
  source: 'SNAPSHOT';
  timestamp: Date;
  proposals: SnapshotProposal[];
}

export interface SnapshotProposal {
  id: string;
  title: string;
  body: string;
  start: number;
  end: number;
  state: 'active' | 'closed' | 'pending';
  space: { id: string; name: string };
  choices: string[];
  scores: number[];
  scores_total: number;
  author: string;
  link: string;
}

// Phase 2: Token Unlocks types
export interface RawTokenUnlocksData {
  source: 'TOKEN_UNLOCKS';
  timestamp: Date;
  unlocks: TokenUnlockEvent[];
}

export interface TokenUnlockEvent {
  project: string;
  symbol: string;
  unlockDate: Date;
  amount: number;
  usdValue: number;
  unlockType: 'cliff' | 'linear' | 'team' | 'investor' | 'ecosystem' | 'other';
  percentOfCirculating: number;
}

// Phase 2: L2Beat types
export interface RawL2BeatData {
  source: 'L2BEAT';
  timestamp: Date;
  projects: L2BeatProject[];
}

export interface L2BeatProject {
  id: string;
  name: string;
  slug: string;
  tvl: number;
  tvlChange7d: number;
  category: 'Optimistic Rollup' | 'ZK Rollup' | 'Validium' | 'Optimium' | 'Other';
  stage?: string;
}

// Union type for all raw data
export type RawData = RawTVLData | RawTweet | RawPriceData | RawCryptoPanicData | RawSnapshotData | RawTokenUnlocksData | RawL2BeatData;
