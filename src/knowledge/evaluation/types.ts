import type { KnowledgeSpace } from "../domain/types";

export type RetrievalEvaluationCase = {
  id: string;
  /** A human-readable, migration-safe selector for the target knowledge space. */
  spaceName: string;
  query: string;
  agentId?: string;
  expectedNodeIds: string[];
  expectedRelatedNodeIds?: string[];
  forbiddenNodeIds?: string[];
};

export type RetrievalEvaluationSet = {
  version: 1;
  description?: string;
  cases: RetrievalEvaluationCase[];
};

export type RetrievalEvaluationCaseResult = {
  id: string;
  spaceName: string;
  query: string;
  expectedNodeIds: string[];
  returnedNodeIds: string[];
  firstRelevantRank: number | null;
  recallAt5: number;
  recallAt10: number;
  irrelevantResultRatio: number;
  latencyMs: number;
};

export type RetrievalEvaluationReport = {
  evaluatedAt: string;
  implementation: "keyword-baseline";
  spaces: Pick<KnowledgeSpace, "id" | "name">[];
  caseCount: number;
  recallAt5: number;
  recallAt10: number;
  meanReciprocalRank: number;
  emptyResultRate: number;
  irrelevantResultRatio: number;
  latencyMs: { p50: number; p95: number; max: number };
  cases: RetrievalEvaluationCaseResult[];
};
