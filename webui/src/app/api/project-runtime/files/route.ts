import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { platformPaths, resolveWorkspaceDirectory } from "@backend/config/paths";
import { SIINX_AGENT_TYPE } from "@backend/lib/agent-identity";
import { databaseDir, readObjectTable } from "@backend/shared/database";

const MAX_FILE_SIZE = 80 * 1024 * 1024;
const FILE_PERMISSION = "project.files";

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再保存项目文件。" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const projectId = String(form?.get("projectId") || "");
  const file = form?.get("file");
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    return NextResponse.json({ error: "项目标识无效。" }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "没有收到文件。" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "文件不能超过 80 MB。" }, { status: 413 });
  if (!await projectHasPermission(projectId, FILE_PERMISSION)) {
    return NextResponse.json({ error: `项目未声明 ${FILE_PERMISSION} 权限。` }, { status: 403 });
  }

  const projectDir = await getProjectDirectory(userId, projectId);
  if (!projectDir) return NextResponse.json({ error: "当前用户还没有可用的默认 Agent。" }, { status: 404 });
  const safeName = sanitizeFileName(file.name);
  const filePath = path.join(projectDir, safeName);
  await mkdir(projectDir, { recursive: true });
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ fileName: safeName, filePath });
}

export async function GET(request: NextRequest) {
  const resolved = await resolveStoredProjectFile(request);
  if (resolved instanceof NextResponse) return resolved;
  try {
    const data = await readFile(resolved.filePath);
    return new NextResponse(data, {
      headers: {
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(resolved.fileName)}`,
        "content-type": resolved.fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json({ error: "缓存文件不存在。" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest) {
  const resolved = await resolveStoredProjectFile(request);
  if (resolved instanceof NextResponse) return resolved;
  try {
    await unlink(resolved.filePath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code !== "ENOENT") return NextResponse.json({ error: "移除缓存文件失败。" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

async function resolveStoredProjectFile(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再读取项目文件。" }, { status: 401 });
  const projectId = request.nextUrl.searchParams.get("projectId") || "";
  const requestedName = request.nextUrl.searchParams.get("fileName") || "";
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    return NextResponse.json({ error: "项目标识无效。" }, { status: 400 });
  }
  if (!await projectHasPermission(projectId, FILE_PERMISSION)) {
    return NextResponse.json({ error: `项目未声明 ${FILE_PERMISSION} 权限。` }, { status: 403 });
  }
  const fileName = sanitizeFileName(requestedName);
  if (!requestedName || fileName !== requestedName) {
    return NextResponse.json({ error: "缓存文件名无效。" }, { status: 400 });
  }
  const projectDir = await getProjectDirectory(userId, projectId);
  if (!projectDir) return NextResponse.json({ error: "当前用户还没有可用的默认 Agent。" }, { status: 404 });
  return { fileName, filePath: path.join(projectDir, fileName) };
}

async function getProjectDirectory(userId: string, projectId: string) {
  const agent = await getDefaultAgent(userId);
  if (!agent) return null;
  const workspaceDir = resolveWorkspaceDirectory(
    typeof agent.workspace_dir === "string" ? agent.workspace_dir : undefined,
  );
  return path.join(workspaceDir, "data", "projects", projectId);
}

async function projectHasPermission(projectId: string, permission: string) {
  try {
    const manifestPath = path.join(platformPaths().projectsDir, projectId, "project.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { permissions?: unknown };
    return Array.isArray(manifest.permissions) && manifest.permissions.includes(permission);
  } catch {
    return false;
  }
}

function sanitizeFileName(name: string) {
  const normalized = path.basename(name).replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-180);
  return normalized && normalized !== "." && normalized !== ".." ? normalized : "project-file";
}

async function getDefaultAgent(userId: string): Promise<Record<string, unknown> | null> {
  const agents = await readObjectTable(databaseDir(), "agents");
  const match = Object.values(agents).find((candidate) => isRecord(candidate)
    && candidate.owner_user_id === userId
    && candidate.agent_type === SIINX_AGENT_TYPE
    && candidate.interaction_mode === "conversation"
    && candidate.is_default === true);
  return isRecord(match) ? match : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
