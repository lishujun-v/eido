import { readFile } from "node:fs/promises";
import path from "node:path";
import { platformPaths } from "../../config/paths.ts";
import type { KnowledgeSpace } from "../domain/types.ts";
import { evaluateKeywordBaseline } from "./evaluator.ts";
import type { RetrievalEvaluationSet } from "./types.ts";

async function main() {
  const inputPath = option(process.argv.slice(2), "--file")
    ?? path.join(platformPaths().databaseDir, "knowledge_retrieval_evaluation.json");
  const [spaces, evaluationSet] = await Promise.all([
    readJson<Record<string, KnowledgeSpace>>(path.join(platformPaths().databaseDir, "knowledge_spaces.json")),
    readJson<RetrievalEvaluationSet>(inputPath),
  ]);
  if (evaluationSet.version !== 1 || !Array.isArray(evaluationSet.cases)) {
    throw new Error("评测集格式无效：需要 version: 1 和 cases 数组。");
  }
  const requestedOwner = option(process.argv.slice(2), "--owner");
  const selectedSpaces = Object.values(spaces).filter((space) => !requestedOwner || space.ownerUserId === requestedOwner);
  const report = evaluateKeywordBaseline(selectedSpaces, evaluationSet.cases);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function readJson<T>(filePath: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取评测文件 ${filePath}：${reason}`);
  }
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "知识检索评测失败。"}\n`);
  process.exitCode = 1;
});
