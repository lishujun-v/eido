import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { databaseDir, readObjectTable } from "@backend/shared/database";

const AGENT_API_URL = process.env.EIDO_AGENT_API_URL ?? "http://127.0.0.1:8000";
// Inactivity timeout for the upstream SSE connection. Reset on every received
// chunk (the backend emits a heartbeat every ~15s), so long runs stay alive
// while a hung backend fails fast and lets the frontend fall back to polling.
const AGENT_EVENTS_TIMEOUT_MS = Number(process.env.EIDO_AGENT_EVENTS_TIMEOUT_MS ?? 150_000);

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后再查看运行状态。" }, { status: 401 });
  const graphId = request.nextUrl.searchParams.get("graphId")?.trim() || "";
  const runId = request.nextUrl.searchParams.get("runId")?.trim() || "";
  const agentId = request.nextUrl.searchParams.get("agentId")?.trim() || "";
  if (!graphId || !runId) return NextResponse.json({ error: "缺少 Graph ID 或 Run ID。" }, { status: 400 });
  if (!/^graph-[a-zA-Z0-9_-]+$/.test(graphId) || !/^run-[a-f0-9]{12}$/.test(runId)) {
    return NextResponse.json({ error: "Graph ID 或 Run ID 格式无效。" }, { status: 400 });
  }
  const agents = await readObjectTable(databaseDir(), "agents");
  const agent = Object.values(agents).find((value) => isRecord(value) && value.owner_user_id === userId && value.agent_type === "siinx" && (!agentId || value.id === agentId));
  if (!isRecord(agent) || typeof agent.id !== "string") {
    return NextResponse.json({ error: "当前用户还没有可运行 Graph 的 SiinX Agent。" }, { status: 404 });
  }
  const controller = new AbortController();
  const timeout = createEventsTimeout(controller);
  try {
    const target = `${AGENT_API_URL}/graphs/run/${encodeURIComponent(graphId)}/${encodeURIComponent(runId)}/events?agent_id=${encodeURIComponent(agent.id)}`;
    const response = await fetch(target, { cache: "no-store", signal: controller.signal });
    if (!response.ok || !response.body) {
      timeout.clear();
      return NextResponse.json({ error: "无法连接 Graph 实时状态流。" }, { status: response.status || 502 });
    }
    return new Response(proxyEventStream(response.body, timeout), {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "connection": "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    timeout.clear();
    const aborted = error && typeof error === "object" && "name" in error && error.name === "AbortError";
    return NextResponse.json({ error: aborted ? "Graph 实时状态流连接超时。" : `无法连接 Agent 服务：${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}

function proxyEventStream(
  upstreamBody: ReadableStream<Uint8Array>,
  timeout: { clear: () => void; reset: () => void },
) {
  const reader = upstreamBody.getReader();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          timeout.reset();
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      } finally {
        timeout.clear();
        reader.releaseLock();
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    async cancel() {
      timeout.clear();
      await reader.cancel().catch(() => undefined);
    },
  });
}

function createEventsTimeout(controller: AbortController) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const reset = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => controller.abort(), AGENT_EVENTS_TIMEOUT_MS);
  };
  reset();
  return { clear: () => clearTimeout(timeoutId), reset };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
