import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function loadKnowledgeClient() {
  const source = await readFile("src/knowledge/sdk/client.ts", "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      useDefineForClassFields: true,
    },
  });

  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

test("KnowledgeClient preserves the native fetch receiver", async () => {
  const { KnowledgeClient } = await loadKnowledgeClient();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = function (input) {
    assert.equal(this, globalThis);
    assert.equal(input, "/api/knowledge");
    return Promise.resolve(Response.json({ spaces: [], results: [] }));
  };

  try {
    assert.deepEqual(await new KnowledgeClient().list(), { spaces: [], results: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("KnowledgeClient sends atomic batch operations through the public API", async () => {
  const { KnowledgeClient } = await loadKnowledgeClient();
  const requests = [];
  const client = new KnowledgeClient({
    fetch: async (input, init) => {
      requests.push({ input, init, body: JSON.parse(init.body) });
      return Response.json({ space: {}, nodes: [], edges: [], refMap: {} });
    },
  });

  await client.addBatch("space-1", {
    nodes: [{ ref: "a", title: "A" }],
    edges: [],
  });
  await client.updateNodes("space-1", [{ nodeId: "node-1", node: { title: "Updated" } }]);

  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].body.action, "addBatch");
  assert.equal(requests[0].body.batch.nodes[0].ref, "a");
  assert.equal(requests[1].init.method, "PATCH");
  assert.equal(requests[1].body.action, "updateNodes");
});

test("KnowledgeClient sends typed retrieval requests to the dedicated endpoint", async () => {
  const { KnowledgeClient } = await loadKnowledgeClient();
  let request;
  const client = new KnowledgeClient({
    fetch: async (input, init) => {
      request = { input, init, body: JSON.parse(init.body) };
      return Response.json({ query: "猫咪", normalizedQuery: "猫咪", mode: "graph", matches: [], metadata: {} });
    },
  });

  await client.search({ query: "猫咪呕吐", agentId: "agent-1", mode: "graph", topK: 6, maxHops: 1 });
  assert.equal(request.input, "/api/knowledge/search");
  assert.equal(request.init.method, "POST");
  assert.equal(request.body.agentId, "agent-1");
  assert.equal(request.body.mode, "graph");
});
