import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalKnowledgeIndexMaintainer } from "../../src/knowledge/server/index-maintenance.ts";

test("background index maintenance serializes retries and persists the final failure", async () => {
  let attempts = 0;
  let recordedError = "";
  const provider = { model: "fake", dimensions: 1, async embed() { return []; } };
  const index = {
    databasePath: "test.sqlite",
    close() {}, status() { return {}; }, verify() { return {}; }, search() { return []; },
    async sync() {
      attempts += 1;
      if (attempts < 3) throw new Error(`temporary-${attempts}`);
      return { embeddedChunkCount: 0 };
    },
    recordSyncFailure(error) { recordedError = error.message; },
  };
  const maintainer = new LocalKnowledgeIndexMaintainer(provider, () => index, 3);
  const result = await maintainer.schedule([]);
  assert.equal(attempts, 3);
  assert.equal(result.embeddedChunkCount, 0);
  assert.equal(recordedError, "");
});

test("background index maintenance leaves a durable retry error after all attempts fail", async () => {
  let attempts = 0;
  let recordedError = "";
  const provider = { model: "fake", dimensions: 1, async embed() { return []; } };
  const index = {
    databasePath: "test.sqlite",
    close() {}, status() { return {}; }, verify() { return {}; }, search() { return []; },
    async sync() { attempts += 1; throw new Error("embedding offline"); },
    recordSyncFailure(error) { recordedError = error.message; },
  };
  const maintainer = new LocalKnowledgeIndexMaintainer(provider, () => index, 2);
  await assert.rejects(maintainer.schedule([]), /embedding offline/);
  assert.equal(attempts, 2);
  assert.equal(recordedError, "embedding offline");
});
