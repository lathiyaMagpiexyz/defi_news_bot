import { createLogger } from '../../utils/logger.js';
import { getKeywords } from '../../config/index.js';
import { AlertCategory } from '../../core/types/alerts.js';
import type { RawTweet } from '../../core/types/sources.js';

const logger = createLogger('KeywordFilter');

export interface KeywordMatch {
  category: AlertCategory;
  score: number;
  matchedPrimary: string[];
  matchedSecondary: string[];
  matchedNegative: string[];
  isFromPriorityAccount: boolean;
}

export class KeywordFilter {
  // Match tweet against all category keywords
  matchTweet(tweet: RawTweet): KeywordMatch[] {
    const keywords = getKeywords();
    const matches: KeywordMatch[] = [];

    const textLower = tweet.text.toLowerCase();
    const authorLower = tweet.authorUsername.toLowerCase();

    for (const [categoryStr, categoryKeywords] of Object.entries(keywords.categories)) {
      const category = categoryStr as AlertCategory;

      // Check for negative keywords first (disqualifying)
      const matchedNegative = categoryKeywords.negative.filter((kw) =>
        textLower.includes(kw.toLowerCase())
      );

      // Check primary keywords
      const matchedPrimary = categoryKeywords.primary.filter((kw) =>
        textLower.includes(kw.toLowerCase())
      );

      // Check secondary keywords (for scoring boost)
      const matchedSecondary = categoryKeywords.secondary.filter((kw) =>
        textLower.includes(kw.toLowerCase())
      );

      // Check if from priority account
      const isFromPriorityAccount = categoryKeywords.accounts.some(
        (acc) => acc.toLowerCase() === authorLower
      );

      // Check hashtags
      const matchedHashtags = categoryKeywords.hashtags.filter((tag) => {
        const cleanTag = tag.replace('#', '').toLowerCase();
        return tweet.hashtags.some((h) => h.toLowerCase() === cleanTag);
      });

      // Calculate score
      if (matchedPrimary.length > 0 || isFromPriorityAccount) {
        let score = 0;

        // Primary keywords: +10 each
        score += matchedPrimary.length * 10;

        // Secondary keywords: +5 each
        score += matchedSecondary.length * 5;

        // Hashtag matches: +3 each
        score += matchedHashtags.length * 3;

        // Priority account: +20
        if (isFromPriorityAccount) {
          score += 20;
        }

        // Engagement boost
        if (tweet.retweetCount > 100) score += 5;
        if (tweet.likeCount > 500) score += 5;

        // Negative keywords: -50 each (can still match but lower score)
        score -= matchedNegative.length * 50;

        // Only include if score is positive and no critical negatives
        if (score > 0 && matchedNegative.length === 0) {
          matches.push({
            category,
            score,
            matchedPrimary,
            matchedSecondary,
            matchedNegative,
            isFromPriorityAccount,
          });
        }
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    if (matches.length > 0) {
      logger.debug(`Tweet matched ${matches.length} categories`, {
        author: tweet.authorUsername,
        topCategory: matches[0]?.category,
        topScore: matches[0]?.score,
      });
    }

    return matches;
  }

  // Check if text matches a specific category
  matchesCategory(text: string, category: AlertCategory): boolean {
    const keywords = getKeywords();
    const categoryKeywords = keywords.categories[category];

    if (!categoryKeywords) {
      return false;
    }

    const textLower = text.toLowerCase();

    // Check for negative keywords
    const hasNegative = categoryKeywords.negative.some((kw) =>
      textLower.includes(kw.toLowerCase())
    );

    if (hasNegative) {
      return false;
    }

    // Check for primary keywords
    return categoryKeywords.primary.some((kw) =>
      textLower.includes(kw.toLowerCase())
    );
  }
}

export const keywordFilter = new KeywordFilter();
export default keywordFilter;
