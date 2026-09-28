import { NextRequest, NextResponse } from "next/server";
import { databaseDir, readObjectTable } from "@backend/shared/database";
import {
  getOwnedRegisteredAgent,
  resolveAgentRuntime,
  runtimeUrl,
} from "@backend/lib/agent-runtime";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ interactionId: string }> },
) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { interactionId } = await params;
  let payload: { sessionId?: string; agentId?: string; response?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }
  const sessionId = payload.sessionId?.trim();
  const responseText = payload.response?.trim();
  if (!sessionId || !responseText) {
    return NextResponse.json({ error: "缺少会话或交互回复。" }, { status: 400 });
  }
  const agent = await getOwnedRegisteredAgent(userId, payload.agentId?.trim());
  if (!agent) return NextResponse.json({ error: "无权操作该交互请求。" }, { status: 404 });
  const runtime = resolveAgentRuntime(agent);
  const sessions = await readObjectTable(databaseDir(), "sessions");
  const session = sessions[sessionId];
  const sessionRecord = session && typeof session === "object" && !Array.isArray(session)
    ? session as Record<string, unknown>
    : null;
  if (sessionRecord?.visitor_id !== userId || sessionRecord.agent_id !== agent.id) {
    return NextResponse.json({ error: "无权操作该交互请求。" }, { status: 404 });
  }
  const upstream = await fetch(
    runtimeUrl(runtime, `/sessions/${encodeURIComponent(sessionId)}/interactions/${encodeURIComponent(interactionId)}/respond`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response: responseText, responder_id: userId }),
      cache: "no-store",
    },
  );
  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data ?? { error: "交互服务返回异常。" }, { status: upstream.status });
}
