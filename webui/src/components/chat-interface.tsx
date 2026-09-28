"use client";

import {
  ArrowLeft,
  Ban,
  Clock3,
  Flag,
  LoaderCircle,
  Lock,
  MessageSquareText,
  Send,
  ShieldCheck,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AgentLocation,
  DigitalAgentBadge,
} from "@/components/agent-badges";
import { RichMessage } from "@/components/rich-message";
import { chatMessages, featuredAgent } from "@/data/demo";

type ChatMessage = {
  id?: string;
  role: "visitor" | "agent" | "system";
  text: string;
  time: string;
};

type TokenUsage = {
  input: number;
  output: number;
  total: number;
};

type HandoffState = {
  status: string;
  reason: string;
  requestedAt: string;
};

type AgentChatResponse = {
  session_id: string;
  message: {
    role: "assistant";
    content: string;
  };
  tool_events?: Array<{
    tool: string;
    arguments?: unknown;
    metadata?: {
      reason?: string;
    };
  }>;
  mock?: boolean;
};

type AgentStreamEvent =
  | {
      type: "meta";
      session_id?: string;
      provider?: string;
      model?: string;
      mock?: boolean;
    }
  | { type: "delta"; content?: string }
  | {
      type: "tool.started" | "tool.completed" | "tool.failed";
      tool?: string;
      arguments?: unknown;
      metadata?: { reason?: string };
      error?: string;
    }
  | {
      type: "done";
      tool_events?: AgentChatResponse["tool_events"];
    }
  | { type: "error"; error?: string };

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>(
    chatMessages as ChatMessage[],
  );
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("Agent 正在处理");
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState<HandoffState>({
    status: "可继续沟通",
    reason: "Agent 会先了解需求，必要时再转给主人。",
    requestedAt: "--",
  });
  const sessionIdRef = useRef("");

  const isWaiting = handoff.status === "等待主人确认";
  const canSend = draft.trim().length > 0 && !isSending;
  const tokenUsage = useMemo(() => estimateSessionTokens(messages), [messages]);

  async function submitMessage() {
    const text = draft.trim();

    if (!text || isSending) {
      return;
    }

    const time = getTime();
    if (!sessionIdRef.current) {
      sessionIdRef.current = `web-${globalThis.crypto.randomUUID()}`;
    }
    setMessages((current) => [
      ...current,
      { role: "visitor", text, time },
      {
        role: "system",
        text: "Agent 已开始处理，会在这里显示执行进度。",
        time: getTime(),
      },
    ]);
    setDraft("");
    setError("");
    setProcessingStatus("Agent 正在处理");
    setIsSending(true);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "li-xiaokong",
          sessionId: sessionIdRef.current,
          visitorId: "web-visitor",
          message: text,
          stream: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data.error || "发送失败，请稍后重试。");
      }

      if (!response.body) {
        throw new Error("Agent 服务没有返回可读取的流。");
      }

      const assistantMessageId = `agent-${globalThis.crypto.randomUUID()}`;
      let hasAssistantMessage = false;
      let finalText = "";

      await readNdjson(response.body, (event) => {
        if (event.type === "meta") {
          sessionIdRef.current = event.session_id || sessionIdRef.current;
          setProcessingStatus("Agent 正在思考");
          return;
        }

        if (event.type === "delta" && event.content) {
          setProcessingStatus("Agent 正在回复");
          finalText += event.content;
          if (!hasAssistantMessage) {
            hasAssistantMessage = true;
            setMessages((current) => [
              ...current,
              {
                id: assistantMessageId,
                role: "agent",
                text: event.content || "",
                time: getTime(),
              },
            ]);
            return;
          }

          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? { ...message, text: message.text + (event.content || "") }
                : message,
            ),
          );
          return;
        }

        if (
          event.type === "tool.started" ||
          event.type === "tool.completed" ||
          event.type === "tool.failed"
        ) {
          if (event.type === "tool.started") {
            setProcessingStatus(`正在执行工具：${event.tool || "unknown"}`);
          } else if (event.type === "tool.failed") {
            setProcessingStatus("工具执行失败，Agent 正在处理");
          } else {
            setProcessingStatus("工具执行完成，Agent 正在整理结果");
          }
          setMessages((current) => [
            ...current,
            {
              role: "system",
              text: toolEventText(event),
              time: getTime(),
            },
          ]);
          return;
        }

        if (event.type === "done") {
          setProcessingStatus("Agent 处理完成");
          if (!hasAssistantMessage) {
            setMessages((current) => [
              ...current,
              {
                id: assistantMessageId,
                role: "agent",
                text: finalText || "我收到了，但没有生成可显示的回复。",
                time: getTime(),
              },
            ]);
          }

          handleHandoffEvent(event.tool_events);
          return;
        }

        if (event.type === "error") {
          throw new Error(event.error || "Agent 流式回复失败。");
        }
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Agent 服务暂时不可用。";
      setError(message);
      setProcessingStatus("Agent 处理失败");
      setMessages((current) => [
        ...current,
        {
          role: "system",
          text: message,
          time: getTime(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleHandoffEvent(toolEvents: AgentChatResponse["tool_events"]) {
    const handoffEvent = toolEvents?.find(
      (event) => event.tool === "request_handoff",
    );

    if (!handoffEvent) {
      return;
    }

    const requestedAt = getTime();
    setHandoff({
      status: "等待主人确认",
      reason:
        handoffEvent.metadata?.reason ||
        "Agent 判断这轮对话需要主人确认后继续。",
      requestedAt,
    });
    setMessages((current) => [
      ...current,
      {
        role: "system",
        text: "已请求主人接入。主人确认后，会继续处理联系方式、时间或报价等具体事项。",
        time: requestedAt,
      },
    ]);
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-73px)] w-full max-w-[1180px] grid-cols-1 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_320px] lg:gap-6 lg:py-8">
      <section className="flex min-h-[720px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ChatHeader isProcessing={isSending} tokenUsage={tokenUsage} />
        <MessageList
          isProcessing={isSending}
          messages={messages}
          processingStatus={processingStatus}
        />
        <Composer
          canSend={canSend}
          draft={draft}
          error={error}
          isWaiting={isWaiting}
          isSending={isSending}
          onDraftChange={setDraft}
          onSubmit={submitMessage}
        />
      </section>

      <aside className="mt-6 space-y-4 lg:mt-0">
        <HandoffPanel handoff={handoff} onRequest={() => {
          const time = getTime();
          setHandoff({
            status: "等待主人确认",
            reason: "访问者主动请求真人接入。",
            requestedAt: time,
          });
          setMessages((current) => [
            ...current,
            {
              role: "system",
              text: "已请求主人接入。主人确认后，会继续处理联系方式、时间或报价等具体事项。",
              time,
            },
          ]);
        }} />
        <SafetyPanel />
      </aside>
    </div>
  );
}

function ChatHeader({
  isProcessing,
  tokenUsage,
}: {
  isProcessing: boolean;
  tokenUsage: TokenUsage;
}) {
  return (
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
      <Link
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        href="/agents/li-xiaokong"
      >
        <ArrowLeft size={17} />
        返回 Agent 主页
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <AgentPresence isProcessing={isProcessing} size="large" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
              <DigitalAgentBadge />
              <span className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs text-teal-700">
                {isProcessing ? "处理中" : featuredAgent.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <AgentLocation city={featuredAgent.city} />
              <span>当前会话 token 估算</span>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500">
              输入 {formatTokenCount(tokenUsage.input)} / 输出{" "}
              {formatTokenCount(tokenUsage.output)} / 合计{" "}
              {formatTokenCount(tokenUsage.total)}
            </p>
          </div>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
          <Zap className={isProcessing ? "text-blue-600" : "text-teal-600"} size={17} />
          {isProcessing ? "任务处理中" : "随时可对话"}
        </div>
      </div>
    </header>
  );
}

function AgentPresence({
  isProcessing,
  size = "small",
}: {
  isProcessing: boolean;
  size?: "small" | "large";
}) {
  const shellSize = size === "large" ? "size-20" : "size-9";
  const coreSize = size === "large" ? "size-14" : "size-6";
  const textSize = size === "large" ? "text-xl" : "text-xs";

  return (
    <div
      className={`relative ${shellSize} shrink-0 rounded-full border border-slate-200 bg-white shadow-sm`}
      aria-label={isProcessing ? "Agent 正在处理任务" : "Agent 空闲"}
    >
      <div
        className={`absolute inset-1 rounded-full bg-gradient-to-br ${featuredAgent.accent} opacity-95`}
      />
      <div
        className={`absolute inset-0 rounded-full border ${
          isProcessing
            ? "animate-ping border-blue-300 opacity-50"
            : "border-teal-200 opacity-60"
        }`}
      />
      <div
        className={`absolute left-1/2 top-1/2 flex ${coreSize} -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 ${textSize} font-semibold text-slate-800 shadow-inner`}
      >
        {featuredAgent.initials}
      </div>
      {isProcessing && (
        <span className="absolute inset-x-3 top-1/2 h-px animate-pulse bg-blue-200" />
      )}
      <span
        className={`absolute bottom-1 right-1 size-3 rounded-full border-2 border-white ${
          isProcessing ? "animate-pulse bg-blue-500" : "bg-teal-500"
        }`}
      />
    </div>
  );
}

function MessageList({
  isProcessing,
  messages,
  processingStatus,
}: {
  isProcessing: boolean;
  messages: ChatMessage[];
  processingStatus: string;
}) {
  const renderedMessages = useMemo(() => messages, [messages]);
  const processingMessageIndex = useMemo(() => {
    if (!isProcessing) {
      return -1;
    }

    return renderedMessages.reduce((lastIndex, message, index) => {
      return message.role === "visitor" ? lastIndex : index;
    }, -1);
  }, [isProcessing, renderedMessages]);
  const listRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    const list = listRef.current;
    if (!list) {
      return;
    }

    requestAnimationFrame(() => {
      list.scrollTo({ top: list.scrollHeight, behavior: "auto" });
      shouldStickToBottomRef.current = isScrolledToBottom(list);
    });
  }, [isProcessing, processingStatus, renderedMessages]);

  return (
    <div className="min-h-0 flex-1 bg-slate-50/70 p-3 sm:p-4">
      <div
        className="h-full space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white/85 px-4 py-5 shadow-inner shadow-slate-200/70 sm:px-6"
        onScroll={(event) => {
          shouldStickToBottomRef.current = isScrolledToBottom(
            event.currentTarget,
          );
        }}
        ref={listRef}
      >
        {renderedMessages.map((message, index) => {
          const showProcessing = index === processingMessageIndex;

          if (message.role === "system") {
            return (
              <div
                className="mx-auto max-w-[620px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800"
                key={`${message.time}-${index}`}
              >
                <div className="flex items-start gap-2">
                  <Lock className="mt-0.5 shrink-0" size={16} />
                  <RichMessage text={message.text} tone="system" />
                </div>
                {showProcessing && (
                  <ProcessingIndicator
                    className="mt-3 border-amber-200 bg-white/70 text-amber-800"
                    status={processingStatus}
                  />
                )}
                <p className="mt-1 text-right text-xs text-amber-600">
                  {message.time}
                </p>
              </div>
            );
          }

          const isVisitor = message.role === "visitor";

          return (
            <div
              className={`flex ${isVisitor ? "justify-end" : "justify-start"}`}
              key={`${message.time}-${index}`}
            >
              <div
                className={`rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm ${
                  isVisitor
                    ? "max-w-[78%] border-blue-100 bg-blue-600 text-white sm:max-w-[68%]"
                    : "w-full border-slate-200 bg-white text-slate-800"
                }`}
              >
                <RichMessage
                  text={message.text}
                  tone={isVisitor ? "visitor" : "agent"}
                />
                {showProcessing && !isVisitor && (
                  <ProcessingIndicator
                    className="mt-3 border-slate-200 bg-slate-50 text-slate-600"
                    status={processingStatus}
                  />
                )}
                <p
                  className={`mt-1 text-right text-xs ${
                    isVisitor ? "text-blue-100" : "text-slate-400"
                  }`}
                >
                  {message.time}
                </p>
              </div>
            </div>
          );
        })}
        {isProcessing && processingMessageIndex === -1 && (
          <div className="flex justify-start" aria-live="polite">
            <ProcessingIndicator
              className="w-full border-slate-200 bg-white text-slate-600 shadow-sm"
              status={processingStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessingIndicator({
  className = "",
  status,
}: {
  className?: string;
  status: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-3 rounded-lg border px-3 py-2 text-xs font-medium leading-5 ${className}`}
      aria-live="polite"
    >
      <LoaderCircle className="shrink-0 animate-spin text-blue-600" size={15} />
      <span>{status}</span>
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="size-1.5 animate-pulse rounded-full bg-current opacity-35" />
        <span className="size-1.5 animate-pulse rounded-full bg-current opacity-35 [animation-delay:150ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-current opacity-35 [animation-delay:300ms]" />
      </span>
    </div>
  );
}

function isScrolledToBottom(element: HTMLDivElement) {
  const bottomGap =
    element.scrollHeight - element.scrollTop - element.clientHeight;

  return bottomGap <= 48;
}

function Composer({
  canSend,
  draft,
  error,
  isWaiting,
  isSending,
  onDraftChange,
  onSubmit,
}: {
  canSend: boolean;
  draft: string;
  error: string;
  isWaiting: boolean;
  isSending: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
}) {
  return (
    <footer className="border-t border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className={`flex items-center gap-2 text-sm font-medium ${isWaiting ? "text-amber-700" : "text-teal-700"}`}>
          <Clock3 size={16} />
          {isSending
            ? "Agent 正在回复"
            : isWaiting
              ? "当前等待主人确认后继续"
              : "可以继续向 Agent 补充需求"}
        </p>
        <div className="flex items-center gap-2">
          <button className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <Flag size={16} />
            举报
          </button>
          <button className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <Ban size={16} />
            拉黑
          </button>
        </div>
      </div>
      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex min-h-12 flex-1 items-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <textarea
            className="min-h-6 min-w-0 flex-1 resize-none bg-transparent text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              const isComposing =
                event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;

              if (event.key === "Enter" && !event.shiftKey && !isComposing) {
                event.preventDefault();
                onSubmit();
              }
            }}
            disabled={isSending}
            placeholder="补充车型、故障现象或请求主人确认时间"
            value={draft}
          />
        </label>
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!canSend}
          onClick={onSubmit}
        >
          <Send size={17} />
          {isSending ? "发送中" : "发送"}
        </button>
      </div>
    </footer>
  );
}

function HandoffPanel({
  handoff,
  onRequest,
}: {
  handoff: HandoffState;
  onRequest: () => void;
}) {
  const waiting = handoff.status === "等待主人确认";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-950">
        <MessageSquareText size={19} />
        真人接入
      </h2>

      <div className={`mt-4 rounded-lg border p-4 ${waiting ? "border-amber-200 bg-amber-50" : "border-teal-100 bg-teal-50"}`}>
        <p className={`text-sm font-semibold ${waiting ? "text-amber-800" : "text-teal-800"}`}>
          {handoff.status}
        </p>
        <p className={`mt-2 text-sm leading-6 ${waiting ? "text-amber-700" : "text-teal-700"}`}>
          {handoff.reason}
        </p>
        <p className={`mt-2 text-xs ${waiting ? "text-amber-600" : "text-teal-600"}`}>
          创建时间 {handoff.requestedAt}
        </p>
      </div>

      <button
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={waiting}
        onClick={onRequest}
      >
        请求真人接入
      </button>
    </section>
  );
}

function SafetyPanel() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-950">
        <ShieldCheck size={19} />
        对话边界
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
        <p>Agent 会说明自己是数字代理，不会冒充本人。</p>
        <p>联系方式、报价、线下见面和具体承诺需要主人确认。</p>
        <p>这个版本先用前端状态演示请求闭环，后续再接数据库和通知。</p>
      </div>
    </section>
  );
}

function getTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function estimateSessionTokens(messages: ChatMessage[]): TokenUsage {
  return messages.reduce<TokenUsage>(
    (usage, message) => {
      const tokens = estimateTextTokens(message.text);

      if (message.role === "visitor") {
        usage.input += tokens;
      } else {
        usage.output += tokens;
      }

      usage.total = usage.input + usage.output;
      return usage;
    },
    { input: 0, output: 0, total: 0 },
  );
}

function estimateTextTokens(text: string) {
  const compactText = text.trim();

  if (!compactText) {
    return 0;
  }

  const cjkCharacters = compactText.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinWords = compactText.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const punctuation =
    compactText.match(/[^\sA-Za-z0-9_\u3400-\u9fff]/g)?.length ?? 0;

  return Math.max(
    1,
    Math.ceil(cjkCharacters + latinWords * 1.25 + punctuation * 0.5),
  );
}

function formatTokenCount(count: number) {
  return new Intl.NumberFormat("zh-CN").format(count);
}

async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AgentStreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      onEvent(JSON.parse(trimmed) as AgentStreamEvent);
    }
  }

  buffer += decoder.decode();
  const trimmed = buffer.trim();
  if (trimmed) {
    onEvent(JSON.parse(trimmed) as AgentStreamEvent);
  }
}

function toolEventText(event: Extract<AgentStreamEvent, { type: `tool.${string}` }>) {
  const name = event.tool || "unknown";
  if (event.type === "tool.started") {
    return `正在调用工具：${name}`;
  }
  if (event.type === "tool.failed") {
    return `工具调用失败：${name}${event.error ? `。${event.error}` : ""}`;
  }
  return `工具调用完成：${name}`;
}
