import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const externalBaseUrl = process.env.EIDO_CONTRACT_BASE_URL?.replace(/\/$/, "");

let baseUrl = externalBaseUrl;
let serverProcess;
let serverOutput = "";
let temporaryDataRoot;

before(async () => {
  if (baseUrl) {
    await waitUntilReady(baseUrl);
    return;
  }

  const port = await findAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  temporaryDataRoot = await mkdtemp(path.join(tmpdir(), "eido-contracts-"));
  serverProcess = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "webui", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        EIDO_ROOT_DIR: process.cwd(),
        EIDO_DATABASE_DIR: path.join(temporaryDataRoot, "database"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  serverProcess.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  await waitUntilReady(baseUrl);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    const exited = await waitForExit(serverProcess, 5_000);
    if (!exited) serverProcess.kill("SIGKILL");
  }
  if (temporaryDataRoot) await rm(temporaryDataRoot, { recursive: true, force: true });
});

test("GET /api/auth preserves the anonymous authentication contract", async () => {
  const { response, body } = await getJson("/api/auth");

  assert.equal(response.status, 200);
  assert.deepEqual(body, { authenticated: false, user: null });
});

test("anonymous collection endpoints preserve their empty-state contracts", async (context) => {
  const contracts = [
    ["/api/agents", { user: null, agents: [] }],
    ["/api/conversations", { conversations: [] }],
    ["/api/provider-configs", { user: null, providerConfigs: [] }],
    ["/api/skills", { skills: [], agents: [] }],
    ["/api/tools", { tools: [], agents: [] }],
    ["/api/mcp", { servers: [] }],
  ];

  for (const [path, expected] of contracts) {
    await context.test(path, async () => {
      const { response, body } = await getJson(path);
      assert.equal(response.status, 200);
      assert.deepEqual(body, expected);
    });
  }
});

test("GET /api/projects returns the project catalogue contract", async () => {
  const { response, body } = await getJson("/api/projects");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.projects));
  for (const project of body.projects) {
    assertRecord(project);
    for (const field of ["id", "name", "description", "version", "entry", "icon", "accent"]) {
      assert.equal(typeof project[field], "string", `project.${field} must be a string`);
    }
    assert.ok(Array.isArray(project.tags));
    assert.ok(Array.isArray(project.permissions));
  }
});

test("GET /api/graphlines returns the graph catalogue contract", async () => {
  const { response, body } = await getJson("/api/graphlines");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.graphs));
  for (const graph of body.graphs) assertRecord(graph);
});

test("protected knowledge and chat APIs reject anonymous requests", async (context) => {
  await context.test("knowledge", async () => {
    const { response, body } = await getJson("/api/knowledge");
    assert.equal(response.status, 401);
    assertErrorContract(body);
  });

  await context.test("agent chat", async () => {
    const { response, body } = await requestJson("/api/agent/chat", {
      method: "POST",
      body: JSON.stringify({ message: "contract check" }),
    });
    assert.equal(response.status, 401);
    assertErrorContract(body);
  });

  await context.test("wechat channel", async () => {
    const status = await getJson("/api/channels/weixin");
    assert.equal(status.response.status, 401);
    assertErrorContract(status.body);
    const mutation = await requestJson("/api/channels/weixin", {
      method: "POST",
      body: JSON.stringify({ action: "qr" }),
    });
    assert.equal(mutation.response.status, 401);
    assertErrorContract(mutation.body);
  });
});

test("Knowledge CRUD and search preserve their authenticated contract", { skip: Boolean(externalBaseUrl) }, async () => {
  const headers = { "x-eido-user-id": `contract-knowledge-${process.pid}` };

  const initial = await requestJson("/api/knowledge", { headers });
  assert.equal(initial.response.status, 200);
  assert.ok(Array.isArray(initial.body.spaces));
  assert.ok(initial.body.spaces.length >= 2);
  assert.deepEqual(initial.body.results, []);

  const created = await requestJson("/api/knowledge", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "createSpace", space: { name: "契约测试知识", domain: "测试" } }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.space.name, "契约测试知识");
  const spaceId = created.body.space.id;

  const firstNode = await requestJson("/api/knowledge", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "createNode", spaceId, node: { title: "契约节点", tags: ["contract"] } }),
  });
  assert.equal(firstNode.response.status, 201);
  assert.equal(firstNode.body.node.title, "契约节点");

  const secondNode = await requestJson("/api/knowledge", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "createNode", spaceId, node: { title: "关联节点" } }),
  });
  assert.equal(secondNode.response.status, 201);

  const edge = await requestJson("/api/knowledge", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "createEdge", spaceId, edge: { source: firstNode.body.node.id, target: secondNode.body.node.id, relation: "验证" } }),
  });
  assert.equal(edge.response.status, 201);
  assert.equal(edge.body.edge.relation, "验证");

  const search = await requestJson(`/api/knowledge?q=${encodeURIComponent("contract")}&spaceId=${encodeURIComponent(spaceId)}`, { headers });
  assert.equal(search.response.status, 200);
  assert.equal(search.body.results[0].node.id, firstNode.body.node.id);

  const retrieval = await requestJson("/api/knowledge/search", {
    method: "POST",
    headers,
    body: JSON.stringify({ query: "contract", spaceIds: [spaceId], mode: "lexical", topK: 6, includeContent: true, explain: true }),
  });
  assert.equal(retrieval.response.status, 200);
  assert.equal(retrieval.body.mode, "lexical");
  assert.equal(retrieval.body.matches[0].nodeId, firstNode.body.node.id);
  assert.equal(typeof retrieval.body.matches[0].content, "string");

  const deniedAgentRetrieval = await requestJson("/api/knowledge/search", {
    method: "POST",
    headers,
    body: JSON.stringify({ query: "contract", agentId: "unbound-agent", spaceIds: [spaceId], mode: "lexical" }),
  });
  assert.equal(deniedAgentRetrieval.response.status, 403);
  assertErrorContract(deniedAgentRetrieval.body);

  const updated = await requestJson("/api/knowledge", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ action: "updateNode", spaceId, nodeId: firstNode.body.node.id, node: { summary: "已更新" } }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.node.summary, "已更新");

  const batch = await requestJson("/api/knowledge", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "addBatch",
      spaceId,
      batch: {
        nodes: [
          { ref: "batch-parent", title: "批量父节点" },
          { ref: "batch-child", title: "批量子节点" },
        ],
        edges: [{ source: "batch-parent", target: "batch-child", relation: "包含" }],
      },
    }),
  });
  assert.equal(batch.response.status, 201);
  assert.equal(batch.body.nodes.length, 2);
  assert.equal(batch.body.edges.length, 1);
  assert.equal(batch.body.edges[0].source, batch.body.refMap["batch-parent"]);
  assert.equal(batch.body.edges[0].target, batch.body.refMap["batch-child"]);

  const nodeCount = batch.body.space.nodes.length;
  const invalidBatch = await requestJson("/api/knowledge", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "addBatch",
      spaceId,
      batch: {
        nodes: [{ ref: "must-not-persist", title: "不应落库" }],
        edges: [{ source: "must-not-persist", target: "missing-node", relation: "无效" }],
      },
    }),
  });
  assert.equal(invalidBatch.response.status, 400);
  assertErrorContract(invalidBatch.body);
  const afterInvalidBatch = await requestJson("/api/knowledge", { headers });
  const unchangedSpace = afterInvalidBatch.body.spaces.find((space) => space.id === spaceId);
  assert.equal(unchangedSpace.nodes.length, nodeCount);
  assert.ok(!unchangedSpace.nodes.some((node) => node.title === "不应落库"));

  const batchUpdated = await requestJson("/api/knowledge", {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      action: "updateNodes",
      spaceId,
      updates: [
        { nodeId: batch.body.refMap["batch-parent"], node: { summary: "父节点已更新" } },
        { nodeId: batch.body.refMap["batch-child"], node: { summary: "子节点已更新" } },
      ],
    }),
  });
  assert.equal(batchUpdated.response.status, 200);
  assert.deepEqual(batchUpdated.body.nodes.map((node) => node.summary), ["父节点已更新", "子节点已更新"]);

  const removed = await requestJson(`/api/knowledge?spaceId=${encodeURIComponent(spaceId)}`, { method: "DELETE", headers });
  assert.equal(removed.response.status, 200);
  assert.deepEqual(removed.body, { deleted: true });
});

test("malformed JSON keeps the authentication validation contract", async () => {
  const { response, body } = await requestJson("/api/auth", {
    method: "POST",
    body: "{",
  });

  assert.equal(response.status, 400);
  assertErrorContract(body);
});

async function getJson(path) {
  return requestJson(path);
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  assert.match(contentType, /^application\/json\b/, `${path} must return JSON`);
  return { response, body: await response.json() };
}

function assertRecord(value) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
}

function assertErrorContract(body) {
  assertRecord(body);
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0);
}

async function waitUntilReady(targetBaseUrl) {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null && serverProcess?.exitCode !== undefined) {
      throw new Error(`Next.js exited before contract tests started.\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${targetBaseUrl}/api/auth`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
      lastError = new Error(`readiness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(
    `Next.js did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}\n${serverOutput}`,
  );
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}
