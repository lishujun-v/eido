import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { platformPaths } from "@backend/config/paths";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
};

export async function GET(_request: Request, context: { params: Promise<{ projectId: string; filePath: string[] }> }) {
  const { projectId, filePath } = await context.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId) || !filePath.length || filePath.some((part) => !part || part === "." || part === "..")) return new NextResponse("Not found", { status: 404 });
  const projectDir = path.resolve(platformPaths().projectsDir, projectId);
  const requestedFile = path.resolve(projectDir, ...filePath);
  if (!requestedFile.startsWith(`${projectDir}${path.sep}`)) return new NextResponse("Not found", { status: 404 });
  try {
    const body = await readFile(requestedFile);
    return new NextResponse(body, { headers: { "Content-Type": CONTENT_TYPES[path.extname(requestedFile).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
