#!/usr/bin/env node
import { AgentClient } from "../sdk/index.ts";
import { agentCliUsage, runAgentCli } from "./index.ts";

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(agentCliUsage());
} else {
  const baseUrl = takeOption(args, "--base-url") ?? process.env.EIDO_PLATFORM_URL ?? "http://127.0.0.1:3000";
  const userId = takeOption(args, "--user") ?? process.env.EIDO_USER_ID;
  if (!userId) {
    console.error("缺少用户身份。请设置 EIDO_USER_ID 或使用 --user <user-id>。");
    process.exitCode = 2;
  } else {
    const client = new AgentClient({ baseUrl, headers: { "x-eido-user-id": userId } });
    process.exitCode = await runAgentCli(args, client, { stdout: console.log, stderr: console.error });
  }
}

function takeOption(argv: string[], name: string) {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  argv.splice(index, 2);
  return value;
}
