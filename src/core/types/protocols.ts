// Protocol and chain domain types

export interface Protocol {
  id: string;
  name: string;
  slug: string;
  symbol?: string;
  chains: string[];
  category: string;
  tvl: number;
  tvlHistory: TVLSnapshot[];
  twitter?: string;
  coingeckoId?: string;
  lastUpdated: Date;
}

export interface TVLSnapshot {
  timestamp: Date;
  tvl: number;
  tvlByChain: Record<string, number>;
}

export interface Chain {
  id: string;
  name: string;
  chainId?: number;
  tvl: number;
  protocols: number;
  lastUpdated: Date;
}

// Token types
export interface Token {
  id: string;
  symbol: string;
  name: string;
  platforms: Record<string, string>;
  marketData?: MarketData;
  lastUpdated: Date;
}

export interface MarketData {
  currentPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  marketCap: number;
  marketCapRank?: number;
  volume24h: number;
  volumeChange24h?: number;
  circulatingSupply: number;
  totalSupply?: number;
  maxSupply?: number;
  ath: number;
  athDate: Date;
  atl: number;
  atlDate: Date;
}

// Database state types
export interface ProtocolState {
  slug: string;
  name: string;
  lastTvl: number;
  lastTvlByChain: string;
  lastCheckedAt: Date;
  tvlHistory24h: string;
  tvlHistory7d: string;
}

export interface UserSettings {
  chatId: string;
  subscribedCategories: string;
  customThresholds: string;
  isPaused: boolean;
  createdAt: Date;
  updatedAt: Date;
}
