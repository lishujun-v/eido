#!/usr/bin/env node
import { KnowledgeClient } from "../sdk/index.ts";
import { knowledgeCliUsage, runKnowledgeCli } from "./index.ts";
import { knowledgeIndexCliUsage, runKnowledgeIndexCli } from "./index-command.ts";

const args = process.argv.slice(2);
if (args[0] === "index") {
  runKnowledgeIndexCli(args.slice(1), { stdout: console.log, stderr: console.error }).then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(knowledgeCliUsage());
} else {
  const baseUrl = takeOption(args, "--base-url") ?? process.env.EIDO_PLATFORM_URL ?? "http://127.0.0.1:3000";
  const userId = takeOption(args, "--user") ?? process.env.EIDO_USER_ID;
  if (!userId) {
    console.error("缺少用户身份。请设置 EIDO_USER_ID 或使用 --user <user-id>。");
    process.exitCode = 2;
  } else {
    const client = new KnowledgeClient({ baseUrl, headers: { "x-eido-user-id": userId } });
    process.exitCode = await runKnowledgeCli(args, client, { stdout: console.log, stderr: console.error });
  }
}

function takeOption(argv: string[], name: string) {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  argv.splice(index, 2);
  return value;
}
