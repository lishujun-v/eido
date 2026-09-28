import type { KnowledgeSpace } from "../domain/types.ts";
import type {
  KnowledgeSemanticNodeMatch,
  KnowledgeSemanticSearchResult,
} from "../domain/retrieval-types.ts";
import { LocalBgeSmallZhEmbeddingProvider, type EmbeddingProvider } from "./embedding-provider.ts";
import { SqliteKnowledgeVectorIndex, type KnowledgeVectorIndex } from "./vector-index.ts";

type IndexFactory = () => KnowledgeVectorIndex;

/**
 * A vector index always has a nearest neighbour, even when the query and the
 * knowledge space are about unrelated subjects.  Do not confuse that ordering
 * with a relevant result.  The value is deliberately conservative for the
 * locally bundled BGE model: it rejects the ~0.20--0.30 unrelated range while
 * retaining the ~0.50+ matches produced by the current knowledge corpus.
 */
export const MINIMUM_SEMANTIC_RELEVANCE = 0.42;

/**
 * Retrieves locally stored semantic vectors and merges chunks back to nodes.
 * It has no knowledge of HTTP, Agent identity, or a particular vector engine.
 */
export class KnowledgeSemanticRetriever {
  private readonly provider: EmbeddingProvider;
  private readonly createIndex: IndexFactory;

  constructor(
    provider: EmbeddingProvider = new LocalBgeSmallZhEmbeddingProvider(),
    createIndex: IndexFactory = () => new SqliteKnowledgeVectorIndex(),
  ) {
    this.provider = provider;
    this.createIndex = createIndex;
  }

  async search(query: string, spaces: KnowledgeSpace[], limit = 20): Promise<KnowledgeSemanticSearchResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || spaces.length === 0) return { matches: [], embeddingModel: this.provider.model };

    const index = this.createIndex();
    try {
      // A missed background job self-heals before it can expose stale chunks.
      const status = index.status(spaces, this.provider);
      if (status.pendingChunkCount > 0) await index.sync(spaces, this.provider);
      const [queryVector] = await this.provider.embed([normalizedQuery]);
      if (!queryVector || queryVector.length !== this.provider.dimensions) {
        throw new Error("Embedding Provider 没有返回有效的查询向量。");
      }
      const spaceById = new Map(spaces.map((space) => [space.id, space]));
      const ownerUserIds = new Set(spaces.map((space) => space.ownerUserId));
      if (ownerUserIds.size !== 1) throw new Error("语义检索一次只能处理同一用户的知识空间。");
      const matches = index.search(queryVector, this.provider.model, Math.max(limit * 4, 20), {
        ownerUserId: spaces[0].ownerUserId,
        spaceIds: spaces.map((space) => space.id),
      }).filter((match) => match.score >= MINIMUM_SEMANTIC_RELEVANCE);
      const nodes = new Map<string, KnowledgeSpace["nodes"][number]>(spaces.flatMap((space) => space.nodes.map((node) => [`${space.id}\u0000${node.id}`, node] as const)));
      const aggregated = new Map<string, KnowledgeSemanticNodeMatch>();
      for (const match of matches) {
        const space = spaceById.get(match.chunk.spaceId);
        const nodeKey = `${match.chunk.spaceId}\u0000${match.chunk.nodeId}`;
        const node = nodes.get(nodeKey);
        if (!space || !node) continue;
        const current = aggregated.get(nodeKey);
        if (!current) {
          aggregated.set(nodeKey, {
            spaceId: space.id,
            spaceName: space.name,
            nodeId: match.chunk.nodeId,
            title: node.title,
            type: node.type,
            score: match.score,
            matchedChunkIds: [match.chunk.id],
          });
        } else {
          current.score = Math.max(current.score, match.score);
          current.matchedChunkIds.push(match.chunk.id);
        }
      }
      return {
        matches: [...aggregated.values()]
          .sort((left, right) => right.score - left.score || left.nodeId.localeCompare(right.nodeId))
          .slice(0, Math.max(1, Math.min(limit, 100))),
        embeddingModel: this.provider.model,
      };
    } catch (error) {
      index.recordSyncFailure(error);
      return {
        matches: [],
        embeddingModel: this.provider.model,
        unavailableReason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      index.close();
    }
  }
}
