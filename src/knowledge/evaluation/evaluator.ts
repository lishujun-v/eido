import { performance } from "node:perf_hooks";
import { scoreKnowledgeNode } from "../domain/keyword-search.ts";
import type { KnowledgeSpace } from "../domain/types.ts";
import type {
  RetrievalEvaluationCase,
  RetrievalEvaluationCaseResult,
  RetrievalEvaluationReport,
} from "./types.ts";

export function evaluateKeywordBaseline(
  spaces: KnowledgeSpace[],
  cases: RetrievalEvaluationCase[],
  now = () => new Date().toISOString(),
): RetrievalEvaluationReport {
  const evaluatedSpaces = new Map(spaces.map((space) => [space.name, space]));
  if (evaluatedSpaces.size !== spaces.length) {
    throw new Error("评测空间名称必须唯一；请通过 --owner 缩小评测范围。");
  }
  const results = cases.map((evaluationCase) => evaluateCase(evaluatedSpaces, evaluationCase));
  const count = results.length;
  const mean = (values: number[]) => count === 0 ? 0 : values.reduce((total, value) => total + value, 0) / count;
  const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);

  return {
    evaluatedAt: now(),
    implementation: "keyword-baseline",
    spaces: spaces.map(({ id, name }) => ({ id, name })),
    caseCount: count,
    recallAt5: mean(results.map((result) => result.recallAt5)),
    recallAt10: mean(results.map((result) => result.recallAt10)),
    meanReciprocalRank: mean(results.map((result) => result.firstRelevantRank ? 1 / result.firstRelevantRank : 0)),
    emptyResultRate: mean(results.map((result) => result.returnedNodeIds.length === 0 ? 1 : 0)),
    irrelevantResultRatio: mean(results.map((result) => result.irrelevantResultRatio)),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: latencies.at(-1) ?? 0,
    },
    cases: results,
  };
}

function evaluateCase(
  spacesByName: Map<string, KnowledgeSpace>,
  evaluationCase: RetrievalEvaluationCase,
): RetrievalEvaluationCaseResult {
  const space = spacesByName.get(evaluationCase.spaceName);
  if (!space) throw new Error(`评测空间不存在：${evaluationCase.spaceName}（${evaluationCase.id}）`);
  const knownNodeIds = new Set(space.nodes.map((node) => node.id));
  const missingExpectedNodeId = evaluationCase.expectedNodeIds.find((nodeId) => !knownNodeIds.has(nodeId));
  if (missingExpectedNodeId) {
    throw new Error(`评测节点不存在：${missingExpectedNodeId}（${evaluationCase.id}）`);
  }
  const startedAt = performance.now();
  const normalizedQuery = evaluationCase.query.trim().toLocaleLowerCase();
  const returned = space.nodes
    .map((node) => scoreKnowledgeNode(space.id, node, normalizedQuery))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || b.node.updatedAt.localeCompare(a.node.updatedAt));
  const latencyMs = performance.now() - startedAt;
  const returnedNodeIds = returned.map((result) => result.node.id);
  const expected = new Set(evaluationCase.expectedNodeIds);
  const firstRelevantIndex = returnedNodeIds.findIndex((nodeId) => expected.has(nodeId));
  const relevantAt = (limit: number) => returnedNodeIds.slice(0, limit).filter((nodeId) => expected.has(nodeId)).length;
  const denominator = evaluationCase.expectedNodeIds.length;
  const topTen = returnedNodeIds.slice(0, 10);

  return {
    id: evaluationCase.id,
    spaceName: space.name,
    query: evaluationCase.query,
    expectedNodeIds: evaluationCase.expectedNodeIds,
    returnedNodeIds,
    firstRelevantRank: firstRelevantIndex < 0 ? null : firstRelevantIndex + 1,
    recallAt5: denominator === 0 ? 1 : relevantAt(5) / denominator,
    recallAt10: denominator === 0 ? 1 : relevantAt(10) / denominator,
    irrelevantResultRatio: topTen.length === 0 ? 0 : topTen.filter((nodeId) => !expected.has(nodeId)).length / topTen.length,
    latencyMs,
  };
}

function percentile(values: number[], quantile: number) {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)];
}
