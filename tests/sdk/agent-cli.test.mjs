import assert from "node:assert/strict";
import { test } from "node:test";
import { runAgentCli } from "../../src/agents/cli/index.ts";

function capture() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, io: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) } };
}

test("Agent CLI discovers providers and submits the native create payload", async () => {
  const calls = [];
  const client = {
    listProviderConfigs: async () => ({ providerConfigs: [{ id: "provider-1", name: "Local", provider: "openai", default_model: "small", models: ["small"] }] }),
    create: async (input) => (calls.push(input), { agent: { id: "expert-1", name: input.name } }),
  };
  const listed = capture();
  assert.equal(await runAgentCli(["provider", "list"], client, listed.io), 0);
  assert.equal(JSON.parse(listed.stdout[0])[0].id, "provider-1");

  const created = capture();
  assert.equal(await runAgentCli(["create", "--json", '{"name":"研究员","identity":"研究专家","capabilities":"检索","providerConfigId":"provider-1","model":"small"}'], client, created.io), 0);
  assert.equal(calls[0].name, "研究员");
  assert.equal(calls[0].providerConfigId, "provider-1");
});

test("Agent CLI never submits an incomplete create request", async () => {
  let created = false;
  const output = capture();
  assert.equal(await runAgentCli(["create", "--json", '{"name":"缺少字段"}'], { create: async () => { created = true; } }, output.io), 1);
  assert.equal(created, false);
  assert.match(output.stderr[0], /name、identity 和 capabilities/);
});
