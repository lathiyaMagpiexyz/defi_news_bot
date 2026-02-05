// Alert domain types

export enum AlertCategory {
  INCENTIVE = 'INCENTIVE',
  TVL_CHANGE = 'TVL_CHANGE',
  TOKEN_EVENT = 'TOKEN_EVENT',
  GOVERNANCE = 'GOVERNANCE',
  NARRATIVE = 'NARRATIVE',
  STABLECOIN_DEPEG = 'STABLECOIN_DEPEG',
  // Phase 2 categories
  LIQUIDATION = 'LIQUIDATION',
  GAS_PRICE = 'GAS_PRICE',
  DEX_VOLUME = 'DEX_VOLUME',
}

export enum AlertPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

export enum AlertSource {
  DEFILLAMA = 'DEFILLAMA',
  TWITTER = 'TWITTER',
  COINGECKO = 'COINGECKO',
  // Phase 2 sources
  CRYPTOPANIC = 'CRYPTOPANIC',
  SNAPSHOT = 'SNAPSHOT',
  TOKEN_UNLOCKS = 'TOKEN_UNLOCKS',
  L2BEAT = 'L2BEAT',
}

export interface Alert {
  id: string;
  category: AlertCategory;
  priority: AlertPriority;
  source: AlertSource;
  title: string;
  summary: string;
  details: AlertDetails;
  metadata: AlertMetadata;
  createdAt: Date;
  expiresAt?: Date;
}

export interface AlertDetails {
  // Incentive-specific
  incentiveType?: 'AIRDROP' | 'POINTS' | 'SEASON' | 'SNAPSHOT';
  programName?: string;

  // TVL-specific
  tvlChange?: TVLChangeDetails;

  // Token-specific
  tokenEvent?: TokenEventDetails;

  // Governance-specific
  governance?: GovernanceDetails;

  // Narrative-specific
  narrative?: NarrativeDetails;

  // Stablecoin de-peg specific
  stablecoinDepeg?: StablecoinDepegDetails;

  // Phase 2 detail types
  liquidation?: LiquidationDetails;
  gasPrice?: GasPriceDetails;
  dexVolume?: DEXVolumeDetails;
  news?: NewsDetails;
  proposal?: ProposalDetails;
  tokenUnlock?: TokenUnlockDetails;
  l2Tvl?: L2TvlDetails;

  // Raw content
  rawContent?: string;
  sourceUrl?: string;
}

export interface TVLChangeDetails {
  protocol: string;
  chain: string;
  previousTVL: number;
  currentTVL: number;
  changePercent: number;
  changeAbsolute: number;
  timeframeHours: 24 | 48 | 168;
}

export interface TokenEventDetails {
  eventType: 'LAUNCH' | 'EMISSION_START' | 'EMISSION_END' | 'VESTING_CLIFF' | 'VC_UNLOCK';
  tokenSymbol: string;
  tokenAddress?: string;
  chain?: string;
  amount?: number;
  usdValue?: number;
  unlockDate?: Date;
  vestingSchedule?: VestingInfo;
}

export interface VestingInfo {
  totalAmount: number;
  unlockedAmount: number;
  remainingAmount: number;
  nextUnlockDate?: Date;
  nextUnlockAmount?: number;
}

export interface GovernanceDetails {
  changeType: 'YIELD_PARAM' | 'COLLATERAL_RULE' | 'REWARD_MULTIPLIER' | 'FEE_CHANGE';
  protocol: string;
  parameterName: string;
  oldValue?: string | number;
  newValue?: string | number;
  proposalUrl?: string;
  effectiveDate?: Date;
}

export interface NarrativeDetails {
  narrativeType: 'NEW_SECTOR' | 'FUND_MENTION' | 'PROTOCOL_PIVOT' | 'TREND_EMERGENCE';
  sectorName?: string;
  relatedProtocols?: string[];
  fundName?: string;
  trendStrength?: number;
}

export interface StablecoinDepegDetails {
  stablecoin: string;
  symbol: string;
  currentPrice: number;
  expectedPrice: number;
  deviationPercent: number;
  direction: 'ABOVE' | 'BELOW';
}

// Phase 2 detail interfaces
export interface LiquidationDetails {
  protocol: string;
  chain: string;
  liquidator?: string;
  borrower?: string;
  collateralToken: string;
  debtToken: string;
  collateralAmount: number;
  debtAmount: number;
  usdValue: number;
  txHash?: string;
}

export interface GasPriceDetails {
  chain: string;
  currentGwei: number;
  avgGwei24h: number;
  percentIncrease: number;
  baseFee?: number;
  priorityFee?: number;
}

export interface DEXVolumeDetails {
  dex: string;
  chain: string;
  volume24h: number;
  previousVolume24h: number;
  percentChange: number;
  topPairs?: Array<{ pair: string; volume: number }>;
}

export interface NewsDetails {
  title: string;
  source: string;
  url: string;
  publishedAt: Date;
  sentiment?: 'positive' | 'negative' | 'neutral';
  currencies?: string[];
  votes?: { positive: number; negative: number; important: number };
}

export interface ProposalDetails {
  proposalId: string;
  space: string;
  spaceName: string;
  title: string;
  state: 'active' | 'closed' | 'pending';
  startTime: Date;
  endTime: Date;
  choices: string[];
  scores?: number[];
  quorum?: number;
  link: string;
}

export interface TokenUnlockDetails {
  project: string;
  symbol: string;
  unlockDate: Date;
  amount: number;
  usdValue: number;
  unlockType: 'cliff' | 'linear' | 'team' | 'investor' | 'ecosystem' | 'other';
  percentOfCirculating: number;
}

export interface L2TvlDetails {
  l2Name: string;
  tvl: number;
  previousTvl: number;
  changePercent: number;
  category: string;
  stage?: string;
}

export interface AlertMetadata {
  protocolId?: string;
  chainId?: string;
  tokenIds?: string[];
  twitterHandle?: string;
  tweetId?: string;
  defillamaSlug?: string;
  coingeckoId?: string;
  // Phase 2 metadata
  cryptopanicPostId?: number;
  snapshotProposalId?: string;
  snapshotSpace?: string;
  l2beatProjectId?: string;
  tags: string[];
}