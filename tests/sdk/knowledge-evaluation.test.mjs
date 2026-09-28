import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateKeywordBaseline } from "../../src/knowledge/evaluation/evaluator.ts";

function node(id, title, tags = []) {
  return {
    id,
    title,
    type: "知识点",
    summary: "",
    content: "",
    tags,
    aliases: [],
    x: 0,
    y: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function space(id, name, nodes) {
  return {
    id,
    ownerUserId: "owner-1",
    name,
    description: "",
    domain: "测试",
    color: "#000000",
    agentIds: [],
    nodes,
    edges: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("keyword evaluation reports repeatable recall, ranking and empty-result metrics", () => {
  const report = evaluateKeywordBaseline(
    [
      space("legal", "法律知识", [node("contract", "合同制度", ["合同履行"])]),
      space("ai", "AI 知识", [node("rag", "检索增强生成")]),
      space("pet", "宠物知识", [node("cat", "猫咪饲养", ["护理"])]),
    ],
    [
      { id: "legal", spaceName: "法律知识", query: "合同履行", expectedNodeIds: ["contract"] },
      { id: "ai", spaceName: "AI 知识", query: "检索增强生成", expectedNodeIds: ["rag"] },
      { id: "pet", spaceName: "宠物知识", query: "犬类", expectedNodeIds: ["cat"] },
    ],
    () => "2026-09-20T00:00:00.000Z",
  );

  assert.equal(report.implementation, "keyword-baseline");
  assert.equal(report.caseCount, 3);
  assert.equal(report.recallAt5, 2 / 3);
  assert.equal(report.meanReciprocalRank, 2 / 3);
  assert.equal(report.emptyResultRate, 1 / 3);
  assert.equal(report.cases[2].firstRelevantRank, null);
});

test("keyword evaluation rejects a stale expected node id", () => {
  assert.throws(
    () => evaluateKeywordBaseline(
      [space("pet", "宠物知识", [node("cat", "猫咪饲养")])],
      [{ id: "stale", spaceName: "宠物知识", query: "猫咪", expectedNodeIds: ["removed"] }],
    ),
    /评测节点不存在/,
  );
});
