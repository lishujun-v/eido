export type KnowledgeNode = {
  id: string;
  title: string;
  type: string;
  summary: string;
  content: string;
  tags: string[];
  aliases: string[];
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSpace = {
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  domain: string;
  color: string;
  agentIds: string[];
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSearchResult = {
  spaceId: string;
  spaceName?: string;
  node: KnowledgeNode;
  score: number;
  matchedFields: string[];
};

/** A node created in a batch. `ref` is a request-local name used by edges. */
export type KnowledgeBatchNodeInput = Partial<KnowledgeNode> & {
  ref: string;
};

/**
 * `source` and `target` may reference a batch node's `ref` or an existing
 * node id in the target space.
 */
export type KnowledgeBatchEdgeInput = {
  source: string;
  target: string;
  relation?: string;
};

export type KnowledgeBatchInput = {
  nodes: KnowledgeBatchNodeInput[];
  edges?: KnowledgeBatchEdgeInput[];
};

export type KnowledgeBatchResult = {
  space: KnowledgeSpace;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  refMap: Record<string, string>;
};

export type KnowledgeNodeUpdateInput = {
  nodeId: string;
  node: Partial<KnowledgeNode>;
};
