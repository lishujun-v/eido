import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const DOMAIN_ROUTES = [
  "webui/src/app/api/agent/chat/route.ts",
  "webui/src/app/api/agents/route.ts",
  "webui/src/app/api/auth/route.ts",
  "webui/src/app/api/channels/weixin/route.ts",
  "webui/src/app/api/conversations/route.ts",
  "webui/src/app/api/graphlines/route.ts",
  "webui/src/app/api/knowledge/route.ts",
  "webui/src/app/api/knowledge/search/route.ts",
  "webui/src/app/api/mcp/route.ts",
  "webui/src/app/api/project-runtime/storage/route.ts",
  "webui/src/app/api/provider-configs/route.ts",
  "webui/src/app/api/skillhub/route.ts",
  "webui/src/app/api/skills/route.ts",
  "webui/src/app/api/tools/route.ts",
];

test("migrated API routes remain thin domain adapters", async (context) => {
  for (const route of DOMAIN_ROUTES) {
    await context.test(route, async () => {
      const source = await readFile(route, "utf8");
      const lines = source.trim().split("\n");

      assert.ok(lines.length <= 12, `${route} grew beyond the adapter boundary`);
      assert.match(source, /from "@backend\/(?:agents|auth|channels|conversations|graphlines|knowledge|mcp|projects|providers|skills|tools)\/(?:weixin\/)?server\//);
      assert.doesNotMatch(source, /Next(?:Request|Response)|readObjectTable|writeJson|platformPaths/);
    });
  }
});

test("Knowledge keeps its sample domain boundaries", async () => {
  const [route, service, repository, sdk, cli] = await Promise.all([
    readFile("webui/src/app/api/knowledge/route.ts", "utf8"),
    readFile("src/knowledge/server/service.ts", "utf8"),
    readFile("src/knowledge/server/repository.ts", "utf8"),
    readFile("src/knowledge/sdk/client.ts", "utf8"),
    readFile("src/knowledge/cli/index.ts", "utf8"),
  ]);

  assert.match(route, /@backend\/knowledge\/server\/handlers/);
  assert.doesNotMatch(service, /Next(?:Request|Response)|@backend\/shared\/database/);
  assert.match(repository, /@backend\/shared\/database/);
  assert.doesNotMatch(sdk, /@backend\/knowledge\/server|next\/server/);
  assert.match(cli, /\.\.\/sdk\/index\.ts/);
});

test("WebUI is isolated from backend source and keeps root command compatibility", async () => {
  const [packageSource, webuiPackage, nextConfig, tsconfig, webuiEntries, backendEntries] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("webui/package.json", "utf8"),
    readFile("webui/next.config.ts", "utf8"),
    readFile("webui/tsconfig.json", "utf8"),
    readdir("webui"),
    readdir("src"),
  ]);

  assert.match(packageSource, /npm run dev --workspace @eido\/webui/);
  assert.match(packageSource, /npm run build --workspace @eido\/webui/);
  assert.match(packageSource, /npm run start --workspace @eido\/webui/);
  assert.match(webuiPackage, /"dev": "next dev/);
  assert.match(webuiPackage, /"build": "next build/);
  assert.match(webuiPackage, /"start": "next start/);
  assert.match(nextConfig, /EIDO_ROOT_DIR/);
  assert.match(tsconfig, /"@backend\/\*"/);
  assert.ok(webuiEntries.includes("public"));
  assert.ok(webuiEntries.includes("src"));
  assert.ok(!backendEntries.includes("app"));
  assert.ok(!backendEntries.includes("components"));
  assert.ok(!backendEntries.includes("data"));

  await access("webui/src/app/page.tsx");
  await access("webui/src/components");
});

test("runtime, model, and Agent skill data use their canonical directories", async () => {
  const [pathConfig, rootEntries, runtimeEntries, dataEntries, agentDatabaseEntries] = await Promise.all([
    readFile("src/config/paths.ts", "utf8"),
    readdir("."),
    readdir("runtime"),
    readdir("data"),
    readdir("database/agents"),
  ]);

  assert.match(pathConfig, /EIDO_RUNTIME_DIR/);
  assert.match(pathConfig, /path\.join\(runtimeDir, fallback\)/);
  assert.match(pathConfig, /resolveWorkspaceDirectory/);
  assert.deepEqual(
    ["graphs", "projects", "workspace"].filter((directory) => runtimeEntries.includes(directory)),
    ["graphs", "projects", "workspace"],
  );
  assert.ok(dataEntries.includes("models"));
  assert.ok(agentDatabaseEntries.includes("skills"));
  assert.match(pathConfig, /path\.join\("database", "agents", "skills"\)/);
  for (const legacyDirectory of [
    "agents",
    "graphs",
    "knowledge",
    "models",
    "output",
    "outputs",
    "powers",
    "projects",
    "workspace",
  ]) {
    assert.ok(!rootEntries.includes(legacyDirectory), `${legacyDirectory}/ must not remain at repository root`);
  }

  await access("data/models/Kokoro-82M/config.json");
  await access("database/agents/skills/kokoro-text-to-speech/SKILL.md");
  await access("database/agents/skills/knowledge-manage/SKILL.md");
  await access("database/agents/skills/knowledge-manage/scripts/knowledge.py");
});

test("Agent Python service has one canonical implementation", async () => {
  const [configSource, packageScript, cliSource, testBootstrap] = await Promise.all([
    readFile("src/agents/server/python/eido_agent/config.py", "utf8"),
    readFile("package.json", "utf8"),
    readFile("src/agents/cli/smoke_test.py", "utf8"),
    readFile("tests/python/agents/__init__.py", "utf8"),
  ]);

  assert.match(configSource, /parents\[1\].*config\.json/s);
  assert.match(packageScript, /--app-dir src\/agents\/server\/python eido_agent\.server:app/);
  assert.match(packageScript, /src\/agents\/cli\/smoke_test\.py/);
  assert.match(packageScript, /tests\/python\/agents/);
  assert.match(cliSource, /server.*python/s);
  assert.match(testBootstrap, /src.*agents.*server.*python/s);
});
