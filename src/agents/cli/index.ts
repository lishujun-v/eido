import { readFile } from "node:fs/promises";
import type { AgentClient, CreateAgentInput } from "../sdk/index.ts";

export type AgentCliIO = {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
};

export async function runAgentCli(argv: string[], client: AgentClient, io: AgentCliIO) {
  const [resource, command, ...args] = argv;
  try {
    if (resource === "provider" && command === "list") {
      const { providerConfigs } = await client.listProviderConfigs();
      return success(io, providerConfigs.map((config) => ({
        id: config.id,
        name: config.name,
        provider: config.provider,
        defaultModel: config.default_model,
        models: config.models,
      })));
    }
    if (resource === "create") {
      return success(io, await client.create(await jsonInput([command, ...args])));
    }
    io.stderr(agentCliUsage());
    return 2;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : "创建 Agent 命令执行失败。");
    return 1;
  }
}

async function jsonInput(args: string[]): Promise<CreateAgentInput> {
  const inline = option(args, "--json");
  const file = option(args, "--file");
  if (Boolean(inline) === Boolean(file)) throw new Error("请且仅请使用 --json 或 --file 提供创建参数。");
  const source = file ? await readFile(file, "utf8") : inline!;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("输入不是有效的 JSON 对象。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("创建参数必须是 JSON 对象。");
  }
  const input = value as CreateAgentInput;
  if (!input.name?.trim() || !input.identity?.trim() || !input.capabilities?.trim()) {
    throw new Error("创建参数必须包含 name、identity 和 capabilities。");
  }
  return input;
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function success(io: AgentCliIO, value: unknown) {
  io.stdout(JSON.stringify(value, null, 2));
  return 0;
}

export function agentCliUsage() {
  return [
    "用法：agent <command> [options]",
    "  provider list",
    "  create --file <agent.json> | --json <json>",
    "创建 JSON 必填：name、identity、capabilities。",
    "本地 Agent 还需 providerConfigId 和 model；先用 provider list 查询可用值。",
  ].join("\n");
}
