import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { platformPaths } from "@backend/config/paths";

type ProjectManifest = {
  name?: string;
  description?: string;
  version?: string;
  entry?: string;
  icon?: string;
  accent?: string;
  tags?: string[];
  permissions?: string[];
};

export async function GET() {
  const projectsDir = platformPaths().projectsDir;
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    const projects = await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map(async (entry) => {
      try {
        const manifest = JSON.parse(await readFile(path.join(projectsDir, entry.name, "project.json"), "utf8")) as ProjectManifest;
        const projectEntry = normalizeEntry(manifest.entry || "index.html");
        await access(path.join(projectsDir, entry.name, projectEntry));
        if (!manifest.name) return null;
        return {
          id: entry.name,
          name: manifest.name,
          description: manifest.description || "",
          version: manifest.version || "1.0.0",
          entry: projectEntry,
          icon: manifest.icon || "◆",
          accent: manifest.accent || "#6c63ff",
          tags: stringList(manifest.tags),
          permissions: stringList(manifest.permissions),
        };
      } catch { return null; }
    }));
    return NextResponse.json({ projects: projects.filter(Boolean) });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "ENOENT") return NextResponse.json({ projects: [] });
    return NextResponse.json({ error: "无法读取 projects 目录。" }, { status: 500 });
  }
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeEntry(entry: string) {
  const normalized = path.posix.normalize(entry.replaceAll("\\", "/")).replace(/^\/+/, "");
  if (!normalized || normalized === ".." || normalized.startsWith("../")) throw new Error("Invalid project entry");
  return normalized;
}
