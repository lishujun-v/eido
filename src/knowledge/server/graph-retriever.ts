import { performance } from "node:perf_hooks";
import type {
  KnowledgeGraphSearchResult,
  KnowledgeHybridSearchResult,
  KnowledgeRetrievalMatch,
} from "../domain/retrieval-types.ts";
import type { KnowledgeSpace } from "../domain/types.ts";
import { KnowledgeGraphExpander } from "./graph-expander.ts";
import { KnowledgeHybridRetriever } from "./hybrid-retriever.ts";

/**
 * Graph retrieval ranks direct hybrid matches first, then appends one-hop
 * neighbours using a decayed relation score. It intentionally remains an
 * internal service until the public API contract is introduced in phase 5.
 */
export class KnowledgeGraphRetriever {
  private readonly hybrid: Pick<KnowledgeHybridRetriever, "search">;
  private readonly expander: KnowledgeGraphExpander;

  constructor(
    hybrid: Pick<KnowledgeHybridRetriever, "search"> = new KnowledgeHybridRetriever(),
    expander = new KnowledgeGraphExpander(),
  ) {
    this.hybrid = hybrid;
    this.expander = expander;
  }

  async search(query: string, spaces: KnowledgeSpace[], topK = 6): Promise<KnowledgeGraphSearchResult> {
    const startedAt = performance.now();
    const limit = Math.max(1, Math.min(topK, 50));
    // Reserve roughly half of the response for graph-only neighbours. Without
    // an anchor budget, a small knowledge space can make every node a direct
    // semantic candidate and leave relationship expansion with nothing to add.
    const anchorLimit = Math.min(6, Math.max(1, Math.ceil(limit / 2)));
    const hybrid = await this.hybrid.search(query, spaces, anchorLimit);
    const expanded = this.expander.expand(hybrid.matches, spaces);
    const matches = mergeAndRank(hybrid.matches, expanded.map((item) => item.match), limit);

    return {
      query: hybrid.query,
      normalizedQuery: hybrid.normalizedQuery,
      mode: "graph",
      matches,
      metadata: {
        ...hybrid.metadata,
        candidateCount: hybrid.metadata.candidateCount + expanded.length,
        elapsedMs: performance.now() - startedAt,
        anchorCount: hybrid.matches.length,
        expandedNodeCount: expanded.length,
      },
    };
  }
}

function mergeAndRank(
  anchors: KnowledgeRetrievalMatch[],
  expanded: KnowledgeRetrievalMatch[],
  limit: number,
) {
  return [...anchors, ...expanded]
    .sort((left, right) => right.score - left.score || right.scoreBreakdown.fusion - left.scoreBreakdown.fusion || right.scoreBreakdown.graph - left.scoreBreakdown.graph || left.nodeId.localeCompare(right.nodeId))
    .slice(0, limit);
}
