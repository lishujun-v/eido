import { performance } from "node:perf_hooks";
import type {
  KnowledgeHybridSearchResult,
  KnowledgeRetrievalMatch,
} from "../domain/retrieval-types.ts";
import type { KnowledgeSpace } from "../domain/types.ts";
import { KnowledgeLexicalRetriever } from "./lexical-retriever.ts";
import { KnowledgeSemanticRetriever } from "./semantic-retriever.ts";

const RRF_K = 60;

/**
 * Combines exact lexical matches and semantic node candidates with reciprocal
 * rank fusion. RRF deliberately uses ranks, not incomparable raw scores, so
 * either source can contribute without hand-tuned score normalization.
 */
export class KnowledgeHybridRetriever {
  private readonly lexical: KnowledgeLexicalRetriever;
  private readonly semantic: Pick<KnowledgeSemanticRetriever, "search">;

  constructor(
    lexical: KnowledgeLexicalRetriever = new KnowledgeLexicalRetriever(),
    semantic: Pick<KnowledgeSemanticRetriever, "search"> = new KnowledgeSemanticRetriever(),
  ) {
    this.lexical = lexical;
    this.semantic = semantic;
  }

  async search(query: string, spaces: KnowledgeSpace[], topK = 6): Promise<KnowledgeHybridSearchResult> {
    const startedAt = performance.now();
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const limit = Math.max(1, Math.min(topK, 50));
    const candidateLimit = Math.max(limit * 4, 20);
    if (!normalizedQuery || spaces.length === 0) {
      return this.empty(query, normalizedQuery, spaces, startedAt, "");
    }

    const lexical = this.lexical.search(normalizedQuery, spaces, candidateLimit);
    const semantic = await this.semantic.search(query, spaces, candidateLimit);
    const byNode = new Map<string, KnowledgeRetrievalMatch>();
    const nodeByKey = new Map<string, { space: KnowledgeSpace; node: KnowledgeSpace["nodes"][number] }>(spaces.flatMap((space) => space.nodes.map((node) => [`${space.id}\u0000${node.id}`, { space, node }] as const)));

    lexical.forEach((match, index) => {
      byNode.set(key(match.spaceId, match.nodeId), {
        ...match,
        scoreBreakdown: { ...match.scoreBreakdown, fusion: rrf(index + 1) },
      });
    });
    semantic.matches.forEach((match, index) => {
      const nodeKey = key(match.spaceId, match.nodeId);
      const existing = byNode.get(nodeKey);
      if (existing) {
        existing.scoreBreakdown.semantic = match.score;
        existing.scoreBreakdown.fusion += rrf(index + 1);
        existing.matchedChunkIds = unique(match.matchedChunkIds);
        existing.retrievalReasons.push(`语义相似度：${match.score.toFixed(4)}`);
        return;
      }
      const source = nodeByKey.get(nodeKey);
      if (!source) return;
      byNode.set(nodeKey, {
        spaceId: match.spaceId,
        spaceName: match.spaceName,
        nodeId: match.nodeId,
        title: source.node.title,
        type: source.node.type,
        summary: source.node.summary,
        content: source.node.content,
        score: 0,
        scoreBreakdown: { lexical: 0, semantic: match.score, fusion: rrf(index + 1), graph: 0 },
        matchedChunkIds: unique(match.matchedChunkIds),
        matchedFields: [],
        retrievalReasons: [`语义相似度：${match.score.toFixed(4)}`],
      });
    });

    const matches = [...byNode.values()]
      .map((match) => ({
        ...match,
        score: match.scoreBreakdown.fusion,
        retrievalReasons: [...match.retrievalReasons, `RRF 融合：${match.scoreBreakdown.fusion.toFixed(6)}`],
      }))
      .sort((left, right) => right.score - left.score || right.scoreBreakdown.lexical - left.scoreBreakdown.lexical || right.scoreBreakdown.semantic - left.scoreBreakdown.semantic || left.nodeId.localeCompare(right.nodeId))
      .slice(0, limit);

    return {
      query,
      normalizedQuery,
      mode: "hybrid",
      matches,
      metadata: {
        searchedSpaceIds: spaces.map((space) => space.id),
        embeddingModel: semantic.embeddingModel,
        candidateCount: byNode.size,
        elapsedMs: performance.now() - startedAt,
        ...(semantic.unavailableReason ? { semanticUnavailableReason: semantic.unavailableReason } : {}),
      },
    };
  }

  private empty(query: string, normalizedQuery: string, spaces: KnowledgeSpace[], startedAt: number, embeddingModel: string): KnowledgeHybridSearchResult {
    return {
      query, normalizedQuery, mode: "hybrid", matches: [],
      metadata: { searchedSpaceIds: spaces.map((space) => space.id), embeddingModel, candidateCount: 0, elapsedMs: performance.now() - startedAt },
    };
  }
}

function key(spaceId: string, nodeId: string) {
  return `${spaceId}\u0000${nodeId}`;
}

function rrf(rank: number) {
  return 1 / (RRF_K + rank);
}

function unique(values: string[]) {
  return [...new Set(values)];
}
