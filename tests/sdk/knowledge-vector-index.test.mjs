import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SqliteKnowledgeVectorIndex, createKnowledgeChunks } from "../../src/knowledge/server/vector-index.ts";
import { KnowledgeSemanticRetriever, MINIMUM_SEMANTIC_RELEVANCE } from "../../src/knowledge/server/semantic-retriever.ts";

const provider = {
  model: "test-embedding-v1",
  dimensions: 3,
  async embed(texts) {
    return texts.map((text) => {
      const vector = text.includes("猫") ? [1, 0, 0] : text.includes("狗") ? [0, 1, 0] : [0, 0, 1];
      return Float32Array.from(vector);
    });
  },
};

function space(nodes) {
  return {
    id: "space-1", ownerUserId: "owner-1", name: "宠物知识", description: "", domain: "宠物", color: "#000", agentIds: [], nodes, edges: [],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function node(id, title, content = title) {
  return {
    id, title, type: "知识点", summary: "", content, tags: [], aliases: [], x: 0, y: 0,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("SQLite index persists normalized Float32 embeddings and incrementally synchronizes chunks", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eido-index-"));
  const index = new SqliteKnowledgeVectorIndex(path.join(directory, "knowledge_index.sqlite"));
  try {
    const source = [space([node("cat", "猫咪护理"), node("dog", "狗狗护理")])];
    assert.equal(createKnowledgeChunks(source).length, 2);
    const first = await index.sync(source, provider);
    assert.deepEqual({ inserted: first.insertedChunkCount, embedded: first.embeddedChunkCount }, { inserted: 2, embedded: 2 });
    assert.equal(first.status.pendingChunkCount, 0);
    assert.equal(index.verify(source, provider).valid, true);

    const results = index.search(Float32Array.from([1, 0, 0]), provider.model);
    assert.equal(results[0].chunk.nodeId, "cat");
    assert.ok(results[0].score > results[1].score);

    const changed = [space([node("cat", "猫咪护理", "猫咪健康和日常护理"), node("dog", "狗狗护理")])];
    const second = await index.sync(changed, provider);
    assert.deepEqual({ updated: second.updatedChunkCount, embedded: second.embeddedChunkCount }, { updated: 1, embedded: 1 });
    assert.equal(index.verify(changed, provider).valid, true);

    const removed = [space([node("dog", "狗狗护理")])];
    const third = await index.sync(removed, provider);
    assert.equal(third.removedChunkCount, 1);
    assert.equal(index.search(Float32Array.from([1, 0, 0]), provider.model).some((match) => match.chunk.nodeId === "cat"), false);
    assert.equal(index.verify(removed, provider).valid, true);
  } finally {
    index.close();
  }
});

test("semantic retriever aggregates chunks by node and reports provider failure for lexical fallback", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eido-semantic-"));
  const databasePath = path.join(directory, "knowledge_index.sqlite");
  const source = [space([node("cat", "猫咪护理", "猫咪的健康和日常照护"), node("dog", "狗狗护理")])];
  const seed = new SqliteKnowledgeVectorIndex(databasePath);
  await seed.sync(source, provider);
  seed.close();

  const retriever = new KnowledgeSemanticRetriever(provider, () => new SqliteKnowledgeVectorIndex(databasePath));
  const result = await retriever.search("猫咪不舒服怎么办", source, 3);
  assert.equal(result.unavailableReason, undefined);
  assert.equal(result.matches[0].nodeId, "cat");
  assert.equal(result.matches[0].spaceName, "宠物知识");
  assert.equal(result.matches[0].title, "猫咪护理");

  const unavailable = new KnowledgeSemanticRetriever({
    model: "broken-model", dimensions: 3,
    async embed() { throw new Error("模型暂时不可用"); },
  }, () => new SqliteKnowledgeVectorIndex(databasePath));
  const fallback = await unavailable.search("猫咪", source);
  assert.deepEqual(fallback.matches, []);
  assert.match(fallback.unavailableReason, /模型暂时不可用/);
});

test("semantic retriever rejects unrelated nearest neighbours below the relevance gate", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eido-semantic-gate-"));
  const databasePath = path.join(directory, "knowledge_index.sqlite");
  const source = [space([node("ai", "大语言模型", "生成和理解自然语言的人工智能模型")])];
  const lowSimilarityProvider = {
    model: "low-similarity-test", dimensions: 3,
    async embed(texts) {
      return texts.map((text) => Float32Array.from(text.includes("幼猫") ? [0, 1, 0] : [1, 0, 0]));
    },
  };
  const index = new SqliteKnowledgeVectorIndex(databasePath);
  await index.sync(source, lowSimilarityProvider);
  index.close();

  const retriever = new KnowledgeSemanticRetriever(lowSimilarityProvider, () => new SqliteKnowledgeVectorIndex(databasePath));
  const result = await retriever.search("幼猫的饮食", source, 3);
  assert.ok(MINIMUM_SEMANTIC_RELEVANCE > 0);
  assert.deepEqual(result.matches, []);
});
