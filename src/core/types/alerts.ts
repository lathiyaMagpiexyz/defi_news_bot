// Alert domain types

export enum AlertCategory {
  INCENTIVE = 'INCENTIVE',
  TVL_CHANGE = 'TVL_CHANGE',
  TOKEN_EVENT = 'TOKEN_EVENT',
  GOVERNANCE = 'GOVERNANCE',
  SECURITY = 'SECURITY',
  NARRATIVE = 'NARRATIVE',
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

  // Security-specific
  security?: SecurityDetails;

  // Narrative-specific
  narrative?: NarrativeDetails;

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

export interface SecurityDetails {
  severityLevel: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
  eventType: 'EXPLOIT' | 'PAUSE' | 'AUDIT_ISSUE' | 'ABNORMAL_BEHAVIOR' | 'RUG_WARNING';
  protocol?: string;
  estimatedLoss?: number;
  affectedChains?: string[];
  txHash?: string;
  auditFirm?: string;
}

export interface NarrativeDetails {
  narrativeType: 'NEW_SECTOR' | 'FUND_MENTION' | 'PROTOCOL_PIVOT' | 'TREND_EMERGENCE';
  sectorName?: string;
  relatedProtocols?: string[];
  fundName?: string;
  trendStrength?: number;
}

export interface AlertMetadata {
  protocolId?: string;
  chainId?: string;
  tokenIds?: string[];
  twitterHandle?: string;
  tweetId?: string;
  defillamaSlug?: string;
  coingeckoId?: string;
  tags: string[];
}

// Database record type
export interface AlertRecord {
  id: string;
  category: AlertCategory;
  priority: AlertPriority;
  source: AlertSource;
  title: string;
  summary: string;
  detailsJson: string;
  metadataJson: string;
  deduplicationKey: string;
  sentAt: Date;
  telegramMessageId?: number;
  chatId: string;
}
