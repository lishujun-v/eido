import assert from "node:assert/strict";
import { test } from "node:test";
import { canAgentAccessKnowledgeSpace } from "../../src/knowledge/domain/access.ts";

const space = {
  id: "space-1",
  ownerUserId: "owner-1",
  name: "受限知识",
  description: "",
  domain: "测试",
  color: "#000000",
  agentIds: ["agent-allowed"],
  nodes: [],
  edges: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("knowledge spaces grant Agent access only through an explicit binding", () => {
  assert.equal(canAgentAccessKnowledgeSpace(space, "agent-allowed"), true);
  assert.equal(canAgentAccessKnowledgeSpace(space, "agent-other"), false);
  assert.equal(canAgentAccessKnowledgeSpace(space, ""), false);
  assert.equal(canAgentAccessKnowledgeSpace({ ...space, agentIds: [] }, "agent-allowed"), false);
});
