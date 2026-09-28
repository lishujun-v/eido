import { readFile } from "node:fs/promises";
import path from "node:path";
import { platformPaths } from "../../config/paths.ts";
import type { KnowledgeSpace } from "../domain/types.ts";
import { LocalBgeSmallZhEmbeddingProvider } from "../server/embedding-provider.ts";
import { SqliteKnowledgeVectorIndex } from "../server/vector-index.ts";

type CliIo = { stdout: (value: string) => void; stderr: (value: string) => void };

export async function runKnowledgeIndexCli(args: string[], io: CliIo): Promise<number> {
  const command = args[0];
  if (!command || ["--help", "-h"].includes(command)) {
    io.stdout(knowledgeIndexCliUsage());
    return 0;
  }
  if (!["status", "sync", "rebuild", "verify", "search"].includes(command)) {
    io.stderr(`未知索引命令：${command}\n${knowledgeIndexCliUsage()}`);
    return 2;
  }
  const spaces = await readSpaces();
  const provider = new LocalBgeSmallZhEmbeddingProvider();
  const index = new SqliteKnowledgeVectorIndex();
  try {
    if (command === "status") io.stdout(JSON.stringify(index.status(spaces, provider), null, 2));
    if (command === "sync") io.stdout(JSON.stringify(await index.sync(spaces, provider), null, 2));
    if (command === "rebuild") io.stdout(JSON.stringify(await index.sync(spaces, provider, true), null, 2));
    if (command === "verify") {
      const verification = index.verify(spaces, provider);
      io.stdout(JSON.stringify(verification, null, 2));
      return verification.valid ? 0 : 1;
    }
    if (command === "search") {
      const query = option(args, "--query");
      if (!query?.trim()) {
        io.stderr("search 需要 --query <文本>。");
        return 2;
      }
      const [vector] = await provider.embed([query]);
      io.stdout(JSON.stringify(index.search(vector, provider.model, Number(option(args, "--limit") ?? 10)), null, 2));
    }
    return 0;
  } finally {
    index.close();
  }
}

export function knowledgeIndexCliUsage() {
  return [
    "用法：npm run knowledge -- index <命令>",
    "", "命令：", "  status                 显示派生 SQLite 索引状态", "  sync                   只补齐缺失或过期向量", "  rebuild                从 knowledge_spaces.json 完整重建", "  verify                 校验源数据、Chunk 和当前模型向量的一致性", "  search --query <文本>  直接验证本地语义索引（开发诊断用）",
  ].join("\n");
}

async function readSpaces() {
  const filePath = path.join(platformPaths().databaseDir, "knowledge_spaces.json");
  try {
    const table = JSON.parse(await readFile(filePath, "utf8")) as Record<string, KnowledgeSpace>;
    return Object.values(table);
  } catch (error) {
    throw new Error(`无法读取知识源 ${filePath}：${error instanceof Error ? error.message : String(error)}`);
  }
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
