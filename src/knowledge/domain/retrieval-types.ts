/**
 * A deterministic, rebuildable unit used by the semantic index. The source of
 * truth remains `knowledge_spaces.json`; chunks are derived from its nodes.
 */
export type KnowledgeChunk = {
  id: string;
  ownerUserId: string;
  spaceId: string;
  nodeId: string;
  chunkIndex: number;
  text: string;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeEmbedding = {
  chunkId: string;
  model: string;
  dimensions: number;
  vector: Float32Array;
  normalized: true;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSemanticMatch = {
  chunk: KnowledgeChunk;
  score: number;
};

/** A semantic match after chunks belonging to the same knowledge node are merged. */
export type KnowledgeSemanticNodeMatch = {
  spaceId: string;
  spaceName: string;
  nodeId: string;
  title: string;
  type: string;
  score: number;
  matchedChunkIds: string[];
};

export type KnowledgeSemanticSearchResult = {
  matches: KnowledgeSemanticNodeMatch[];
  embeddingModel: string;
  /** Present when callers should fall back to lexical retrieval. */
  unavailableReason?: string;
};

export type KnowledgeRetrievalScoreBreakdown = {
  /** 原有关键词规则给出的原始分数。 */
  lexical: number;
  /** 向量余弦相似度；未命中时为 0。 */
  semantic: number;
  /** Reciprocal Rank Fusion 的最终排序分数。 */
  fusion: number;
  /** 阶段 4 的图关系扩展预留。 */
  graph: number;
  /** 可选 LLM 重排分数；默认不启用，也不会覆盖基础召回证据。 */
  rerank?: number;
};

/** A node-level result shared by lexical and hybrid retrieval. */
export type KnowledgeRetrievalMatch = {
  spaceId: string;
  spaceName: string;
  nodeId: string;
  title: string;
  type: string;
  summary: string;
  content: string;
  score: number;
  scoreBreakdown: KnowledgeRetrievalScoreBreakdown;
  matchedChunkIds: string[];
  matchedFields: string[];
  retrievalReasons: string[];
  /**
   * The edge sequence used to reach this result from a directly retrieved
   * anchor. It is omitted for direct lexical/semantic matches.
   */
  graphPath?: KnowledgeGraphPath[];
};

export type KnowledgeGraphPath = {
  edgeId: string;
  /** The edge's persisted source, regardless of traversal direction. */
  sourceNodeId: string;
  relation: string;
  /** The edge's persisted target, regardless of traversal direction. */
  targetNodeId: string;
  /** Whether traversal followed or reversed the persisted edge. */
  direction: "forward" | "reverse";
};

export type KnowledgeHybridSearchResult = {
  query: string;
  normalizedQuery: string;
  mode: "hybrid";
  matches: KnowledgeRetrievalMatch[];
  metadata: {
    searchedSpaceIds: string[];
    embeddingModel: string;
    candidateCount: number;
    elapsedMs: number;
    /** Present when results safely fell back to keyword retrieval. */
    semanticUnavailableReason?: string;
  };
};

export type KnowledgeGraphSearchResult = Omit<KnowledgeHybridSearchResult, "mode" | "metadata"> & {
  mode: "graph";
  metadata: KnowledgeHybridSearchResult["metadata"] & {
    anchorCount: number;
    expandedNodeCount: number;
  };
};

/** Public retrieval modes shared by the HTTP API, SDK, CLI and Agent tool. */
export type KnowledgeSearchMode = "lexical" | "semantic" | "hybrid" | "graph";

/** LLM is an opt-in refinement layer, never the source of truth for recall. */
export type KnowledgeLlmEnhancementMode = "off" | "auto" | "force";

export type KnowledgeLlmOptions = {
  /** `auto` only runs for ambiguous, complex, or low-confidence queries. */
  enhancement?: KnowledgeLlmEnhancementMode;
  /** Requires the server-side rerank feature switch; false by default. */
  rerank?: boolean;
};

export type KnowledgeSearchInput = {
  query: string;
  /** When supplied, the caller may search only these owned/bound spaces. */
  spaceIds?: string[];
  /** Applies the Agent-to-space binding rule before retrieval. */
  agentId?: string;
  mode?: KnowledgeSearchMode;
  topK?: number;
  /** Phase 4 supports one hop; retained in the contract for future expansion. */
  maxHops?: number;
  includeContent?: boolean;
  explain?: boolean;
  llm?: KnowledgeLlmOptions;
};

export type KnowledgeRetrievalResult = {
  query: string;
  normalizedQuery: string;
  mode: KnowledgeSearchMode;
  matches: KnowledgeRetrievalMatch[];
  metadata: {
    searchedSpaceIds: string[];
    embeddingModel?: string;
    candidateCount: number;
    elapsedMs: number;
    semanticUnavailableReason?: string;
    anchorCount?: number;
    expandedNodeCount?: number;
    llm?: {
      configured: boolean;
      attempted: boolean;
      reason?: string;
      rewrittenQuery?: string;
      subQueries?: string[];
      reranked?: boolean;
      unavailableReason?: string;
    };
  };
};

export type KnowledgeIndexStatus = {
  databasePath: string;
  schemaVersion: string | null;
  activeModel: string | null;
  dimensions: number | null;
  sourceChunkCount: number;
  indexedChunkCount: number;
  activeEmbeddingCount: number;
  pendingChunkCount: number;
  /** The latest background indexing failure. Source knowledge remains usable. */
  lastSyncError: string | null;
  lastSyncFailedAt: string | null;
};

export type KnowledgeIndexVerification = {
  valid: boolean;
  checkedChunkCount: number;
  checkedEmbeddingCount: number;
  issues: string[];
};

export type KnowledgeIndexSyncResult = {
  insertedChunkCount: number;
  updatedChunkCount: number;
  removedChunkCount: number;
  embeddedChunkCount: number;
  status: KnowledgeIndexStatus;
};
