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

// Union type for all raw data
export type RawData = RawTVLData | RawTweet | RawPriceData;
