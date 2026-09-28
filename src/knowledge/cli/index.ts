import { readFile } from "node:fs/promises";
import { KnowledgeClient } from "../sdk/index.ts";

export type KnowledgeCliIO = {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
};

export async function runKnowledgeCli(argv: string[], client: KnowledgeClient, io: KnowledgeCliIO) {
  const [resource, command, ...args] = argv;
  try {
    if (resource === "space" && command === "list") {
      const { spaces } = await client.list();
      return success(io, spaces);
    }
    if (resource === "space" && command === "get") {
      const spaceId = requiredArg(args[0], "缺少知识空间 ID。");
      const { spaces } = await client.list();
      const space = spaces.find((item) => item.id === spaceId);
      if (!space) throw new Error("没有找到这个知识空间。");
      return success(io, space);
    }
    if (resource === "space" && command === "create") {
      return success(io, await client.createSpace(await jsonInput(args)));
    }
    if (resource === "space" && command === "update") {
      return success(io, await client.updateSpace(requiredArg(args[0], "缺少知识空间 ID。"), await jsonInput(args.slice(1))));
    }
    if (resource === "space" && command === "delete") {
      requireConfirmation(args);
      return success(io, await client.deleteSpace(requiredArg(args[0], "缺少知识空间 ID。")));
    }
    if (resource === "node" && command === "list") {
      const spaceId = requiredArg(args[0], "缺少知识空间 ID。");
      const { spaces } = await client.list();
      const space = spaces.find((item) => item.id === spaceId);
      if (!space) throw new Error("没有找到这个知识空间。");
      return success(io, { nodes: space.nodes, edges: space.edges });
    }
    if (resource === "node" && command === "add-batch") {
      return success(io, await client.addBatch(requiredArg(args[0], "缺少知识空间 ID。"), await jsonInput(args.slice(1))));
    }
    if (resource === "node" && command === "update") {
      const spaceId = requiredArg(args[0], "缺少知识空间 ID。");
      const nodeId = requiredArg(args[1], "缺少知识节点 ID。");
      return success(io, await client.updateNode(spaceId, nodeId, await jsonInput(args.slice(2))));
    }
    if (resource === "node" && command === "update-batch") {
      const spaceId = requiredArg(args[0], "缺少知识空间 ID。");
      const input = await jsonInput<Record<string, unknown> | unknown[]>(args.slice(1));
      const updates = Array.isArray(input) ? input : input.updates;
      if (!Array.isArray(updates)) throw new Error("批量修改输入必须是数组，或包含 updates 数组。");
      return success(io, await client.updateNodes(spaceId, updates));
    }
    if (resource === "node" && command === "delete") {
      requireConfirmation(args);
      return success(io, await client.deleteNode(requiredArg(args[0], "缺少知识空间 ID。"), requiredArg(args[1], "缺少知识节点 ID。")));
    }
    if (resource === "search") {
      const query = option(args, "--query") ?? command;
      return success(io, await client.search({
        query: requiredArg(query, "缺少检索内容。"),
        agentId: option(args, "--agent"),
        spaceIds: options(args, "--space"),
        mode: parseMode(option(args, "--mode")),
        topK: parseInteger(option(args, "--top-k"), "--top-k"),
        maxHops: parseInteger(option(args, "--max-hops"), "--max-hops"),
        includeContent: !args.includes("--no-content"),
        explain: args.includes("--explain"),
        llm: {
          enhancement: parseLlmMode(option(args, "--llm")),
          rerank: args.includes("--rerank"),
        },
      }));
    }
    io.stderr(knowledgeCliUsage());
    return 2;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : "知识库命令执行失败。");
    return 1;
  }
}

async function jsonInput<T extends object>(args: string[]): Promise<T> {
  const inline = option(args, "--json");
  const file = option(args, "--file");
  if (Boolean(inline) === Boolean(file)) throw new Error("请且仅请使用 --json 或 --file 提供 JSON 输入。");
  const source = file ? await readFile(file, "utf8") : inline!;
  try {
    const value: unknown = JSON.parse(source);
    if (!value || typeof value !== "object") throw new Error();
    return value as T;
  } catch {
    throw new Error("输入不是有效的 JSON 对象或数组。");
  }
}

function success(io: KnowledgeCliIO, value: unknown) {
  io.stdout(JSON.stringify(value, null, 2));
  return 0;
}

function requiredArg(value: string | undefined, message: string) {
  if (!value || value.startsWith("--")) throw new Error(message);
  return value;
}

function requireConfirmation(args: string[]) {
  if (!args.includes("--yes")) throw new Error("删除操作需要显式添加 --yes。");
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function options(args: string[], name: string) {
  return args.flatMap((value, index) => value === name && args[index + 1] ? [args[index + 1]] : []);
}

function parseInteger(value: string | undefined, name: string) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${name} 必须是整数。`);
  return Number(value);
}

function parseMode(value: string | undefined) {
  if (value === undefined) return undefined;
  if (value === "lexical" || value === "semantic" || value === "hybrid" || value === "graph") return value;
  throw new Error("--mode 只能是 lexical、semantic、hybrid 或 graph。");
}

function parseLlmMode(value: string | undefined): "off" | "auto" | "force" | undefined {
  if (value === undefined) return undefined;
  if (value === "off" || value === "auto" || value === "force") return value;
  throw new Error("--llm 只能是 off、auto 或 force。");
}

export function knowledgeCliUsage() {
  return [
    "用法：knowledge <resource> <command> [options]",
    "  space list | get <id> | create --json <json> | update <id> --file <path> | delete <id> --yes",
    "  node list <space-id> | add-batch <space-id> --file <path>",
    "  node update <space-id> <node-id> --json <json> | update-batch <space-id> --file <path>",
    "  node delete <space-id> <node-id> --yes",
    "  search --query <文本> [--agent <agent-id>] [--space <space-id>] [--mode graph] [--top-k 6] [--max-hops 1] [--llm auto|force|off] [--rerank] [--explain]",
  ].join("\n");
}
