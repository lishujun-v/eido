import { access, mkdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { platformPaths, resolveWorkspaceDirectory } from "@backend/config/paths";
import { databaseDir, readObjectTable, tablePath, writeJson } from "@backend/shared/database";

const execFileAsync = promisify(execFile);
const defaultWorkspace = platformPaths().workspaceDir;

export async function GET(request: NextRequest) {
  await mkdir(defaultWorkspace, { recursive: true });
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  const agentId = request.nextUrl.searchParams.get("agentId")?.trim();
  if (!userId || !agentId) return NextResponse.json({ directory: defaultWorkspace, isDefault: true });

  const agents = await readObjectTable(databaseDir(), "agents");
  const agent = agents[agentId];
  const directory = isOwnedAgent(agent, userId) && typeof agent.workspace_dir === "string"
    ? resolveWorkspaceDirectory(agent.workspace_dir)
    : defaultWorkspace;
  return NextResponse.json({ directory, isDefault: directory === defaultWorkspace });
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  const payload = await request.json().catch(() => null);
  const agentId = typeof payload?.agentId === "string" ? payload.agentId.trim() : "";
  if (!userId || !agentId) {
    return NextResponse.json({ error: "请先登录并选择 Agent。" }, { status: 401 });
  }
  if (process.platform !== "darwin") {
    return NextResponse.json(
      { error: "当前环境不支持系统目录选择器。" },
      { status: 501 },
    );
  }

  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "选择 Agent 的工作目录")',
    ]);
    const selectedDirectory = stdout.trim().replace(/\/$/, "");
    const info = await stat(selectedDirectory);
    if (!info.isDirectory()) {
      throw new Error("所选路径不是目录。");
    }
    await access(selectedDirectory);
    const databaseDirectory = databaseDir();
    const agents = await readObjectTable(databaseDirectory, "agents");
    const agent = agents[agentId];
    if (!isOwnedAgent(agent, userId)) {
      return NextResponse.json({ error: "无权设置该 Agent 的工作目录。" }, { status: 404 });
    }
    agents[agentId] = { ...agent, workspace_dir: selectedDirectory, updated_at: new Date().toISOString() };
    await writeJson(tablePath(databaseDirectory, "agents"), agents);
    return NextResponse.json({ directory: selectedDirectory, isDefault: selectedDirectory === defaultWorkspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : "目录选择失败。";
    if (/User canceled|用户已取消|-128/i.test(message)) {
      return NextResponse.json({ cancelled: true });
    }
    return NextResponse.json({ error: `无法使用所选目录：${message}` }, { status: 400 });
  }
}

function isOwnedAgent(value: unknown, userId: string): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (value as Record<string, unknown>).owner_user_id === userId;
}
