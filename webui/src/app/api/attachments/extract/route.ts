import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceDirectory } from "@backend/config/paths";
import { databaseDir, readObjectTable } from "@backend/shared/database";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 80 * 1024 * 1024;
export async function POST(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再上传附件。" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const agentId = string(form?.get("agentId"));
  if (!(file instanceof File)) return NextResponse.json({ error: "没有收到附件。" }, { status: 400 });
  if (!agentId) return NextResponse.json({ error: "请先选择 Agent。" }, { status: 400 });
  if (!file.name.trim()) return NextResponse.json({ error: "附件名称不能为空。" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "附件不能超过 80 MB。" }, { status: 413 });

  const agents = await readObjectTable(databaseDir(), "agents");
  const agent = agents[agentId];
  if (!isOwnedAgent(agent, userId)) return NextResponse.json({ error: "无权向该 Agent 的工作目录上传附件。" }, { status: 404 });

  const workspace = workspaceFor(agent);
  try {
    const info = await stat(workspace);
    if (!info.isDirectory()) throw new Error("工作目录不可用。");
    const attachmentDirectory = path.join(workspace, ".eido", "attachments");
    await mkdir(attachmentDirectory, { recursive: true });
    const safeName = sanitizeFileName(file.name);
    const storedPath = path.join(attachmentDirectory, `${randomUUID()}-${safeName}`);
    await writeFile(storedPath, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
    return NextResponse.json({ attachment: { name: safeName, path: storedPath, size: file.size } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? `上传附件失败：${error.message}` : "上传附件失败。" }, { status: 422 });
  }
}

function workspaceFor(agent: Record<string, unknown>) {
  return resolveWorkspaceDirectory(string(agent.workspace_dir));
}

function sanitizeFileName(name: string) {
  const normalized = path.basename(name).replace(/[^\p{L}\p{N}._() -]/gu, "_").slice(0, 160);
  return normalized && normalized !== "." && normalized !== ".." ? normalized : "attachment";
}

function isOwnedAgent(value: unknown, userId: string): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).owner_user_id === userId;
}

function string(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
