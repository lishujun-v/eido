import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { databaseDir, readObjectTable, tablePath, writeJson } from "@backend/shared/database";
import { getOwnedRegisteredAgent, resolveAgentRuntime, runtimeUrl, type RegisteredAgent } from "@backend/lib/agent-runtime";

type Phase = "clarifying" | "discussing" | "concluded";
type Message = { id: string; agentId: string | null; author: string; role: "user" | "agent" | "system"; content: string; createdAt: string };
type Session = { id: string; ownerId: string; title: string; phase: Phase; memberIds: string[]; messages: Message[]; conclusion: string; createdAt: string; updatedAt: string };
const TABLE = "brainstorm_sessions";
const MAX_CONTEXT = 18_000;

function isSession(value: unknown): value is Session {
  return !!value && typeof value === "object" && typeof (value as Session).id === "string"
    && Array.isArray((value as Session).messages) && Array.isArray((value as Session).memberIds);
}
function message(role: Message["role"], author: string, content: string, agentId: string | null = null): Message {
  return { id: randomUUID(), role, author, content, agentId, createdAt: new Date().toISOString() };
}
function jsonError(error: string, status: number) { return NextResponse.json({ error }, { status }); }
function owned(request: NextRequest) { return request.cookies.get("eido_user_id")?.value.trim() || ""; }
async function agentsFor(userId: string) {
  const table = await readObjectTable(databaseDir(), "agents");
  return Object.values(table).filter((item): item is RegisteredAgent => !!item && typeof item === "object"
    && (item as RegisteredAgent).owner_user_id === userId && typeof (item as RegisteredAgent).id === "string");
}
async function save(session: Session) {
  const table = await readObjectTable(databaseDir(), TABLE);
  session.updatedAt = new Date().toISOString();
  table[session.id] = session;
  await writeJson(tablePath(databaseDir(), TABLE), table);
}
async function invoke(agent: RegisteredAgent, session: Session, instruction: string, userId: string) {
  const runtime = resolveAgentRuntime(agent);
  const transcript = session.messages.map((item) => `${item.author}：${item.content}`).join("\n\n").slice(-MAX_CONTEXT);
  const prompt = `你正参与“脑暴空间”的多人讨论。你是 ${String(agent.name || agent.id)}。所有智能体共享下面的讨论记录，请依据真实记录回应，不要虚构其他人的意见。只输出适合群聊展示的内容，不要修改文件或执行无关任务。\n\n讨论记录：\n${transcript}\n\n本轮要求：${instruction}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150_000);
  try {
    const response = await fetch(runtimeUrl(runtime, "/chat"), {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", signal: controller.signal,
      body: JSON.stringify({ agent_id: runtime.remote_agent_id, session_id: `brainstorm_${randomUUID()}`,
        visitor_id: userId, message: prompt, stream: false, permission_mode: "smart" }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "智能体服务调用失败。");
    const content = typeof data?.message?.content === "string" ? data.message.content.trim() : "";
    if (!content) throw new Error("智能体没有返回可展示的内容。");
    return content;
  } finally { clearTimeout(timeout); }
}

export async function listBrainstorms(request: NextRequest) {
  const userId = owned(request);
  if (!userId) return jsonError("请先登录。", 401);
  const table = await readObjectTable(databaseDir(), TABLE);
  const sessions = Object.values(table).filter((item): item is Session => isSession(item) && item.ownerId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json({ sessions });
}

export async function updateBrainstorm(request: NextRequest) {
  const userId = owned(request);
  if (!userId) return jsonError("请先登录。", 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("请求格式错误。", 400);
  const action = String(body.action || "");
  const allAgents = await agentsFor(userId);
  const main = await getOwnedRegisteredAgent(userId);
  if (!main) return jsonError("请先创建 SiinX 主智能体。", 404);

  if (action === "create") {
    const title = String(body.title || "").trim().slice(0, 160);
    if (!title) return jsonError("请输入讨论选题。", 400);
    const requested: string[] = Array.isArray(body.memberIds) ? body.memberIds.filter((id: unknown): id is string => typeof id === "string") : [];
    const memberIds = [main.id, ...new Set(requested.filter((id) => id !== main.id && allAgents.some((agent) => agent.id === id)))];
    const now = new Date().toISOString();
    const session: Session = { id: randomUUID(), ownerId: userId, title, phase: "clarifying", memberIds,
      messages: [message("user", "你", title)], conclusion: "", createdAt: now, updatedAt: now };
    await save(session);
    return NextResponse.json({ session });
  }

  const table = await readObjectTable(databaseDir(), TABLE);
  const session = table[String(body.sessionId || "")];
  if (!isSession(session) || session.ownerId !== userId) return jsonError("找不到这个讨论。", 404);
  if (action === "reply") {
    if (session.phase !== "clarifying") return jsonError("澄清阶段已结束。", 409);
    const content = String(body.content || "").trim().slice(0, 10_000);
    if (!content) return jsonError("请输入补充说明。", 400);
    session.messages.push(message("user", "你", content));
    await save(session);
    return NextResponse.json({ session });
  }
  if (action === "members") {
    if (session.phase === "concluded") return jsonError("已结束的讨论不能更改成员。", 409);
    const requested: string[] = Array.isArray(body.memberIds) ? body.memberIds.filter((id: unknown): id is string => typeof id === "string") : [];
    session.memberIds = [main.id, ...new Set(requested.filter((id) => id !== main.id && allAgents.some((agent) => agent.id === id)))];
    await save(session);
    return NextResponse.json({ session });
  }
  if (action === "start") {
    if (session.phase !== "clarifying") return jsonError("讨论已经开始或结束。", 409);
    session.phase = "discussing";
    session.messages.push(message("system", "系统", "题目已明确，开始群组讨论。"));
    await save(session);
    return NextResponse.json({ session });
  }
  if (!["clarify", "turn", "conclude"].includes(action)) return jsonError("未知操作。", 400);
  if (action === "clarify" && session.phase !== "clarifying") return jsonError("澄清阶段已结束。", 409);
  if (action === "turn" && session.phase !== "discussing") return jsonError("请先开始讨论。", 409);
  if (action === "conclude" && session.phase !== "discussing") return jsonError("请先进行讨论。", 409);
  const agentId = action === "turn" ? String(body.agentId || "") : main.id;
  if (!session.memberIds.includes(agentId)) return jsonError("智能体不在当前讨论中。", 403);
  const agent = allAgents.find((item) => item.id === agentId);
  if (!agent) return jsonError("智能体已不存在。", 404);
  const instruction = action === "clarify"
    ? "你是主持人 SiinX。根据用户选题与补充内容，用简洁语言复述已明确的范围；如果仍缺少会改变讨论方向的关键信息，最多提出 3 个澄清问题。请不要现在邀请其他智能体发言。"
    : action === "turn"
      ? "围绕选题发表你自己的专业观点，引用前面成员的具体观点并补充或质疑；尽量提出可执行建议，控制在 250 字左右。"
      : "你是主持人 SiinX。整合所有成员的真实观点，给出清晰结论：共同认识、主要分歧、推荐方案、下一步行动与仍需验证的问题。不要声称未参与成员发表了意见。";
  try {
    const content = await invoke(agent, session, instruction, userId);
    session.messages.push(message("agent", String(agent.name || agent.id), content, agent.id));
    if (action === "conclude") { session.phase = "concluded"; session.conclusion = content; }
    await save(session);
    return NextResponse.json({ session });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "智能体响应失败，请重试。", 502);
  }
}
