import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getOwnedRegisteredAgent,
  resolveAgentRuntime,
  runtimeUrl,
} from "@backend/lib/agent-runtime";
import {
  appendRemoteAssistantMessage,
  appendRemoteUserMessage,
} from "@backend/lib/platform-agent-sessions";

// This is an inactivity timeout, not a total task deadline. Keep it above the
// Python runtime's default 120s timeout for any single Provider request.
const AGENT_REQUEST_TIMEOUT_MS = Number(process.env.EIDO_AGENT_PROXY_TIMEOUT_MS ?? 150_000);

type ChatPayload = {
  agentId?: string;
  message?: string;
  images?: string[];
  attachmentPaths?: string[];
  model?: string;
  sessionId?: string;
  visitorId?: string;
  stream?: boolean;
  slashCommand?: string;
  workingDirectory?: string;
  permissionMode?: "auto" | "smart" | "manual";
  projectContext?: {
    projectId?: string;
    projectName?: string;
    kind?: string;
    title?: string;
    filePath?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  };
};

export async function sendAgentMessage(request: NextRequest) {
  let payload: ChatPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  const message = payload.message?.trim();
  const images = normalizeImages(payload.images);
  const attachmentPaths = normalizeAttachmentPaths(payload.attachmentPaths);
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ error: "请先登录后再和 Agent 对话。" }, { status: 401 });
  }

  if (!message && !images.length && !attachmentPaths.length) {
    return NextResponse.json({ error: "消息不能为空。" }, { status: 400 });
  }

  const agent = await getOwnedRegisteredAgent(userId, payload.agentId);

  if (!agent || typeof agent.id !== "string") {
    return NextResponse.json({ error: "当前用户还没有可对话的 Agent。" }, { status: 404 });
  }

  let timeout: AgentTimeout | undefined;

  try {
    const runtime = resolveAgentRuntime(agent);
    const platformSessionId = payload.sessionId?.trim()
      || `session_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    if (runtime.kind === "remote-ndjson") {
      await appendRemoteUserMessage({
        sessionId: platformSessionId,
        agentId: agent.id,
        visitorId: payload.visitorId || userId,
        message: message || "",
        images,
        runtimeKind: runtime.kind,
        workingDirectory: normalizeWorkingDirectory(payload.workingDirectory),
      });
    }
    const controller = new AbortController();
    timeout = createAgentTimeout(controller);
    const response = await fetch(runtimeUrl(runtime, "/chat"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent_id: runtime.remote_agent_id,
        session_id: platformSessionId,
        visitor_id: payload.visitorId || userId,
        message: message || "",
        images,
        attachment_paths: attachmentPaths,
        model: payload.model?.trim() || undefined,
        stream: Boolean(payload.stream),
        slash_command: normalizeSlashCommand(payload.slashCommand),
        working_directory: normalizeWorkingDirectory(payload.workingDirectory),
        permission_mode: normalizePermissionMode(payload.permissionMode),
        project_context: normalizeProjectContext(payload.projectContext),
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (payload.stream && response.ok) {
      if (!response.body) {
        timeout.clear();
        return ndjsonErrorResponse("Agent 服务没有返回可读取的回复流。", 502);
      }

      return new Response(proxyAgentStream(
        response.body,
        timeout,
        runtime.kind === "remote-ndjson"
          ? (content) => appendRemoteAssistantMessage(platformSessionId, content)
          : undefined,
      ), {
        status: response.status,
        headers: {
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "no-cache, no-transform",
        },
      });
    }

    const data = await readResponseData(response);
    timeout.clear();

    if (!response.ok) {
      return NextResponse.json(
        { error: extractErrorMessage(data) || "Agent 服务返回错误。" },
        { status: response.status },
      );
    }

    if (runtime.kind === "remote-ndjson" && isRecord(data)) {
      const responseContent = isRecord(data.message) && typeof data.message.content === "string"
        ? data.message.content
        : "";
      await appendRemoteAssistantMessage(platformSessionId, responseContent);
    }

    return NextResponse.json(data);
  } catch (error) {
    timeout?.clear();
    return NextResponse.json(
      {
        error: formatProxyError(error),
      },
      { status: 502 },
    );
  }
}

function normalizeWorkingDirectory(value: unknown) {
  if (typeof value !== "string") return undefined;
  const directory = value.trim();
  return path.isAbsolute(directory) && directory.length <= 4_000 ? directory : undefined;
}

function normalizePermissionMode(value: unknown) {
  return value === "auto" || value === "manual" || value === "smart" ? value : "smart";
}

function normalizeSlashCommand(value: unknown) {
  if (typeof value !== "string") return undefined;
  const command = value.trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,31}$/.test(command) ? command : undefined;
}

export async function stopAgentMessage(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();
  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  if (!sessionId) return NextResponse.json({ error: "缺少 sessionId。" }, { status: 400 });

  const agentId = request.nextUrl.searchParams.get("agentId")?.trim();
  const agent = await getOwnedRegisteredAgent(userId, agentId);
  if (!agent) return NextResponse.json({ error: "无权终止该会话任务。" }, { status: 404 });
  const runtime = resolveAgentRuntime(agent);
  const response = await fetch(runtimeUrl(runtime, `/chat/${encodeURIComponent(sessionId)}`), {
    method: "DELETE",
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  return NextResponse.json(data ?? { stopped: false }, { status: response.status });
}

function normalizeProjectContext(context: ChatPayload["projectContext"]) {
  if (!context || !/^[a-zA-Z0-9_-]+$/.test(String(context.projectId || ""))) return undefined;
  return {
    project_id: String(context.projectId).slice(0, 100),
    project_name: String(context.projectName || context.projectId).slice(0, 100),
    kind: String(context.kind || "general").slice(0, 100),
    title: String(context.title || "").slice(0, 255),
    file_path: String(context.filePath || "").slice(0, 1000),
    content: String(context.content || "").slice(0, 120_000),
    metadata: isRecord(context.metadata) ? context.metadata : {},
  };
}

function normalizeImages(images: ChatPayload["images"]) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((image): image is string => typeof image === "string" && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(image))
    .filter((image) => image.length <= 7_000_000)
    .slice(0, 4);
}

function normalizeAttachmentPaths(paths: ChatPayload["attachmentPaths"]) {
  if (!Array.isArray(paths)) return [];
  return paths
    .filter((item): item is string => typeof item === "string" && path.isAbsolute(item) && item.length <= 4_000)
    .slice(0, 8);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function proxyAgentStream(
  upstreamBody: ReadableStream<Uint8Array>,
  timeout: AgentTimeout,
  onComplete?: (content: string) => Promise<void>,
) {
  const reader = upstreamBody.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered = "";
  let assistantContent = "";

  const collectEvents = (chunk: Uint8Array, flush = false) => {
    buffered += decoder.decode(chunk, { stream: !flush });
    const lines = buffered.split("\n");
    buffered = flush ? "" : (lines.pop() ?? "");
    for (const rawLine of lines) {
      try {
        const event = JSON.parse(rawLine) as { type?: string; content?: unknown };
        if (event.type === "delta" && typeof event.content === "string") assistantContent += event.content;
      } catch {
        // Forwarded bytes are authoritative; malformed extension events are ignored for mirroring.
      }
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          timeout.reset();
          collectEvents(value);
          controller.enqueue(value);
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`${JSON.stringify({
          type: "error",
          error: formatProxyError(error),
        })}\n`));
      } finally {
        timeout.clear();
        reader.releaseLock();
        collectEvents(new Uint8Array(), true);
        await onComplete?.(assistantContent).catch(() => undefined);
        controller.close();
      }
    },
    async cancel() {
      timeout.clear();
      await reader.cancel().catch(() => undefined);
    },
  });
}

type AgentTimeout = {
  clear: () => void;
  reset: () => void;
};

function createAgentTimeout(controller: AbortController): AgentTimeout {
  let timeoutId: ReturnType<typeof setTimeout>;
  const reset = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => controller.abort(), AGENT_REQUEST_TIMEOUT_MS);
  };
  reset();
  return {
    clear: () => clearTimeout(timeoutId),
    reset,
  };
}

async function readResponseData(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function extractErrorMessage(data: unknown): string {
  if (!isRecord(data)) {
    return "";
  }

  for (const key of ["detail", "error", "message"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      return redactSensitiveText(limitErrorText(value));
    }
    if (isRecord(value)) {
      const nested = extractErrorMessage(value);
      if (nested) {
        return nested;
      }
    }
  }

  return redactSensitiveText(limitErrorText(JSON.stringify(data)));
}

function formatProxyError(error: unknown) {
  if (isAbortError(error)) {
    return `Agent 请求超过 ${Math.round(AGENT_REQUEST_TIMEOUT_MS / 1000)} 秒没有完成，可能是模型 Provider 请求超时或连接卡住。请检查 Provider、Model 名称、API Base 和 API Key。`;
  }

  const detail = error instanceof Error ? error.message : String(error || "");
  if (detail.trim()) {
    return redactSensitiveText(limitErrorText(`Agent 服务请求失败：${detail}`));
  }

  return "Agent 服务暂时不可用。请确认 Python 服务已启动：npm run agent:server";
}

function isAbortError(error: unknown) {
  return isRecord(error) && error.name === "AbortError";
}

function ndjsonErrorResponse(error: string, status: number) {
  return new Response(`${JSON.stringify({ type: "error", error })}\n`, {
    status,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}

function limitErrorText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 1600 ? `${normalized.slice(0, 1600)}...` : normalized;
}

function redactSensitiveText(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/("api[_-]?key"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2")
    .replace(/(api[_-]?key=)[^\s&]+/gi, "$1[redacted]");
}
