import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function loadAgentClient() {
  const source = await readFile("src/agents/sdk/client.ts", "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, useDefineForClassFields: true },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

test("AgentClient preserves fetch binding and posts the native create payload", async () => {
  const { AgentClient } = await loadAgentClient();
  let request;
  const client = new AgentClient({
    fetch: async (input, init) => {
      request = { input, init, body: JSON.parse(init.body) };
      return Response.json({ agent: { id: "expert-1", name: "Researcher" } });
    },
  });

  await client.create({ name: "Researcher", identity: "研究专家", capabilities: "检索与总结", providerConfigId: "provider-1", model: "model-1" });
  assert.equal(request.input, "/api/agents");
  assert.equal(request.init.method, "POST");
  assert.equal(request.body.providerConfigId, "provider-1");
  assert.equal(request.body.model, "model-1");
});

test("AgentClient discovers only the provider fields needed for creation", async () => {
  const { AgentClient } = await loadAgentClient();
  const client = new AgentClient({ fetch: async () => Response.json({ providerConfigs: [{ id: "p", models: ["m"] }] }) });
  const result = await client.listProviderConfigs();
  assert.equal(result.providerConfigs[0].id, "p");
  assert.deepEqual(result.providerConfigs[0].models, ["m"]);
});
