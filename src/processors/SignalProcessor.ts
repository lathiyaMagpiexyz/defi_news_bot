import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import { eventBus } from '../core/events/EventBus.js';
import { getConfig, getKeywords } from '../config/index.js';
import { alertRepository } from '../storage/repositories/AlertRepository.js';
import { keywordFilter, type KeywordMatch } from './filters/KeywordFilter.js';
import { tvlAnalyzer } from './analyzers/TVLAnalyzer.js';
import {
  Alert,
  AlertCategory,
  AlertPriority,
  AlertSource,
} from '../core/types/alerts.js';
import type {
  RawTVLData,
  RawTweet,
  RawPriceData,
  RawCryptoPanicData,
  RawSnapshotData,
  RawTokenUnlocksData,
  RawL2BeatData,
} from '../core/types/sources.js';

const logger = createLogger('SignalProcessor');

export class SignalProcessor {
  private lastGlobalAlertTime = 0;
  private lastCategoryAlertTime: Map<AlertCategory, number> = new Map();

  constructor() {
    // Subscribe to raw data events
    eventBus.on('collector:tvl', (data) => this.processTVLData(data));
    eventBus.on('collector:tweet', (data) => this.processTweet(data));
    eventBus.on('collector:price', (data) => this.processPriceData(data));

    // Phase 2 event subscriptions
    eventBus.on('collector:news', (data) => this.processNewsData(data));
    eventBus.on('collector:governance', (data) => this.processGovernanceData(data));
    eventBus.on('collector:unlock', (data) => this.processUnlockData(data));
    eventBus.on('collector:l2', (data) => this.processL2Data(data));

    logger.info('SignalProcessor initialized');
  }

  // Process TVL data from DeFiLlama
  private async processTVLData(data: RawTVLData): Promise<void> {
    logger.debug(`Processing TVL data: ${data.protocols.length} protocols`);

    // Analyze for significant TVL changes
    const alerts = tvlAnalyzer.analyze(data);

    for (const alert of alerts) {
      await this.emitAlert(alert);
    }
  }

  // Process tweet from Twitter
  private async processTweet(tweet: RawTweet): Promise<void> {
    // Skip retweets
    if (tweet.isRetweet) {
      return;
    }

    // Match against keywords
    const matches = keywordFilter.matchTweet(tweet);

    if (matches.length === 0) {
      return;
    }

    // Take the highest scoring match
    const topMatch = matches[0];
    if (!topMatch) {
      return;
    }

    // Create alert based on category
    const alert = this.createTweetAlert(tweet, topMatch);

    if (alert) {
      await this.emitAlert(alert);
    }
  }

  // Process price data from CoinGecko
  private async processPriceData(data: RawPriceData): Promise<void> {
    logger.debug(`Processing price data: ${data.tokens.length} tokens`);

    // Price data is mainly for enrichment and future alerts
    // For now, we just store it via the collector
  }

  // Phase 2: Process news data from CryptoPanic
  private async processNewsData(data: RawCryptoPanicData): Promise<void> {
    logger.debug(`Processing news data: ${data.posts.length} posts`);

    for (const post of data.posts) {
      // Calculate importance score
      const importanceScore = post.votes.important + post.votes.positive - post.votes.negative;

      if (importanceScore < 5) {
        continue; // Skip low-importance news
      }

      const alert: Alert = {
        id: uuidv4(),
        category: AlertCategory.SECURITY, // News often relates to security
        priority: importanceScore >= 20 ? AlertPriority.HIGH : AlertPriority.MEDIUM,
        source: AlertSource.CRYPTOPANIC,
        title: `📰 NEWS - ${post.title.substring(0, 60)}${post.title.length > 60 ? '...' : ''}`,
        summary: post.title,
        details: {
          news: {
            title: post.title,
            source: post.domain,
            url: post.url,
            publishedAt: post.publishedAt,
            currencies: post.currencies?.map((c) => c.code),
            votes: {
              positive: post.votes.positive,
              negative: post.votes.negative,
              important: post.votes.important,
            },
          },
          sourceUrl: post.url,
        },
        metadata: {
          cryptopanicPostId: post.id,
          tags: ['news', post.domain, ...(post.currencies?.map((c) => c.code.toLowerCase()) || [])],
        },
        createdAt: new Date(),
      };

      await this.emitAlert(alert);
    }
  }

  // Phase 2: Process governance proposals from Snapshot
  private async processGovernanceData(data: RawSnapshotData): Promise<void> {
    logger.debug(`Processing governance data: ${data.proposals.length} proposals`);

    for (const proposal of data.proposals) {
      // Only alert on active proposals
      if (proposal.state !== 'active') {
        continue;
      }

      const alert: Alert = {
        id: uuidv4(),
        category: AlertCategory.GOVERNANCE,
        priority: AlertPriority.MEDIUM,
        source: AlertSource.SNAPSHOT,
        title: `🏛 GOVERNANCE - ${proposal.space.name}: ${proposal.title.substring(0, 40)}${proposal.title.length > 40 ? '...' : ''}`,
        summary: `New proposal in ${proposal.space.name}: "${proposal.title}"`,
        details: {
          proposal: {
            proposalId: proposal.id,
            space: proposal.space.id,
            spaceName: proposal.space.name,
            title: proposal.title,
            state: proposal.state,
            startTime: new Date(proposal.start * 1000),
            endTime: new Date(proposal.end * 1000),
            choices: proposal.choices,
            scores: proposal.scores,
            link: proposal.link,
          },
          sourceUrl: proposal.link,
        },
        metadata: {
          snapshotProposalId: proposal.id,
          snapshotSpace: proposal.space.id,
          tags: ['governance', 'snapshot', proposal.space.id],
        },
        createdAt: new Date(),
      };

      await this.emitAlert(alert);
    }
  }

  // Phase 2: Process token unlock data
  private async processUnlockData(data: RawTokenUnlocksData): Promise<void> {
    logger.debug(`Processing unlock data: ${data.unlocks.length} unlocks`);

    for (const unlock of data.unlocks) {
      const alert: Alert = {
        id: uuidv4(),
        category: AlertCategory.TOKEN_EVENT,
        priority: unlock.percentOfCirculating >= 5 ? AlertPriority.HIGH : AlertPriority.MEDIUM,
        source: AlertSource.TOKEN_UNLOCKS,
        title: `🔓 TOKEN UNLOCK - ${unlock.symbol}: $${this.formatNumber(unlock.usdValue)}`,
        summary: `${unlock.project} (${unlock.symbol}) unlocking ${unlock.percentOfCirculating.toFixed(1)}% of circulating supply`,
        details: {
          tokenUnlock: {
            project: unlock.project,
            symbol: unlock.symbol,
            unlockDate: unlock.unlockDate,
            amount: unlock.amount,
            usdValue: unlock.usdValue,
            unlockType: unlock.unlockType,
            percentOfCirculating: unlock.percentOfCirculating,
          },
          tokenEvent: {
            eventType: 'VC_UNLOCK',
            tokenSymbol: unlock.symbol,
            amount: unlock.amount,
            usdValue: unlock.usdValue,
            unlockDate: unlock.unlockDate,
          },
          sourceUrl: `https://token.unlocks.app/${unlock.project.toLowerCase()}`,
        },
        metadata: {
          tags: ['unlock', unlock.symbol.toLowerCase(), unlock.unlockType],
        },
        createdAt: new Date(),
      };

      await this.emitAlert(alert);
    }
  }

  // Phase 2: Process L2 TVL data from L2Beat
  private async processL2Data(data: RawL2BeatData): Promise<void> {
    logger.debug(`Processing L2 data: ${data.projects.length} projects`);

    const config = getConfig();
    const minChangePercent = config.collectors.l2beat.minChangePercent;

    for (const project of data.projects) {
      // Only alert on significant TVL changes
      if (Math.abs(project.tvlChange7d) < minChangePercent) {
        continue;
      }

      const changeDirection = project.tvlChange7d >= 0 ? '📈' : '📉';

      const alert: Alert = {
        id: uuidv4(),
        category: AlertCategory.TVL_CHANGE,
        priority: Math.abs(project.tvlChange7d) >= 20 ? AlertPriority.HIGH : AlertPriority.MEDIUM,
        source: AlertSource.L2BEAT,
        title: `${changeDirection} L2 TVL - ${project.name}: ${project.tvlChange7d >= 0 ? '+' : ''}${project.tvlChange7d.toFixed(1)}%`,
        summary: `${project.name} TVL ${project.tvlChange7d >= 0 ? 'increased' : 'decreased'} by ${Math.abs(project.tvlChange7d).toFixed(1)}% (7d)`,
        details: {
          l2Tvl: {
            l2Name: project.name,
            tvl: project.tvl,
            previousTvl: project.tvl / (1 + project.tvlChange7d / 100),
            changePercent: project.tvlChange7d,
            category: project.category,
            stage: project.stage,
          },
          sourceUrl: `https://l2beat.com/scaling/projects/${project.slug}`,
        },
        metadata: {
          l2beatProjectId: project.id,
          tags: ['l2', 'tvl', project.category.toLowerCase().replace(' ', '-')],
        },
        createdAt: new Date(),
      };

      await this.emitAlert(alert);
    }
  }

  // Create alert from tweet based on matched category
  private createTweetAlert(tweet: RawTweet, match: KeywordMatch): Alert | null {
    const categoryPriority = this.getCategoryPriority(match.category);

    // Build title based on category
    let title: string;
    switch (match.category) {
      case AlertCategory.INCENTIVE:
        title = `🎁 INCENTIVE SIGNAL - @${tweet.authorUsername}`;
        break;
      case AlertCategory.SECURITY:
        title = `🚨 SECURITY ALERT - @${tweet.authorUsername}`;
        break;
      case AlertCategory.TOKEN_EVENT:
        title = `🪙 TOKEN EVENT - @${tweet.authorUsername}`;
        break;
      case AlertCategory.GOVERNANCE:
        title = `🏛 GOVERNANCE UPDATE - @${tweet.authorUsername}`;
        break;
      case AlertCategory.NARRATIVE:
        title = `📊 NARRATIVE SIGNAL - @${tweet.authorUsername}`;
        break;
      case AlertCategory.TVL_CHANGE:
        title = `📈 TVL UPDATE - @${tweet.authorUsername}`;
        break;
      default:
        title = `📢 DEFI SIGNAL - @${tweet.authorUsername}`;
    }

    const alert: Alert = {
      id: uuidv4(),
      category: match.category,
      priority: categoryPriority,
      source: AlertSource.TWITTER,
      title,
      summary: tweet.text.substring(0, 280),
      details: {
        rawContent: tweet.text,
        sourceUrl: `https://twitter.com/${tweet.authorUsername}/status/${tweet.tweetId}`,
        incentiveType:
          match.category === AlertCategory.INCENTIVE
            ? this.detectIncentiveType(tweet.text)
            : undefined,
        security:
          match.category === AlertCategory.SECURITY
            ? {
                severityLevel: this.detectSecuritySeverity(tweet.text),
                eventType: this.detectSecurityEventType(tweet.text),
                protocol: this.extractProtocolName(tweet.text),
              }
            : undefined,
      },
      metadata: {
        twitterHandle: tweet.authorUsername,
        tweetId: tweet.tweetId,
        tags: [
          match.category.toLowerCase(),
          ...tweet.hashtags.slice(0, 3),
          match.isFromPriorityAccount ? 'priority' : '',
        ].filter(Boolean),
      },
      createdAt: new Date(),
    };

    // Boost priority for security alerts from trusted accounts
    if (match.category === AlertCategory.SECURITY && match.isFromPriorityAccount) {
      alert.priority = AlertPriority.CRITICAL;
    }

    return alert;
  }

  // Emit alert if it passes all checks
  private async emitAlert(alert: Alert): Promise<void> {
    const config = getConfig();

    // Check for duplicates
    if (alertRepository.isDuplicate(alert)) {
      logger.debug(`Duplicate alert filtered: ${alert.title}`);
      return;
    }

    // Check global cooldown
    const now = Date.now();
    if (now - this.lastGlobalAlertTime < config.alerts.globalCooldownMs) {
      logger.debug(`Global cooldown active, skipping: ${alert.title}`);
      return;
    }

    // Check category cooldown
    const categoryConfig = config.alerts.categories[alert.category];
    const lastCategoryTime = this.lastCategoryAlertTime.get(alert.category) || 0;

    if (now - lastCategoryTime < categoryConfig.cooldownMs) {
      logger.debug(`Category cooldown active for ${alert.category}, skipping: ${alert.title}`);
      return;
    }

    // Check if category is enabled
    if (!categoryConfig.enabled) {
      logger.debug(`Category ${alert.category} disabled, skipping: ${alert.title}`);
      return;
    }

    // Update cooldown timestamps
    this.lastGlobalAlertTime = now;
    this.lastCategoryAlertTime.set(alert.category, now);

    // Emit the alert
    eventBus.emit('signal:alert', alert);
    logger.info(`Alert emitted: [${alert.category}] ${alert.title}`);
  }

  // Helper methods
  private getCategoryPriority(category: AlertCategory): AlertPriority {
    const config = getConfig();
    return config.alerts.categories[category]?.priority || AlertPriority.MEDIUM;
  }

  private detectIncentiveType(text: string): 'AIRDROP' | 'POINTS' | 'SEASON' | 'SNAPSHOT' {
    const textLower = text.toLowerCase();

    if (textLower.includes('snapshot')) return 'SNAPSHOT';
    if (textLower.includes('season')) return 'SEASON';
    if (textLower.includes('points') || textLower.includes('xp')) return 'POINTS';
    return 'AIRDROP';
  }

  private detectSecuritySeverity(text: string): 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL' {
    const textLower = text.toLowerCase();

    if (textLower.includes('critical') || textLower.includes('drained') || textLower.includes('stolen')) {
      return 'CRITICAL';
    }
    if (textLower.includes('exploit') || textLower.includes('hack') || textLower.includes('attack')) {
      return 'HIGH';
    }
    if (textLower.includes('warning') || textLower.includes('suspicious') || textLower.includes('paused')) {
      return 'WARNING';
    }
    return 'INFO';
  }

  private detectSecurityEventType(text: string): 'EXPLOIT' | 'PAUSE' | 'AUDIT_ISSUE' | 'ABNORMAL_BEHAVIOR' | 'RUG_WARNING' {
    const textLower = text.toLowerCase();

    if (textLower.includes('rug') || textLower.includes('scam')) return 'RUG_WARNING';
    if (textLower.includes('exploit') || textLower.includes('hack') || textLower.includes('drained')) return 'EXPLOIT';
    if (textLower.includes('paused') || textLower.includes('pause')) return 'PAUSE';
    if (textLower.includes('audit')) return 'AUDIT_ISSUE';
    return 'ABNORMAL_BEHAVIOR';
  }

  private extractProtocolName(text: string): string | undefined {
    // Try to extract protocol name from common patterns
    const patterns = [
      /(?:on|at|from|@)\s+([A-Z][a-zA-Z0-9]+)/,
      /([A-Z][a-zA-Z0-9]+)\s+(?:protocol|finance|swap|lend)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  // Phase 2 helper methods
  private formatNumber(num: number): string {
    if (num >= 1e9) {
      return (num / 1e9).toFixed(2) + 'B';
    }
    if (num >= 1e6) {
      return (num / 1e6).toFixed(2) + 'M';
    }
    if (num >= 1e3) {
      return (num / 1e3).toFixed(2) + 'K';
    }
    return num.toFixed(2);
  }
}

// Export singleton instance
let signalProcessor: SignalProcessor | null = null;

export function getSignalProcessor(): SignalProcessor {
  if (!signalProcessor) {
    signalProcessor = new SignalProcessor();
  }
  return signalProcessor;
}

export default getSignalProcessor;
