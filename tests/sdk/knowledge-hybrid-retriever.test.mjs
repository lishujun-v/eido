import assert from "node:assert/strict";
import { test } from "node:test";
import { KnowledgeHybridRetriever } from "../../src/knowledge/server/hybrid-retriever.ts";
import { KnowledgeGraphRetriever } from "../../src/knowledge/server/graph-retriever.ts";

function node(id, title, { tags = [], aliases = [], summary = "", content = "" } = {}) {
  return {
    id, title, type: "知识点", summary, content, tags, aliases, x: 0, y: 0,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function space(nodes) {
  return {
    id: "space-1", ownerUserId: "owner-1", name: "宠物知识", description: "", domain: "宠物", color: "#000", agentIds: [], nodes, edges: [],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("hybrid retrieval fuses lexical and semantic ranks with explainable score breakdowns", async () => {
  const source = [space([
    node("exact", "阿比西尼亚猫", { tags: ["纯种猫"] }),
    node("semantic", "猫咪肠胃不适", { summary: "呕吐时应观察饮水和精神状态" }),
  ])];
  const retriever = new KnowledgeHybridRetriever(undefined, {
    async search() {
      return {
        embeddingModel: "test-model",
        matches: [
          { spaceId: "space-1", spaceName: "宠物知识", nodeId: "semantic", title: "猫咪肠胃不适", type: "知识点", score: 0.94, matchedChunkIds: ["chunk-1"] },
          { spaceId: "space-1", spaceName: "宠物知识", nodeId: "exact", title: "阿比西尼亚猫", type: "知识点", score: 0.88, matchedChunkIds: ["chunk-2"] },
        ],
      };
    },
  });

  const result = await retriever.search("阿比西尼亚猫", source, 6);
  assert.equal(result.mode, "hybrid");
  assert.equal(result.matches[0].nodeId, "exact", "exact lexical name must retain a strong RRF contribution");
  assert.equal(result.matches[0].scoreBreakdown.lexical, 8);
  assert.equal(result.matches[0].scoreBreakdown.semantic, 0.88);
  assert.equal(result.matches[0].matchedChunkIds[0], "chunk-2");
  assert.ok(result.matches[0].retrievalReasons.some((reason) => reason.startsWith("关键词匹配：title")));
  assert.ok(result.matches[0].retrievalReasons.some((reason) => reason.startsWith("语义相似度：")));
  assert.ok(result.matches[0].retrievalReasons.some((reason) => reason.startsWith("RRF 融合：")));
});

test("hybrid retrieval keeps lexical results when semantic retrieval is unavailable", async () => {
  const retriever = new KnowledgeHybridRetriever(undefined, {
    async search() {
      return { embeddingModel: "broken-model", matches: [], unavailableReason: "本地模型不可用" };
    },
  });
  const result = await retriever.search("阿比西尼亚猫", [space([node("exact", "阿比西尼亚猫")])]);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].nodeId, "exact");
  assert.equal(result.metadata.semanticUnavailableReason, "本地模型不可用");
});

test("hybrid retrieval does not turn an unrelated nearest vector into a result", async () => {
  const retriever = new KnowledgeHybridRetriever(undefined, {
    async search() {
      // The semantic retriever applies this gate in production.  Model the
      // post-gate contract here: a space may legitimately have no candidate.
      return { embeddingModel: "test-model", matches: [] };
    },
  });
  const result = await retriever.search("幼猫的饮食", [space([
    node("ai", "大语言模型", { summary: "基于大规模语料训练的生成式语言模型" }),
  ])]);
  assert.deepEqual(result.matches, []);
  assert.equal(result.metadata.candidateCount, 0);
});

test("graph retrieval adds one-hop neighbours with an explainable persisted path", async () => {
  const source = [space([
    node("disease", "猫咪肠胃不适"),
    node("advice", "呕吐护理建议"),
    node("unrelated", "犬类训练"),
  ])];
  source[0].edges = [{
    id: "edge-1", source: "disease", target: "advice", relation: "建议",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  }];
  const retriever = new KnowledgeGraphRetriever({
    async search() {
      return {
        query: "猫咪肠胃不适", normalizedQuery: "猫咪肠胃不适", mode: "hybrid",
        matches: [{
          spaceId: "space-1", spaceName: "宠物知识", nodeId: "disease", title: "猫咪肠胃不适", type: "知识点", summary: "", content: "", score: 0.03,
          scoreBreakdown: { lexical: 8, semantic: 0.8, fusion: 0.03, graph: 0 }, matchedChunkIds: ["chunk-1"], matchedFields: ["title"], retrievalReasons: ["关键词匹配：title"],
        }],
        metadata: { searchedSpaceIds: ["space-1"], embeddingModel: "test-model", candidateCount: 1, elapsedMs: 1 },
      };
    },
  });

  const result = await retriever.search("猫咪肠胃不适", source, 6);
  const related = result.matches.find((match) => match.nodeId === "advice");
  assert.equal(result.mode, "graph");
  assert.equal(result.metadata.anchorCount, 1);
  assert.equal(result.metadata.expandedNodeCount, 1);
  assert.equal(related?.graphPath?.[0].edgeId, "edge-1");
  assert.equal(related?.graphPath?.[0].sourceNodeId, "disease");
  assert.equal(related?.graphPath?.[0].targetNodeId, "advice");
  assert.ok(related?.retrievalReasons.some((reason) => reason.startsWith("关系扩展：由「猫咪肠胃不适」经「建议」")));
  assert.equal(related?.scoreBreakdown.graph, 0.03 * 0.9 * 0.55);
});

test("graph expansion permits reverse traversal only for bidirectional relations and stays bounded", async () => {
  const source = [space([
    node("category", "猫咪健康"), node("disease", "猫咪肠胃不适"), node("detail", "护理细节"),
  ])];
  source[0].edges = [
    { id: "belongs", source: "disease", target: "category", relation: "属于", createdAt: "", updatedAt: "" },
    { id: "advice", source: "disease", target: "detail", relation: "建议", createdAt: "", updatedAt: "" },
  ];
  const retriever = new KnowledgeGraphRetriever({
    async search() {
      return {
        query: "猫咪健康", normalizedQuery: "猫咪健康", mode: "hybrid", matches: [{
          spaceId: "space-1", spaceName: "宠物知识", nodeId: "category", title: "猫咪健康", type: "知识点", summary: "", content: "", score: 0.02,
          scoreBreakdown: { lexical: 8, semantic: 0, fusion: 0.02, graph: 0 }, matchedChunkIds: [], matchedFields: ["title"], retrievalReasons: [],
        }], metadata: { searchedSpaceIds: ["space-1"], embeddingModel: "", candidateCount: 1, elapsedMs: 0 },
      };
    },
  });
  const result = await retriever.search("猫咪健康", source, 6);
  const reversed = result.matches.find((match) => match.nodeId === "disease");
  assert.equal(reversed?.graphPath?.[0].direction, "reverse");
  assert.equal(result.matches.some((match) => match.nodeId === "detail"), false, "one-hop traversal must not continue through the expanded node");
});
