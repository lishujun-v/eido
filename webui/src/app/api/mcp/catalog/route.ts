import { NextRequest, NextResponse } from "next/server";

const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";

type RegistryField = {
  name: string;
  description: string;
  required: boolean;
  secret: boolean;
  defaultValue: string;
  choices: string[];
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  const params = new URLSearchParams({ limit: "60" });
  if (query) params.set("search", query);

  try {
    const response = await fetch(`${REGISTRY_URL}?${params}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Registry 返回 HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.servers)) throw new Error("Registry 返回了无效数据");

    const latestByName = new Map<string, NonNullable<ReturnType<typeof normalizeEntry>>>();
    for (const item of payload.servers) {
      const entry = normalizeEntry(item);
      if (!entry || entry.status !== "active") continue;
      const previous = latestByName.get(entry.registryName);
      if (!previous || entry.isLatest || compareVersions(entry.version, previous.version) > 0) {
        latestByName.set(entry.registryName, entry);
      }
    }

    const servers = [...latestByName.values()]
      .filter((server) => server.remotes.length > 0 || server.packages.length > 0)
      .sort((a, b) => Number(Boolean(b.remotes.length)) - Number(Boolean(a.remotes.length)) || a.title.localeCompare(b.title));
    return NextResponse.json({ servers, source: "official-mcp-registry" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: `读取官方 MCP Registry 失败：${detail}` }, { status: 502 });
  }
}

function normalizeEntry(value: unknown) {
  if (!isRecord(value) || !isRecord(value.server)) return null;
  const server = value.server;
  const meta = isRecord(value._meta) && isRecord(value._meta["io.modelcontextprotocol.registry/official"])
    ? value._meta["io.modelcontextprotocol.registry/official"] as Record<string, unknown>
    : {};
  const registryName = text(server.name);
  if (!registryName) return null;

  const remotes = Array.isArray(server.remotes) ? server.remotes.flatMap((remote) => {
    if (!isRecord(remote) || !["streamable-http", "sse"].includes(text(remote.type)) || !text(remote.url)) return [];
    const variables = isRecord(remote.variables)
      ? Object.entries(remote.variables).map(([name, field]) => normalizeField(name, field))
      : [];
    const headers = Array.isArray(remote.headers) ? remote.headers.flatMap((header) => {
      if (!isRecord(header) || !text(header.name)) return [];
      const valueTemplate = text(header.value) || `{${text(header.name)}}`;
      return [{
        ...normalizeField(text(header.name), header),
        valueTemplate,
        placeholders: [...valueTemplate.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]),
      }];
    }) : [];
    return [{ type: text(remote.type), url: text(remote.url), variables, headers }];
  }) : [];

  const packages = Array.isArray(server.packages) ? server.packages.flatMap((pkg) => {
    if (!isRecord(pkg) || !text(pkg.registryType) || !text(pkg.identifier)) return [];
    return [{
      registryType: text(pkg.registryType), identifier: text(pkg.identifier), version: text(pkg.version),
      runtimeHint: text(pkg.runtimeHint), transport: isRecord(pkg.transport) ? text(pkg.transport.type) : "stdio",
    }];
  }) : [];

  return {
    registryName,
    title: text(server.title) || registryName.split("/").at(-1) || registryName,
    description: text(server.description) || "No description provided.",
    version: text(server.version),
    repositoryUrl: isRecord(server.repository) ? text(server.repository.url) : "",
    status: text(meta.status) || "active",
    isLatest: meta.isLatest === true,
    remotes,
    packages,
  };
}

function normalizeField(name: string, value: unknown): RegistryField {
  const field = isRecord(value) ? value : {};
  return {
    name, description: text(field.description), required: field.isRequired === true, secret: field.isSecret === true,
    defaultValue: text(field.default),
    choices: Array.isArray(field.choices) ? field.choices.filter((choice): choice is string => typeof choice === "string") : [],
  };
}

function compareVersions(a: string, b: string) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
