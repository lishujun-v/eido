import { NextRequest, NextResponse } from "next/server";
import {
  databaseDir,
  readListTable,
  readObjectTable,
  tablePath,
  writeJson,
} from "@backend/shared/database";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  images?: string[];
  created_at?: string;
};

type ContextUsage = {
  total: number;
  system?: number;
  messages?: number;
  tools?: number;
};

export async function listConversations(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ conversations: [] });
  }

  const tableDir = databaseDir();
  const [agents, sessions, interactions] = await Promise.all([
    readObjectTable(tableDir, "agents"),
    readObjectTable(tableDir, "sessions"),
    readObjectTable(tableDir, "interactions"),
  ]);
  const ownedAgentIds = new Set(
    Object.values(agents)
      .filter((agent) => isRecord(agent) && agent.owner_user_id === userId)
      .map((agent) => String((agent as Record<string, unknown>).id ?? "")),
  );
  const agentDirectories = new Map(
    Object.values(agents)
      .flatMap((agent) => isRecord(agent) && agent.owner_user_id === userId
        ? [[stringValue(agent.id), stringValue(agent.workspace_dir)]]
        : []),
  );
  const search = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const detailId = request.nextUrl.searchParams.get("id")?.trim() || "";
  const pendingInteractions = new Map<string, Interaction>();
  for (const value of Object.values(interactions)) {
    const interaction = normalizePendingInteraction(value);
    if (interaction) pendingInteractions.set(interaction.sessionId, interaction);
  }

  const conversations = Object.values(sessions)
    .filter((session) => isOwnedSession(session, ownedAgentIds, userId))
    .map((session) => {
      const record = session as Record<string, unknown>;
      return normalizeSession(
        record,
        pendingInteractions.get(stringValue(record.id)) ?? null,
        agentDirectories.get(stringValue(record.agent_id)) ?? "",
      );
    })
    .filter((conversation) => {
      if (detailId) {
        return conversation.id === detailId;
      }
      if (!search) {
        return true;
      }
      const haystack = [
        conversation.title,
        conversation.preview,
        ...conversation.messages.map((message) => message.content),
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  if (detailId) {
    return NextResponse.json({ conversation: conversations[0] ?? null });
  }

  return NextResponse.json({
    conversations: conversations.map(({ messages, ...conversation }) => ({
      ...conversation,
      messageCount: messages.length,
    })),
  });
}

export async function deleteConversation(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ error: "请先登录后再删除会话。" }, { status: 401 });
  }

  let payload: { ids?: string[] };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  const requestedIds = new Set((payload.ids ?? []).map((id) => id.trim()).filter(Boolean));

  if (requestedIds.size === 0) {
    return NextResponse.json({ error: "请选择要删除的会话。" }, { status: 400 });
  }

  const tableDir = databaseDir();
  const [agents, sessions, history] = await Promise.all([
    readObjectTable(tableDir, "agents"),
    readObjectTable(tableDir, "sessions"),
    readListTable(tableDir, "agent_history"),
  ]);
  const ownedAgentIds = new Set(
    Object.values(agents)
      .filter((agent) => isRecord(agent) && agent.owner_user_id === userId)
      .map((agent) => String((agent as Record<string, unknown>).id ?? "")),
  );
  const deletableIds = new Set<string>();

  for (const id of requestedIds) {
    if (isOwnedSession(sessions[id], ownedAgentIds, userId)) {
      delete sessions[id];
      deletableIds.add(id);
    }
  }

  const nextHistory = history.filter((item) => {
    return !isRecord(item) || !deletableIds.has(String(item.session_id ?? ""));
  });

  await Promise.all([
    writeJson(tablePath(tableDir, "sessions"), sessions),
    writeJson(tablePath(tableDir, "agent_history"), nextHistory),
  ]);

  return NextResponse.json({ deletedIds: Array.from(deletableIds) });
}

type Interaction = {
  id: string;
  sessionId: string;
  kind: "clarification" | "approval";
  status: "pending";
  prompt: string;
  options: string[];
  action: string | null;
  actionArguments: Record<string, unknown> | null;
};

function normalizeSession(
  session: Record<string, unknown>,
  pendingInteraction: Interaction | null = null,
  fallbackWorkingDirectory = "",
) {
  const messages = normalizeMessages(session.messages);
  const firstUserMessage = messages.find((message) => message.role === "user");
  const firstMessage = firstUserMessage ?? messages[0];
  const summary = stringValue(session.summary);
  const metadata = isRecord(session.metadata) ? session.metadata : {};
  const metadataTitle = stringValue(metadata.title);
  const title = limitText(metadataTitle || summary || firstUserMessage?.content || "新会话", 36);
  const preview = limitText(firstMessage?.content || summary || "暂无消息", 96);
  const updatedAt = stringValue(session.updated_at) || stringValue(session.created_at) || "";

  return {
    id: stringValue(session.id),
    agentId: stringValue(session.agent_id),
    title,
    preview,
    summary,
    workingDirectory: stringValue(metadata.working_directory) || fallbackWorkingDirectory,
    createdAt: stringValue(session.created_at),
    updatedAt,
    executionPlan: normalizeExecutionPlan(metadata.execution_plan),
    contextUsage: normalizeContextUsage(metadata.context_usage),
    messages,
    pendingInteraction: pendingInteraction ? {
      id: pendingInteraction.id,
      kind: pendingInteraction.kind,
      status: pendingInteraction.status,
      prompt: pendingInteraction.prompt,
      options: pendingInteraction.options,
      action: pendingInteraction.action,
      action_arguments: pendingInteraction.actionArguments,
    } : null,
  };
}

function normalizePendingInteraction(value: unknown): Interaction | null {
  if (!isRecord(value) || value.status !== "pending") return null;
  const id = stringValue(value.id);
  const sessionId = stringValue(value.session_id);
  const prompt = stringValue(value.prompt);
  const kind = value.kind;
  if (!id || !sessionId || !prompt || (kind !== "clarification" && kind !== "approval")) return null;
  return {
    id,
    sessionId,
    kind,
    status: "pending",
    prompt,
    options: Array.isArray(value.options) ? value.options.filter((item): item is string => typeof item === "string").slice(0, 3) : [],
    action: typeof value.action === "string" ? value.action : null,
    actionArguments: isRecord(value.action_arguments) ? value.action_arguments : null,
  };
}

function normalizeContextUsage(value: unknown): ContextUsage | null {
  if (!isRecord(value)) return null;
  const total = Number(value.total);
  if (!Number.isSafeInteger(total) || total < 0) return null;
  const optionalCount = (key: "system" | "messages" | "tools") => {
    const count = Number(value[key]);
    return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
  };
  return {
    total,
    system: optionalCount("system"),
    messages: optionalCount("messages"),
    tools: optionalCount("tools"),
  };
}

function normalizeExecutionPlan(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.steps)) {
    return null;
  }

  const steps = value.steps.filter(isRecord).flatMap((step) => {
    const id = stringValue(step.id);
    const title = stringValue(step.title);
    const status = stringValue(step.status);
    if (!id || !title || !["pending", "in_progress", "completed", "blocked", "skipped"].includes(status)) {
      return [];
    }
    return [{ id, title, status, detail: stringValue(step.detail) }];
  });

  if (!steps.length) {
    return null;
  }

  return {
    goal: stringValue(value.goal),
    status: stringValue(value.status) || "active",
    reason: stringValue(value.reason),
    updatedAt: stringValue(value.updated_at),
    steps,
  };
}

function normalizeMessages(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .flatMap((message) => {
      const role = normalizeRole(message.role);
      const content = stringValue(message.content);

      // Session storage includes internal tool calls and orchestration events.
      // They are useful to the runtime, but are not chat messages and can be
      // extremely large. Returning them as system messages made archived chats
      // appear to contain unrelated content in the conversation panel.
      if (!role || !content.trim()) {
        return [];
      }

      const images = Array.isArray(message.images)
        ? message.images.filter((image): image is string => typeof image === "string" && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(image)).slice(0, 4)
        : [];
      return [{ role, content, images, created_at: stringValue(message.created_at) }];
    });
}

function normalizeRole(value: unknown): ConversationMessage["role"] | null {
  return value === "user" || value === "assistant" ? value : null;
}

function isOwnedSession(value: unknown, ownedAgentIds: Set<string>, userId: string) {
  if (!isRecord(value)) {
    return false;
  }

  const agentId = stringValue(value.agent_id);
  const visitorId = stringValue(value.visitor_id);

  return ownedAgentIds.has(agentId) && (!visitorId || visitorId === userId);
}

function limitText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
