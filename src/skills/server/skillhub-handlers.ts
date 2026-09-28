import { cp, lstat, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { NextRequest, NextResponse } from "next/server";
import { platformPaths } from "@backend/config/paths";
import { readObjectTable, tablePath, writeJson, type ObjectTable } from "@backend/shared/database";

const execFile = promisify(execFileCallback);
const registry = (process.env.SKILLHUB_REGISTRY_URL || "https://skill.xfyun.cn").replace(/\/$/, "");
const maxArchiveBytes = 30 * 1024 * 1024;
const maxFiles = 200;

export async function listSkillHub(request: NextRequest) {
  if (!request.cookies.get("eido_user_id")?.value.trim()) return NextResponse.json({ results: [] });
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (!query) return NextResponse.json({ results: [] });
  try {
    const response = await fetch(`${registry}/api/v1/search?q=${encodeURIComponent(query)}&page=0&limit=12`, {
      signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`SkillHub returned ${response.status}`);
    const payload = await response.json() as { results?: unknown[] };
    const basicResults = Array.isArray(payload.results) ? payload.results.flatMap(toSearchResult) : [];
    const results = await Promise.all(basicResults.map(enrichSearchResult));
    return NextResponse.json({ results, registry });
  } catch {
    return NextResponse.json({ error: "暂时无法连接 SkillHub，请稍后重试。" }, { status: 502 });
  }
}

export async function installSkillFromHub(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再导入 Skill。" }, { status: 401 });
  const body = await request.json().catch(() => null) as { slug?: unknown; version?: unknown } | null;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const version = typeof body?.version === "string" ? body.version.trim() : "latest";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*(--[a-zA-Z0-9][a-zA-Z0-9_-]*)?$/.test(slug)) {
    return NextResponse.json({ error: "SkillHub Skill 标识无效。" }, { status: 400 });
  }
  try {
    const resolved = await fetch(`${registry}/api/v1/resolve?slug=${encodeURIComponent(slug)}&version=${encodeURIComponent(version)}`, {
      signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" },
    });
    if (!resolved.ok) throw new Error("resolve failed");
    const detail = await resolved.json() as { match?: { version?: unknown } };
    const resolvedVersion = typeof detail.match?.version === "string" ? detail.match.version : version;
    const initialDownload = await fetch(`${registry}/api/v1/download?slug=${encodeURIComponent(slug)}&version=${encodeURIComponent(resolvedVersion)}`, {
      signal: AbortSignal.timeout(15_000), redirect: "manual",
    });
    const downloadPath = initialDownload.headers.get("location");
    const cookies = typeof initialDownload.headers.getSetCookie === "function"
      ? initialDownload.headers.getSetCookie().map((item) => item.split(";", 1)[0]).join("; ")
      : "";
    if (!downloadPath) throw new Error("missing download URL");
    const archiveResponse = await fetch(new URL(downloadPath, registry), {
      signal: AbortSignal.timeout(30_000), redirect: "follow", headers: cookies ? { Cookie: cookies } : {},
    });
    const bytes = Number(archiveResponse.headers.get("content-length") || 0);
    if (!archiveResponse.ok || bytes > maxArchiveBytes) throw new Error("archive unavailable or too large");
    const archive = Buffer.from(await archiveResponse.arrayBuffer());
    if (archive.byteLength > maxArchiveBytes) throw new Error("archive too large");
    return await saveArchive({ userId, slug, version: resolvedVersion, archive });
  } catch {
    return NextResponse.json({ error: "无法下载或校验该 SkillHub Skill。" }, { status: 502 });
  }
}

async function saveArchive({ userId, slug, version, archive }: { userId: string; slug: string; version: string; archive: Buffer }) {
  const staging = await mkdtemp(path.join(tmpdir(), "eido-skillhub-"));
  const archivePath = path.join(staging, "skill.zip");
  try {
    await writeFile(archivePath, archive);
    const { stdout } = await execFile("/usr/bin/unzip", ["-Z1", archivePath], { maxBuffer: 1024 * 1024 });
    const entries = stdout.split(/\r?\n/).filter(Boolean).filter((entry) => !entry.endsWith("/"));
    if (!entries.length || entries.length > maxFiles || entries.some((entry) => !safePath(entry))) throw new Error("unsafe archive");
    await execFile("/usr/bin/unzip", ["-qq", archivePath, "-d", path.join(staging, "content")]);
    await assertNoSymlinks(path.join(staging, "content"));
    const source = await skillRoot(path.join(staging, "content"));
    const skillContent = await readFile(path.join(source, "SKILL.md"), "utf8");
    const name = frontmatter(skillContent, "name");
    const description = frontmatter(skillContent, "description");
    if (!validName(name) || !description) throw new Error("invalid SKILL.md");

    const databaseDir = platformPaths().databaseDir;
    const skills = await readObjectTable(databaseDir, "skills");
    if (Object.values(skills).some((item) => isRecord(item) && item.owner_user_id === userId && string(item.name) === name)) {
      return NextResponse.json({ error: "同名 Skill 已存在。" }, { status: 409 });
    }
    const id = `skill_${name}_${Date.now().toString(36)}`;
    const packageDir = path.join("custom", id);
    await cp(source, path.join(platformPaths().skillsDir, packageDir), { recursive: true, errorOnExist: true });
    const now = new Date().toISOString();
    skills[id] = {
      id, owner_user_id: userId, name, description, content: stripFrontmatter(skillContent), package_dir: packageDir,
      file_count: entries.length, source: "skillhub", source_slug: slug, source_version: version, source_registry: registry,
      created_at: now, updated_at: now,
    };
    await writeJson(tablePath(databaseDir, "skills"), skills);
    return NextResponse.json({ skill: skills[id] });
  } catch {
    return NextResponse.json({ error: "SkillHub 包未通过安全校验。" }, { status: 400 });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function skillRoot(root: string): Promise<string> {
  if (await exists(path.join(root, "SKILL.md"))) return root;
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (dirs.length === 1 && await exists(path.join(root, dirs[0].name, "SKILL.md"))) return path.join(root, dirs[0].name);
  throw new Error("missing SKILL.md");
}

async function assertNoSymlinks(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    if ((await lstat(item)).isSymbolicLink()) throw new Error("symlink in archive");
    if (entry.isDirectory()) await assertNoSymlinks(item);
  }
}

async function exists(file: string) { try { return (await stat(file)).isFile(); } catch { return false; } }
function safePath(value: string) { return !value.startsWith("/") && !value.includes("\\") && value.split("/").every((part) => part && part !== "." && part !== ".."); }
function frontmatter(content: string, key: string) { const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/); return match?.[1].split(/\r?\n/).find((line) => line.trim().startsWith(`${key}:`))?.split(":").slice(1).join(":").trim().replace(/^["']|["']$/g, "") || ""; }
function stripFrontmatter(content: string) { return content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*/, "").trim(); }
function validName(value: string) { return /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(value); }
function string(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function isRecord(value: unknown): value is ObjectTable { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
async function enrichSearchResult(result: SearchResult): Promise<SearchResult> {
  try {
    const response = await fetch(`${registry}/api/v1/skills/${encodeURIComponent(result.slug)}`, {
      signal: AbortSignal.timeout(5_000), headers: { Accept: "application/json" },
    });
    if (!response.ok) return result;
    const payload = await response.json() as { skill?: unknown };
    const skill = isRecord(payload.skill) ? payload.skill : {};
    const stats = isRecord(skill.stats) ? skill.stats : {};
    return {
      ...result,
      sourceUrl: sourceUrl(skill) || result.sourceUrl,
      downloads: numberValue(stats.downloadCount) ?? numberValue(stats.downloads),
      stars: numberValue(stats.starCount) ?? numberValue(stats.stars) ?? numberValue(stats.favoriteCount),
      rating: numberValue(stats.rating) ?? numberValue(stats.averageRating),
    };
  } catch { return result; }
}

type SearchResult = { slug: string; name: string; description: string; version: string; score?: number; downloads?: number; stars?: number; rating?: number; sourceUrl?: string };
function numberValue(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function toSearchResult(value: unknown): SearchResult[] {
  if (!isRecord(value) || !string(value.slug)) return [];
  const slug = string(value.slug);
  return [{ slug, name: string(value.displayName) || string(value.name) || slug, description: string(value.summary) || string(value.description), version: string(value.version) || "latest", score: numberValue(value.score), sourceUrl: sourceUrl(value) }];
}
function sourceUrl(value: ObjectTable) {
  for (const key of ["githubUrl", "github_url", "repository", "repositoryUrl", "repoUrl", "sourceUrl", "homepage"]) {
    const candidate = string(value[key]);
    if (/^https:\/\/(github\.com|www\.github\.com)\//i.test(candidate)) return candidate;
  }
  return undefined;
}
