import { BaseCollector } from '../BaseCollector.js';
import { getRateLimiter } from '../../services/RateLimiter.js';
import { eventBus } from '../../core/events/EventBus.js';
import { getConfig } from '../../config/index.js';
import { AlertSource } from '../../core/types/alerts.js';
import type { RawSnapshotData, SnapshotProposal } from '../../core/types/sources.js';

// GraphQL query for active proposals
const PROPOSALS_QUERY = `
  query Proposals($spaces: [String!], $state: String, $first: Int) {
    proposals(
      where: { space_in: $spaces, state: $state }
      orderBy: "created"
      orderDirection: desc
      first: $first
    ) {
      id
      title
      body
      start
      end
      state
      space {
        id
        name
      }
      choices
      scores
      scores_total
      author
      link
    }
  }
`;

interface GraphQLProposal {
  id: string;
  title: string;
  body: string;
  start: number;
  end: number;
  state: string;
  space: {
    id: string;
    name: string;
  };
  choices: string[];
  scores: number[];
  scores_total: number;
  author: string;
  link: string;
}

interface GraphQLResponse {
  data?: {
    proposals: GraphQLProposal[];
  };
  errors?: Array<{ message: string }>;
}

export class SnapshotCollector extends BaseCollector {
  readonly name = 'Snapshot';
  readonly source = AlertSource.SNAPSHOT;

  private rateLimiter = getRateLimiter('snapshot');
  private processedProposalIds: Set<string> = new Set();
  private maxProcessedIds = 200;

  constructor() {
    const config = getConfig();
    super(config.collectors.snapshot.pollingIntervalMs);
  }

  protected async doCollect(): Promise<void> {
    const config = getConfig();
    const watchedSpaces = config.collectors.snapshot.watchedSpaces;

    if (watchedSpaces.length === 0) {
      this.logger.debug('No Snapshot spaces configured, skipping collection');
      return;
    }

    try {
      const proposals = await this.fetchProposals(watchedSpaces);

      // Filter out already processed proposals
      const newProposals = proposals.filter((p) => !this.processedProposalIds.has(p.id));

      if (newProposals.length === 0) {
        this.logger.debug('No new proposals from Snapshot');
        return;
      }

      // Mark proposals as processed
      for (const proposal of newProposals) {
        this.processedProposalIds.add(proposal.id);
      }

      // Cleanup old IDs
      if (this.processedProposalIds.size > this.maxProcessedIds) {
        const idsArray = Array.from(this.processedProposalIds);
        this.processedProposalIds = new Set(idsArray.slice(-Math.floor(this.maxProcessedIds / 2)));
      }

      // Transform to internal types
      const transformedProposals: SnapshotProposal[] = newProposals.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body.substring(0, 500), // Truncate body
        start: p.start,
        end: p.end,
        state: this.mapState(p.state),
        space: {
          id: p.space.id,
          name: p.space.name,
        },
        choices: p.choices,
        scores: p.scores,
        scores_total: p.scores_total,
        author: p.author,
        link: p.link || `https://snapshot.org/#/${p.space.id}/proposal/${p.id}`,
      }));

      // Emit raw data event
      const rawData: RawSnapshotData = {
        source: 'SNAPSHOT',
        timestamp: new Date(),
        proposals: transformedProposals,
      };

      eventBus.emit('collector:governance', rawData);

      this.logger.info(`Collected ${transformedProposals.length} proposals from Snapshot`);
    } catch (error) {
      this.logger.error('Failed to fetch from Snapshot:', error);
      throw error;
    }
  }

  private async fetchProposals(
    spaces: string[]
  ): Promise<GraphQLProposal[]> {
    return this.rateLimiter.execute(async () => {
      const config = getConfig();
      const graphqlUrl = config.collectors.snapshot.graphqlUrl;

      const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: PROPOSALS_QUERY,
          variables: {
            spaces,
            state: 'active',
            first: 50,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Snapshot GraphQL error: ${response.status}`);
      }

      const result = (await response.json()) as GraphQLResponse;

      if (result.errors && result.errors.length > 0) {
        throw new Error(`Snapshot GraphQL errors: ${result.errors.map((e) => e.message).join(', ')}`);
      }

      return result.data?.proposals || [];
    });
  }

  private mapState(state: string): 'active' | 'closed' | 'pending' {
    switch (state.toLowerCase()) {
      case 'active':
        return 'active';
      case 'closed':
        return 'closed';
      case 'pending':
        return 'pending';
      default:
        return 'pending';
    }
  }
}

export default SnapshotCollector;
