import { cp, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { platformPaths, resolveWorkspaceDirectory } from "@backend/config/paths";
import { SIINX_AGENT_TYPE } from "@backend/lib/agent-identity";
import { databaseDir, readObjectTable } from "@backend/shared/database";

const STORAGE_PERMISSION = "project.storage";
const MAX_STORAGE_SIZE = 1_000_000;
const MAX_NOTE_SIZE = 40 * 1024 * 1024;
const MAX_INDEX_SIZE = 20 * 1024 * 1024;
const FOCUS_BOARD_PROJECT = "focus-board";
const NOTE_DOWN_PROJECT = "note-down";
const NOTE_DOWN_WORKSPACE_KEY = "note-down-workspace-v1";
const NOTE_DOWN_INDEX_KEY = "workspace-index";
const NOTE_DOWN_BATCH_KEY = "workspace-batch";
const NOTE_KEY_PREFIX = "note:";

type StoragePayload = {
  projectId?: unknown;
  action?: unknown;
  key?: unknown;
  value?: unknown;
};

type NoteIndexNode = {
  id: string;
  title: string;
  time: string;
  children: NoteIndexNode[];
};

type NoteValue = NoteIndexNode & { text: string };

export async function accessProjectStorage(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再使用项目存储。" }, { status: 401 });

  const payload = await request.json().catch(() => null) as StoragePayload | null;
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : "";
  const action = typeof payload?.action === "string" ? payload.action : "";
  const key = typeof payload?.key === "string" ? payload.key.slice(0, 200) : "";

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId) || !key) {
    return NextResponse.json({ error: "项目存储请求无效。" }, { status: 400 });
  }
  if (![FOCUS_BOARD_PROJECT, NOTE_DOWN_PROJECT].includes(projectId)) {
    return NextResponse.json({ error: "该项目未启用磁盘存储。" }, { status: 403 });
  }
  if (!await projectHasPermission(projectId)) {
    return NextResponse.json({ error: `项目未声明 ${STORAGE_PERMISSION} 权限。` }, { status: 403 });
  }
  if (!new Set(["get", "set", "remove"]).has(action)) {
    return NextResponse.json({ error: `不支持的存储操作：${action}` }, { status: 400 });
  }

  if (projectId === NOTE_DOWN_PROJECT) {
    const dataDir = await getNoteDownDirectory(userId);
    if (!dataDir) return NextResponse.json({ error: "当前用户还没有可用的默认 Agent。" }, { status: 404 });
    try {
      return await handleNoteDownStorage(dataDir, action, key, payload?.value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "笔记磁盘存储失败。";
      const status = message.includes("不能超过") ? 413 : message.includes("无效") ? 400 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const projectDir = path.resolve(platformPaths().projectsDir, projectId);
  const dataDir = path.join(projectDir, "data");
  const storagePath = path.join(dataDir, "storage.json");
  const values = await readStorage(storagePath);

  if (action === "get") return NextResponse.json({ value: values[key] ?? null });
  if (action === "remove") delete values[key];
  else values[key] = payload?.value;

  const serialized = `${JSON.stringify(values, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_STORAGE_SIZE) {
    return NextResponse.json({ error: "项目存储不能超过 1 MB。" }, { status: 413 });
  }

  await atomicWrite(storagePath, serialized);
  return NextResponse.json({ value: values[key] ?? null, filePath: storagePath });
}

async function handleNoteDownStorage(dataDir: string, action: string, key: string, value: unknown) {
  const indexPath = path.join(dataDir, "workspace.json");

  if (action === "get") {
    if (key === NOTE_DOWN_WORKSPACE_KEY) {
      const workspace = await readJson(indexPath);
      if (!workspace) return NextResponse.json({ value: null });
      return NextResponse.json({ value: await hydrateWorkspace(dataDir, workspace), filePath: indexPath });
    }
    if (key === NOTE_DOWN_INDEX_KEY) return NextResponse.json({ value: await readJson(indexPath), filePath: indexPath });
    if (key.startsWith(NOTE_KEY_PREFIX)) {
      const id = validNoteId(key.slice(NOTE_KEY_PREFIX.length));
      return NextResponse.json({ value: { id, text: await readNote(dataDir, id) }, filePath: notePath(dataDir, id) });
    }
    return NextResponse.json({ value: null });
  }

  if (action === "remove") {
    if (key.startsWith(NOTE_KEY_PREFIX)) {
      const id = validNoteId(key.slice(NOTE_KEY_PREFIX.length));
      await unlink(notePath(dataDir, id)).catch(error => {
        if (!isMissingFile(error)) throw error;
      });
      return NextResponse.json({ value: null, filePath: notePath(dataDir, id) });
    }
    if (key === NOTE_DOWN_WORKSPACE_KEY || key === NOTE_DOWN_INDEX_KEY) {
      await unlink(indexPath).catch(error => {
        if (!isMissingFile(error)) throw error;
      });
      return NextResponse.json({ value: null, filePath: indexPath });
    }
    return NextResponse.json({ value: null });
  }

  if (key === NOTE_DOWN_BATCH_KEY) {
    const batch = asRecord(value);
    const workspace = normalizeWorkspaceIndex(batch?.workspace);
    const note = normalizeNoteValue(batch?.note);
    if (!workspace || !note) throw new Error("笔记批量存储数据无效。");
    await writeNote(dataDir, note.id, note.text);
    await writeWorkspaceIndex(indexPath, workspace);
    return NextResponse.json({ value: workspace, filePath: indexPath });
  }

  if (key === NOTE_DOWN_WORKSPACE_KEY) {
    const workspace = normalizeHydratedWorkspace(value);
    if (!workspace) throw new Error("笔记工作区数据无效。");
    await persistHydratedWorkspace(dataDir, indexPath, workspace);
    return NextResponse.json({ value: workspace, filePath: indexPath });
  }

  if (key === NOTE_DOWN_INDEX_KEY) {
    const workspace = normalizeWorkspaceIndex(value);
    if (!workspace) throw new Error("笔记索引数据无效。");
    await writeWorkspaceIndex(indexPath, workspace);
    return NextResponse.json({ value: workspace, filePath: indexPath });
  }

  if (key.startsWith(NOTE_KEY_PREFIX)) {
    const id = validNoteId(key.slice(NOTE_KEY_PREFIX.length));
    const note = normalizeNoteValue(value);
    if (!note || note.id !== id) throw new Error("笔记内容数据无效。");
    await writeNote(dataDir, id, note.text);
    return NextResponse.json({ value: note, filePath: notePath(dataDir, id) });
  }

  return NextResponse.json({ value: null });
}

async function persistHydratedWorkspace(dataDir: string, indexPath: string, workspace: Record<string, unknown>) {
  const notes = Array.isArray(workspace.notes) ? workspace.notes as NoteValue[] : [];
  const flat = flattenHydratedNotes(notes);
  for (let start = 0; start < flat.length; start += 32) {
    await Promise.all(flat.slice(start, start + 32).map(note => writeNote(dataDir, note.id, note.text)));
  }
  await writeWorkspaceIndex(indexPath, {
    ...workspace,
    schemaVersion: 3,
    notes: stripNoteText(notes),
  });
}

async function hydrateWorkspace(dataDir: string, value: unknown) {
  const workspace = normalizeWorkspaceIndex(value);
  if (!workspace) return null;
  const indexNotes = workspace.notes as NoteIndexNode[];
  const activeId = String(workspace.activeId || "");
  const activeText = activeId ? await readNote(dataDir, activeId) : "";
  const attachActiveText = (nodes: NoteIndexNode[]): Array<NoteIndexNode & { text: string | null }> => nodes.map(note => ({
    ...note,
    text: note.id === activeId ? activeText : null,
    children: attachActiveText(note.children),
  }));
  return { ...workspace, notes: attachActiveText(indexNotes) };
}

function normalizeHydratedWorkspace(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.notes)) return null;
  const notes = normalizeHydratedNotes(record.notes);
  if (!notes) return null;
  return normalizeWorkspaceFields(record, notes);
}

function normalizeWorkspaceIndex(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.notes)) return null;
  const notes = normalizeIndexNotes(record.notes);
  if (!notes) return null;
  return normalizeWorkspaceFields(record, notes);
}

function normalizeWorkspaceFields(record: Record<string, unknown>, notes: NoteIndexNode[] | NoteValue[]) {
  const flat = flattenIndexNotes(notes);
  const ids = new Set(flat.map(note => note.id));
  if (ids.size !== flat.length) throw new Error("笔记索引包含重复 ID，数据无效。");
  const activeId = typeof record.activeId === "string" && ids.has(record.activeId) ? record.activeId : notes[0]?.id || "";
  const expandedIds = [...new Set(Array.isArray(record.expandedIds)
    ? record.expandedIds.filter((id): id is string => typeof id === "string" && ids.has(id))
    : [])];
  return {
    schemaVersion: 3,
    notes,
    activeId,
    expandedIds,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}

function normalizeIndexNotes(value: unknown[]): NoteIndexNode[] | null {
  const notes: NoteIndexNode[] = [];
  for (const candidate of value) {
    const record = asRecord(candidate);
    if (!record || !Array.isArray(record.children)) return null;
    const children = normalizeIndexNotes(record.children);
    if (!children) return null;
    notes.push({
      id: validNoteId(record.id),
      title: typeof record.title === "string" ? record.title.slice(0, 500) : "未命名笔记",
      time: typeof record.time === "string" ? record.time.slice(0, 100) : "刚刚",
      children,
    });
  }
  return notes;
}

function normalizeHydratedNotes(value: unknown[]): NoteValue[] | null {
  const notes: NoteValue[] = [];
  for (const candidate of value) {
    const record = asRecord(candidate);
    if (!record || !Array.isArray(record.children) || typeof record.text !== "string") return null;
    const children = normalizeHydratedNotes(record.children);
    if (!children) return null;
    notes.push({
      id: validNoteId(record.id),
      title: typeof record.title === "string" ? record.title.slice(0, 500) : "未命名笔记",
      time: typeof record.time === "string" ? record.time.slice(0, 100) : "刚刚",
      text: record.text,
      children,
    });
  }
  return notes;
}

function normalizeNoteValue(value: unknown): NoteValue | null {
  const record = asRecord(value);
  if (!record || typeof record.text !== "string") return null;
  return {
    id: validNoteId(record.id),
    title: typeof record.title === "string" ? record.title.slice(0, 500) : "未命名笔记",
    time: typeof record.time === "string" ? record.time.slice(0, 100) : "刚刚",
    text: record.text,
    children: [],
  };
}

function stripNoteText(notes: NoteValue[]): NoteIndexNode[] {
  return notes.map(({ id, title, time, children }) => ({ id, title, time, children: stripNoteText(children as NoteValue[]) }));
}

function flattenHydratedNotes(notes: NoteValue[]): NoteValue[] {
  return notes.flatMap(note => [note, ...flattenHydratedNotes(note.children as NoteValue[])]);
}

function flattenIndexNotes(notes: NoteIndexNode[] | NoteValue[]): NoteIndexNode[] {
  return notes.flatMap(note => [note, ...flattenIndexNotes(note.children)]);
}

async function writeWorkspaceIndex(indexPath: string, workspace: Record<string, unknown>) {
  const serialized = `${JSON.stringify(workspace, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_INDEX_SIZE) throw new Error("笔记索引不能超过 20 MB。");
  await atomicWrite(indexPath, serialized);
}

async function writeNote(dataDir: string, id: string, text: string) {
  if (Buffer.byteLength(text, "utf8") > MAX_NOTE_SIZE) throw new Error("单篇笔记不能超过 40 MB。");
  const filePath = notePath(dataDir, id);
  try {
    if (await readFile(filePath, "utf8") === text) return;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  await atomicWrite(filePath, text);
}

async function readNote(dataDir: string, id: string) {
  try {
    return await readFile(notePath(dataDir, id), "utf8");
  } catch (error) {
    if (isMissingFile(error)) return "";
    throw error;
  }
}

function notePath(dataDir: string, id: string) {
  const safeId = validNoteId(id);
  const shard = safeId.slice(0, 2).toLowerCase().padEnd(2, "_");
  return path.join(dataDir, "notes", shard, `${safeId}.md`);
}

function validNoteId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new Error("笔记 ID 无效。");
  return value;
}

async function atomicWrite(filePath: string, content: string) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.write-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

async function getNoteDownDirectory(userId: string) {
  const outputDir = path.resolve(platformPaths().projectsDir, NOTE_DOWN_PROJECT, "outputs");
  if (await readJson(path.join(outputDir, "workspace.json"))) return outputDir;

  const agent = await getDefaultAgent(userId);
  if (!agent) return outputDir;
  const workspaceDir = resolveWorkspaceDirectory(
    typeof agent.workspace_dir === "string" ? agent.workspace_dir : undefined,
  );
  const legacyDir = path.join(workspaceDir, "data", "projects", NOTE_DOWN_PROJECT);
  if (await readJson(path.join(legacyDir, "workspace.json"))) {
    await mkdir(path.dirname(outputDir), { recursive: true });
    await cp(legacyDir, outputDir, { recursive: true, errorOnExist: true, force: false });
  }
  return outputDir;
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

async function readStorage(storagePath: string): Promise<Record<string, unknown>> {
  const value = await readJson(storagePath);
  return value || {};
}

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return asRecord(parsed);
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(asRecord(value));
}

function isMissingFile(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

async function projectHasPermission(projectId: string) {
  try {
    const manifestPath = path.resolve(platformPaths().projectsDir, projectId, "project.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { permissions?: unknown };
    return Array.isArray(manifest.permissions) && manifest.permissions.includes(STORAGE_PERMISSION);
  } catch {
    return false;
  }
}
