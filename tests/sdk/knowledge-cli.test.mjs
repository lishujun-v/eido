import assert from "node:assert/strict";
import { test } from "node:test";
import { runKnowledgeCli } from "../../src/knowledge/cli/index.ts";

function capture() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, io: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) } };
}

test("Knowledge CLI exposes space and atomic batch mutations", async () => {
  const calls = [];
  const client = {
    createSpace: async (space) => (calls.push(["createSpace", space]), { space: { id: "space-1", ...space } }),
    addBatch: async (spaceId, batch) => (calls.push(["addBatch", spaceId, batch]), { refMap: { root: "node-1" } }),
  };

  const created = capture();
  assert.equal(await runKnowledgeCli(["space", "create", "--json", '{"name":"Docs"}'], client, created.io), 0);
  assert.equal(JSON.parse(created.stdout[0]).space.name, "Docs");

  const added = capture();
  assert.equal(await runKnowledgeCli(["node", "add-batch", "space-1", "--json", '{"nodes":[{"ref":"root","title":"Root"}]}'], client, added.io), 0);
  assert.deepEqual(calls[1], ["addBatch", "space-1", { nodes: [{ ref: "root", title: "Root" }] }]);
});

test("Knowledge CLI requires explicit confirmation before deletion", async () => {
  let deleted = false;
  const client = { deleteSpace: async () => { deleted = true; } };
  const output = capture();

  assert.equal(await runKnowledgeCli(["space", "delete", "space-1"], client, output.io), 1);
  assert.equal(deleted, false);
  assert.match(output.stderr[0], /--yes/);
});
