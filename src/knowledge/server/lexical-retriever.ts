import { scoreKnowledgeNode } from "../domain/keyword-search.ts";
import type { KnowledgeRetrievalMatch } from "../domain/retrieval-types.ts";
import type { KnowledgeSpace } from "../domain/types.ts";

/**
 * The deterministic lexical side of hybrid retrieval. Keeping it isolated
 * ensures exact names and tags remain independently testable and usable as a
 * fallback whenever the embedding runtime is unavailable.
 */
export class KnowledgeLexicalRetriever {
  search(query: string, spaces: KnowledgeSpace[], limit = 20): KnowledgeRetrievalMatch[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery || spaces.length === 0) return [];

    return spaces
      .flatMap((space) => space.nodes.map((node) => {
        const result = scoreKnowledgeNode(space.id, node, normalizedQuery);
        return {
          spaceId: space.id,
          spaceName: space.name,
          nodeId: node.id,
          title: node.title,
          type: node.type,
          summary: node.summary,
          content: node.content,
          score: result.score,
          scoreBreakdown: { lexical: result.score, semantic: 0, fusion: 0, graph: 0 },
          matchedChunkIds: [],
          matchedFields: result.matchedFields,
          retrievalReasons: result.matchedFields.map((field) => `关键词匹配：${field}`),
          updatedAt: node.updatedAt,
        };
      }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score || right.updatedAt.localeCompare(left.updatedAt) || left.nodeId.localeCompare(right.nodeId))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map(({ updatedAt: _updatedAt, ...match }) => match);
  }
}
