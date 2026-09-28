import { NextRequest, NextResponse } from "next/server";
import { platformPaths } from "@backend/config/paths";
import { readObjectTable, tablePath, writeJson } from "@backend/shared/database";

type McpPayload = {
  id?: string;
  name?: string;
  endpoint?: string;
  authorization?: string;
  headers?: Record<string, string>;
  registryName?: string;
};

type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export async function listMcpServers(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ servers: [] });

  const rows = await readObjectTable(platformPaths().databaseDir, "mcp_servers");
  const servers = Object.values(rows)
    .flatMap((row) => {
      if (!isRecord(row) || row.owner_user_id !== userId) return [];
      return [{
        id: text(row.id),
        name: text(row.name),
        endpoint: text(row.endpoint),
        transport: "streamable-http",
        tools: normalizeTools(row.tools),
        status: text(row.status) || "connected",
        lastSyncedAt: text(row.last_synced_at),
        createdAt: text(row.created_at),
        hasAuthorization: Boolean(text(row.authorization)),
        hasCredentials: Boolean(text(row.authorization)) || Object.keys(normalizeHeaders(row.headers)).length > 0,
        registryName: text(row.registry_name),
      }];
    })
    .filter((server) => server.id && server.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ servers });
}

export async function createMcpServer(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再添加 MCP Server。" }, { status: 401 });

  const payload = await readPayload(request);
  if (!payload) return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });

  const name = payload.name?.trim() || "";
  const endpoint = normalizeEndpoint(payload.endpoint);
  if (!name) return NextResponse.json({ error: "请输入 Server 名称。" }, { status: 400 });
  if (!endpoint) return NextResponse.json({ error: "请输入有效的 HTTP(S) MCP Endpoint。" }, { status: 400 });

  const databaseDir = platformPaths().databaseDir;
  const rows = await readObjectTable(databaseDir, "mcp_servers");
  const duplicate = Object.values(rows).some((row) =>
    isRecord(row) && row.owner_user_id === userId && (text(row.name) === name || text(row.endpoint) === endpoint),
  );
  if (duplicate) return NextResponse.json({ error: "同名或相同 Endpoint 的 MCP Server 已存在。" }, { status: 409 });

  let tools: McpTool[];
  try {
    tools = await discoverMcpTools(endpoint, requestHeaders(payload));
  } catch (error) {
    return NextResponse.json({ error: formatMcpError(error) }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = uniqueId(name);
  const server = {
    id,
    owner_user_id: userId,
    name,
    endpoint,
    transport: "streamable-http",
    authorization: payload.authorization?.trim() || "",
    headers: normalizeHeaders(payload.headers),
    registry_name: payload.registryName?.trim() || "",
    tools,
    status: "connected",
    last_synced_at: now,
    created_at: now,
    updated_at: now,
  };
  rows[id] = server;
  await writeJson(tablePath(databaseDir, "mcp_servers"), rows);
  return NextResponse.json({ server: publicServer(server) });
}

export async function updateMcpServer(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再同步 MCP Server。" }, { status: 401 });
  const payload = await readPayload(request);
  const id = payload?.id?.trim();
  if (!id) return NextResponse.json({ error: "缺少 MCP Server 标识。" }, { status: 400 });

  const databaseDir = platformPaths().databaseDir;
  const rows = await readObjectTable(databaseDir, "mcp_servers");
  const current = rows[id];
  if (!isRecord(current) || current.owner_user_id !== userId) {
    return NextResponse.json({ error: "MCP Server 不存在或无权修改。" }, { status: 404 });
  }

  try {
    const tools = await discoverMcpTools(text(current.endpoint), storedHeaders(current));
    const now = new Date().toISOString();
    const next = { ...current, tools, status: "connected", last_synced_at: now, updated_at: now };
    rows[id] = next;
    await writeJson(tablePath(databaseDir, "mcp_servers"), rows);
    return NextResponse.json({ server: publicServer(next) });
  } catch (error) {
    return NextResponse.json({ error: formatMcpError(error) }, { status: 400 });
  }
}

export async function deleteMcpServers(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再删除 MCP Server。" }, { status: 401 });
  const payload = await readPayload(request);
  const id = payload?.id?.trim();
  if (!id) return NextResponse.json({ error: "缺少 MCP Server 标识。" }, { status: 400 });

  const databaseDir = platformPaths().databaseDir;
  const [rows, agents] = await Promise.all([
    readObjectTable(databaseDir, "mcp_servers"),
    readObjectTable(databaseDir, "agents"),
  ]);
  const current = rows[id];
  if (!isRecord(current) || current.owner_user_id !== userId) {
    return NextResponse.json({ error: "MCP Server 不存在或无权删除。" }, { status: 404 });
  }
  delete rows[id];
  const prefix = `mcp:${id}:`;
  for (const [agentId, agent] of Object.entries(agents)) {
    if (!isRecord(agent) || agent.owner_user_id !== userId) continue;
    agents[agentId] = {
      ...agent,
      enabled_tool_ids: normalizeIds(agent.enabled_tool_ids).filter((toolId) => !toolId.startsWith(prefix)),
      updated_at: new Date().toISOString(),
    };
  }
  await Promise.all([
    writeJson(tablePath(databaseDir, "mcp_servers"), rows),
    writeJson(tablePath(databaseDir, "agents"), agents),
  ]);
  return NextResponse.json({ deletedId: id });
}

async function discoverMcpTools(endpoint: string, configuredHeaders: Record<string, string>): Promise<McpTool[]> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  Object.assign(headers, configuredHeaders);

  const initialized = await mcpRequest(endpoint, headers, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "SiinX", version: "0.1.0" },
    },
  });
  const initializeBody = await readMcpBody(initialized);
  if (isRecord(initializeBody.error)) {
    throw new Error(text(initializeBody.error.message) || "Server 拒绝 initialize 请求");
  }
  const sessionId = initialized.headers.get("mcp-session-id");
  if (sessionId) headers["mcp-session-id"] = sessionId;

  await mcpRequest(endpoint, headers, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }, true);
  const listed = await mcpRequest(endpoint, headers, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  const body = await readMcpBody(listed);
  if (isRecord(body.error)) throw new Error(text(body.error.message) || "Server 返回 tools/list 错误");
  const result = isRecord(body.result) ? body.result : {};
  return normalizeTools(result.tools);
}

async function mcpRequest(endpoint: string, headers: Record<string, string>, body: unknown, allowEmpty = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) throw new Error(`Server 返回 HTTP ${response.status}`);
    if (!allowEmpty && !response.body) throw new Error("Server 没有返回响应");
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function readMcpBody(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("text/event-stream")
    ? raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).find(Boolean) || ""
    : raw;
  const parsed = JSON.parse(payload) as unknown;
  if (!isRecord(parsed)) throw new Error("Server 返回了无效的 MCP 响应");
  return parsed;
}

function normalizeTools(value: unknown): McpTool[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tool) => {
    if (!isRecord(tool) || !text(tool.name)) return [];
    return [{
      name: text(tool.name),
      description: text(tool.description) || "No description provided by the MCP server.",
      inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : { type: "object", properties: {} },
    }];
  });
}

function publicServer(server: Record<string, unknown>) {
  return {
    id: text(server.id), name: text(server.name), endpoint: text(server.endpoint),
    transport: "streamable-http", tools: normalizeTools(server.tools), status: "connected",
    lastSyncedAt: text(server.last_synced_at), hasAuthorization: Boolean(text(server.authorization)),
    hasCredentials: Boolean(text(server.authorization)) || Object.keys(normalizeHeaders(server.headers)).length > 0,
    registryName: text(server.registry_name),
  };
}

function normalizeEndpoint(value: unknown) {
  try {
    const url = new URL(typeof value === "string" ? value.trim() : "");
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch { return ""; }
}

function uniqueId(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "server";
  return `mcp_${slug}_${Date.now().toString(36)}`;
}

function normalizeIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeHeaders(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([name, raw]) => {
    const headerName = name.trim();
    const headerValue = text(raw).trim();
    return headerName && headerValue ? [[headerName, headerValue]] : [];
  }));
}

function requestHeaders(payload: McpPayload) {
  const headers = normalizeHeaders(payload.headers);
  const authorization = payload.authorization?.trim();
  if (authorization && !Object.keys(headers).some((name) => name.toLowerCase() === "authorization")) {
    headers.Authorization = authorization;
  }
  return headers;
}

function storedHeaders(server: Record<string, unknown>) {
  const headers = normalizeHeaders(server.headers);
  const authorization = text(server.authorization).trim();
  if (authorization && !Object.keys(headers).some((name) => name.toLowerCase() === "authorization")) {
    headers.Authorization = authorization;
  }
  return headers;
}

async function readPayload(request: NextRequest): Promise<McpPayload | null> {
  try { return await request.json() as McpPayload; } catch { return null; }
}

function formatMcpError(error: unknown) {
  if (isRecord(error) && error.name === "AbortError") return "连接 MCP Server 超时，请检查 Endpoint。";
  const detail = error instanceof Error ? error.message : String(error || "");
  return `无法连接 MCP Server${detail ? `：${detail}` : "。"}`;
}

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
