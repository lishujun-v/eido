import assert from "node:assert/strict";
import { test } from "node:test";
import { llmEnhancementReason, OpenAICompatibleKnowledgeLlmEnhancer } from "../../src/knowledge/server/llm-enhancer.ts";

function match({ lexical = 0 } = {}) {
  return { scoreBreakdown: { lexical, semantic: 0, fusion: 0, graph: 0 } };
}

test("LLM enhancement heuristic leaves simple exact lookups on the deterministic path", () => {
  assert.equal(llmEnhancementReason("猫咪呕吐", [match({ lexical: 8 })]), undefined);
  assert.equal(llmEnhancementReason("它老是吐怎么办", []), "指代不清");
  assert.equal(llmEnhancementReason("猫粮和鲜食怎么选，分别有什么利弊", [match()]), "复合问题");
  assert.equal(llmEnhancementReason("不认识的表达", [match()]), "低置信度候选");
});

test("OpenAI-compatible enhancer parses bounded planning and candidate-only reranking", async () => {
  const requests = [];
  const enhancer = new OpenAICompatibleKnowledgeLlmEnhancer({ baseUrl: "https://llm.example/v1", apiKey: "secret", model: "test", rerankEnabled: true }, async (_url, init) => {
    requests.push(JSON.parse(String(init.body)));
    const reply = requests.length === 1
      ? '{"rewrite":"猫咪频繁呕吐处理","subQueries":["猫咪呕吐危险信号","猫咪呕吐护理"]}'
      : '{"nodeIds":["allowed","forbidden"]}';
    return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), { status: 200 });
  });
  const plan = await enhancer.plan("它老是吐怎么办");
  assert.equal(plan.rewrittenQuery, "猫咪频繁呕吐处理");
  assert.equal(plan.subQueries.length, 2);
  const order = await enhancer.rerank("问题", [
    { nodeId: "allowed", spaceId: "s", spaceName: "s", title: "A", type: "", summary: "", content: "", score: 0, scoreBreakdown: { lexical: 0, semantic: 0, fusion: 0, graph: 0 }, matchedChunkIds: [], matchedFields: [], retrievalReasons: [] },
    { nodeId: "other", spaceId: "s", spaceName: "s", title: "B", type: "", summary: "", content: "", score: 0, scoreBreakdown: { lexical: 0, semantic: 0, fusion: 0, graph: 0 }, matchedChunkIds: [], matchedFields: [], retrievalReasons: [] },
  ]);
  assert.deepEqual(order, ["allowed"], "model cannot introduce a node outside the supplied candidate set");
  assert.equal(requests.length, 2);
});

test("LLM adapter surfaces provider failures so the retrieval service can safely fall back", async () => {
  const enhancer = new OpenAICompatibleKnowledgeLlmEnhancer({ baseUrl: "https://llm.example/v1", apiKey: "secret", model: "test", rerankEnabled: false }, async () => new Response("unavailable", { status: 503 }));
  await assert.rejects(enhancer.plan("它老是吐怎么办"), /503/);
});
