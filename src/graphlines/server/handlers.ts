import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { platformPaths } from "@backend/config/paths";
import { databaseDir, readObjectTable } from "@backend/shared/database";

const AGENT_API_URL = process.env.EIDO_AGENT_API_URL ?? "http://127.0.0.1:8000";

export async function listGraphlines(request: NextRequest) {
  const directory = platformPaths().graphsDir;
  const graphId = request.nextUrl.searchParams.get("graphId")?.trim() || "";
  const includeRuns = request.nextUrl.searchParams.get("runs") === "1";
  if (graphId && !/^graph-[a-zA-Z0-9_-]+$/.test(graphId)) {
    return NextResponse.json({ error: "Graph ID 格式无效。" }, { status: 400 });
  }
  try {
    if (graphId) {
      if (includeRuns) {
        const userId = request.cookies.get("eido_user_id")?.value.trim();
        if (!userId) return NextResponse.json({ error: "请先登录后再查看运行记录。" }, { status: 401 });
        const requestedAgentId = request.nextUrl.searchParams.get("agentId")?.trim() || "";
        const agents = await readObjectTable(databaseDir(), "agents");
        const agent = Object.values(agents).find((value) => isRecord(value) && value.owner_user_id === userId && value.agent_type === "siinx" && (!requestedAgentId || value.id === requestedAgentId));
        if (!isRecord(agent) || typeof agent.id !== "string") return NextResponse.json({ runs: [] });
        return NextResponse.json({ runs: await readLocalRuns(graphId, agent.id) });
      }
      try {
        const graph = JSON.parse(
          await readFile(path.join(directory, graphId, "graph.json"), "utf8"),
        );
        return NextResponse.json({ graph });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : "";
        if (code === "ENOENT") {
          return NextResponse.json({ error: "业务线不存在。" }, { status: 404 });
        }
        throw error;
      }
    }
    const files = await readdir(directory, { withFileTypes: true });
    const graphFiles = files.flatMap((entry) => entry.isDirectory() ? [path.join(directory, entry.name, "graph.json")] : entry.isFile() && entry.name.endsWith(".json") ? [path.join(directory, entry.name)] : []);
    const graphs = (await Promise.all(graphFiles
      .map(async (filePath) => {
        try {
          const value = JSON.parse(await readFile(filePath, "utf8"));
          return value && typeof value === "object" ? value as Record<string, unknown> : null;
        } catch {
          return null;
        }
      })))
      .filter((value): value is Record<string, unknown> => value !== null)
      .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
    return NextResponse.json({ graphs });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "ENOENT") return NextResponse.json({ graphs: [] });
    return NextResponse.json({ error: "无法读取 graphs 目录。" }, { status: 500 });
  }
}

export async function createGraphline(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再运行 Graph。" }, { status: 401 });
  let payload: { graphId?: string; agentId?: string; input?: string; runId?: string; interactionResponse?: string };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 }); }
  if (!payload.graphId?.trim()) return NextResponse.json({ error: "缺少 Graph ID。" }, { status: 400 });
  const agents = await readObjectTable(databaseDir(), "agents");
  const agent = Object.values(agents).find((value) => isRecord(value) && value.owner_user_id === userId && value.agent_type === "siinx" && (!payload.agentId || value.id === payload.agentId));
  if (!isRecord(agent) || typeof agent.id !== "string") return NextResponse.json({ error: "当前用户还没有可运行 Graph 的 SiinX Agent。" }, { status: 404 });
  try {
    const response = await fetch(`${AGENT_API_URL}/graphs/run`, {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ graph_id: payload.graphId, agent_id: agent.id, input: payload.input || "", run_id: payload.runId || undefined, interaction_response: payload.interactionResponse || "" }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return NextResponse.json({ error: errorMessage(data) || "Graph 运行失败。" }, { status: response.status });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: `无法连接 Agent 服务：${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}

export async function runGraphline(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再查看运行状态。" }, { status: 401 });
  let payload: { graphId?: string; agentId?: string; runId?: string };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 }); }
  if (!payload.graphId?.trim() || !payload.runId?.trim()) return NextResponse.json({ error: "缺少 Graph ID 或 Run ID。" }, { status: 400 });
  const agents = await readObjectTable(databaseDir(), "agents");
  const agent = Object.values(agents).find((value) => isRecord(value) && value.owner_user_id === userId && value.agent_type === "siinx" && (!payload.agentId || value.id === payload.agentId));
  if (!isRecord(agent) || typeof agent.id !== "string") return NextResponse.json({ error: "当前用户还没有可运行 Graph 的 SiinX Agent。" }, { status: 404 });
  const localRun = await readLocalRun(payload.graphId, payload.runId, agent.id);
  if (localRun) return NextResponse.json({ run: localRun });
  try {
    const target = `${AGENT_API_URL}/graphs/run/${encodeURIComponent(payload.graphId)}/${encodeURIComponent(payload.runId)}?agent_id=${encodeURIComponent(agent.id)}`;
    const response = await fetch(target, { cache: "no-store" });
    const { data, text } = await readResponse(response);
    if (!response.ok) return NextResponse.json({ error: errorMessage(data) || text || "无法读取 Graph 运行状态。" }, { status: response.status });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: `无法连接 Agent 服务：${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}

export async function deleteGraphline(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再删除运行记录。" }, { status: 401 });
  let payload: { graphId?: string; agentId?: string; runId?: string; clear?: boolean };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 }); }
  const graphId = payload.graphId?.trim() || "";
  if (!/^graph-[a-zA-Z0-9_-]+$/.test(graphId)) return NextResponse.json({ error: "Graph ID 格式无效。" }, { status: 400 });
  if (!payload.clear && !/^run-[a-f0-9]{12}$/.test(payload.runId?.trim() || "")) return NextResponse.json({ error: "缺少有效的 Run ID。" }, { status: 400 });
  const agents = await readObjectTable(databaseDir(), "agents");
  const agent = Object.values(agents).find((value) => isRecord(value) && value.owner_user_id === userId && value.agent_type === "siinx" && (!payload.agentId || value.id === payload.agentId));
  if (!isRecord(agent) || typeof agent.id !== "string") return NextResponse.json({ error: "当前用户还没有可运行 Graph 的 SiinX Agent。" }, { status: 404 });

  const targets = payload.clear
    ? await readLocalRuns(graphId, agent.id)
    : [await readLocalRun(graphId, payload.runId!.trim(), agent.id)].filter((value): value is Record<string, unknown> => value !== null);
  await Promise.all(targets.map(async (run) => {
    if (typeof run.id !== "string") return;
    try { await unlink(path.join(platformPaths().graphsDir, graphId, "runs", `${run.id}.json`)); } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "";
      if (code !== "ENOENT") throw error;
    }
  }));
  return NextResponse.json({ removedRunIds: targets.map((run) => run.id) });
}

async function readLocalRun(graphId: string, runId: string, agentId: string): Promise<Record<string, unknown> | null> {
  if (!/^graph-[a-zA-Z0-9_-]+$/.test(graphId) || !/^run-[a-f0-9]{12}$/.test(runId)) return null;
  try {
    const value: unknown = JSON.parse(await readFile(path.join(platformPaths().graphsDir, graphId, "runs", `${runId}.json`), "utf8"));
    if (!isRecord(value) || value.id !== runId || value.graph_id !== graphId || value.agent_id !== agentId) return null;
    return value;
  } catch {
    return null;
  }
}

async function readLocalRuns(graphId: string, agentId: string): Promise<Record<string, unknown>[]> {
  if (!/^graph-[a-zA-Z0-9_-]+$/.test(graphId)) return [];
  const runsDirectory = path.join(platformPaths().graphsDir, graphId, "runs");
  try {
    const entries = await readdir(runsDirectory, { withFileTypes: true });
    const values = await Promise.all(entries
      .filter((entry) => entry.isFile() && /^run-[a-f0-9]{12}\.json$/.test(entry.name))
      .map(async (entry) => {
        try {
          const value: unknown = JSON.parse(await readFile(path.join(runsDirectory, entry.name), "utf8"));
          return isRecord(value) && value.graph_id === graphId && value.agent_id === agentId ? value : null;
        } catch {
          return null;
        }
      }));
    return values
      .filter((value): value is Record<string, unknown> => value !== null)
      .sort((left, right) => String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || "")));
  } catch {
    return [];
  }
}

async function readResponse(response: Response): Promise<{ data: unknown; text: string }> {
  const text = await response.text();
  try {
    return { data: JSON.parse(text), text: "" };
  } catch {
    return { data: null, text: text.trim().slice(0, 500) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(value: unknown): string {
  if (!isRecord(value)) return "";
  return typeof value.detail === "string" ? value.detail : typeof value.error === "string" ? value.error : "";
}
