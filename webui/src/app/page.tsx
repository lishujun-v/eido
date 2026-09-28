"use client";

import {
  BarChart3,
  BadgeInfo,
  Box,
  BookOpen,
  Check,
  ChevronDown,
  CircleDot,
  CircleX,
  Compass,
  Cuboid,
  Radio,
  ExternalLink,
  ArrowLeft,
  FolderKanban,
  FolderOpen,
  GripVertical,
  GitFork,
  Loader2,
  LibraryBig,
  LogIn,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  PenLine,
  Plus,
  Save,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  Trash2,
  RefreshCw,
  ShieldAlert,
  UserRound,
  UsersRound,
  Cpu,
} from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AuthDialog, type AuthUser } from "@/components/auth-dialog";
import { NewAgentForm } from "@/components/new-agent-form";
import { ProviderConfigManager } from "@/components/provider-config-manager";
import { RichMessage } from "@/components/rich-message";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { GraphLines } from "@/components/graph-lines";
import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { BrainstormSpace } from "@/components/brainstorm-space";
import { ChannelWorkspace } from "@/components/channel-workspace";
import { createKnowledgeClient, type KnowledgeSpace } from "@backend/knowledge/sdk";

const knowledgeClient = createKnowledgeClient();

const slashCommands = [
  { name: "compact", description: "压缩较早的会话上下文，保留摘要与最近消息" },
  { name: "help", description: "查看可用的斜杠命令" },
] as const;

const configNavItems = [
  { section: "Agents", label: "智能体", icon: CircleDot },
  { section: "KnowledgeBase", label: "知识库", icon: LibraryBig },
  { section: "Models", label: "模型", icon: Settings },
  { section: "Skills", label: "技能", icon: BookOpen },
  { section: "Tools", label: "工具", icon: Cuboid },
  { section: "Channels", label: "渠道", icon: Radio },
  { section: "Conversations", label: "会话", icon: MessageSquare },
];

const chatNavItem = { section: "Chat" as const, label: "会话", icon: MessageSquare };

const chatScenarios = [
  {
    id: "daily",
    label: "日常协作",
    quickActions: [
      { label: "整理待办", icon: Check, prompt: "请帮我把这些事项整理成待办清单：" },
      { label: "跟进事项", icon: Target, prompt: "请帮我梳理下一步需要跟进的事项：" },
      { label: "起草消息", icon: PenLine, prompt: "请帮我起草一段消息：" },
      { label: "总结资料", icon: BookOpen, prompt: "请帮我总结这份资料的重点：" },
    ],
  },
  {
    id: "analysis",
    label: "深度分析",
    quickActions: [
      { label: "梳理需求", icon: Target, prompt: "请帮我梳理需求：" },
      { label: "分析问题", icon: BarChart3, prompt: "请按背景、关键因素、可选方案、建议结论来分析：" },
      { label: "制定计划", icon: Check, prompt: "请帮我制定一个可执行的计划：" },
      { label: "写一段内容", icon: PenLine, prompt: "请帮我写一段内容：" },
    ],
  },
  {
    id: "creative",
    label: "创意探索",
    quickActions: [
      { label: "发散点子", icon: Sparkles, prompt: "请从三个不同方向为我发散创意：" },
      { label: "构思主题", icon: Target, prompt: "请帮我构思几个主题方向：" },
      { label: "打磨文案", icon: PenLine, prompt: "请帮我打磨这段文案：" },
      { label: "生成大纲", icon: BookOpen, prompt: "请帮我生成一份内容大纲：" },
    ],
  },
] as const;

type ChatScenarioId = (typeof chatScenarios)[number]["id"];

const permissionModes = [
  { id: "auto", label: "自动审批", description: "除危险命令外，工具直接执行" },
  { id: "smart", label: "智能审批", description: "按路径与网址风险决定是否确认" },
  { id: "manual", label: "人工审批", description: "外部文件与所有联网操作均确认" },
] as const;

type PermissionMode = (typeof permissionModes)[number]["id"];

const workspaceNavItems = [
  { section: "Focus", label: "专注看板", icon: FolderKanban },
  { section: "Factory", label: "超级工厂", icon: GitFork },
  { section: "Knowledge", label: "知识空间", icon: LibraryBig },
  { section: "Projects", label: "工作平台", icon: Box },
  { section: "Brainstorm", label: "脑暴空间", icon: Sparkles },
];

const workspaceExcludedProjectIds = ["note-down", "focus-board"];
const noExcludedProjectIds: string[] = [];

const orbitAgents = [
  {
    name: "Researcher",
    label: "Insights",
    icon: Search,
    className: "left-[50%] top-[14%] -translate-x-1/2",
    color: "from-[#7fb6ff] to-[#4d6df2]",
    tag: "bg-[#eaf0ff] text-[#5c73e5]",
  },
  {
    name: "Strategist",
    label: "Strategy",
    icon: Target,
    className: "right-[12%] top-[30%]",
    color: "from-[#ff92cf] to-[#d9468d]",
    tag: "bg-[#f0e9ff] text-[#6659c9]",
  },
  {
    name: "HR Assistant",
    label: "People",
    icon: UsersRound,
    className: "right-[12%] bottom-[23%]",
    color: "from-[#bc87ff] to-[#704ee4]",
    tag: "bg-[#eae9ff] text-[#6962d4]",
  },
  {
    name: "Support Agent",
    label: "Support",
    icon: ShieldCheck,
    className: "left-[50%] bottom-[12%] -translate-x-1/2",
    color: "from-[#75dfd4] to-[#38bea5]",
    tag: "bg-[#dff7f4] text-[#329f95]",
  },
  {
    name: "Content Creator",
    label: "Creative",
    icon: PenLine,
    className: "left-[13%] bottom-[25%]",
    color: "from-[#ffe36a] to-[#e8a71e]",
    tag: "bg-[#fbf0de] text-[#a77927]",
  },
  {
    name: "Data Analyst",
    label: "Analytics",
    icon: BarChart3,
    className: "left-[10%] top-[30%]",
    color: "from-[#79edb1] to-[#32c77d]",
    tag: "bg-[#ddf6f1] text-[#278f86]",
  },
];

const agentDirectoryThemes = [
  { artwork: "/agent-art/product-manager.png", tone: "blue", keywords: ["产品", "需求", "增长"] },
  { artwork: "/agent-art/ui-designer.png", tone: "violet", keywords: ["策略", "设计", "体验"] },
  { artwork: "/agent-art/presentation.png", tone: "coral", keywords: ["内容", "演示", "表达"] },
  { artwork: "/agent-art/document-converter.png", tone: "cyan", keywords: ["文档", "转换", "效率"] },
] as const;

type AgentProfile = {
  id: string;
  name: string;
  bio?: string;
  capabilities?: string;
  provider_config_id?: string;
  avatar?: {
    type?: "preset" | "upload";
    data_url?: string;
    emoji?: string;
    gradient?: string;
  };
  allowed_providers?: string[];
  enabled_tool_ids?: string[];
  enabled_skill_ids?: string[];
  knowledge_space_ids?: string[];
  agent_type?: "siinx" | "expert";
  interaction_mode?: "conversation" | "task_only";
  is_default?: boolean;
  system_managed?: boolean;
  runtime?: {
    kind?: "eido-local" | "remote-ndjson";
    endpoint?: string;
    remote_agent_id?: string;
    protocol_version?: "eido-agent/v1";
  };
  llm?: {
    default_provider?: string | null;
    default_model?: string | null;
    providers?: Array<{
      provider?: string;
      protocol?: string;
      api_base?: string;
      api_key_env?: string;
      auth_header?: string;
      default_model?: string;
      models?: string[];
      model_settings?: Record<string, { context_window?: number }>;
      temperature?: number;
    }>;
  };
  values?: string[];
  speaking_style?: string;
  boundaries?: string[];
  handoff_policy?: string;
  public_facts?: {
    city?: string;
    occupation?: string;
    visibility?: "private" | "unlisted" | "public";
  };
};

type ProviderConfig = {
  id: string;
  name: string;
  provider: string;
  default_model: string;
  models?: string[];
  model_settings?: Record<string, { context_window?: number }>;
  api_base: string;
  api_key_env: string;
  protocol: string;
  auth_header: string;
};

function getProviderConfigModels(config: ProviderConfig) {
  return Array.from(new Set([
    config.default_model,
    ...(config.models ?? []),
  ].filter(Boolean)));
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  images?: string[];
  time: string;
  speakerName?: string;
  speakerRole?: "orchestrator" | "expert";
  parts?: AssistantMessagePart[];
  isStreaming?: boolean;
};

type ConversationTokenUsage = {
  input: number;
  output: number;
  total: number;
};

type AssistantMessagePart =
  | {
      id: string;
      type: "text";
      text: string;
    }
  | {
      id: string;
      type: "thinking";
      text: string;
    }
  | ToolCallPart
  | InteractionPart;

type ToolCallPart = {
  id: string;
  type: "tool";
  name: string;
  arguments?: unknown;
  result?: string;
  status: "running" | "completed" | "failed";
  error?: string;
};

type Interaction = {
  id: string;
  kind: "clarification" | "approval";
  status?: "pending" | "answered" | "approved" | "rejected" | "expired";
  prompt: string;
  options?: string[];
  action?: string | null;
  action_arguments?: Record<string, unknown> | null;
};

type InteractionPart = {
  id: string;
  type: "interaction";
  interaction: Interaction;
  submission?: "idle" | "submitting" | "submitted";
};

type ChatStreamEvent =
  | { type: "meta"; session_id?: string }
  | { type: "heartbeat" }
  | { type: "delta"; content?: string }
  | { type: "thinking.delta"; content?: string }
  | {
      type: "tool.started" | "tool.completed" | "tool.failed";
      tool?: string;
      arguments?: unknown;
      result?: unknown;
      error?: string;
      metadata?: { detail?: string; result?: unknown };
    }
  | {
      type: "agent.started" | "agent.completed" | "agent.failed" | "agent.tool.started" | "agent.tool.completed" | "agent.tool.failed";
      agent_call_id?: string;
      agent_id?: string;
      agent_name?: string;
      task?: string;
      context?: string;
      expected_output?: string;
      summary?: string;
      tool?: string;
      arguments?: unknown;
      result?: unknown;
      error?: string;
    }
  | { type: "interaction.required"; interaction?: Interaction }
  | { type: "interaction.resolved"; interaction?: Interaction }
  | { type: "browser.frame"; action?: string; url?: string; title?: string; image?: string }
  | { type: "done"; tool_events?: unknown[]; context_usage?: { total?: number } | null; interaction?: Interaction | null }
  | { type: "error"; error?: string };

type ActiveSection = "Chat" | "Models" | "Skills" | "Tools" | "Channels" | "Conversations" | "Agents" | "KnowledgeBase" | "Focus" | "Factory" | "Knowledge" | "Projects" | "Brainstorm";

type WorkspaceProject = {
  id: string;
  name: string;
  description: string;
  version: string;
  entry: string;
  icon?: string;
  accent?: string;
  tags: string[];
  permissions: string[];
};

type ActiveProjectContext = {
  projectId: string;
  projectName: string;
  kind: string;
  title: string;
  filePath: string;
  content: string;
  metadata: Record<string, unknown>;
};

type PendingAttachment = {
  name: string;
  path: string;
  size: number;
};

type ConversationSummary = {
  id: string;
  agentId: string;
  title: string;
  preview: string;
  summary?: string;
  workingDirectory?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

type ConversationDetail = Omit<ConversationSummary, "messageCount"> & {
  executionPlan?: ExecutionPlan | null;
  contextUsage?: { total: number; system?: number; messages?: number; tools?: number } | null;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    images?: string[];
    created_at?: string;
  }>;
  pendingInteraction?: Interaction | null;
};

type PlanStepStatus = "pending" | "in_progress" | "completed" | "blocked" | "skipped";

type ExecutionPlan = {
  goal: string;
  status: string;
  reason?: string;
  updatedAt?: string;
  steps: Array<{
    id: string;
    title: string;
    status: PlanStepStatus;
    detail?: string;
  }>;
};

type ToolDefinition = {
  id: string;
  name: string;
  description: string;
  source: "nanobot" | "custom" | "mcp" | "siinx";
  kind: "builtin" | "http" | "mcp";
  method?: "GET" | "POST";
  endpoint?: string;
  parameters?: Record<string, unknown>;
  serverId?: string;
  serverName?: string;
  availableTo?: "siinx";
};

type McpServerDefinition = {
  id: string;
  name: string;
  endpoint: string;
  transport: "streamable-http";
  status: string;
  lastSyncedAt: string;
  hasAuthorization: boolean;
  hasCredentials?: boolean;
  registryName?: string;
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
};

type McpCatalogField = {
  name: string;
  description: string;
  required: boolean;
  secret: boolean;
  defaultValue: string;
  choices: string[];
};

type McpCatalogRemote = {
  type: "streamable-http" | "sse";
  url: string;
  variables: McpCatalogField[];
  headers: Array<McpCatalogField & { valueTemplate: string; placeholders: string[] }>;
};

type McpCatalogServer = {
  registryName: string;
  title: string;
  description: string;
  version: string;
  repositoryUrl: string;
  remotes: McpCatalogRemote[];
  packages: Array<{ registryType: string; identifier: string; version: string; runtimeHint: string; transport: string }>;
};

type ToolAgent = {
  id: string;
  name: string;
  enabledToolIds: string[];
};

type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  content?: string;
  source: "nanobot" | "custom";
  kind: "builtin" | "skill";
  disabledByDefault?: boolean;
};

type SkillAgent = {
  id: string;
  name: string;
  enabledSkillIds: string[];
};

const MIN_LEFT_PANEL = 204;
const MAX_LEFT_PANEL = 304;
const DEFAULT_LEFT_PANEL = 218;
const COLLAPSED_PANEL = 12;

type ResizeTarget = "left";

function PersistentMainView({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      className="persistent-main-view"
      data-active={active ? "true" : "false"}
    >
      {children}
    </div>
  );
}

export default function Home() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [digitalTwinAgent, setDigitalTwinAgent] = useState<AgentProfile | null>(null);
  const [workAgents, setWorkAgents] = useState<AgentProfile[]>([]);
  const [selectedWorkAgentIds, setSelectedWorkAgentIds] = useState<string[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(DEFAULT_LEFT_PANEL);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  // Always open on a blank conversation after a browser refresh.
  const [activeSection, setActiveSection] = useState<ActiveSection>("Chat");
  const [mountedSections, setMountedSections] = useState<Set<ActiveSection>>(
    () => new Set<ActiveSection>(["Chat"]),
  );
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [newConversationSignal, setNewConversationSignal] = useState(0);
  const [activeProjectContext, setActiveProjectContext] = useState<ActiveProjectContext | null>(null);
  const dragRef = useRef<{
    target: ResizeTarget;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    setMountedSections((current) => {
      if (current.has(activeSection)) return current;
      const next = new Set(current);
      next.add(activeSection);
      return next;
    });
  }, [activeSection]);

  useEffect(() => {
    let active = true;

    fetch("/api/auth", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active && data?.authenticated) {
          setAuthUser(data.user);
          loadAgents().then(({ siinXAgent, expertAgents: loadedExpertAgents }) => {
            if (active) {
              setDigitalTwinAgent(siinXAgent);
              setWorkAgents(loadedExpertAgents);
            }
          });
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };

  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      const delta = event.clientX - drag.startX;
      if (drag.target === "left") {
        setLeftPanelWidth(clamp(drag.startWidth + delta, MIN_LEFT_PANEL, MAX_LEFT_PANEL));
        return;
      }

    }

    function handlePointerUp() {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function startResize(target: ResizeTarget, clientX: number) {
    dragRef.current = {
      target,
      startX: clientX,
    startWidth: leftPanelWidth,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const refreshAgents = useCallback((createdAgent?: AgentProfile) => {
    if (createdAgent?.id) {
      setWorkAgents((current) => [
        createdAgent,
        ...current.filter((item) => item.id !== createdAgent.id),
      ]);
    }

    loadAgents().then(({ siinXAgent, expertAgents: loadedExpertAgents, success }) => {
      if (success) {
        setDigitalTwinAgent(siinXAgent);
        setWorkAgents(loadedExpertAgents);
      }
    });
  }, []);

  useEffect(() => {
    if ((activeSection === "Agents" || activeSection === "Brainstorm") && authUser) {
      refreshAgents();
    }
  }, [activeSection, authUser, refreshAgents]);

  const layoutColumns = [
    leftCollapsed ? `${COLLAPSED_PANEL}px` : `${leftPanelWidth}px`,
    "12px",
    "minmax(620px, 1fr)",
  ].join(" ");

  return (
    <main className="app-canvas theme-root overflow-hidden p-3 lg:p-4">
      <div
        className="app-shell grid gap-0"
        style={{
          gridTemplateColumns: layoutColumns,
          "--left-workspace-panel": leftCollapsed ? `${COLLAPSED_PANEL}px` : `${leftPanelWidth}px`,
        } as React.CSSProperties}
      >
        {leftCollapsed ? (
          <CollapsedRail
            icon="left"
            label="展开左侧栏"
            onExpand={() => setLeftCollapsed(false)}
          />
        ) : (
          <Sidebar
            activeSection={activeSection}
            agent={digitalTwinAgent}
            authUser={authUser}
            onAuthClick={() => setAuthModalOpen(true)}
            onCollapse={() => setLeftCollapsed(true)}
            onConversationDeleted={(deletedIds) => {
              if (selectedConversation && deletedIds.includes(selectedConversation.id)) {
                setSelectedConversation(null);
                setNewConversationSignal((signal) => signal + 1);
              }
            }}
            onConversationSelected={(conversation) => {
              setSelectedWorkAgentIds(
                conversation.agentId && conversation.agentId !== digitalTwinAgent?.id ? [conversation.agentId] : [],
              );
              setSelectedConversation(conversation);
              setActiveSection("Chat");
            }}
            onNewConversation={() => {
              setSelectedConversation(null);
              setNewConversationSignal((signal) => signal + 1);
              setActiveSection("Chat");
            }}
            onLogout={() => {
              setAuthUser(null);
              setDigitalTwinAgent(null);
              setWorkAgents([]);
              setSelectedWorkAgentIds([]);
              setSelectedConversation(null);
            }}
            onAgentUpdated={setDigitalTwinAgent}
            onNavSelect={(section) => {
              setActiveSection(section);
            }}
            selectedConversationId={selectedConversation?.id || ""}
          />
        )}
        <ResizeDivider
          disabled={leftCollapsed}
          label="拖动调整左侧栏宽度"
          onPointerDown={(clientX) => startResize("left", clientX)}
        />
        {mountedSections.has("Factory") && (
          <PersistentMainView active={activeSection === "Factory"}>
            <GraphLines agentId={digitalTwinAgent?.id} />
          </PersistentMainView>
        )}
        {mountedSections.has("Focus") && (
          <PersistentMainView active={activeSection === "Focus"}>
            <WorkspacePanel directProjectId="focus-board" onProjectContextChange={setActiveProjectContext} />
          </PersistentMainView>
        )}
        {mountedSections.has("Knowledge") && (
          <PersistentMainView active={activeSection === "Knowledge"}>
            <WorkspacePanel directProjectId="note-down" onProjectContextChange={setActiveProjectContext} />
          </PersistentMainView>
        )}
        {mountedSections.has("Projects") && (
          <PersistentMainView active={activeSection === "Projects"}>
            <WorkspacePanel excludedProjectIds={workspaceExcludedProjectIds} onProjectContextChange={setActiveProjectContext} />
          </PersistentMainView>
        )}
        {mountedSections.has("Brainstorm") && (
          <PersistentMainView active={activeSection === "Brainstorm"}>
            <BrainstormSpace active={activeSection === "Brainstorm"} mainAgent={digitalTwinAgent} agents={workAgents} authenticated={Boolean(authUser)} />
          </PersistentMainView>
        )}
        {(["Models", "Skills", "Tools", "Conversations"] as ActiveSection[]).map((section) =>
          mountedSections.has(section) ? (
            <PersistentMainView active={activeSection === section} key={section}>
              <section className="theme-orbit relative min-h-0 min-w-0 overflow-hidden rounded-[24px] border bg-[var(--app-surface-strong)]" />
            </PersistentMainView>
          ) : null,
        )}
        {mountedSections.has("Agents") && (
          <PersistentMainView active={activeSection === "Agents"}>
            <WorkAgentOrbit
              agents={[digitalTwinAgent, ...workAgents].filter((agent): agent is AgentProfile => agent !== null)}
              onAgentUpdated={(updatedAgent) => {
                if (updatedAgent.agent_type === "siinx") {
                  setDigitalTwinAgent(updatedAgent);
                } else {
                  setWorkAgents((current) => current.map((item) => item.id === updatedAgent.id ? updatedAgent : item));
                }
              }}
              onAgentSelect={(expertAgent) => {
                setSelectedWorkAgentIds((current) => current.includes(expertAgent.id) ? current : [...current, expertAgent.id]);
                setSelectedConversation(null);
                setNewConversationSignal((signal) => signal + 1);
                setActiveSection("Chat");
              }}
              onNewAgent={() => setNewAgentOpen(true)}
              selectedAgentIds={selectedWorkAgentIds}
            />
          </PersistentMainView>
        )}
        {mountedSections.has("KnowledgeBase") && (
          <PersistentMainView active={activeSection === "KnowledgeBase"}>
            <KnowledgeWorkspace active={activeSection === "KnowledgeBase"} agents={[digitalTwinAgent, ...workAgents].filter((agent): agent is AgentProfile => agent !== null).map((agent) => ({ id: agent.id, name: agent.name }))} />
          </PersistentMainView>
        )}
        {mountedSections.has("Channels") && (
          <PersistentMainView active={activeSection === "Channels"}>
            <ChannelWorkspace
              active={activeSection === "Channels"}
              agents={[digitalTwinAgent, ...workAgents].filter((agent): agent is AgentProfile => agent !== null).map((agent) => ({ id: agent.id, name: agent.name, isDefault: agent.agent_type === "siinx" }))}
              authenticated={Boolean(authUser)}
              onAuthClick={() => setAuthModalOpen(true)}
            />
          </PersistentMainView>
        )}
        {mountedSections.has("Chat") && (
          <PersistentMainView active={activeSection === "Chat"}>
            <DigitalTwinChatPanel
              agent={digitalTwinAgent}
              delegatedAgents={workAgents.filter((agent) => selectedWorkAgentIds.includes(agent.id))}
              onRemoveDelegatedAgent={(agentId) => setSelectedWorkAgentIds((current) => current.filter((id) => id !== agentId))}
              isAuthenticated={Boolean(authUser)}
              key={digitalTwinAgent?.id ?? "no-agent"}
              onAgentUpdated={(updatedAgent) => {
                if (updatedAgent.agent_type === "expert") {
                  setWorkAgents((current) => current.map((agent) => agent.id === updatedAgent.id ? updatedAgent : agent));
                } else {
                  setDigitalTwinAgent(updatedAgent);
                }
              }}
              onAuthClick={() => setAuthModalOpen(true)}
              onCollapse={() => undefined}
              onOpenModelConfig={() => setActiveSection("Models")}
              selectedConversation={selectedConversation}
              startNewSignal={newConversationSignal}
              projectContext={null}
            />
          </PersistentMainView>
        )}
      </div>
      {authModalOpen && (
        <AuthDialog
          onClose={() => setAuthModalOpen(false)}
          onSignedIn={(user) => {
            setAuthUser(user);
            loadAgents().then(({ siinXAgent, expertAgents: loadedExpertAgents }) => {
              setDigitalTwinAgent(siinXAgent);
              setWorkAgents(loadedExpertAgents);
            });
            setAuthModalOpen(false);
          }}
        />
      )}
      {newAgentOpen && (
        <NewAgentDialog
          onAgentCreated={(createdAgent) => refreshAgents(createdAgent)}
          onClose={() => setNewAgentOpen(false)}
        />
      )}
    </main>
  );
}

type SettingsSection = "Models" | "Conversations" | "Tools" | "Skills";

function Sidebar({
  activeSection,
  agent,
  authUser,
  onAgentUpdated,
  onAuthClick,
  onCollapse,
  onConversationDeleted,
  onConversationSelected,
  onNewConversation,
  onLogout,
  onNavSelect,
  selectedConversationId,
}: {
  activeSection: ActiveSection;
  agent: AgentProfile | null;
  authUser: AuthUser | null;
  onAgentUpdated: (agent: AgentProfile) => void;
  onAuthClick: () => void;
  onCollapse: () => void;
  onConversationDeleted: (deletedIds: string[]) => void;
  onConversationSelected: (conversation: ConversationDetail) => void;
  onNewConversation: () => void;
  onLogout: () => void;
  onNavSelect: (section: ActiveSection) => void;
  selectedConversationId: string;
}) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [dialogSection, setDialogSection] = useState<SettingsSection | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationQuery, setConversationQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationError, setConversationError] = useState("");
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerDefinition[]>([]);
  const [toolPanelTab, setToolPanelTab] = useState<"local" | "mcp">("local");
  const [toolAgents, setToolAgents] = useState<ToolAgent[]>([]);
  const [toolQuery, setToolQuery] = useState("");
  const [mcpQuery, setMcpQuery] = useState("");
  const [mcpView, setMcpView] = useState<"installed" | "discover">("installed");
  const [mcpCatalog, setMcpCatalog] = useState<McpCatalogServer[]>([]);
  const [isLoadingMcpCatalog, setIsLoadingMcpCatalog] = useState(false);
  const [mcpInstallTarget, setMcpInstallTarget] = useState<McpCatalogServer | null>(null);
  const [mcpInstallRemoteIndex, setMcpInstallRemoteIndex] = useState(0);
  const [mcpInstallValues, setMcpInstallValues] = useState<Record<string, string>>({});
  const [toolError, setToolError] = useState("");
  const [toolSuccess, setToolSuccess] = useState("");
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [isSavingTools, setIsSavingTools] = useState(false);
  const [isSavingMcp, setIsSavingMcp] = useState(false);

  useEffect(() => {
    const settingsSection = ["Models", "Skills", "Tools", "Conversations"].includes(activeSection)
      ? activeSection as SettingsSection
      : null;
    setDialogSection(settingsSection);
  }, [activeSection]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function closeAccountMenuOnOutsideClick(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeAccountMenuOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeAccountMenuOnOutsideClick);
  }, [accountMenuOpen]);
  const [toolDraft, setToolDraft] = useState({
    name: "",
    description: "",
    method: "POST" as "GET" | "POST",
    endpoint: "",
    parametersText: JSON.stringify(defaultToolParametersSchema(), null, 2),
  });
  const [mcpDraft, setMcpDraft] = useState({ name: "", endpoint: "", authorization: "" });
  const [enabledToolIds, setEnabledToolIds] = useState<string[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [skillAgents, setSkillAgents] = useState<SkillAgent[]>([]);
  const [skillPanelTab, setSkillPanelTab] = useState<"library" | "create">("library");
  const [skillQuery, setSkillQuery] = useState("");
  const [skillHubQuery, setSkillHubQuery] = useState("");
  const [skillHubResults, setSkillHubResults] = useState<Array<{ slug: string; name: string; description: string; version: string; score?: number; downloads?: number; stars?: number; rating?: number; sourceUrl?: string }>>([]);
  const [skillHubDownload, setSkillHubDownload] = useState<{ slug: string; progress: number } | null>(null);
  const [isSearchingSkillHub, setIsSearchingSkillHub] = useState(false);
  const [skillError, setSkillError] = useState("");
  const [skillSuccess, setSkillSuccess] = useState("");
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [isSavingSkills, setIsSavingSkills] = useState(false);
  const skillDirectoryInputRef = useRef<HTMLInputElement>(null);
  const [skillDraft, setSkillDraft] = useState({
    name: "",
    description: "",
    content:
      "## When to use\nDescribe when the agent should use this skill.\n\n## Instructions\n1. Follow the user's intent.\n2. Use available tools only when needed.\n3. Return a concise, useful answer.",
  });
  const [enabledSkillIds, setEnabledSkillIds] = useState<string[]>([]);

  const loadConversations = useCallback(async () => {
    if (!authUser) {
      setConversations([]);
      setSelectedIds([]);
      return;
    }

    setIsLoadingConversations(true);
    setConversationError("");

    try {
      const params = new URLSearchParams();
      if (conversationQuery.trim()) {
        params.set("q", conversationQuery.trim());
      }
      const response = await fetch(`/api/conversations?${params.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "读取会话失败。");
      }

      const nextConversations = Array.isArray(data?.conversations) ? data.conversations : [];
      setConversations(nextConversations);
      setSelectedIds((current) =>
        current.filter((id) => nextConversations.some((conversation: ConversationSummary) => conversation.id === id)),
      );
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "读取会话失败。");
    } finally {
      setIsLoadingConversations(false);
    }
  }, [authUser, conversationQuery]);

  useEffect(() => {
    if (dialogSection !== "Conversations") {
      return;
    }

    const timer = window.setTimeout(() => {
      loadConversations();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [dialogSection, loadConversations]);

  const loadTools = useCallback(async () => {
    if (!authUser) {
      setTools([]);
      setMcpServers([]);
      setToolAgents([]);
      setEnabledToolIds([]);
      return;
    }

    setIsLoadingTools(true);
    setToolError("");

    try {
      const [response, mcpResponse] = await Promise.all([
        fetch("/api/tools", { cache: "no-store" }),
        fetch("/api/mcp", { cache: "no-store" }),
      ]);
      const [data, mcpData] = await Promise.all([
        response.json().catch(() => null),
        mcpResponse.json().catch(() => null),
      ]);

      if (!response.ok) {
        throw new Error(data?.error || "读取 Tools 失败。");
      }
      if (!mcpResponse.ok) {
        throw new Error(mcpData?.error || "读取 MCP Servers 失败。");
      }

      const nextTools = Array.isArray(data?.tools) ? data.tools : [];
      const nextAgents = Array.isArray(data?.agents) ? data.agents : [];
      const activeAgent = nextAgents.find((item: ToolAgent) => item.id === agent?.id) ?? nextAgents[0];
      setTools(nextTools);
      setMcpServers(Array.isArray(mcpData?.servers) ? mcpData.servers : []);
      setToolAgents(nextAgents);
      setEnabledToolIds(Array.isArray(activeAgent?.enabledToolIds) ? activeAgent.enabledToolIds : []);
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "读取 Tools 失败。");
    } finally {
      setIsLoadingTools(false);
    }
  }, [agent?.id, authUser]);

  useEffect(() => {
    if (dialogSection !== "Tools") {
      return;
    }
    const timer = window.setTimeout(() => {
      loadTools();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [dialogSection, loadTools]);

  const loadMcpCatalog = useCallback(async (query = "") => {
    setIsLoadingMcpCatalog(true);
    setToolError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/mcp/catalog?${params}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "读取 MCP Registry 失败。");
      setMcpCatalog(Array.isArray(data?.servers) ? data.servers : []);
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "读取 MCP Registry 失败。");
    } finally {
      setIsLoadingMcpCatalog(false);
    }
  }, []);

  useEffect(() => {
    if (dialogSection !== "Tools" || toolPanelTab !== "mcp" || mcpView !== "discover") return;
    const timer = window.setTimeout(() => loadMcpCatalog(mcpQuery), 300);
    return () => window.clearTimeout(timer);
  }, [dialogSection, loadMcpCatalog, mcpQuery, mcpView, toolPanelTab]);

  const loadSkills = useCallback(async () => {
    if (!authUser) {
      setSkills([]);
      setSkillAgents([]);
      setEnabledSkillIds([]);
      return;
    }

    setIsLoadingSkills(true);
    setSkillError("");

    try {
      const response = await fetch("/api/skills", { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "读取 Skills 失败。");
      }

      const nextSkills = Array.isArray(data?.skills) ? data.skills : [];
      const nextAgents = Array.isArray(data?.agents) ? data.agents : [];
      const activeAgent = nextAgents.find((item: SkillAgent) => item.id === agent?.id) ?? nextAgents[0];
      const savedIds = Array.isArray(activeAgent?.enabledSkillIds) ? activeAgent.enabledSkillIds : [];
      setSkills(nextSkills);
      setSkillAgents(nextAgents);
      setEnabledSkillIds(savedIds);
    } catch (error) {
      setSkillError(error instanceof Error ? error.message : "读取 Skills 失败。");
    } finally {
      setIsLoadingSkills(false);
    }
  }, [agent?.id, authUser]);

  useEffect(() => {
    if (dialogSection !== "Skills") {
      return;
    }
    const timer = window.setTimeout(() => {
      loadSkills();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [dialogSection, loadSkills]);

  async function logout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "logout" }),
      }).catch(() => undefined);
      setLogoutConfirmOpen(false);
      setAccountMenuOpen(false);
      onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  async function openConversation(id: string) {
    setConversationError("");

    try {
      const response = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.conversation) {
        throw new Error(data?.error || "读取会话详情失败。");
      }

      onConversationSelected(data.conversation);
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "读取会话详情失败。");
    }
  }

  async function deleteConversations(ids: string[]) {
    const targetIds = ids.filter(Boolean);
    if (!targetIds.length) {
      return;
    }

    setConversationError("");

    try {
      const response = await fetch("/api/conversations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: targetIds }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "删除会话失败。");
      }

      const deletedIds = Array.isArray(data?.deletedIds) ? data.deletedIds : [];
      setSelectedIds((current) => current.filter((id) => !deletedIds.includes(id)));
      onConversationDeleted(deletedIds);
      await loadConversations();
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "删除会话失败。");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleTool(id: string) {
    setEnabledToolIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function toggleSkill(id: string) {
    const targetAgentId = agent?.id || skillAgents[0]?.id;
    if (!targetAgentId) {
      setSkillError("请先创建 Agent，再配置可用 Skill。");
      return;
    }

    const previousIds = enabledSkillIds;
    const nextIds = previousIds.includes(id)
      ? previousIds.filter((item) => item !== id)
      : [...previousIds, id];

    setSkillError("");
    setSkillSuccess("");
    setEnabledSkillIds(nextIds);
    setIsSavingSkills(true);

    try {
      const response = await fetch("/api/skills", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: targetAgentId, enabledSkillIds: nextIds }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "更新 Agent Skill 配置失败。");
      }

      setSkillAgents((current) =>
        current.map((item) =>
          item.id === targetAgentId ? { ...item, enabledSkillIds: nextIds } : item,
        ),
      );
      if (data?.agent) {
        onAgentUpdated(data.agent);
      }
    } catch (error) {
      setEnabledSkillIds(previousIds);
      setSkillError(error instanceof Error ? error.message : "更新 Agent Skill 配置失败。");
    } finally {
      setIsSavingSkills(false);
    }
  }

  async function createTool() {
    setToolError("");
    setToolSuccess("");

    let parameters: unknown;
    try {
      parameters = JSON.parse(toolDraft.parametersText);
    } catch {
      setToolError("Parameters 不是有效 JSON。");
      return;
    }

    setIsSavingTools(true);
    try {
      const response = await fetch("/api/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: toolDraft.name,
          description: toolDraft.description,
          method: toolDraft.method,
          endpoint: toolDraft.endpoint,
          parameters,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "新增 Tool 失败。");
      }

      setToolDraft({
        name: "",
        description: "",
        method: "POST",
        endpoint: "",
        parametersText: JSON.stringify(defaultToolParametersSchema(), null, 2),
      });
      setToolSuccess("Tool 已新增。");
      await loadTools();
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "新增 Tool 失败。");
    } finally {
      setIsSavingTools(false);
    }
  }

  async function deleteTool(id: string) {
    setToolError("");
    setToolSuccess("");
    setIsSavingTools(true);

    try {
      const response = await fetch("/api/tools", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "删除 Tool 失败。");
      }

      setEnabledToolIds((current) => current.filter((item) => item !== id));
      setToolSuccess("Tool 已删除。");
      await loadTools();
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "删除 Tool 失败。");
    } finally {
      setIsSavingTools(false);
    }
  }

  async function createMcpServer() {
    setToolError("");
    setToolSuccess("");
    setIsSavingMcp(true);
    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mcpDraft),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "添加 MCP Server 失败。");
      setMcpDraft({ name: "", endpoint: "", authorization: "" });
      setToolSuccess(`MCP Server 已连接，发现 ${data?.server?.tools?.length || 0} 个工具。`);
      await loadTools();
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "添加 MCP Server 失败。");
    } finally {
      setIsSavingMcp(false);
    }
  }

  function startCatalogInstall(server: McpCatalogServer) {
    const remoteIndex = server.remotes.findIndex((remote) => remote.type === "streamable-http");
    if (remoteIndex < 0) return;
    const remote = server.remotes[remoteIndex];
    const values: Record<string, string> = {};
    for (const field of remote.variables) values[`variable:${field.name}`] = field.defaultValue;
    for (const header of remote.headers) {
      const keys = header.placeholders.length ? header.placeholders : [header.name];
      for (const key of keys) values[`header:${header.name}:${key}`] = "";
    }
    setMcpInstallTarget(server);
    setMcpInstallRemoteIndex(remoteIndex);
    setMcpInstallValues(values);
    setToolError("");
    setToolSuccess("");
  }

  async function installCatalogMcp() {
    if (!mcpInstallTarget) return;
    const remote = mcpInstallTarget.remotes[mcpInstallRemoteIndex];
    if (!remote || remote.type !== "streamable-http") return;
    let endpoint = remote.url;
    for (const field of remote.variables) {
      endpoint = endpoint.replaceAll(`{${field.name}}`, mcpInstallValues[`variable:${field.name}`] || field.defaultValue);
    }
    const headers = Object.fromEntries(remote.headers.flatMap((header) => {
      let value = header.valueTemplate;
      const keys = header.placeholders.length ? header.placeholders : [header.name];
      for (const key of keys) {
        const input = mcpInstallValues[`header:${header.name}:${key}`] || "";
        value = header.placeholders.length ? value.replaceAll(`{${key}}`, input) : input;
      }
      return value.trim() ? [[header.name, value.trim()]] : [];
    }));
    setIsSavingMcp(true);
    setToolError("");
    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: mcpInstallTarget.title,
          endpoint,
          headers,
          registryName: mcpInstallTarget.registryName,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "安装 MCP Server 失败。");
      setMcpInstallTarget(null);
      setMcpView("installed");
      setMcpQuery("");
      setToolSuccess(`${mcpInstallTarget.title} 已安装，发现 ${data?.server?.tools?.length || 0} 个工具。`);
      await loadTools();
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "安装 MCP Server 失败。");
    } finally {
      setIsSavingMcp(false);
    }
  }

  async function syncMcpServer(id: string) {
    setToolError("");
    setToolSuccess("");
    setIsSavingMcp(true);
    try {
      const response = await fetch("/api/mcp", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "同步 MCP Server 失败。");
      setToolSuccess(`已同步 ${data?.server?.tools?.length || 0} 个 MCP 工具。`);
      await loadTools();
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "同步 MCP Server 失败。");
    } finally {
      setIsSavingMcp(false);
    }
  }

  async function deleteMcpServer(id: string) {
    setToolError("");
    setToolSuccess("");
    setIsSavingMcp(true);
    try {
      const response = await fetch("/api/mcp", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "删除 MCP Server 失败。");
      setEnabledToolIds((current) => current.filter((toolId) => !toolId.startsWith(`mcp:${id}:`)));
      setToolSuccess("MCP Server 已删除。");
      await loadTools();
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "删除 MCP Server 失败。");
    } finally {
      setIsSavingMcp(false);
    }
  }

  async function saveAgentTools() {
    const targetAgentId = agent?.id || toolAgents[0]?.id;
    if (!targetAgentId) {
      setToolError("请先创建 Agent，再配置可用 Tool。");
      return;
    }

    setToolError("");
    setToolSuccess("");
    setIsSavingTools(true);

    try {
      const response = await fetch("/api/tools", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: targetAgentId, enabledToolIds }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "保存 Agent Tool 配置失败。");
      }

      if (data?.agent) {
        onAgentUpdated(data.agent);
      }
      setToolSuccess("Agent 可用 Tool 已保存。");
      await loadTools();
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "保存 Agent Tool 配置失败。");
    } finally {
      setIsSavingTools(false);
    }
  }

  async function createSkill() {
    setSkillError("");
    setSkillSuccess("");
    setIsSavingSkills(true);

    try {
      const response = await fetch("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(skillDraft),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "新增 Skill 失败。");
      }

      setSkillDraft({
        name: "",
        description: "",
        content:
          "## When to use\nDescribe when the agent should use this skill.\n\n## Instructions\n1. Follow the user's intent.\n2. Use available tools only when needed.\n3. Return a concise, useful answer.",
      });
      setSkillSuccess("Skill 已新增。");
      await loadSkills();
    } catch (error) {
      setSkillError(error instanceof Error ? error.message : "新增 Skill 失败。");
    } finally {
      setIsSavingSkills(false);
    }
  }

  async function importSkillDirectory(files: FileList | null) {
    if (!files?.length) return;
    setSkillError("");
    setSkillSuccess("");
    setIsSavingSkills(true);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) {
        const relativePath = file.webkitRelativePath || file.name;
        form.append(`files/${relativePath}`, file);
      }
      const response = await fetch("/api/skills", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "导入 Skill 目录失败。");
      setSkillSuccess(`已导入 ${data?.skill?.name || "Skill"}，保留 ${data?.skill?.file_count || files.length} 个文件。`);
      await loadSkills();
    } catch (error) {
      setSkillError(error instanceof Error ? error.message : "导入 Skill 目录失败。");
    } finally {
      if (skillDirectoryInputRef.current) skillDirectoryInputRef.current.value = "";
      setIsSavingSkills(false);
    }
  }

  async function searchSkillHub() {
    const query = skillHubQuery.trim();
    if (!query) return;
    setSkillError("");
    setIsSearchingSkillHub(true);
    try {
      const response = await fetch(`/api/skillhub?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "搜索 SkillHub 失败。");
      setSkillHubResults(Array.isArray(data?.results) ? data.results : []);
    } catch (error) {
      setSkillError(error instanceof Error ? error.message : "搜索 SkillHub 失败。");
    } finally {
      setIsSearchingSkillHub(false);
    }
  }

  async function importFromSkillHub(slug: string, version: string) {
    setSkillError("");
    setSkillSuccess("");
    setIsSavingSkills(true);
    setSkillHubDownload({ slug, progress: 6 });
    const progressTimer = window.setInterval(() => {
      setSkillHubDownload((current) => {
        if (!current || current.slug !== slug || current.progress >= 92) return current;
        const step = Math.max(1, Math.round((92 - current.progress) * 0.12));
        return { ...current, progress: Math.min(92, current.progress + step) };
      });
    }, 180);
    try {
      const response = await fetch("/api/skillhub", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, version }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "从 SkillHub 导入失败。");
      window.clearInterval(progressTimer);
      setSkillHubDownload({ slug, progress: 100 });
      setSkillSuccess(`已从 SkillHub 导入 ${data?.skill?.name || slug}。`);
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      setSkillHubResults((items) => items.filter((item) => item.slug !== slug));
      await loadSkills();
    } catch (error) {
      setSkillError(error instanceof Error ? error.message : "从 SkillHub 导入失败。");
    } finally {
      window.clearInterval(progressTimer);
      setSkillHubDownload(null);
      setIsSavingSkills(false);
    }
  }

  async function deleteSkill(id: string) {
    setSkillError("");
    setSkillSuccess("");
    setIsSavingSkills(true);

    try {
      const response = await fetch("/api/skills", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "删除 Skill 失败。");
      }

      setEnabledSkillIds((current) => current.filter((item) => item !== id));
      setSkillSuccess("Skill 已删除。");
      await loadSkills();
    } catch (error) {
      setSkillError(error instanceof Error ? error.message : "删除 Skill 失败。");
    } finally {
      setIsSavingSkills(false);
    }
  }

  const allVisibleSelected =
    conversations.length > 0 && conversations.every((conversation) => selectedIds.includes(conversation.id));
  const conversationsByDirectory = conversations.reduce<Array<{ directory: string; tasks: ConversationSummary[] }>>(
    (groups, conversation) => {
      const directory = conversation.workingDirectory || "未绑定工作目录";
      const group = groups.find((item) => item.directory === directory);
      if (group) group.tasks.push(conversation);
      else groups.push({ directory, tasks: [conversation] });
      return groups;
    },
    [],
  );
  const filteredTools = tools.filter((tool) => {
    if (tool.source === "mcp") return false;
    const query = toolQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [tool.name, tool.description, tool.endpoint, tool.kind]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  const filteredMcpServers = mcpServers
    .map((server) => ({
      ...server,
      tools: server.tools.filter((tool) => {
        const query = mcpQuery.trim().toLowerCase();
        return !query || [tool.name, tool.description, server.name, server.endpoint]
          .some((value) => value.toLowerCase().includes(query));
      }),
    }))
    .filter((server) => !mcpQuery.trim() || server.tools.length > 0 || server.name.toLowerCase().includes(mcpQuery.trim().toLowerCase()));
  const selectedCatalogRemote = mcpInstallTarget?.remotes[mcpInstallRemoteIndex];
  const catalogInstallReady = Boolean(selectedCatalogRemote) && Boolean(selectedCatalogRemote?.variables.every((field) =>
    !field.required || Boolean((mcpInstallValues[`variable:${field.name}`] || field.defaultValue).trim()),
  )) && Boolean(selectedCatalogRemote?.headers.every((header) => {
    if (!header.required) return true;
    const keys = header.placeholders.length ? header.placeholders : [header.name];
    return keys.every((key) => Boolean(mcpInstallValues[`header:${header.name}:${key}`]?.trim()));
  }));
  const filteredSkills = skills.filter((skill) => {
    const query = skillQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [skill.name, skill.description, skill.source, skill.kind]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  return (
    <>
    <aside className="theme-panel app-sidebar relative z-20 mx-1 flex min-h-0 flex-col rounded-[24px] border">
      <div className="flex items-center gap-3 px-7 pb-6 pt-6">
        <Link className="flex items-center gap-4" href="/">
          <span className="brand-mark flex size-11 items-center justify-center rounded-[12px] text-[#11120f]">
            <Sparkles size={24} strokeWidth={2.5} />
          </span>
          <span className="theme-heading text-[19px] font-bold tracking-normal">
            SiinX
          </span>
        </Link>
        <button
          aria-label="隐藏左侧栏"
          className="theme-muted ml-auto flex size-9 shrink-0 items-center justify-center rounded-[10px] transition hover:bg-[var(--app-primary-soft)] hover:text-[var(--app-primary-strong)]"
          onClick={onCollapse}
          title="隐藏左侧栏"
          type="button"
        >
          <PanelLeftClose size={19} />
        </button>
      </div>

      <nav aria-label="主功能" className="px-4">
        <div className="mb-3">
          {(() => {
            const Icon = chatNavItem.icon;
            const isActive = activeSection === chatNavItem.section;
            return (
              <div
                className={`flex h-[50px] w-full items-center rounded-[14px] transition ${
                  isActive ? "theme-primary-soft" : "text-[var(--app-text)] hover:bg-[var(--app-surface-soft)]"
                }`}
              >
                <button
                  aria-current={isActive ? "page" : undefined}
                  className="flex h-full min-w-0 flex-1 items-center gap-4 rounded-l-[14px] px-4 text-left text-[14px] font-bold"
                  onClick={() => {
                    setDialogSection(null);
                    onNavSelect("Chat");
                  }}
                  type="button"
                >
                  <span className={`flex size-7 items-center justify-center rounded-[9px] ${isActive ? "bg-[var(--app-primary)] text-[var(--app-primary-contrast)]" : "theme-soft"}`}>
                    <Icon size={16} strokeWidth={2.2} />
                  </span>
                  {chatNavItem.label}
                </button>
                <button
                  aria-label="新建会话"
                  className="theme-muted mr-2 flex size-8 shrink-0 items-center justify-center rounded-[9px] transition hover:bg-[var(--app-primary)] hover:text-[var(--app-primary-contrast)]"
                  onClick={() => {
                    setDialogSection(null);
                    onNewConversation();
                  }}
                  title="新建会话"
                  type="button"
                >
                  <Plus size={17} strokeWidth={2.4} />
                </button>
              </div>
            );
          })()}
        </div>

        <div className="mb-3 border-t border-[var(--app-border)]" />
        <div className="space-y-1.5">
        {configNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.section;
          const className = `flex h-[46px] w-full items-center gap-4 rounded-[12px] px-4 text-left text-[14px] font-semibold transition ${
            isActive
              ? "theme-primary-soft"
              : "text-[var(--app-text)] hover:bg-[var(--app-surface-soft)]"
          }`;

          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={className}
              key={item.section}
              onClick={() => {
                setDialogSection(["Models", "Skills", "Tools", "Conversations"].includes(item.section) ? item.section as SettingsSection : null);
                onNavSelect(item.section as ActiveSection);
              }}
              type="button"
            >
              <Icon size={20} strokeWidth={1.9} />
              {item.label}
            </button>
          );
        })}
        </div>

        <div className="my-3 border-t border-[var(--app-border)]" />

        <div className="space-y-1.5">
        {workspaceNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.section;
          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={`flex h-[46px] w-full items-center gap-4 rounded-[12px] px-4 text-left text-[14px] font-semibold transition ${
                isActive ? "theme-primary-soft" : "text-[var(--app-text)] hover:bg-[var(--app-surface-soft)]"
              }`}
              key={item.section}
              onClick={() => {
                setDialogSection(null);
                onNavSelect(item.section as ActiveSection);
              }}
              type="button"
            >
              <Icon size={20} strokeWidth={1.9} />
              {item.label}
            </button>
          );
        })}
        </div>
      </nav>

      <div className="flex-1" />

      <div ref={accountMenuRef} className="relative mt-auto shrink-0 border-t border-[var(--app-border)] px-5 py-4">
        {accountMenuOpen && (
          <div className="theme-menu account-menu-popover absolute bottom-[76px] left-5 z-50 w-[300px] max-w-[calc(100vw-2rem)] rounded-[18px] border shadow-[0_24px_60px_rgba(45,55,92,0.18)]">
            {authUser ? (
              <>
                <div className="flex items-center gap-3 border-b border-[var(--app-border)] px-4 py-4">
                  <span className="theme-primary-soft flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">
                    {getInitials(authUser.name || authUser.email || "")}
                  </span>
                  <div className="min-w-0">
                    <p className="theme-heading break-words text-[14px] font-bold">
                      {authUser.name || "已登录用户"}
                    </p>
                    <p className="theme-muted mt-0.5 break-all text-[12px] font-medium">
                      {authUser.email}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="border-b border-[var(--app-border)] px-4 py-4">
                <p className="theme-heading text-[14px] font-bold">访客用户</p>
                <p className="theme-muted mt-1 text-[12px] font-medium">登录后同步你的 Agent 与对话</p>
              </div>
            )}

            <div className="px-4 py-4">
              <ThemeSwitcher menu />
            </div>

            <div className="border-t border-[var(--app-border)] p-2">
              <button
                className={`flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14px] font-semibold transition hover:bg-[var(--app-surface-soft)] ${
                  authUser ? "text-[#c43d52]" : "text-[var(--app-text)]"
                }`}
                onClick={() => {
                  if (authUser) {
                    setAccountMenuOpen(false);
                    setLogoutConfirmOpen(true);
                  } else {
                    setAccountMenuOpen(false);
                    onAuthClick();
                  }
                }}
                type="button"
              >
                {authUser ? <LogOut size={18} /> : <LogIn size={18} />}
                {authUser ? "退出登录" : "登录 / 注册"}
              </button>
            </div>
          </div>
        )}

        <button
          aria-expanded={accountMenuOpen}
          aria-haspopup="dialog"
          className="account-tab flex min-h-12 w-full items-center gap-3 rounded-[13px] px-2 text-left transition"
          onClick={() => setAccountMenuOpen((open) => !open)}
          type="button"
        >
          <span className="theme-primary-soft flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">
            {authUser ? getInitials(authUser.name || authUser.email || "") : <UserRound size={22} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="theme-heading block truncate text-[14px] font-bold">
              {authUser?.name || "未登录"}
            </span>
          </span>
        </button>
      </div>
    </aside>
    {dialogSection === "Models" && (
      <div className="capability-page capability-page--models fixed inset-y-3 left-[calc(.75rem+var(--left-workspace-panel)+12px)] right-3 z-[60] overflow-hidden rounded-[24px] border lg:inset-y-4 lg:left-[calc(1rem+var(--left-workspace-panel)+12px)] lg:right-4">
        <section className="capability-page__scroll mx-auto h-full w-full overflow-y-auto">
          <div className="mx-auto min-w-0 max-w-[1280px] px-5 py-6 lg:px-10 lg:py-8">
            <ProviderConfigManager mainAgent={agent} onMainAgentUpdated={onAgentUpdated} />
          </div>
        </section>
      </div>
    )}
    {dialogSection === "Conversations" && (
      <div className="capability-page capability-page--conversations fixed inset-y-3 left-[calc(.75rem+var(--left-workspace-panel)+12px)] right-3 z-[60] overflow-hidden rounded-[24px] border lg:inset-y-4 lg:left-[calc(1rem+var(--left-workspace-panel)+12px)] lg:right-4">
        <section className="capability-page__scroll mx-auto h-full w-full overflow-y-auto">
          <div className="mx-auto min-w-0 max-w-[1180px] px-5 py-6 lg:px-10 lg:py-8">
            <div className="capability-hero mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div className="flex items-center gap-4">
                <span className="capability-hero__icon"><MessageSquare size={28} /></span>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="capability-hero__title">会话任务</h2>
                    <span className="capability-count">{conversations.length} 个任务</span>
                  </div>
                  <p className="capability-hero__copy">按工作目录整理全部任务，快速回到最近的上下文继续协作。</p>
                </div>
              </div>
              <p className="capability-eyebrow">CONVERSATION · CONTEXT · CONTINUITY</p>
            </div>
            <div className="capability-toolbar mb-5 flex flex-wrap items-center gap-3 rounded-[18px] border p-3">
              <label className="capability-search flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-[12px] border px-3">
                <Search size={16} className="theme-muted shrink-0" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:text-[var(--app-muted)]"
                  onChange={(event) => setConversationQuery(event.target.value)}
                  placeholder="搜索任务标题或消息"
                  value={conversationQuery}
                />
              </label>
              {isLoadingConversations && <Loader2 size={18} className="theme-muted-strong animate-spin" />}
              <button
                className="theme-button inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[12px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!conversations.length}
                onClick={() => {
                  setSelectedIds(allVisibleSelected ? [] : conversations.map((conversation) => conversation.id));
                }}
                type="button"
              >
                {allVisibleSelected ? <Check size={14} /> : <Square size={14} />}
                {allVisibleSelected ? "取消" : "全选"}
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#ffd8df] bg-[#fff1f3] px-3 text-[12px] font-bold text-[#b4233a] transition hover:bg-[#ffe7eb] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!selectedIds.length}
                onClick={() => deleteConversations(selectedIds)}
                type="button"
              >
                <Trash2 size={14} />
                删除 {selectedIds.length || ""}
              </button>
            </div>

            {conversationError && (
              <p className="mb-3 rounded-[12px] border border-[#ffd8df] bg-[#fff1f3] px-3 py-2 text-[12px] font-semibold leading-5 text-[#b4233a]">
                {conversationError}
              </p>
            )}

            <div className="conversation-directory-grid grid gap-7 lg:grid-cols-2">
              {conversationsByDirectory.map(({ directory, tasks }) => <section className="conversation-directory" key={directory}>
                <div className="mb-3 flex items-center gap-2 px-1">
                  <FolderOpen size={15} className="shrink-0 text-[var(--app-primary-strong)]" />
                  <span className="theme-heading truncate text-[12px] font-bold" title={directory}>{directory.split("/").filter(Boolean).pop() || directory}</span>
                  <span className="theme-muted text-[11px] font-semibold">{tasks.length} 个任务</span>
                </div>
                <div className="conversation-task-grid grid gap-2">
              {tasks.map((conversation) => {
                const isSelected = selectedIds.includes(conversation.id);
                const isCurrent = selectedConversationId === conversation.id;

                return (
                  <div
                    className={`conversation-card group rounded-[14px] border p-3 transition ${
                      isCurrent
                        ? "border-[var(--app-primary)] bg-[var(--app-primary-soft)]"
                        : "border-[var(--app-border)] bg-[var(--app-surface-strong)] hover:bg-[var(--app-surface-soft)]"
                    }`}
                    key={conversation.id}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--app-muted)] transition hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-primary-strong)]"
                        onClick={() => toggleSelected(conversation.id)}
                        title={isSelected ? "取消选择" : "选择任务"}
                        type="button"
                      >
                        {isSelected ? <Check size={16} strokeWidth={3} /> : <Square size={16} />}
                      </button>
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          openConversation(conversation.id);
                        }}
                        type="button"
                      >
                        <span className="theme-heading block truncate text-[14px] font-bold">
                          {conversation.title}
                        </span>
                        <span className="theme-muted mt-1 line-clamp-2 block text-[12px] font-medium leading-5">
                          {conversation.preview}
                        </span>
                        <span className="theme-muted mt-2 block text-[11px] font-bold">
                          {formatConversationTime(conversation.updatedAt)} · {conversation.messageCount} 条消息
                        </span>
                      </button>
                      <button
                        className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-[#b4233a] transition hover:bg-[#fff1f3]"
                        onClick={() => deleteConversations([conversation.id])}
                        title="删除任务"
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
                </div>
              </section>)}
            </div>

            {!isLoadingConversations && conversations.length === 0 && (
              <div className="theme-soft rounded-[14px] border border-dashed px-4 py-5 text-[13px] font-medium leading-6">
                {authUser
                  ? conversationQuery
                    ? "没有找到匹配的任务。"
                    : "暂无任务。创建 Agent 后，在右侧发起任务即可。"
                  : "登录后可以查看和管理你的任务。"}
              </div>
            )}
          </div>
        </section>
      </div>
    )}
    {dialogSection === "Tools" && (
      <div className="capability-page capability-page--tools fixed inset-y-3 left-[calc(.75rem+var(--left-workspace-panel)+12px)] right-3 z-[60] overflow-hidden rounded-[24px] border lg:inset-y-4 lg:left-[calc(1rem+var(--left-workspace-panel)+12px)] lg:right-4">
        <section className="mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden px-5 pt-6 lg:px-10 lg:pt-8">
            <div className="capability-hero mb-5 flex shrink-0 flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div className="flex items-center gap-4">
                <span className="capability-hero__icon"><Cuboid size={28} /></span>
                <div>
                  <div className="flex items-center gap-3"><h2 className="capability-hero__title">工具中心</h2><span className="capability-count">{tools.length + mcpServers.reduce((total, server) => total + server.tools.length, 0)} 个工具</span></div>
                  <p className="capability-hero__copy">连接本地能力与 MCP 服务，为 Agent 组合可执行的工作装备。</p>
                </div>
              </div>
              <p className="capability-eyebrow">CONNECT · EXECUTE · EXTEND</p>
            </div>
            <div className="capability-tabs flex shrink-0 gap-2 rounded-[16px] border p-1.5" role="tablist" aria-label="Tool 类型">
              <button
                aria-selected={toolPanelTab === "local"}
                className={`flex h-10 items-center gap-2 rounded-[10px] px-3 text-[12px] font-bold transition ${toolPanelTab === "local" ? "theme-primary-soft" : "theme-muted hover:bg-[var(--app-surface-soft)]"}`}
                onClick={() => { setToolPanelTab("local"); setToolError(""); setToolSuccess(""); }}
                role="tab"
                type="button"
              >
                <Cuboid size={18} />
                <span>Local Tools</span>
                <span className="theme-muted text-[11px]">{tools.filter((tool) => tool.source !== "mcp").length}</span>
              </button>
              <button
                aria-selected={toolPanelTab === "mcp"}
                className={`flex h-10 items-center gap-2 rounded-[10px] px-3 text-[12px] font-bold transition ${toolPanelTab === "mcp" ? "theme-primary-soft" : "theme-muted hover:bg-[var(--app-surface-soft)]"}`}
                onClick={() => { setToolPanelTab("mcp"); setToolError(""); setToolSuccess(""); }}
                role="tab"
                type="button"
              >
                <Server size={18} />
                <span>MCP Tools</span>
                <span className="theme-muted text-[11px]">{mcpServers.reduce((total, server) => total + server.tools.length, 0)}</span>
              </button>
            </div>

          {toolPanelTab === "local" ? (
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-5 overflow-y-auto py-5 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
            <div className="capability-glass-card h-fit space-y-3 rounded-[18px] border px-4 py-4">
              <h3 className="theme-heading text-[14px] font-bold">新增 Tool</h3>
              <input
                className="theme-input h-10 w-full rounded-[10px] border px-3 text-[12px] font-semibold outline-none placeholder:text-[var(--app-muted)]"
                onChange={(event) => setToolDraft((draft) => ({ ...draft, name: event.target.value }))}
                placeholder="tool_name"
                value={toolDraft.name}
              />
              <textarea
                className="theme-input min-h-16 w-full resize-none rounded-[10px] border px-3 py-2 text-[12px] font-semibold leading-5 outline-none placeholder:text-[var(--app-muted)]"
                onChange={(event) => setToolDraft((draft) => ({ ...draft, description: event.target.value }))}
                placeholder="描述这个 tool 什么时候使用"
                value={toolDraft.description}
              />
              <div className="grid grid-cols-[78px_1fr] gap-2">
                <select
                  className="theme-input h-10 rounded-[10px] border px-2 text-[12px] font-bold outline-none"
                  onChange={(event) =>
                    setToolDraft((draft) => ({ ...draft, method: event.target.value as "GET" | "POST" }))
                  }
                  value={toolDraft.method}
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </select>
                <input
                  className="theme-input h-10 min-w-0 rounded-[10px] border px-3 text-[12px] font-semibold outline-none placeholder:text-[var(--app-muted)]"
                  onChange={(event) => setToolDraft((draft) => ({ ...draft, endpoint: event.target.value }))}
                  placeholder="https://example.com/tool"
                  value={toolDraft.endpoint}
                />
              </div>
              <textarea
                className="theme-input min-h-[180px] w-full resize-none rounded-[10px] border px-3 py-2 font-mono text-[11px] leading-5 outline-none"
                onChange={(event) => setToolDraft((draft) => ({ ...draft, parametersText: event.target.value }))}
                value={toolDraft.parametersText}
              />
              <button
                className="theme-primary-bg flex h-10 w-full items-center justify-center gap-2 rounded-[10px] text-[13px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-55"
                disabled={isSavingTools || !authUser}
                onClick={createTool}
                type="button"
              >
                {isSavingTools ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                新增 Tool
              </button>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="flex items-center gap-3">
                <label className="theme-input flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[12px] border px-3">
                  <Search size={16} className="theme-muted shrink-0" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:text-[var(--app-muted)]"
                    onChange={(event) => setToolQuery(event.target.value)}
                    placeholder="搜索 tool"
                    value={toolQuery}
                  />
                </label>
                {isLoadingTools && <Loader2 size={18} className="theme-muted-strong animate-spin" />}
              </div>

              {(toolError || toolSuccess) && (
                <p
                  className={`rounded-[12px] border px-3 py-2 text-[12px] font-semibold leading-5 ${
                    toolError
                      ? "border-[#ffd8df] bg-[#fff1f3] text-[#b4233a]"
                      : "border-[#c9f0dc] bg-[#eefbf4] text-[#217a4a]"
                  }`}
                >
                  {toolError || toolSuccess}
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredTools.map((tool) => {
                  const enabled = enabledToolIds.includes(tool.id);
                  const isCustom = tool.source === "custom";

                  return (
                    <div className="tool-library-card rounded-[16px] border p-3" key={tool.id}>
                      <div className="flex items-start gap-2">
                        <button
                          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px] transition ${
                            enabled
                              ? "theme-primary-soft text-[var(--app-primary-strong)]"
                              : "text-[var(--app-muted)] hover:bg-[var(--app-surface-soft)]"
                          }`}
                          onClick={() => toggleTool(tool.id)}
                          title={enabled ? "从 Agent 禁用" : "给 Agent 启用"}
                          type="button"
                        >
                          {enabled ? <Check size={17} strokeWidth={3} /> : <Square size={17} />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="theme-heading truncate text-[13px] font-bold">{tool.name}</span>
                            <span className="theme-soft shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase">
                              {tool.kind}
                            </span>
                          </div>
                          <p className="theme-muted mt-1 line-clamp-2 text-[12px] font-medium leading-5">
                            {tool.description}
                          </p>
                          {tool.endpoint && (
                            <p className="theme-muted mt-2 truncate font-mono text-[10px]">
                              {tool.method || "POST"} {tool.endpoint}
                            </p>
                          )}
                        </div>
                        {isCustom && (
                          <button
                            className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-[#b4233a] transition hover:bg-[#fff1f3] disabled:opacity-45"
                            disabled={isSavingTools}
                            onClick={() => deleteTool(tool.id)}
                            title="删除 Tool"
                            type="button"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!isLoadingTools && filteredTools.length === 0 && (
                <div className="theme-soft rounded-[14px] border border-dashed px-4 py-5 text-[13px] font-medium leading-6">
                  {authUser ? "没有找到匹配的 Tool。" : "登录后可以管理 Tool。"}
                </div>
              )}

              <button
                className="theme-button sticky bottom-0 flex h-11 w-full items-center justify-center gap-2 rounded-[11px] border text-[13px] font-bold shadow-[0_14px_30px_rgba(67,78,119,0.12)] transition disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSavingTools || !agent}
                onClick={saveAgentTools}
                type="button"
              >
                {isSavingTools ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                保存 Agent Tools
              </button>
            </div>
          </div>
          ) : (
          <>
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(250px,300px)_minmax(0,1fr)] gap-5 overflow-y-auto p-5 sm:p-7">
            <div className="h-fit space-y-4">
              <div className="theme-soft grid grid-cols-2 gap-1 rounded-[12px] border p-1" role="tablist" aria-label="MCP Server 视图">
                <button className={`rounded-[9px] px-3 py-2 text-[12px] font-bold transition ${mcpView === "installed" ? "theme-primary-soft" : "theme-muted"}`} onClick={() => { setMcpView("installed"); setMcpQuery(""); }} type="button">已安装 {mcpServers.length}</button>
                <button className={`rounded-[9px] px-3 py-2 text-[12px] font-bold transition ${mcpView === "discover" ? "theme-primary-soft" : "theme-muted"}`} onClick={() => { setMcpView("discover"); setMcpQuery(""); }} type="button">发现</button>
              </div>

              {mcpView === "installed" ? (
                <div className="theme-soft space-y-3 rounded-[14px] border px-4 py-4">
                  <div>
                    <h3 className="theme-heading text-[14px] font-bold">手动连接 Server</h3>
                    <p className="theme-muted mt-1 text-[11px] font-medium leading-5">适用于未发布到 Registry 的 Streamable HTTP 服务。</p>
                  </div>
                  <input className="theme-input h-10 w-full rounded-[10px] border px-3 text-[12px] font-semibold outline-none placeholder:text-[var(--app-muted)]" onChange={(event) => setMcpDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Server 名称" value={mcpDraft.name} />
                  <input className="theme-input h-10 w-full rounded-[10px] border px-3 font-mono text-[11px] outline-none placeholder:text-[var(--app-muted)]" onChange={(event) => setMcpDraft((draft) => ({ ...draft, endpoint: event.target.value }))} placeholder="https://example.com/mcp" value={mcpDraft.endpoint} />
                  <input autoComplete="off" className="theme-input h-10 w-full rounded-[10px] border px-3 font-mono text-[11px] outline-none placeholder:text-[var(--app-muted)]" onChange={(event) => setMcpDraft((draft) => ({ ...draft, authorization: event.target.value }))} placeholder="Authorization（可选）" type="password" value={mcpDraft.authorization} />
                  <button className="theme-primary-bg flex h-10 w-full items-center justify-center gap-2 rounded-[10px] text-[13px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-55" disabled={isSavingMcp || !authUser || !mcpDraft.name.trim() || !mcpDraft.endpoint.trim()} onClick={createMcpServer} type="button">
                    {isSavingMcp ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}添加 Server
                  </button>
                  <p className="theme-muted text-[10px] font-medium leading-4">凭据只保存在本地配置中，不会在界面中回显。</p>
                </div>
              ) : (
                <div className="theme-soft rounded-[14px] border px-4 py-4">
                  <Compass className="theme-primary" size={21} />
                  <h3 className="theme-heading mt-3 text-[14px] font-bold">官方 MCP Registry</h3>
                  <p className="theme-muted mt-2 text-[11px] font-medium leading-5">搜索开源 MCP Server。远程 HTTP 服务可以直接安装，本地 stdio 包会标明运行方式。</p>
                  <p className="theme-muted mt-3 text-[10px] font-medium leading-4">目录数据由 Registry 提供，安装前请确认来源和权限。</p>
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-4">
              <div className="flex items-center gap-3">
                <label className="theme-input flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[12px] border px-3">
                  <Search size={16} className="theme-muted shrink-0" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:text-[var(--app-muted)]"
                    onChange={(event) => setMcpQuery(event.target.value)}
                    placeholder={mcpView === "installed" ? "搜索已安装的 tool 或 server" : "搜索官方 MCP Registry"}
                    value={mcpQuery}
                  />
                </label>
                {(isLoadingTools || isLoadingMcpCatalog) && <Loader2 size={18} className="theme-muted-strong animate-spin" />}
              </div>

              {(toolError || toolSuccess) && (
                <p className={`rounded-[12px] border px-3 py-2 text-[12px] font-semibold leading-5 ${toolError ? "border-[#ffd8df] bg-[#fff1f3] text-[#b4233a]" : "border-[#c9f0dc] bg-[#eefbf4] text-[#217a4a]"}`}>
                  {toolError || toolSuccess}
                </p>
              )}

              {mcpView === "installed" ? <div className="space-y-3">
                {filteredMcpServers.map((server) => (
                  <section className="overflow-hidden rounded-[14px] border border-[var(--app-border)] bg-[var(--app-surface-strong)]" key={server.id}>
                    <div className="flex items-start gap-3 border-b border-[var(--app-border)] p-4">
                      <span className="theme-primary-soft flex size-9 shrink-0 items-center justify-center rounded-[10px]"><Server size={17} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="theme-heading truncate text-[13px] font-bold">{server.name}</h3>
                          <span className="rounded-full bg-[#eefbf4] px-2 py-0.5 text-[9px] font-bold uppercase text-[#217a4a]">Connected</span>
                        </div>
                        <p className="theme-muted mt-1 truncate font-mono text-[10px]">{server.endpoint}</p>
                        <p className="theme-muted mt-1 text-[10px] font-semibold">{server.tools.length} tools · Streamable HTTP</p>
                      </div>
                      <button className="theme-muted flex size-8 items-center justify-center rounded-[9px] transition hover:bg-[var(--app-surface-soft)] disabled:opacity-45" disabled={isSavingMcp} onClick={() => syncMcpServer(server.id)} title="重新同步工具" type="button"><RefreshCw className={isSavingMcp ? "animate-spin" : ""} size={15} /></button>
                      <button className="flex size-8 items-center justify-center rounded-[9px] text-[#b4233a] transition hover:bg-[#fff1f3] disabled:opacity-45" disabled={isSavingMcp} onClick={() => deleteMcpServer(server.id)} title="删除 Server" type="button"><Trash2 size={15} /></button>
                    </div>
                    <div className="divide-y divide-[var(--app-border)]">
                      {server.tools.map((tool) => {
                        const id = `mcp:${server.id}:${tool.name}`;
                        const enabled = enabledToolIds.includes(id);
                        return (
                          <button className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[var(--app-surface-soft)]" key={id} onClick={() => toggleTool(id)} type="button">
                            <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] ${enabled ? "theme-primary-soft" : "theme-soft border"}`}>
                              {enabled ? <Check size={14} strokeWidth={3} /> : <Square className="theme-muted" size={14} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="theme-heading block truncate text-[12px] font-bold">{tool.name}</span>
                              <span className="theme-muted mt-1 block line-clamp-2 text-[11px] font-medium leading-4">{tool.description}</span>
                            </span>
                          </button>
                        );
                      })}
                      {server.tools.length === 0 && <p className="theme-muted px-4 py-5 text-center text-[12px] font-medium">这个 Server 暂未暴露匹配的工具。</p>}
                    </div>
                  </section>
                ))}
              </div> : <div className="grid gap-3 lg:grid-cols-2">
                {mcpCatalog.map((server) => {
                  const installed = mcpServers.some((item) => item.registryName === server.registryName);
                  const remoteAvailable = server.remotes.some((remote) => remote.type === "streamable-http");
                  return (
                    <section className="flex min-h-[190px] flex-col rounded-[14px] border border-[var(--app-border)] bg-[var(--app-surface-strong)] p-4" key={server.registryName}>
                      <div className="flex items-start gap-3">
                        <span className="theme-primary-soft flex size-9 shrink-0 items-center justify-center rounded-[10px]"><Server size={17} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="theme-heading truncate text-[13px] font-bold">{server.title}</h3>
                            <span className="theme-soft shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold">v{server.version}</span>
                          </div>
                          <p className="theme-muted mt-1 truncate font-mono text-[9px]">{server.registryName}</p>
                        </div>
                        {server.repositoryUrl && <a className="theme-muted transition hover:text-[var(--app-heading)]" href={server.repositoryUrl} rel="noreferrer" target="_blank" title="查看源码"><ExternalLink size={15} /></a>}
                      </div>
                      <p className="theme-muted mt-3 line-clamp-3 flex-1 text-[11px] font-medium leading-5">{server.description}</p>
                      <div className="mt-4 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${remoteAvailable ? "bg-[#eefbf4] text-[#217a4a]" : "theme-soft border"}`}>{remoteAvailable ? "Remote HTTP" : "Local stdio"}</span>
                        {server.packages[0] && <span className="theme-muted truncate text-[9px] font-semibold">{server.packages[0].runtimeHint || server.packages[0].registryType}</span>}
                        <button className="theme-primary-bg ml-auto flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[11px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-45" disabled={installed || !remoteAvailable || isSavingMcp} onClick={() => startCatalogInstall(server)} type="button">
                          {installed ? <><Check size={13} />已安装</> : remoteAvailable ? <><Plus size={13} />安装</> : "暂不支持"}
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>}

              {mcpView === "installed" && !isLoadingTools && filteredMcpServers.length === 0 && (
                <div className="theme-soft rounded-[14px] border border-dashed px-5 py-10 text-center">
                  <Server className="theme-muted mx-auto" size={28} />
                  <p className="theme-heading mt-3 text-[13px] font-bold">{mcpQuery ? "没有找到匹配的 MCP Tool" : "还没有 MCP Server"}</p>
                  <p className="theme-muted mt-1 text-[11px] font-medium">{authUser ? "在左侧填写 Endpoint，连接第一个外部工具服务。" : "登录后可以连接 MCP Server。"}</p>
                </div>
              )}

              {mcpView === "discover" && !isLoadingMcpCatalog && mcpCatalog.length === 0 && !toolError && (
                <div className="theme-soft rounded-[14px] border border-dashed px-5 py-10 text-center">
                  <Compass className="theme-muted mx-auto" size={28} />
                  <p className="theme-heading mt-3 text-[13px] font-bold">没有找到匹配的 MCP Server</p>
                  <p className="theme-muted mt-1 text-[11px] font-medium">换一个关键词试试。</p>
                </div>
              )}

              {mcpView === "installed" && <button
                className="theme-button sticky bottom-0 flex h-11 w-full items-center justify-center gap-2 rounded-[11px] border text-[13px] font-bold shadow-[0_14px_30px_rgba(67,78,119,0.12)] transition disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSavingTools || isSavingMcp || !agent}
                onClick={saveAgentTools}
                type="button"
              >
                {isSavingTools ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                保存 Agent MCP Tools
              </button>}
            </div>
          </div>
          {mcpInstallTarget && selectedCatalogRemote && (
            <div className="theme-overlay fixed inset-0 z-[130] flex items-center justify-center px-4 backdrop-blur-sm">
              <section className="theme-card max-h-[82vh] w-full max-w-[560px] overflow-y-auto rounded-[20px] border p-6 shadow-[0_30px_90px_rgba(25,35,70,0.32)]">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="theme-primary text-[11px] font-bold uppercase tracking-[0.14em]">Install from Registry</p><h3 className="theme-heading mt-2 text-[20px] font-bold">{mcpInstallTarget.title}</h3><p className="theme-muted mt-1 font-mono text-[10px]">{selectedCatalogRemote.url}</p></div>
                  <button className="theme-button flex size-9 shrink-0 items-center justify-center rounded-[10px] border" onClick={() => setMcpInstallTarget(null)} type="button"><CircleX size={18} /></button>
                </div>
                {mcpInstallTarget.remotes.filter((remote) => remote.type === "streamable-http").length > 1 && <div className="mt-5"><label className="theme-muted text-[11px] font-bold">Endpoint</label><select className="theme-input mt-2 h-10 w-full rounded-[10px] border px-3 font-mono text-[11px]" onChange={(event) => setMcpInstallRemoteIndex(Number(event.target.value))} value={mcpInstallRemoteIndex}>{mcpInstallTarget.remotes.map((remote, index) => remote.type === "streamable-http" && <option key={remote.url} value={index}>{remote.url}</option>)}</select></div>}
                <div className="mt-5 space-y-4">
                  {selectedCatalogRemote.variables.map((field) => <label className="block" key={`variable:${field.name}`}><span className="theme-heading text-[11px] font-bold">{field.name}{field.required && <span className="text-[#b4233a]"> *</span>}</span>{field.description && <span className="theme-muted ml-2 text-[10px]">{field.description}</span>}<input className="theme-input mt-2 h-10 w-full rounded-[10px] border px-3 text-[12px] outline-none" onChange={(event) => setMcpInstallValues((values) => ({ ...values, [`variable:${field.name}`]: event.target.value }))} placeholder={field.defaultValue} type={field.secret ? "password" : "text"} value={mcpInstallValues[`variable:${field.name}`] || ""} /></label>)}
                  {selectedCatalogRemote.headers.flatMap((header) =>
                    (header.placeholders.length ? header.placeholders : [header.name]).map((key) => (
                      <label className="block" key={`header:${header.name}:${key}`}>
                        <span className="theme-heading text-[11px] font-bold">
                          {key}{header.required && <span className="text-[#b4233a]"> *</span>}
                        </span>
                        <span className="theme-muted ml-2 text-[10px]">{header.description || `${header.name} 请求头`}</span>
                        <input
                          autoComplete="off"
                          className="theme-input mt-2 h-10 w-full rounded-[10px] border px-3 font-mono text-[11px] outline-none"
                          onChange={(event) => setMcpInstallValues((values) => ({ ...values, [`header:${header.name}:${key}`]: event.target.value }))}
                          placeholder={header.secret ? "输入密钥" : header.valueTemplate}
                          type={header.secret ? "password" : "text"}
                          value={mcpInstallValues[`header:${header.name}:${key}`] || ""}
                        />
                      </label>
                    )),
                  )}
                  {selectedCatalogRemote.variables.length === 0 && selectedCatalogRemote.headers.length === 0 && <p className="theme-soft rounded-[12px] border px-4 py-3 text-[11px] font-medium">这个 Server 不需要额外配置，可以直接连接。</p>}
                </div>
                <div className="mt-6 flex gap-3"><button className="theme-button h-10 flex-1 rounded-[10px] border text-[12px] font-bold" onClick={() => setMcpInstallTarget(null)} type="button">取消</button><button className="theme-primary-bg flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] text-[12px] font-bold text-white disabled:opacity-50" disabled={!catalogInstallReady || isSavingMcp} onClick={installCatalogMcp} type="button">{isSavingMcp ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}连接并安装</button></div>
              </section>
            </div>
          )}
          </>
          )}
        </section>
      </div>
    )}
    {dialogSection === "Skills" && (
      <div className="capability-page capability-page--skills fixed inset-y-3 left-[calc(.75rem+var(--left-workspace-panel)+12px)] right-3 z-[60] overflow-hidden rounded-[24px] border lg:inset-y-4 lg:left-[calc(1rem+var(--left-workspace-panel)+12px)] lg:right-4">
        <section className="mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-6 lg:px-10 lg:py-8">
            {skillPanelTab === "create" && <div aria-labelledby="skill-create-tab" className="mx-auto max-w-[760px] space-y-5" id="skill-create-panel" role="tabpanel">
              <div className="flex items-center gap-3 border-b border-[var(--app-border)] pb-4">
                <button
                  className="theme-button flex size-9 shrink-0 items-center justify-center rounded-[10px] border"
                  onClick={() => setSkillPanelTab("library")}
                  title="返回我的 Skills"
                  type="button"
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h3 className="theme-heading text-[17px] font-bold">添加 Skill</h3>
                  <p className="theme-muted mt-0.5 text-[11px] leading-5">选择一种适合的添加方式</p>
                </div>
              </div>

              <section className="theme-soft rounded-[16px] border p-4 sm:p-5">
                <div className="mb-4 flex items-start gap-3">
                  <span className="theme-primary-soft flex size-9 shrink-0 items-center justify-center rounded-[10px]"><Search size={17} /></span>
                  <div>
                    <p className="theme-primary text-[10px] font-bold uppercase tracking-[0.1em]">方案一 · 在线获取</p>
                    <h3 className="theme-heading mt-1 text-[14px] font-bold">从 SkillHub 导入</h3>
                    <p className="theme-muted mt-1 text-[12px] leading-5">搜索官方或你配置的自建 SkillHub，选中后下载完整 Skill 包并进行本地校验。</p>
                  </div>
                </div>
                <div className="flex gap-2">
                <input
                  className="theme-input h-10 min-w-0 flex-1 rounded-[10px] border px-3 text-[12px] font-semibold outline-none"
                  onChange={(event) => setSkillHubQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") searchSkillHub(); }}
                  placeholder="例如：pdf、github"
                  value={skillHubQuery}
                />
                <button className="theme-button flex size-10 shrink-0 items-center justify-center rounded-[10px] border" disabled={isSearchingSkillHub || !authUser} onClick={searchSkillHub} title="搜索 SkillHub" type="button">
                  {isSearchingSkillHub ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                </button>
              </div>
                {skillHubResults.length > 0 && <div className="mt-3 space-y-2">{skillHubResults.map((result) => (
                <div className="group relative rounded-[10px] border border-[var(--app-border)] bg-[var(--app-surface-strong)] p-2.5 transition hover:border-[var(--app-primary)] hover:shadow-sm focus-within:border-[var(--app-primary)]" key={result.slug} tabIndex={0}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {result.sourceUrl ? <a className="theme-heading flex w-fit max-w-full items-center gap-1 truncate text-[12px] font-bold hover:underline" href={result.sourceUrl} rel="noreferrer" target="_blank" title="打开 GitHub 源码"><span className="truncate">{result.name}</span><ExternalLink className="shrink-0" size={12} /></a> : <p className="theme-heading truncate text-[12px] font-bold">{result.name}</p>}
                      <p className="theme-muted mt-1 line-clamp-2 text-[10px] leading-4">{result.description || result.slug}</p>
                      <div className="theme-muted mt-2 flex flex-wrap gap-x-2 text-[10px] font-semibold">{typeof result.downloads === "number" && <span>下载 {result.downloads.toLocaleString()}</span>}{typeof result.stars === "number" && <span>收藏 {result.stars.toLocaleString()}</span>}{typeof result.rating === "number" && <span>评分 {result.rating.toFixed(1)}</span>}{typeof result.downloads !== "number" && typeof result.stars !== "number" && <span>暂无公开热度</span>}{typeof result.score === "number" && <span>匹配 {Math.round(result.score * 100)}%</span>}</div>
                    </div>
                    <button
                      aria-label={skillHubDownload?.slug === result.slug ? `正在下载 ${result.name}，${skillHubDownload.progress}%` : `一键添加 ${result.name}`}
                      className={`theme-primary-bg relative min-w-[94px] shrink-0 overflow-hidden rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm disabled:cursor-not-allowed ${isSavingSkills && skillHubDownload?.slug !== result.slug ? "opacity-50" : ""}`}
                      disabled={isSavingSkills}
                      onClick={() => importFromSkillHub(result.slug, result.version)}
                      type="button"
                    >
                      {skillHubDownload?.slug === result.slug && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-200 ease-out"
                          style={{ width: `${skillHubDownload.progress}%` }}
                        />
                      )}
                      <span className="relative z-10 tabular-nums">
                        {skillHubDownload?.slug === result.slug ? `下载中 ${skillHubDownload.progress}%` : "一键添加"}
                      </span>
                    </button>
                  </div>
                  <div className="pointer-events-none absolute bottom-[calc(100%+9px)] left-4 z-30 w-max max-w-[min(32rem,calc(100vw-4rem))] translate-y-1 rounded-[11px] border border-[var(--app-primary)] bg-[var(--app-surface-strong)] px-3.5 py-3 text-[11px] leading-5 opacity-0 shadow-[0_14px_36px_rgba(25,35,70,0.2)] transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100" role="tooltip">
                    <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--app-primary-strong)]"><Sparkles size={12} />{result.name}</span>
                    <span className="theme-muted-strong block whitespace-normal">{result.description || "该 Skill 未提供详细介绍。"}</span>
                    <span className="absolute -bottom-[5px] left-6 size-2.5 rotate-45 border-b border-r border-[var(--app-primary)] bg-[var(--app-surface-strong)]" />
                  </div>
                </div>
                ))}</div>}
              </section>

              <section className="theme-soft rounded-[16px] border p-4 sm:p-5">
                <div className="mb-4 flex items-start gap-3">
                  <span className="theme-primary-soft flex size-9 shrink-0 items-center justify-center rounded-[10px]"><Box size={17} /></span>
                  <div>
                    <p className="theme-primary text-[10px] font-bold uppercase tracking-[0.1em]">方案二 · 本地导入</p>
                    <h3 className="theme-heading mt-1 text-[14px] font-bold">导入 Skill 目录</h3>
                    <p className="theme-muted mt-1 text-[12px] leading-5">选择包含 <code>SKILL.md</code> 的本地文件夹。会完整保留 scripts、references、assets 等文件，最多 200 个文件 / 30 MB。</p>
                  </div>
                </div>
                <input
                className="hidden"
                multiple
                onChange={(event) => importSkillDirectory(event.target.files)}
                ref={skillDirectoryInputRef}
                type="file"
              />
                <button
                className="theme-primary-bg flex h-10 w-full items-center justify-center gap-2 rounded-[10px] text-[13px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-55"
                disabled={isSavingSkills || !authUser}
                onClick={() => {
                  const input = skillDirectoryInputRef.current;
                  if (!input) return;
                  input.setAttribute("webkitdirectory", "");
                  input.setAttribute("directory", "");
                  input.click();
                }}
                type="button"
              >
                {isSavingSkills ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                选择本地 Skill 目录
                </button>
              </section>

              <section className="theme-soft rounded-[16px] border p-4 sm:p-5">
                <div className="mb-4 flex items-start gap-3">
                  <span className="theme-primary-soft flex size-9 shrink-0 items-center justify-center rounded-[10px]"><PenLine size={17} /></span>
                  <div>
                    <p className="theme-primary text-[10px] font-bold uppercase tracking-[0.1em]">方案三 · 从零创建</p>
                    <h3 className="theme-heading mt-1 text-[14px] font-bold">快速创建</h3>
                    <p className="theme-muted mt-1 text-[12px] leading-5">直接创建一个轻量的 SKILL.md；需要脚本或资源文件时，请使用目录导入。</p>
                  </div>
                </div>
                <div className="space-y-3">
                <input
                className="theme-input h-10 w-full rounded-[10px] border px-3 text-[12px] font-semibold outline-none placeholder:text-[var(--app-muted)]"
                onChange={(event) => setSkillDraft((draft) => ({ ...draft, name: event.target.value }))}
                placeholder="skill-name"
                value={skillDraft.name}
              />
              <textarea
                className="theme-input min-h-16 w-full resize-none rounded-[10px] border px-3 py-2 text-[12px] font-semibold leading-5 outline-none placeholder:text-[var(--app-muted)]"
                onChange={(event) => setSkillDraft((draft) => ({ ...draft, description: event.target.value }))}
                placeholder="一句话说明这个 skill 什么时候使用"
                value={skillDraft.description}
              />
              <textarea
                className="theme-input min-h-[260px] w-full resize-none rounded-[10px] border px-3 py-2 font-mono text-[11px] leading-5 outline-none"
                onChange={(event) => setSkillDraft((draft) => ({ ...draft, content: event.target.value }))}
                value={skillDraft.content}
              />
                <button
                className="theme-primary-bg flex h-10 w-full items-center justify-center gap-2 rounded-[10px] text-[13px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-55"
                disabled={isSavingSkills || !authUser}
                onClick={createSkill}
                type="button"
              >
                {isSavingSkills ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                新增 Skill
                </button>
                </div>
              </section>
              {(skillError || skillSuccess) && (
                <p className={`rounded-[12px] border px-3 py-2 text-[12px] font-semibold leading-5 ${skillError ? "border-[#ffd8df] bg-[#fff1f3] text-[#b4233a]" : "border-[#c9f0dc] bg-[#eefbf4] text-[#217a4a]"}`}>
                  {skillError || skillSuccess}
                </p>
              )}
            </div>}

            {skillPanelTab === "library" && <div aria-labelledby="skill-library-title" className="mx-auto min-w-0 space-y-5" id="skill-library-panel" role="tabpanel">
              <div className="skill-library-header -mx-1 space-y-5 px-1 pb-2">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div className="min-w-0">
                    <div className="flex items-center gap-4">
                      <span className="capability-hero__icon"><BookOpen size={28} /></span>
                      <div>
                        <h3 className="capability-hero__title" id="skill-library-title">技能广场</h3>
                        <p className="capability-hero__copy">浏览、启用并管理可复用的 Agent 专业能力。</p>
                      </div>
                      {isLoadingSkills && <Loader2 size={16} className="theme-muted-strong ml-1 animate-spin" />}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 text-[11px] font-bold">
                    <span className="theme-soft inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5"><BookOpen size={13} />全部 {skills.length}</span>
                    <span className="theme-primary-soft inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">已启用 {enabledSkillIds.length}</span>
                  </div>
                </div>
                <div className="capability-toolbar flex items-center gap-2 rounded-[18px] border p-3">
                  <label className="capability-search flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[12px] border px-3 transition">
                    <Search size={16} className="shrink-0" />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:opacity-75"
                      onChange={(event) => setSkillQuery(event.target.value)}
                      placeholder="搜索技能名称、用途或来源"
                      value={skillQuery}
                    />
                  </label>
                  <button
                    className="theme-primary-bg flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] px-4 text-[12px] font-bold transition sm:min-w-[112px]"
                    id="skill-create-tab"
                    onClick={() => setSkillPanelTab("create")}
                    type="button"
                  >
                    <Plus size={16} />
                    <span className="hidden sm:inline">添加技能</span>
                  </button>
                </div>
              </div>

              {(skillError || skillSuccess) && (
                <p
                  className={`rounded-[12px] border px-3 py-2 text-[12px] font-semibold leading-5 ${
                    skillError
                      ? "border-[#ffd8df] bg-[#fff1f3] text-[#b4233a]"
                      : "border-[#c9f0dc] bg-[#eefbf4] text-[#217a4a]"
                  }`}
                >
                  {skillError || skillSuccess}
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredSkills.map((skill) => {
                  const enabled = enabledSkillIds.includes(skill.id);
                  const isCustom = skill.source === "custom";

                  return (
                    <article className={`skill-plaza-card group flex min-h-[218px] flex-col rounded-[16px] border p-4 transition ${enabled ? "border-[var(--app-primary)] bg-[var(--app-surface-strong)]" : "border-[var(--app-border)] bg-[var(--app-surface-strong)]"}`} key={skill.id}>
                      <div className="flex items-start justify-between gap-3">
                        <span className={`flex size-10 shrink-0 items-center justify-center rounded-[12px] ${enabled ? "theme-primary-soft text-[var(--app-primary-strong)]" : "theme-soft theme-muted-strong border"}`}>
                          {skill.kind === "builtin" ? <Sparkles size={18} /> : <BookOpen size={18} />}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="theme-soft rounded-full border px-2 py-1 text-[10px] font-bold uppercase">{isCustom ? "自定义" : skill.source}</span>
                          {isCustom && <button aria-label={`删除 ${skill.name}`} className="flex size-7 items-center justify-center rounded-[8px] text-[#b4233a] transition hover:bg-[#fff1f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4233a]/30 disabled:opacity-45" disabled={isSavingSkills} onClick={() => deleteSkill(skill.id)} title="删除 Skill" type="button"><Trash2 size={14} /></button>}
                        </div>
                      </div>
                      <div className="mt-4 min-w-0">
                        <h4 className="theme-heading truncate text-[14px] font-bold tracking-[-0.01em]">{skill.name}</h4>
                        <p className="theme-muted mt-1.5 line-clamp-3 min-h-[60px] text-[12px] font-medium leading-5">{skill.description || "尚未添加技能说明。"}</p>
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--app-border)] pt-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${enabled ? "text-[var(--app-primary-strong)]" : "theme-muted"}`}>
                          {enabled ? <Check size={14} strokeWidth={3} /> : <CircleDot size={14} />}
                          {enabled ? "已为 Agent 启用" : skill.disabledByDefault ? "默认未启用" : "未启用"}
                        </span>
                        <button aria-pressed={enabled} className={`flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${enabled ? "theme-primary-soft text-[var(--app-primary-strong)] hover:brightness-95" : "theme-button border"}`} disabled={isSavingSkills} onClick={() => toggleSkill(skill.id)} title={enabled ? "从 Agent 禁用（自动保存）" : "给 Agent 启用（自动保存）"} type="button">
                          {enabled ? <Check size={14} strokeWidth={3} /> : <Plus size={14} />}
                          {enabled ? "已启用" : "启用"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {!isLoadingSkills && filteredSkills.length === 0 && (
                <div className="theme-soft rounded-[16px] border border-dashed px-5 py-10 text-center text-[13px] font-medium leading-6">
                  <Compass className="theme-muted mx-auto mb-3" size={24} />
                  {authUser ? "没有找到匹配的技能，试试其他关键词或添加一个新 Skill。" : "登录后即可浏览和管理你的 Skills。"}
                </div>
              )}

            </div>}
          </div>
        </section>
      </div>
    )}
    {logoutConfirmOpen && (
      <LogoutConfirmDialog
        isLoggingOut={isLoggingOut}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={logout}
      />
    )}
    </>
  );
}

function LogoutConfirmDialog({
  isLoggingOut,
  onCancel,
  onConfirm,
}: {
  isLoggingOut: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isLoggingOut) onCancel();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isLoggingOut, onCancel]);

  return (
    <div
      className="theme-overlay fixed inset-0 z-[120] flex items-center justify-center px-5 py-8 backdrop-blur-[5px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isLoggingOut) onCancel();
      }}
    >
      <section
        aria-describedby="logout-confirm-description"
        aria-labelledby="logout-confirm-title"
        aria-modal="true"
        className="theme-panel w-full max-w-[420px] rounded-[22px] border p-6 shadow-[0_28px_80px_rgba(25,40,75,0.3)]"
        role="alertdialog"
      >
        <div className="logout-confirm-icon flex size-12 items-center justify-center rounded-[15px]">
          <LogOut size={22} strokeWidth={2} />
        </div>
        <h2 id="logout-confirm-title" className="theme-heading mt-5 text-[18px] font-bold">
          确认退出登录？
        </h2>
        <p id="logout-confirm-description" className="theme-muted mt-2 text-[13px] font-medium leading-6">
          退出后将无法继续同步当前账户的专家配置与会话记录，之后仍可重新登录。
        </p>
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            ref={cancelButtonRef}
            className="theme-button h-10 rounded-[11px] border px-5 text-[13px] font-semibold transition"
            disabled={isLoggingOut}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="logout-confirm-button flex h-10 min-w-[104px] items-center justify-center gap-2 rounded-[11px] px-5 text-[13px] font-semibold text-white transition disabled:cursor-wait disabled:opacity-70"
            disabled={isLoggingOut}
            onClick={onConfirm}
            type="button"
          >
            {isLoggingOut && <Loader2 className="animate-spin" size={15} />}
            {isLoggingOut ? "正在退出" : "确认退出"}
          </button>
        </div>
      </section>
    </div>
  );
}

function NewAgentDialog({
  onAgentCreated,
  onClose,
}: {
  onAgentCreated: (agent: AgentProfile) => void;
  onClose: () => void;
}) {
  return (
    <div className="theme-overlay fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 backdrop-blur-sm">
      <section
        aria-label="创建 Agent"
        aria-modal="true"
        className="theme-card relative max-h-[92vh] w-full max-w-[1240px] overflow-y-auto rounded-[22px] border shadow-[0_30px_90px_rgba(25,35,70,0.28)]"
        role="dialog"
      >
        <button
          aria-label="关闭创建 Agent"
          className="theme-button sticky right-5 top-5 z-20 ml-auto mr-5 mt-5 flex size-9 items-center justify-center rounded-[10px] border transition"
          onClick={onClose}
          title="关闭"
          type="button"
        >
          <CircleX size={19} />
        </button>
        <div className="-mt-14 pt-2">
          <NewAgentForm onCreated={(agent) => onAgentCreated(agent as AgentProfile)} />
        </div>
      </section>
    </div>
  );
}

function getInitials(value: string) {
  return value.trim().slice(0, 1).toUpperCase() || "U";
}

async function loadAgents(): Promise<{
  siinXAgent: AgentProfile | null;
  expertAgents: AgentProfile[];
  success: boolean;
}> {
  try {
    const response = await fetch("/api/agents", { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || "读取 Agents 失败。");
    }
    const agents: AgentProfile[] = Array.isArray(data?.agents) ? data.agents : [];
    const siinXAgent = agents.find((item) => item.id === data?.siinXAgentId)
      ?? agents.find((item) => item.agent_type === "siinx" && item.is_default)
      ?? null;
    const expertAgents = agents.filter((item) =>
      item.agent_type === "expert"
      && item.id.toLowerCase() !== "eido_agent"
      && item.name.toLowerCase() !== "eido_agent"
    );
    return { siinXAgent, expertAgents, success: true };
  } catch {
    return { siinXAgent: null, expertAgents: [], success: false };
  }
}

function currentTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function readImageAsDataUrl(file: File): Promise<string> {
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function formatMessageTime(value: string | undefined) {
  if (!value) {
    return currentTime();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return currentTime();
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatConversationTime(value: string) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function defaultToolParametersSchema() {
  return {
    type: "object",
    properties: {
      input: {
        type: "string",
        description: "Input text for this tool.",
      },
    },
    required: ["input"],
    additionalProperties: false,
  };
}

function createMessageId(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function ResizeDivider({
  disabled,
  label,
  onPointerDown,
}: {
  disabled?: boolean;
  label: string;
  onPointerDown: (clientX: number) => void;
}) {
  return (
    <div
      aria-label={label}
      className={`group relative flex h-full cursor-col-resize items-center justify-center rounded-[12px] outline-none transition ${
        disabled ? "cursor-default opacity-35" : "hover:bg-[var(--app-surface)] focus-visible:bg-[var(--app-surface)]"
      }`}
      onPointerDown={(event) => {
        if (disabled) {
          return;
        }
        onPointerDown(event.clientX);
      }}
      role="separator"
      title={label}
    >
      <span className="flex h-full w-px items-center justify-center bg-transparent transition">
        <GripVertical
          className="rounded-full bg-[var(--app-bg)] text-[var(--app-muted)] opacity-0 transition group-hover:opacity-100 group-hover:text-[var(--app-primary)]"
          size={14}
        />
      </span>
    </div>
  );
}

function CollapsedRail({
  icon,
  label,
  onExpand,
}: {
  icon: "left" | "right";
  label: string;
  onExpand: () => void;
}) {
  const Icon = icon === "left" ? PanelRightOpen : PanelLeftOpen;
  const Mark = icon === "left" ? Sparkles : MessageSquare;

  const edgeClass = icon === "left" ? "left-0 translate-x-[-calc(100%-12px)] group-hover:translate-x-0 group-focus-within:translate-x-0" : "right-0 translate-x-[calc(100%-12px)] group-hover:translate-x-0 group-focus-within:translate-x-0";

  return (
    <aside className="group relative min-h-0" aria-label={label}>
      <button
        aria-label={label}
        className={`theme-panel absolute top-1/2 z-30 flex h-14 w-11 -translate-y-1/2 items-center justify-center rounded-[14px] border shadow-[var(--app-shadow-soft)] transition-transform duration-200 ${edgeClass}`}
        onClick={onExpand}
        title={label}
        type="button"
      >
        <span className="sr-only">{label}</span>
        <Icon className="theme-primary" size={20} />
        <Mark className="absolute bottom-1.5 theme-muted opacity-50" size={11} />
      </button>
    </aside>
  );
}

function splitTags(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function accessProjectFile(projectId: string, payload: unknown) {
  if (!isPlainObject(payload)) throw new Error("项目没有提供有效的文件请求");
  const action = typeof payload.action === "string" ? payload.action : "save";
  if (action === "read" || action === "remove") {
    if (typeof payload.fileName !== "string" || !payload.fileName.trim()) throw new Error("项目没有提供有效的文件名");
    const query = new URLSearchParams({ projectId, fileName: payload.fileName });
    const response = await fetch(`/api/project-runtime/files?${query}`, { method: action === "read" ? "GET" : "DELETE" });
    if (action === "remove") {
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "项目文件移除失败");
      return data;
    }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || "项目文件读取失败");
    }
    return {
      data: await response.arrayBuffer(),
      fileName: payload.fileName,
      mimeType: response.headers.get("content-type") || "application/octet-stream",
    };
  }
  if (!(payload.data instanceof ArrayBuffer)) throw new Error("项目没有提供有效的文件数据");
  const fileName = typeof payload.fileName === "string" ? payload.fileName : "project-file";
  const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "application/octet-stream";
  const form = new FormData();
  form.append("projectId", projectId);
  form.append("file", new Blob([payload.data], { type: mimeType }), fileName);
  const response = await fetch("/api/project-runtime/files", { method: "POST", body: form });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "项目文件保存失败");
  return data;
}

async function runProjectAgent(project: WorkspaceProject, payload: unknown) {
  if (!isPlainObject(payload) || typeof payload.message !== "string" || !payload.message.trim()) {
    throw new Error("项目没有提供有效的 Agent 指令");
  }
  const suppliedContext = isPlainObject(payload.context) ? payload.context : {};
  const response = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: payload.message.slice(0, 20_000),
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : undefined,
      projectContext: {
        projectId: project.id,
        projectName: project.name,
        kind: typeof suppliedContext.kind === "string" ? suppliedContext.kind : "general",
        title: typeof suppliedContext.title === "string" ? suppliedContext.title : "",
        filePath: typeof suppliedContext.filePath === "string" ? suppliedContext.filePath : "",
        content: typeof suppliedContext.content === "string" ? suppliedContext.content : "",
        metadata: isPlainObject(suppliedContext.metadata) ? suppliedContext.metadata : {},
      },
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Agent 调用失败");
  return {
    sessionId: typeof data?.session_id === "string" ? data.session_id : "",
    content: typeof data?.message?.content === "string" ? data.message.content : "",
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function accessProjectStorage(projectId: string, payload: unknown) {
  if (!isPlainObject(payload) || typeof payload.action !== "string" || typeof payload.key !== "string") {
    throw new Error("项目存储请求无效");
  }
  const diskBackedProject = projectId === "focus-board" || projectId === "note-down";
  if (!diskBackedProject) {
    const key = payload.key.slice(0, 200);
    const storageKey = `eido:project-storage:${projectId}`;
    const stored = window.localStorage.getItem(storageKey);
    const values = stored ? JSON.parse(stored) as Record<string, unknown> : {};
    if (payload.action === "get") return { value: values[key] ?? null };
    if (payload.action === "remove") delete values[key];
    else if (payload.action === "set") values[key] = payload.value;
    else throw new Error(`不支持的存储操作：${payload.action}`);
    const serialized = JSON.stringify(values);
    if (serialized.length > 1_000_000) throw new Error("项目存储不能超过 1 MB");
    window.localStorage.setItem(storageKey, serialized);
    return { value: values[key] ?? null };
  }
  const legacyStorageKey = `eido:project-storage:${projectId}`;
  let legacyValues: Record<string, unknown> = {};
  try {
    const legacyStored = window.localStorage.getItem(legacyStorageKey);
    legacyValues = legacyStored ? JSON.parse(legacyStored) as Record<string, unknown> : {};
  } catch {}
  const response = await fetch("/api/project-runtime/storage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, action: payload.action, key: payload.key, value: payload.value }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "项目磁盘存储失败");
  if (payload.action === "get") {
    const diskValue = data?.value;
    const legacyValue = legacyValues[payload.key];
    if (preferRecoveryCandidate(diskValue, legacyValue)) {
      return { ...data, value: legacyValue, recoveredFromLegacyStorage: true };
    }
  }
  const legacyKey = projectId === "note-down" ? "note-down-workspace-v1" : payload.key;
  if (payload.action === "set" && Object.prototype.hasOwnProperty.call(legacyValues, legacyKey)) {
    delete legacyValues[legacyKey];
    if (Object.keys(legacyValues).length) window.localStorage.setItem(legacyStorageKey, JSON.stringify(legacyValues));
    else window.localStorage.removeItem(legacyStorageKey);
  }
  return data;
}

function preferRecoveryCandidate(current: unknown, candidate: unknown) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  if (!current || typeof current !== "object" || Array.isArray(current)) return true;
  const currentRecord = current as Record<string, unknown>;
  const candidateRecord = candidate as Record<string, unknown>;
  const currentTime = Date.parse(typeof currentRecord.updatedAt === "string" ? currentRecord.updatedAt : "") || 0;
  const candidateTime = Date.parse(typeof candidateRecord.updatedAt === "string" ? candidateRecord.updatedAt : "") || 0;
  if (candidateTime > currentTime) return true;
  return countStoredTasks(currentRecord) === 0 && countStoredTasks(candidateRecord) > 0;
}

function countStoredTasks(value: Record<string, unknown>): number {
  if (!value.days || typeof value.days !== "object" || Array.isArray(value.days)) return 0;
  return Object.values(value.days as Record<string, unknown>).reduce<number>((total, day) => {
    if (!day || typeof day !== "object" || Array.isArray(day)) return total;
    const tasks = (day as Record<string, unknown>).tasks;
    return total + (Array.isArray(tasks) ? tasks.length : 0);
  }, 0);
}

function WorkspacePanel({ directProjectId, excludedProjectIds = noExcludedProjectIds, onProjectContextChange }: {
  directProjectId?: string;
  excludedProjectIds?: string[];
  onProjectContextChange: (context: ActiveProjectContext | null) => void;
}) {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<WorkspaceProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const projectFrameRef = useRef<HTMLIFrameElement>(null);

  const sendProjectTheme = useCallback(() => {
    const theme = document.documentElement.dataset.theme || "light";
    projectFrameRef.current?.contentWindow?.postMessage({ type: "eido:theme", theme }, "*");
  }, []);

  useEffect(() => {
    const syncTheme = () => sendProjectTheme();
    window.addEventListener("eido-theme-change", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("eido-theme-change", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, [sendProjectTheme]);

  useEffect(() => () => onProjectContextChange(null), [onProjectContextChange]);

  useEffect(() => {
    if (!selectedProject) {
      onProjectContextChange(null);
      return;
    }
    onProjectContextChange({
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      kind: "project",
      title: selectedProject.name,
      filePath: "",
      content: selectedProject.description,
      metadata: { version: selectedProject.version, tags: selectedProject.tags },
    });
  }, [onProjectContextChange, selectedProject]);

  useEffect(() => {
    let active = true;
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "读取项目失败。");
        if (!active) return;
        const loadedProjects = Array.isArray(data?.projects) ? data.projects as WorkspaceProject[] : [];
        if (directProjectId) {
          const directProject = loadedProjects.find((project) => project.id === directProjectId);
          if (!directProject) throw new Error("该功能暂不可用。");
          setProjects([directProject]);
          setSelectedProject(directProject);
          return;
        }
        setProjects(loadedProjects.filter((project) => !excludedProjectIds.includes(project.id)));
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "读取项目失败。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [directProjectId, excludedProjectIds]);

  useEffect(() => {
    const receiveProjectRequest = async (event: MessageEvent) => {
      const frameWindow = projectFrameRef.current?.contentWindow;
      if (!selectedProject || !frameWindow || event.source !== frameWindow) return;
      if (event.data?.type === "eido:project-context") {
        const supplied = isPlainObject(event.data.context) ? event.data.context : {};
        onProjectContextChange({
          projectId: selectedProject.id,
          projectName: selectedProject.name,
          kind: typeof supplied.kind === "string" ? supplied.kind.slice(0, 100) : "project",
          title: typeof supplied.title === "string" ? supplied.title.slice(0, 255) : selectedProject.name,
          filePath: typeof supplied.filePath === "string" ? supplied.filePath.slice(0, 1000) : "",
          content: typeof supplied.content === "string" ? supplied.content.slice(0, 120_000) : "",
          metadata: isPlainObject(supplied.metadata) ? supplied.metadata : {},
        });
        return;
      }
      if (event.data?.type !== "eido:project-request") return;
      const requestId = typeof event.data.requestId === "string" ? event.data.requestId : "";
      const capability = typeof event.data.capability === "string" ? event.data.capability : "";
      if (!requestId) return;
      try {
        if (!selectedProject.permissions.includes(capability)) throw new Error(`项目未声明 ${capability} 权限`);
        const result = capability === "project.files"
          ? await accessProjectFile(selectedProject.id, event.data.payload)
          : capability === "agent.chat"
            ? await runProjectAgent(selectedProject, event.data.payload)
            : capability === "project.storage"
              ? await accessProjectStorage(selectedProject.id, event.data.payload)
            : (() => { throw new Error(`不支持的项目能力：${capability}`); })();
        const transfer = isPlainObject(result) && result.data instanceof ArrayBuffer ? [result.data] : [];
        frameWindow.postMessage({ type: "eido:project-response", requestId, ok: true, result }, "*", transfer);
      } catch (reason) {
        frameWindow.postMessage({
          type: "eido:project-response",
          requestId,
          ok: false,
          error: reason instanceof Error ? reason.message : "项目能力调用失败",
        }, "*");
      }
    };
    window.addEventListener("message", receiveProjectRequest);
    return () => window.removeEventListener("message", receiveProjectRequest);
  }, [onProjectContextChange, selectedProject]);

  if (selectedProject) {
    const entryUrl = selectedProject.entry.split("/").map(encodeURIComponent).join("/");
    return (
      <section className="theme-orbit relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[24px] border">
        <div className="theme-panel flex h-[52px] shrink-0 items-center gap-3 border-x-0 border-t-0 px-4">
          {!directProjectId && (
            <>
              <button
                aria-label="返回工作平台"
                className="theme-muted flex size-8 items-center justify-center rounded-lg transition hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-heading)]"
                onClick={() => setSelectedProject(null)}
                title="返回工作平台"
                type="button"
              >
                <ArrowLeft size={17} />
              </button>
              <span className="h-4 w-px bg-[var(--app-border)]" />
            </>
          )}
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
            style={{ background: `${selectedProject.accent || "#6c63ff"}18`, color: selectedProject.accent || "#6c63ff" }}
          >
            {selectedProject.icon || "◆"}
          </span>
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="theme-heading truncate text-sm font-semibold">{selectedProject.name}</h2>
            <span className="theme-muted shrink-0 text-[11px]">v{selectedProject.version}</span>
          </div>
        </div>
        <iframe
          ref={projectFrameRef}
          allowFullScreen
          className="min-h-0 w-full flex-1 border-0 bg-[var(--app-surface-strong)]"
          sandbox="allow-scripts allow-forms allow-downloads allow-modals"
          src={`/api/projects/${encodeURIComponent(selectedProject.id)}/files/${entryUrl}`}
          title={selectedProject.name}
          onLoad={() => {
            sendProjectTheme();
            projectFrameRef.current?.contentWindow?.postMessage({ type: "eido:project-context-request" }, "*");
          }}
        />
      </section>
    );
  }

  return (
    <section className="theme-orbit relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[24px] border">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-16">
          {loading && <div className="theme-muted flex h-40 items-center justify-center gap-2 text-sm"><Loader2 className="animate-spin" size={18} />正在读取项目</div>}
          {error && <div className="rounded-[16px] border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
          {!loading && !error && projects.length === 0 && <div className="theme-muted flex h-48 flex-col items-center justify-center rounded-[18px] border border-dashed"><FolderKanban className="mb-3 opacity-50" size={30} /><span className="text-sm font-semibold">还没有可用项目</span><span className="mt-1 text-xs">将符合规范的项目放入 projects 目录即可</span></div>}
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {projects.map((project) => (
              <button key={project.id} className="theme-panel group flex min-h-[150px] flex-col rounded-[18px] border p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--app-primary)] hover:shadow-lg" onClick={() => setSelectedProject(project)} type="button">
                <div className="flex w-full items-start gap-3"><span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] text-[24px]" style={{ background: `${project.accent || "#6c63ff"}18`, color: project.accent || "#6c63ff" }}>{project.icon || "◆"}</span><div className="min-w-0 flex-1"><h2 className="theme-heading truncate text-[16px] font-bold">{project.name}</h2><span className="theme-muted text-[11px]">v{project.version}</span></div><ExternalLink className="theme-muted opacity-0 transition group-hover:opacity-100" size={17} /></div>
                <p className="theme-muted mt-3 line-clamp-2 text-[12px] leading-5">{project.description}</p>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">{project.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-[var(--app-surface-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--app-muted)]">{tag}</span>)}</div>
              </button>
            ))}
          </div>
        </div>
    </section>
  );
}

function WorkAgentOrbit({ agents, onAgentSelect, onAgentUpdated, onNewAgent, selectedAgentIds }: {
  agents: AgentProfile[];
  onAgentSelect: (agent: AgentProfile) => void;
  onAgentUpdated: (agent: AgentProfile) => void;
  onNewAgent: () => void;
  selectedAgentIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [equippingAgent, setEquippingAgent] = useState<AgentProfile | null>(null);
  const [inspectedAgent, setInspectedAgent] = useState<AgentProfile | null>(null);
  const [cardAnchor, setCardAnchor] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const cardTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!cardAnchor) return;

    function closeCardOnOutsideClick(event: PointerEvent) {
      const target = event.target as Node;
      if (!cardRef.current?.contains(target) && !cardTriggerRef.current?.contains(target)) {
        setCardAnchor(null);
      }
    }

    document.addEventListener("pointerdown", closeCardOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeCardOnOutsideClick);
  }, [cardAnchor]);

  function selectAgent(agent: AgentProfile, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    cardTriggerRef.current = element;
    setCardAnchor({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    setInspectedAgent(agent);
  }

  const filteredAgents = agents.filter((agent) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return [agent.name, agent.bio, agent.capabilities, agent.public_facts?.occupation, agent.llm?.default_model, ...(agent.values ?? [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
  const mainAgentCount = agents.filter((agent) => agent.agent_type === "siinx").length;
  const specialistCount = agents.length - mainAgentCount;

  return (
    <section className="theme-orbit agent-workspace agent-workspace--directory relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[24px] border">
      <header className="agent-directory-header relative z-[2] flex shrink-0 items-center justify-between gap-6 px-9 pb-5 pt-8">
        <div className="flex min-w-0 items-center gap-5">
          <span className="agent-directory-orb flex size-[66px] shrink-0 items-center justify-center rounded-full" aria-hidden="true"><Sparkles size={29} strokeWidth={2.1} /></span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <h1 className="agent-directory-title text-[30px] font-black tracking-[-0.04em]">智能体</h1>
              <span className="agent-directory-count rounded-full px-2.5 py-1 text-[11px] font-bold">{mainAgentCount} 位主 Agent · {specialistCount} 位任务智能体</span>
            </div>
            <p className="mt-1.5 max-w-[560px] text-[13px] font-medium leading-6 text-[#52739d]">统一维护主 Agent 与任务智能体的身份、模型、Skills、Tools 和知识库权限。</p>
          </div>
        </div>
        <div className="w-full max-w-[340px] shrink-0">
          <label className="agent-directory-search flex h-11 items-center gap-3 rounded-[14px] border px-4">
            <Search className="shrink-0 text-[#1d5796]" size={18} strokeWidth={2} />
            <input aria-label="搜索智能体" className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[#183a64] outline-none placeholder:text-[#8198b7]" onChange={(event) => setQuery(event.target.value)} placeholder="搜索智能体或查看能力…" type="search" value={query} />
          </label>
          <p className="mt-2 text-right text-[9px] font-bold tracking-[0.34em] text-[#6792c1]">专业 · 高效 · 无限可能</p>
        </div>
      </header>

      <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto px-7 pb-8 pt-2">
        <div className="agent-directory-grid mx-auto grid w-full items-stretch gap-3">
            {filteredAgents.map((agent) => {
              const isMainAgent = agent.agent_type === "siinx";
              const agentIndex = Math.max(0, agents.findIndex((item) => item.id === agent.id));
              const config = orbitAgents[agentIndex % orbitAgents.length];
              const directoryTheme = agentDirectoryThemes[agentIndex % agentDirectoryThemes.length];
              return (
                <article key={agent.id} data-tone={directoryTheme.tone} className={`agent-tile agent-directory-card flex min-h-[210px] min-w-0 flex-col overflow-hidden rounded-[16px] border p-3 text-left transition ${selectedAgentIds.includes(agent.id) ? "is-selected" : ""}`}>
                  <button type="button" onClick={(event) => selectAgent(agent, event.currentTarget)} className="relative flex min-w-0 flex-1 flex-col text-left">
                    <div className="relative z-[2] flex w-full items-start">
                      <AgentStatusAvatar active={selectedAgentIds.includes(agent.id)} avatar={agent.avatar} initials={getInitials(agent.name)} size="small" />
                      <span className={`agent-directory-badge ml-2 mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold ${isMainAgent ? "is-main" : ""}`}>{isMainAgent ? "主 Agent" : "任务智能体"}</span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" aria-hidden="true" className="agent-directory-art pointer-events-none absolute -right-5 -top-5 h-[90px] w-[90px] object-contain opacity-60" src={directoryTheme.artwork} />
                    <div className="relative z-[2] mt-2 min-w-0">
                      <h3 className="agent-directory-name truncate text-[15px] font-black tracking-[-0.025em]" title={agent.name}>{agent.name}</h3>
                      <p className="agent-directory-role mt-0.5 truncate text-[11px] font-semibold">{agent.public_facts?.occupation || (isMainAgent ? "默认主控智能体" : config.label)}</p>
                    </div>
                    <p className="agent-directory-bio relative z-[2] mt-2 line-clamp-2 min-h-[32px] border-t pt-2 text-[11px] font-medium leading-4">{agent.bio || agent.capabilities || (isMainAgent ? "负责与你直接协作，并在需要时调度任务智能体。" : "专注处理特定场景的任务。")}</p>
                    <div className="relative z-[2] mt-auto flex w-full items-center gap-1.5 pt-2">
                      <span className="agent-directory-meta shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold">S {agent.enabled_skill_ids?.length ?? 0}</span>
                      <span className="agent-directory-meta shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold">T {agent.enabled_tool_ids?.length ?? 0}</span>
                      <span className="agent-directory-meta min-w-0 flex-1 truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold" title={agent.llm?.default_model || "待配置模型"}>{agent.llm?.default_model || "待配置模型"}</span>
                    </div>
                  </button>
                  <div className="relative z-[2] mt-2 flex items-center gap-1.5 border-t border-[#b8d7f0]/70 pt-2">
                    {isMainAgent
                      ? <span className="agent-main-status flex min-h-8 flex-1 items-center justify-center gap-1 rounded-[8px] border px-1 text-[11px] font-bold"><Sparkles size={13} />当前主控</span>
                      : <button type="button" onClick={() => onAgentSelect(agent)} className="agent-summon-button flex min-h-8 flex-1 items-center justify-center gap-1 rounded-[8px] border px-1 text-[11px] font-bold"><Sparkles size={13} />召唤</button>}
                    <button type="button" onClick={() => setEquippingAgent(agent)} className="agent-equip-button flex min-h-8 items-center justify-center gap-1 rounded-[8px] border px-2 text-[11px] font-bold"><PenLine size={13} />编辑</button>
                  </div>
                </article>
              );
            })}
            {filteredAgents.length === 0 && (
              <div className="agent-directory-empty col-span-full flex min-h-[220px] flex-col items-center justify-center rounded-[20px] border border-dashed text-center">
                <Search size={26} />
                <p className="mt-3 text-sm font-bold">没有找到匹配的智能体</p>
                <button className="mt-2 text-xs font-semibold text-[#226bc5]" onClick={() => setQuery("")} type="button">清除搜索条件</button>
              </div>
            )}
            <button
              aria-label="创建 Agent"
              className="agent-add-card flex min-h-[210px] flex-col items-center justify-center rounded-[16px] border border-dashed transition"
              onClick={onNewAgent}
              title="创建 Agent"
              type="button"
            >
              <span className="agent-add-orb flex size-11 items-center justify-center rounded-full border"><Plus size={22} strokeWidth={1.7} /></span>
              <span className="mt-2 text-[13px] font-black">添加智能体</span>
              <span className="mt-1 text-[10px] font-medium text-[#7893b4]">创建专属 AI 任务智能体</span>
            </button>
          </div>
      </div>

      {inspectedAgent && cardAnchor && (
        <WorkAgentCard cardRef={cardRef} agent={inspectedAgent} anchor={cardAnchor} onClose={() => setCardAnchor(null)} />
      )}

      {equippingAgent && <AgentEquipmentDialog agent={equippingAgent} onClose={() => setEquippingAgent(null)} onUpdated={(updated) => { onAgentUpdated(updated); setEquippingAgent(updated); }} />}
    </section>
  );
}

function AgentEquipmentDialog({ agent, onClose, onUpdated }: {
  agent: AgentProfile;
  onClose: () => void;
  onUpdated: (agent: AgentProfile) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [knowledgeSpaces, setKnowledgeSpaces] = useState<KnowledgeSpace[]>([]);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
  const [toolIds, setToolIds] = useState<string[]>(agent.enabled_tool_ids || []);
  const [skillIds, setSkillIds] = useState<string[]>(agent.enabled_skill_ids || []);
  const [knowledgeSpaceIds, setKnowledgeSpaceIds] = useState<string[]>([]);
  const [draft, setDraft] = useState(() => agentToDraft(agent));
  const [selectedProviderConfigId, setSelectedProviderConfigId] = useState(agent.provider_config_id || "");
  const [selectedModel, setSelectedModel] = useState(agent.llm?.default_model || "");
  const [activeTab, setActiveTab] = useState<EquipmentTabId>("meta");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/tools", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/skills", { cache: "no-store" }).then((response) => response.json()),
      knowledgeClient.list(),
      fetch("/api/provider-configs", { cache: "no-store" }).then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "读取 Provider 配置失败。");
        return data;
      }),
    ]).then(([toolData, skillData, knowledgeData, providerData]) => {
      if (toolData.error || skillData.error) throw new Error(toolData.error || skillData.error);
      setTools((Array.isArray(toolData.tools) ? toolData.tools : [])
        .filter((tool: ToolDefinition) => tool.availableTo !== "siinx" || agent.agent_type === "siinx"));
      setSkills(Array.isArray(skillData.skills) ? skillData.skills : []);
      const spaces = Array.isArray(knowledgeData.spaces) ? knowledgeData.spaces : [];
      setKnowledgeSpaces(spaces);
      setKnowledgeSpaceIds(spaces.filter((space) => space.agentIds.includes(agent.id)).map((space) => space.id));
      const configs = Array.isArray(providerData?.providerConfigs) ? providerData.providerConfigs : [];
      setProviderConfigs(configs);
      const selectedConfig = configs.find((config: ProviderConfig) => config.id === agent.provider_config_id)
        || configs.find((config: ProviderConfig) => config.provider === agent.llm?.default_provider && getProviderConfigModels(config).includes(agent.llm?.default_model || ""))
        || configs[0];
      if (selectedConfig) {
        setSelectedProviderConfigId(selectedConfig.id);
        setSelectedModel((current) => getProviderConfigModels(selectedConfig).includes(current) ? current : selectedConfig.default_model);
      }
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "读取装备失败。"))
      .finally(() => setLoading(false));
  }, [agent.agent_type, agent.id]);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!dialogRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [onClose]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function toggle(id: string, values: string[], update: (ids: string[]) => void) {
    update(values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);
  }

  const selectedProviderConfig = providerConfigs.find((config) => config.id === selectedProviderConfigId);
  const availableModels = selectedProviderConfig ? getProviderConfigModels(selectedProviderConfig) : [];

  function selectProvider(config: ProviderConfig) {
    setSelectedProviderConfigId(config.id);
    setSelectedModel(getProviderConfigModels(config).includes(selectedModel) ? selectedModel : config.default_model);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const agentResponse = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agent.id,
          ...draft,
          values: splitTags(draft.values),
          boundaries: draft.boundaries,
          providerConfigId: selectedProviderConfigId || undefined,
          model: selectedModel || undefined,
        }),
      });
      const agentData = await agentResponse.json().catch(() => null);
      if (!agentResponse.ok) throw new Error(agentData?.error || "保存专家信息失败。");

      // Both endpoints persist the complete Agent record. Saving them concurrently
      // lets the later writer overwrite the other equipment list with stale data.
      const toolResponse = await fetch("/api/tools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, enabledToolIds: toolIds }),
      });
      const toolData = await toolResponse.json();
      if (!toolResponse.ok) throw new Error(toolData.error || "保存 Tools 失败。");

      const skillResponse = await fetch("/api/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, enabledSkillIds: skillIds }),
      });
      const skillData = await skillResponse.json();
      if (!skillResponse.ok) throw new Error(skillData.error || "保存 Skills 失败。");

      const changedKnowledgeSpaces = knowledgeSpaces.filter((space) => {
        const wasEnabled = space.agentIds.includes(agent.id);
        return wasEnabled !== knowledgeSpaceIds.includes(space.id);
      });
      for (const space of changedKnowledgeSpaces) {
        const enabled = knowledgeSpaceIds.includes(space.id);
        await knowledgeClient.updateSpace(space.id, {
          agentIds: enabled
            ? [...new Set([...space.agentIds, agent.id])]
            : space.agentIds.filter((id) => id !== agent.id),
        });
      }

      onUpdated({
        ...agent,
        ...agentData.agent,
        ...toolData.agent,
        ...skillData.agent,
        enabled_tool_ids: toolIds,
        enabled_skill_ids: skillIds,
        knowledge_space_ids: knowledgeSpaceIds,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存装备失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="agent-equipment-backdrop absolute inset-0 z-50 flex items-center justify-center p-5">
      <div aria-describedby="agent-equipment-description" aria-labelledby="agent-equipment-title" aria-modal="true" ref={dialogRef} className="agent-equipment-dialog theme-panel flex w-full max-w-[760px] flex-col" role="dialog">
        <div className="agent-equipment-dialog__header flex items-start justify-between gap-5">
          <div className="flex min-w-0 items-center gap-3"><AgentStatusAvatar active avatar={agent.avatar} initials={getInitials(agent.name)} size="medium" /><div className="min-w-0"><h3 className="theme-heading truncate text-[19px] font-extrabold tracking-[-0.025em]" id="agent-equipment-title">编辑 {agent.name}</h3><p className="theme-muted mt-1 text-[12px] leading-5" id="agent-equipment-description">在一个位置维护智能体身份、默认模型及其可调用能力。</p></div></div><button aria-label="关闭智能体编辑" type="button" onClick={onClose} className="agent-equipment-close theme-button"><CircleX size={18} /></button>
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] text-red-600">{error}</p>}
        <div className="agent-equipment-body mt-6 min-h-0 flex flex-1 gap-5">
          <nav aria-label="智能体编辑分类" className="agent-equipment-tabs" role="tablist">
            <EquipmentTab active={activeTab === "meta"} icon={<BadgeInfo size={16} />} id="meta" label="Meta" onSelect={setActiveTab} />
            <EquipmentTab active={activeTab === "model"} icon={<Cpu size={16} />} id="model" label="Model" onSelect={setActiveTab} />
            <EquipmentTab active={activeTab === "skills"} count={skillIds.length} icon={<BookOpen size={16} />} id="skills" label="Skills" onSelect={setActiveTab} />
            <EquipmentTab active={activeTab === "tools"} count={toolIds.length} icon={<Cuboid size={16} />} id="tools" label="Tools" onSelect={setActiveTab} />
            <EquipmentTab active={activeTab === "knowledge"} count={knowledgeSpaceIds.length} icon={<LibraryBig size={16} />} id="knowledge" label="知识库" onSelect={setActiveTab} />
          </nav>
          {loading ? <div className="flex flex-1 justify-center py-20"><Loader2 className="animate-spin" /></div> : <div aria-labelledby={`agent-equipment-tab-${activeTab}`} className="agent-equipment-content min-h-0 flex-1 overflow-y-auto pr-1" id="agent-equipment-panel" role="tabpanel">
            {activeTab === "meta" && <AgentMetaEditor draft={draft} onChange={setDraft} />}
            {activeTab === "model" && <AgentModelEditor availableModels={availableModels} configs={providerConfigs} selectedModel={selectedModel} selectedProviderConfigId={selectedProviderConfigId} onModelChange={setSelectedModel} onProviderSelect={selectProvider} />}
            {activeTab === "skills" && <EquipmentList description="为专家注入可复用的工作方法与操作规范。" emptyMessage="还没有可用的 Skill，可先到技能库创建或导入。" items={skills} selectedIds={skillIds} title="已装备的 Skills" onToggle={(id) => toggle(id, skillIds, setSkillIds)} />}
            {activeTab === "tools" && <EquipmentList description="仅启用这位专家真正需要的工具，减少不必要的执行权限。" emptyMessage="当前没有可供此专家使用的 Tool。" items={tools} selectedIds={toolIds} title="已装备的 Tools" onToggle={(id) => toggle(id, toolIds, setToolIds)} />}
            {activeTab === "knowledge" && <KnowledgeEquipmentList agentId={agent.id} items={knowledgeSpaces} selectedIds={knowledgeSpaceIds} onToggle={(id) => toggle(id, knowledgeSpaceIds, setKnowledgeSpaceIds)} />}
          </div>}
        </div>
        <div className="agent-equipment-dialog__footer mt-5 flex items-center justify-between gap-4"><p className="theme-muted hidden text-[11px] font-medium sm:block">已选择 {skillIds.length + toolIds.length + knowledgeSpaceIds.length} 项能力配置</p><div className="ml-auto flex gap-2"><button type="button" onClick={onClose} className="theme-button rounded-[10px] border px-4 py-2 text-sm">取消</button><button type="button" disabled={loading || saving} onClick={save} className="rounded-[10px] bg-[var(--app-primary)] px-4 py-2 text-sm font-semibold text-[var(--app-primary-contrast)] disabled:opacity-50">{saving ? "保存中…" : "保存修改"}</button></div></div>
      </div>
    </div>
  );
}

type EquipmentTabId = "meta" | "model" | "skills" | "tools" | "knowledge";

function EquipmentTab({ active, count, icon, id, label, onSelect }: { active: boolean; count?: number; icon: React.ReactNode; id: EquipmentTabId; label: string; onSelect: (id: EquipmentTabId) => void }) {
  return <button aria-controls="agent-equipment-panel" aria-selected={active} className="agent-equipment-tab" id={`agent-equipment-tab-${id}`} onClick={() => onSelect(id)} role="tab" type="button"><span>{icon}</span><span>{label}</span>{typeof count === "number" && <b>{count}</b>}</button>;
}

function AgentMetaEditor({ draft, onChange }: { draft: ReturnType<typeof agentToDraft>; onChange: (draft: ReturnType<typeof agentToDraft>) => void }) {
  return <section aria-labelledby="agent-meta-title"><div className="agent-equipment-section-heading"><div><h4 className="theme-heading text-[16px] font-extrabold" id="agent-meta-title">智能体资料</h4><p className="theme-muted mt-1 text-[11px] font-medium leading-5">这些信息会形成智能体的工作画像，并用于协作、任务分发与提示词构建。</p></div></div><div className="agent-meta-editor"><AgentEditInput label="智能体名称" value={draft.name} onChange={(name) => onChange({ ...draft, name })} /><AgentEditInput label="专长场景" value={draft.identity} multiline onChange={(identity) => onChange({ ...draft, identity })} /><AgentEditInput label="可处理任务" value={draft.capabilities} multiline onChange={(capabilities) => onChange({ ...draft, capabilities })} /><AgentEditInput label="表达风格" value={draft.speakingStyle} multiline onChange={(speakingStyle) => onChange({ ...draft, speakingStyle })} /><AgentEditInput label="标签（用逗号分隔）" value={draft.values} onChange={(values) => onChange({ ...draft, values })} /><div className="grid grid-cols-2 gap-3"><AgentEditInput label="角色 / 职位" value={draft.occupation} onChange={(occupation) => onChange({ ...draft, occupation })} /><AgentEditInput label="城市 / 时区" value={draft.city} onChange={(city) => onChange({ ...draft, city })} /></div></div></section>;
}

function AgentModelEditor({ availableModels, configs, selectedModel, selectedProviderConfigId, onModelChange, onProviderSelect }: { availableModels: string[]; configs: ProviderConfig[]; selectedModel: string; selectedProviderConfigId: string; onModelChange: (model: string) => void; onProviderSelect: (config: ProviderConfig) => void }) {
  return <section aria-labelledby="agent-model-title"><div className="agent-equipment-section-heading"><div><h4 className="theme-heading text-[16px] font-extrabold" id="agent-model-title">默认模型</h4><p className="theme-muted mt-1 text-[11px] font-medium leading-5">选择这位专家每次执行任务时默认调用的已配置模型。</p></div></div><div className="agent-model-editor"><div className="agent-model-editor__configs">{configs.map((config) => <button aria-pressed={config.id === selectedProviderConfigId} className={`agent-model-config ${config.id === selectedProviderConfigId ? "is-selected" : ""}`} key={config.id} onClick={() => onProviderSelect(config)} type="button"><span className="theme-heading block text-[13px] font-bold">{config.name || config.provider}</span><span className="theme-muted mt-1 block text-[11px]">{config.provider} · {getProviderConfigModels(config).length} 个模型</span></button>)}{configs.length === 0 && <p className="theme-muted rounded-[12px] border border-dashed px-4 py-7 text-center text-xs">还没有可选 Provider，请先在模型配置中添加。</p>}</div>{availableModels.length > 0 && <label className="theme-muted mt-5 block text-[11px] font-bold">默认模型<select className="theme-input mt-1 w-full rounded-[10px] border px-3 py-2.5 text-[13px] outline-none" value={selectedModel} onChange={(event) => onModelChange(event.target.value)}>{availableModels.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>}</div></section>;
}

function EquipmentList({ title, description, emptyMessage, items, selectedIds, onToggle }: {
  title: string;
  description: string;
  emptyMessage: string;
  items: Array<{ id: string; name: string; description: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return <section aria-labelledby="equipment-list-title"><div className="agent-equipment-section-heading"><div><h4 className="theme-heading text-[15px] font-extrabold" id="equipment-list-title">{title}</h4><p className="theme-muted mt-1 text-[11px] font-medium leading-5">{description}</p></div><span>{selectedIds.length} 已选</span></div><div className="agent-equipment-list">{items.map((item) => <button aria-pressed={selectedIds.includes(item.id)} type="button" key={item.id} onClick={() => onToggle(item.id)} className={`agent-equipment-item ${selectedIds.includes(item.id) ? "is-selected" : ""}`}><span className="agent-equipment-item__check">{selectedIds.includes(item.id) && <Check size={13} />}</span><span className="min-w-0 flex-1"><span className="theme-heading block text-[13px] font-bold">{item.name}</span><span className="theme-muted mt-1 block text-[11px] leading-4">{item.description || "暂无描述"}</span></span></button>)}{items.length === 0 && <p className="theme-muted py-9 text-center text-xs">{emptyMessage}</p>}</div></section>;
}

function KnowledgeEquipmentList({ agentId, items, selectedIds, onToggle }: { agentId: string; items: KnowledgeSpace[]; selectedIds: string[]; onToggle: (id: string) => void }) {
  return <section aria-labelledby="knowledge-equipment-title"><div className="agent-equipment-section-heading"><div><h4 className="theme-heading text-[15px] font-extrabold" id="knowledge-equipment-title">可检索的知识空间</h4><p className="theme-muted mt-1 text-[11px] font-medium leading-5">智能体在需要时，只能检索在这里授权的知识节点与一跳关系。</p></div><span>{selectedIds.length} 已授权</span></div><div className="agent-equipment-list">{items.map((space) => { const selected = selectedIds.includes(space.id); const sharedWith = space.agentIds.filter((id) => id !== agentId).length; return <button aria-pressed={selected} className={`agent-equipment-item agent-equipment-item--knowledge ${selected ? "is-selected" : ""}`} key={space.id} onClick={() => onToggle(space.id)} type="button"><span className="agent-equipment-space-mark" style={{ background: space.color }} /><span className="agent-equipment-item__check">{selected && <Check size={13} />}</span><span className="min-w-0 flex-1"><span className="theme-heading block text-[13px] font-bold">{space.name}</span><span className="theme-muted mt-1 block text-[11px] leading-4">{space.description || space.domain || "尚未填写知识空间说明"}</span><span className="agent-equipment-space-meta">{space.nodes.length} 节点 · {space.edges.length} 关系{sharedWith > 0 ? ` · 与 ${sharedWith} 位智能体共享` : ""}</span></span></button>; })}{items.length === 0 && <p className="theme-muted py-9 text-center text-xs">还没有知识空间，可先在知识库中新建。</p>}</div></section>;
}

function WorkAgentCard({ agent, anchor, cardRef, onClose }: {
  agent: AgentProfile;
  anchor: { left: number; top: number; width: number; height: number };
  cardRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const cardWidth = 390;
  const gap = 16;
  const roomOnRight = typeof window === "undefined" ? true : anchor.left + anchor.width + gap + cardWidth <= window.innerWidth - 16;
  const left = roomOnRight ? anchor.left + anchor.width + gap : Math.max(16, anchor.left - cardWidth - gap);
  const top = typeof window === "undefined" ? anchor.top : Math.max(16, Math.min(anchor.top + anchor.height / 2 - 120, window.innerHeight - 560));
  const arrowTop = Math.max(28, Math.min(500, anchor.top + anchor.height / 2 - top - 8));

  useEffect(() => {
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const fields = [
    ["专长场景", agent.bio || "未填写"],
    ["可处理任务", agent.capabilities || "未填写"],
    ["配置模型", agent.llm?.default_model || "未配置"],
    ["表达风格", agent.speaking_style || "未填写"],
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <aside ref={cardRef} className="theme-card fixed z-[80] w-[390px] max-w-[calc(100vw-2rem)] rounded-[20px] border p-5 shadow-[0_24px_70px_rgba(26,38,80,0.25)] backdrop-blur-xl" style={{ left, top }} role="dialog" aria-label={`${agent.name} Agent Card`}>
      <span className={`absolute size-4 rotate-45 border bg-[var(--app-surface)] ${roomOnRight ? "-left-2 border-b border-l" : "-right-2 border-r border-t"}`} style={{ top: arrowTop }} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3"><AgentStatusAvatar active avatar={agent.avatar} initials={getInitials(agent.name)} size="medium" /><div className="min-w-0"><span className="theme-primary-soft inline-flex rounded-full px-3 py-1 text-[11px] font-bold">{agent.agent_type === "siinx" ? "主 Agent" : "任务智能体"}</span><h2 className="theme-heading mt-2 truncate text-xl font-bold">{agent.name}</h2><p className="theme-muted mt-1 text-xs">{agent.public_facts?.occupation || (agent.agent_type === "siinx" ? "默认主控智能体" : "专属场景智能体")}{agent.public_facts?.city ? ` · ${agent.public_facts.city}` : ""}</p></div></div>
        <button type="button" aria-label="关闭 Agent Card" onClick={onClose} className="theme-button flex size-9 shrink-0 items-center justify-center rounded-[10px] border"><CircleX size={16} /></button>
      </div>
      <div className="mt-5 space-y-3">{fields.map(([label, value]) => <div key={label} className="theme-soft rounded-[12px] border p-3"><p className="theme-muted text-[10px] font-bold uppercase">{label}</p><p className="theme-heading mt-1 line-clamp-3 text-[13px] leading-5">{value}</p></div>)}<div className="grid grid-cols-2 gap-3"><div className="theme-soft rounded-[12px] border p-3"><p className="theme-muted text-[10px] font-bold uppercase">专属 Skills</p><p className="theme-heading mt-1 text-[13px] font-bold">{agent.enabled_skill_ids?.length ?? 0} 项</p></div><div className="theme-soft rounded-[12px] border p-3"><p className="theme-muted text-[10px] font-bold uppercase">专属 Tools</p><p className="theme-heading mt-1 text-[13px] font-bold">{agent.enabled_tool_ids?.length ?? 0} 项</p></div></div>{(agent.values?.length ?? 0) > 0 && <div className="flex flex-wrap gap-2">{agent.values!.map((value) => <span key={value} className="theme-primary-soft rounded-full px-3 py-1 text-[11px] font-semibold">{value}</span>)}</div>}</div>
    </aside>
    , document.body,
  );
}

function agentToDraft(agent: AgentProfile) {
  return { name: agent.name, identity: agent.bio || "", capabilities: agent.capabilities || "", occupation: agent.public_facts?.occupation || "", city: agent.public_facts?.city || "", speakingStyle: agent.speaking_style || "", values: (agent.values ?? []).join(", "), boundaries: (agent.boundaries ?? []).join("\n"), handoffPolicy: agent.handoff_policy || "", visibility: agent.public_facts?.visibility || "private" };
}

function AgentEditInput({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  const className = "theme-input mt-1 w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none";
  return <label className="theme-muted block text-[11px] font-bold">{label}{multiline ? <textarea rows={3} className={className} value={value} onChange={(event) => onChange(event.target.value)} /> : <input className={className} value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function DigitalTwinChatPanel({
  agent,
  delegatedAgents,
  onRemoveDelegatedAgent,
  isAuthenticated,
  onAgentUpdated,
  onAuthClick,
  onCollapse,
  onOpenModelConfig,
  selectedConversation,
  startNewSignal,
  projectContext,
}: {
  agent: AgentProfile | null;
  delegatedAgents: AgentProfile[];
  onRemoveDelegatedAgent: (agentId: string) => void;
  isAuthenticated: boolean;
  onAgentUpdated: (agent: AgentProfile) => void;
  onAuthClick: () => void;
  onCollapse: () => void;
  onOpenModelConfig: () => void;
  selectedConversation: ConversationDetail | null;
  startNewSignal: number;
  projectContext: ActiveProjectContext | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [serverContextTokens, setServerContextTokens] = useState<number | null>(null);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [selectedChatScenario, setSelectedChatScenario] = useState<ChatScenarioId>("analysis");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("smart");
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentAccept, setAttachmentAccept] = useState(".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,text/plain,application/pdf,application/msword,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlan | null>(null);
  const [browserView, setBrowserView] = useState<{ open: boolean; url: string; title: string; image: string; action: string; busy: boolean } | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [taskElapsedMs, setTaskElapsedMs] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
  const [isLoadingProviderConfigs, setIsLoadingProviderConfigs] = useState(false);
  const [isModelSaving, setIsModelSaving] = useState(false);
  const [savingProviderConfigId, setSavingProviderConfigId] = useState("");
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const permissionMenuRef = useRef<HTMLDivElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const runningSessionIdRef = useRef("");
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const activeExpert = delegatedAgents[delegatedAgents.length - 1] ?? null;
  const taskAgent = activeExpert ?? agent;
  const currentChatScenario = chatScenarios.find((scenario) => scenario.id === selectedChatScenario) ?? chatScenarios[1];
  const slashQuery = draftMessage.match(/^\/([a-z-]*)$/i)?.[1]?.toLowerCase();
  const visibleSlashCommands = slashQuery === undefined
    ? []
    : slashCommands.filter((command) => command.name.startsWith(slashQuery));
  useEffect(() => {
    const query = taskAgent?.id ? `?agentId=${encodeURIComponent(taskAgent.id)}` : "";
    fetch(`/api/workspace-directory${query}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!selectedConversation?.workingDirectory && typeof data?.directory === "string") {
          setWorkingDirectory(data.directory);
        }
      })
      .catch(() => undefined);
  }, [taskAgent?.id, selectedConversation?.id, selectedConversation?.workingDirectory]);

  useEffect(() => {
    const key = taskAgent?.id ? `eido-permission-mode:${taskAgent.id}` : "";
    const saved = key ? window.localStorage.getItem(key) : null;
    setPermissionMode(saved === "auto" || saved === "manual" || saved === "smart" ? saved : "smart");
  }, [taskAgent?.id]);

  useEffect(() => {
    if (!modelMenuOpen) return;

    function closeModelMenuOnOutsideClick(event: PointerEvent) {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeModelMenuOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeModelMenuOnOutsideClick);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!permissionMenuOpen) return;

    function closePermissionMenuOnOutsideClick(event: PointerEvent) {
      if (!permissionMenuRef.current?.contains(event.target as Node)) {
        setPermissionMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closePermissionMenuOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closePermissionMenuOnOutsideClick);
  }, [permissionMenuOpen]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;

    function closeAttachmentMenuOnOutsideClick(event: PointerEvent) {
      if (!attachmentMenuRef.current?.contains(event.target as Node)) {
        setAttachmentMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeAttachmentMenuOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeAttachmentMenuOnOutsideClick);
  }, [attachmentMenuOpen]);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }
    if (runningSessionIdRef.current && selectedConversation.id !== runningSessionIdRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSessionId(selectedConversation.id);
      if (selectedConversation.workingDirectory) setWorkingDirectory(selectedConversation.workingDirectory);
      const restoredMessages: ChatMessage[] = selectedConversation.messages.map((message, index) => {
        const id = `${selectedConversation.id}-${index}`;
        const normalized = message.role === "assistant"
          ? splitTaggedThinkingContent(message.content, id)
          : null;
        return {
          id,
          role: message.role,
          text: normalized?.answer ?? message.content,
          images: message.images,
          time: formatMessageTime(message.created_at),
          parts: normalized?.parts,
          isStreaming: false,
        };
      });
      const lastAssistantIndex = restoredMessages.map((message) => message.role).lastIndexOf("assistant");
      if (selectedConversation.pendingInteraction && lastAssistantIndex >= 0) {
        const target = restoredMessages[lastAssistantIndex];
        target.parts = [...(target.parts ?? []), interactionPartFrom(selectedConversation.pendingInteraction)];
      }
      setMessages(restoredMessages);
      setDraftMessage("");
      setDraftImages([]);
      setPendingAttachments([]);
      setError("");
      setExecutionPlan(selectedConversation.executionPlan ?? null);
      setBrowserView(null);
      setServerContextTokens(selectedConversation.contextUsage?.total ?? null);
      shouldStickToBottomRef.current = true;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedConversation]);

  useEffect(() => {
    if (runningSessionIdRef.current) return;
    const timer = window.setTimeout(() => {
      setMessages([]);
      setSessionId("");
      setDraftMessage("");
      setDraftImages([]);
      setPendingAttachments([]);
      setError("");
      setExecutionPlan(null);
      setBrowserView(null);
      setServerContextTokens(null);
      shouldStickToBottomRef.current = true;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [startNewSignal]);

  async function loadProviderConfigs() {
    setIsLoadingProviderConfigs(true);

    try {
      const response = await fetch("/api/provider-configs", { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "读取 Provider 配置失败。");
      }

      setProviderConfigs(Array.isArray(data?.providerConfigs) ? data.providerConfigs : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取 Provider 配置失败。");
    } finally {
      setIsLoadingProviderConfigs(false);
    }
  }

  function openModelMenu() {
    setModelMenuOpen(true);
    void loadProviderConfigs();
  }

  async function sendMessage(messageOverride?: string) {
    const content = (messageOverride ?? draftMessage).trim();

    if (!taskAgent || (!content && !draftImages.length && !pendingAttachments.length) || isSending || isUploadingAttachments) {
      return;
    }

    const slashCommand = content.match(/^\/([a-z][a-z0-9_-]*)$/i)?.[1]?.toLowerCase();
    if (slashCommand === "help") {
      setMessages((current) => [...current, {
        id: createMessageId("system"),
        role: "system",
        text: "可用命令：/compact（压缩会话上下文）、/help（显示命令说明）。",
        time: currentTime(),
      }]);
      if (messageOverride === undefined) setDraftMessage("");
      return;
    }
    if (slashCommand === "compact") {
      await compactConversation();
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      text: content || `已发送附件：${pendingAttachments.map((attachment) => attachment.name).join("、")}`,
      images: draftImages,
      time: currentTime(),
    };
    const assistantMessageId = createMessageId("assistant");

    const requestSessionId = sessionId || `session_${globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    runningSessionIdRef.current = requestSessionId;
    if (!sessionId) setSessionId(requestSessionId);
    // Keep the last full-session baseline while the request is running. The
    // newly submitted user turn is the only context not yet in that baseline;
    // the server replaces this estimate with its full cumulative value on done.
    const submittedContextTokens = estimateTextTokens(content) + 4 + draftImages.length * 85 + pendingAttachments.length * 12;
    setServerContextTokens((current) => current === null ? null : current + submittedContextTokens);
    setMessages((current) => [
      ...current,
      userMessage,
      ...(activeExpert ? [{
        id: createMessageId("orchestrator"),
        role: "assistant" as const,
        speakerName: agent?.name || "SiinX Agent",
        speakerRole: "orchestrator" as const,
        text: `@${activeExpert.name}，你来帮用户完成一下这个任务。`,
        time: currentTime(),
        parts: [{ id: createMessageId("orchestrator-text"), type: "text" as const, text: `@${activeExpert.name}，你来帮用户完成一下这个任务。` }],
      }] : []),
      {
        id: assistantMessageId,
        role: "assistant",
        speakerName: taskAgent.name,
        speakerRole: activeExpert ? "expert" : "orchestrator",
        text: "",
        time: currentTime(),
        parts: [],
        isStreaming: true,
      },
    ]);
    if (messageOverride === undefined) {
      setDraftMessage("");
      setDraftImages([]);
      setPendingAttachments([]);
    }
    setError("");
    setIsSending(true);
    setTaskElapsedMs(0);
    let activeSessionId = requestSessionId;
    let receivedAssistantText = false;
    let pendingAssistantDelta = "";
    let deltaFlushTimer: number | null = null;

    function appendAssistantDelta(contentToAppend: string, modelError = "") {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: modelError ? `请求失败：${modelError}` : `${message.text}${contentToAppend}`,
                parts: appendAssistantTextPart(
                  message.parts ?? [],
                  modelError ? `请求失败：${modelError}` : contentToAppend,
                ),
                isStreaming: !modelError,
              }
            : message,
        ),
      );
    }

    function flushAssistantDelta() {
      if (deltaFlushTimer !== null) {
        window.clearTimeout(deltaFlushTimer);
        deltaFlushTimer = null;
      }
      if (!pendingAssistantDelta) {
        return;
      }
      const contentToAppend = pendingAssistantDelta;
      pendingAssistantDelta = "";
      appendAssistantDelta(contentToAppend);
    }

    function scheduleAssistantDelta(contentToAppend: string) {
      pendingAssistantDelta += contentToAppend;
      if (deltaFlushTimer !== null) {
        return;
      }
      deltaFlushTimer = window.setTimeout(flushAssistantDelta, 80);
    }

    async function recoverPersistedReply() {
      if (!activeSessionId) {
        return false;
      }
      const recoveryResponse = await fetch(
        `/api/conversations?id=${encodeURIComponent(activeSessionId)}`,
        { cache: "no-store" },
      ).catch(() => null);
      if (!recoveryResponse?.ok) {
        return false;
      }
      const recoveryData = await recoveryResponse.json().catch(() => null);
      const persistedMessages = Array.isArray(recoveryData?.conversation?.messages)
        ? recoveryData.conversation.messages
        : [];
      const lastMessage = persistedMessages[persistedMessages.length - 1];
      if (lastMessage?.role !== "assistant" || typeof lastMessage.content !== "string" || !lastMessage.content.trim()) {
        return false;
      }
      receivedAssistantText = true;
      const normalized = splitTaggedThinkingContent(lastMessage.content, `${assistantMessageId}-recovered`);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: normalized.answer,
                parts: [
                  ...(message.parts ?? []).filter((part) => part.type !== "text" && part.type !== "thinking"),
                  ...normalized.parts,
                ],
                isStreaming: false,
              }
            : message,
        ),
      );
      return true;
    }

    try {
      const controller = new AbortController();
      chatAbortRef.current = controller;
      stopRequestedRef.current = false;
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: taskAgent.id,
          sessionId: requestSessionId,
          message: content,
          images: messageOverride === undefined ? draftImages : [],
          attachmentPaths: messageOverride === undefined ? pendingAttachments.map((attachment) => attachment.path) : [],
          model,
          stream: true,
          workingDirectory: workingDirectory || undefined,
          permissionMode,
          projectContext: projectContext ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Agent 回复失败。");
      }

      if (!response.body) {
        throw new Error("Agent 回复流不可用。");
      }

      for await (const event of readChatStream(response.body)) {
        if (event.type === "browser.frame" && event.image?.startsWith("data:image/jpeg;base64,")) {
          setBrowserView({ open: true, url: event.url ?? "", title: event.title ?? "浏览器", image: event.image, action: event.action ?? "inspect", busy: false });
        }
        if (event.type === "tool.started" && event.tool === "browser") {
          setBrowserView((current) => ({ open: true, url: current?.url ?? "", title: current?.title ?? "浏览器", image: current?.image ?? "", action: typeof event.arguments === "object" && event.arguments !== null && "action" in event.arguments ? String(event.arguments.action) : "正在操作", busy: true }));
        }
        if ((event.type === "tool.completed" || event.type === "tool.failed") && event.tool === "browser") {
          setBrowserView((current) => current ? { ...current, busy: false } : current);
        }
        if (event.type === "meta" && event.session_id) {
          activeSessionId = event.session_id;
          setSessionId(event.session_id);
        }
        if (event.type === "delta" && event.content) {
          receivedAssistantText = true;
          const modelError = parseModelErrorContent(event.content);
          if (modelError) {
            flushAssistantDelta();
            appendAssistantDelta(event.content, modelError);
            setError(modelError);
          } else {
            scheduleAssistantDelta(event.content);
          }
        }
        if (event.type === "thinking.delta" && event.content) {
          flushAssistantDelta();
          setMessages((current) => current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, parts: appendAssistantThinkingPart(message.parts ?? [], event.content!) }
              : message,
          ));
        }
        if (event.type === "interaction.required" && event.interaction) {
          const interaction = event.interaction;
          flushAssistantDelta();
          setMessages((current) => current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, parts: upsertInteractionPart(message.parts ?? [], interaction) }
              : message,
          ));
        }
        if (event.type === "interaction.resolved" && event.interaction) {
          const interaction = event.interaction;
          flushAssistantDelta();
          setMessages((current) => current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  parts: markInteractionSubmitted(
                    upsertInteractionPart(message.parts ?? [], interaction),
                    interaction.id,
                  ),
                }
              : message,
          ));
        }
        if (
          event.type === "tool.started" ||
          event.type === "tool.completed" ||
          event.type === "tool.failed"
        ) {
          flushAssistantDelta();
          const nextPlan = executionPlanFromToolEvent(event);
          if (nextPlan) {
            setExecutionPlan((current) => ({
              ...nextPlan,
              goal: nextPlan.goal || current?.goal || "",
            }));
          }
          // Planning events own the right-hand workspace instead of creating a
          // duplicate JSON-heavy tool card in the conversation transcript.
          if (event.tool !== "plan" && event.tool !== "request_user_interaction") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      parts: updateAssistantToolParts(message.parts ?? [], event),
                      isStreaming: true,
                    }
                  : message,
              ),
            );
          }

          if (isFactoryMutationEvent(event)) {
            window.dispatchEvent(new CustomEvent("eido:factory-changed", {
              detail: factoryMutationDetail(event),
            }));
          }
        }
        if (event.type === "done") {
          flushAssistantDelta();
          if (Number.isSafeInteger(event.context_usage?.total) && (event.context_usage?.total ?? 0) >= 0) {
            setServerContextTokens(event.context_usage!.total!);
          }
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    isStreaming: false,
                    parts: event.interaction
                      ? upsertInteractionPart(message.parts ?? [], event.interaction)
                      : message.parts,
                  }
                : message,
            ),
          );
        }
        if (event.type === "error") {
          throw new Error(event.error || "Agent 回复失败。");
        }
      }
      flushAssistantDelta();
      if (!receivedAssistantText) {
        await recoverPersistedReply();
      }
    } catch (sendError) {
      flushAssistantDelta();
      if (stopRequestedRef.current) {
        setError("");
        setMessages((current) => current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, text: message.text || "执行已由用户终止。", isStreaming: false }
            : message,
        ));
        return;
      }
      if (await recoverPersistedReply()) {
        setError("");
        return;
      }
      const errorMessage = sendError instanceof Error ? sendError.message : "Agent 回复失败。";
      setError(errorMessage);
      setMessages((current) =>
        current
          .map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  text: message.text.trim() ? message.text : `请求失败：${errorMessage}`,
                  parts: appendAssistantTextPart(
                    message.parts ?? [],
                    `\n\n请求失败：${errorMessage}`,
                  ),
                  isStreaming: false,
                }
              : message,
          )
          .filter(
            (message) =>
              message.id !== assistantMessageId ||
              message.text.trim() ||
              (message.parts?.length ?? 0) > 0,
          ),
      );
    } finally {
      flushAssistantDelta();
      chatAbortRef.current = null;
      runningSessionIdRef.current = "";
      setIsSending(false);
    }
  }

  async function respondToInteraction(
    messageId: string,
    interaction: Interaction,
    responseText: string,
  ) {
    const activeSessionId = runningSessionIdRef.current || sessionId;
    if (!activeSessionId) {
      setError("当前交互缺少会话信息，无法提交。");
      return;
    }
    setMessages((current) => current.map((item) =>
      item.id === messageId
        ? { ...item, parts: markInteractionSubmitting(item.parts ?? [], interaction.id) }
        : item,
    ));
    try {
      const response = await fetch(
        `/api/agent/interactions/${encodeURIComponent(interaction.id)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: activeSessionId, agentId: taskAgent?.id, response: responseText }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || data?.detail || "提交交互响应失败。");
      }
      const resolved = data?.interaction as Interaction | undefined;
      setMessages((current) => current.map((item) =>
        item.id === messageId
          ? {
              ...item,
              parts: markInteractionSubmitted(
                resolved
                  ? upsertInteractionPart(item.parts ?? [], resolved)
                  : item.parts ?? [],
                interaction.id,
              ),
            }
          : item,
      ));
    } catch (interactionError) {
      setMessages((current) => current.map((item) =>
        item.id === messageId
          ? { ...item, parts: markInteractionIdle(item.parts ?? [], interaction.id) }
          : item,
      ));
      setError(interactionError instanceof Error ? interactionError.message : "提交交互响应失败。");
    }
  }

  async function compactConversation() {
    if (!taskAgent || isSending) return;
    if (!sessionId) {
      setError("当前还是新会话，发送消息后才能压缩上下文。");
      return;
    }
    setIsSending(true);
    setError("");
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: taskAgent.id,
          sessionId,
          message: "/compact",
          slashCommand: "compact",
          model: selectedModel || undefined,
          workingDirectory: workingDirectory || undefined,
          permissionMode,
          projectContext: projectContext ?? undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "压缩会话上下文失败。");
      const content = typeof data?.message?.content === "string"
        ? data.message.content
        : "会话上下文已压缩。";
      setMessages((current) => [...current, {
        id: createMessageId("system"),
        role: "system",
        text: content,
        time: currentTime(),
      }]);
      setDraftMessage("");
      if (Number.isSafeInteger(data?.context_usage?.total) && data.context_usage.total >= 0) {
        setServerContextTokens(data.context_usage.total);
      } else {
        setServerContextTokens(null);
      }
    } catch (compactError) {
      setError(compactError instanceof Error ? compactError.message : "压缩会话上下文失败。");
    } finally {
      setIsSending(false);
    }
  }

  async function stopAgentExecution() {
    const runningSessionId = runningSessionIdRef.current;
    if (!isSending || !runningSessionId) return;
    stopRequestedRef.current = true;
    const agentId = taskAgent?.id ? `&agentId=${encodeURIComponent(taskAgent.id)}` : "";
    await fetch(`/api/agent/chat?sessionId=${encodeURIComponent(runningSessionId)}${agentId}`, { method: "DELETE" }).catch(() => null);
    chatAbortRef.current?.abort();
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    if (!taskAgent) {
      setError("请先选择 Agent 后再上传附件。");
      return;
    }

    const failures: string[] = [];
    const uploaded: PendingAttachment[] = [];
    setIsUploadingAttachments(true);
    for (const file of Array.from(files).slice(0, 4)) {
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("agentId", taskAgent.id);
        const response = await fetch("/api/attachments/extract", { method: "POST", body: form });
        const data = await response.json().catch(() => null);
        if (!response.ok || typeof data?.attachment?.path !== "string") {
          throw new Error(typeof data?.error === "string" ? data.error : "上传失败。");
        }
        uploaded.push({
          name: typeof data.attachment.name === "string" ? data.attachment.name : file.name,
          path: data.attachment.path,
          size: typeof data.attachment.size === "number" ? data.attachment.size : file.size,
        });
      } catch (fileError) {
        failures.push(`${file.name}（${fileError instanceof Error ? fileError.message : "上传失败"}）`);
      }
    }
    setIsUploadingAttachments(false);
    if (uploaded.length) setPendingAttachments((current) => [...current, ...uploaded].slice(0, 8));
    if (failures.length) setError(`附件上传失败：${failures.join("、")}`);
  }

  async function selectWorkingDirectory() {
    if (isSelectingDirectory || isSending) return;
    setIsSelectingDirectory(true);
    setError("");
    try {
      if (!taskAgent) throw new Error("请先选择 Agent。");
      const response = await fetch("/api/workspace-directory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: taskAgent.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "选择工作目录失败。");
      if (typeof data?.directory === "string") setWorkingDirectory(data.directory);
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "选择工作目录失败。");
    } finally {
      setIsSelectingDirectory(false);
    }
  }

  async function handleImagePaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    event.preventDefault();
    const accepted = imageFiles.slice(0, Math.max(0, 4 - draftImages.length));
    const dataUrls = await Promise.all(accepted.map(readImageAsDataUrl));
    setDraftImages((current) => [...current, ...dataUrls.filter(Boolean)].slice(0, 4));
  }

  function replaceDraft(text: string) {
    setDraftMessage(text);
  }

  async function applyModel(config: ProviderConfig, nextModel: string) {
    const targetAgent = taskAgent;
    if (!targetAgent || isModelSaving) {
      return;
    }

    setIsModelSaving(true);
    setSavingProviderConfigId(`${config.id}:${nextModel}`);
    setError("");

    try {
      const response = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: targetAgent.id,
          name: targetAgent.name,
          identity: targetAgent.bio || "",
          capabilities: targetAgent.capabilities || "",
          occupation: targetAgent.public_facts?.occupation || "",
          city: targetAgent.public_facts?.city || "",
          values: targetAgent.values ?? [],
          speakingStyle: targetAgent.speaking_style || "",
          boundaries: (targetAgent.boundaries ?? []).join("\n"),
          handoffPolicy: targetAgent.handoff_policy || "",
          providerConfigId: config.id,
          model: nextModel,
          visibility: targetAgent.public_facts?.visibility || "private",
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "模型保存失败。");
      }

      onAgentUpdated(data.agent);
      setSelectedModel(data.agent?.llm?.default_model || nextModel);
      setError("");
      setModelMenuOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "模型保存失败。");
    } finally {
      setIsModelSaving(false);
      setSavingProviderConfigId("");
    }
  }

  const model = selectedModel || taskAgent?.llm?.default_model || "";
  const currentModelLabel = model
    ? taskAgent?.llm?.default_provider
      ? `${taskAgent.llm.default_provider} / ${model}`
      : model
    : "未配置模型";
  const currentProviderConfigId = taskAgent?.provider_config_id || "";
  const providerFailure = isProviderConfigurationError(error);
  const isEmptyConversation = messages.length === 0 && !sessionId && !isSending;
  const tokenUsage = useMemo(() => estimateConversationTokens(messages), [messages]);
  const contextWindow = useMemo(
    () => getModelContextWindow(taskAgent, providerConfigs, currentProviderConfigId, model),
    [currentProviderConfigId, model, providerConfigs, taskAgent],
  );
  const contextUsage = useMemo(() => {
    const draftTokens = estimateTextTokens(draftMessage);
    if (serverContextTokens !== null) {
      return serverContextTokens + (draftTokens > 0 ? draftTokens + 4 : 0);
    }
    return estimateContextTokens(messages, draftMessage);
  }, [draftMessage, messages, serverContextTokens]);
  const contextPercent = contextWindow
    ? Math.min(100, Math.round((contextUsage / contextWindow) * 100))
    : 0;
  const contextTone = contextPercent >= 80
    ? "bg-[#dc4458]"
    : contextPercent >= 50
      ? "bg-[#d98a26]"
      : "bg-[var(--app-primary)]";

  useEffect(() => {
    setSelectedModel(taskAgent?.llm?.default_model || "");
  }, [taskAgent?.id, taskAgent?.llm?.default_model]);

  useEffect(() => {
    if (!isSending) {
      return;
    }

    const timer = window.setInterval(() => {
      setTaskElapsedMs((elapsed) => elapsed + 1000);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isSending]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    const viewport = messageViewportRef.current;
    if (!viewport) {
      return;
    }

    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
      shouldStickToBottomRef.current = isScrolledToBottom(viewport);
    });
  }, [isSending, messages]);

  return (
    <aside className={`theme-panel app-chat-panel main-chat-panel relative mx-1 flex min-h-0 flex-col overflow-hidden rounded-[24px] border ${isEmptyConversation ? "main-chat-panel--empty" : ""} ${executionPlan ? "main-chat-panel--with-plan" : ""} ${browserView?.open ? "main-chat-panel--with-browser" : ""}`}>
      <div className="chat-conversation-area min-h-0 flex-1 px-5 pb-4">
        <div
          className="theme-chat-space h-full space-y-5 overflow-y-auto rounded-[22px] border px-5 py-5"
          onScroll={(event) => {
            shouldStickToBottomRef.current = isScrolledToBottom(event.currentTarget);
          }}
          ref={messageViewportRef}
        >
          {!agent && !isEmptyConversation && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
              <div className="theme-primary-soft flex size-16 items-center justify-center rounded-full">
                <Sparkles size={30} />
              </div>
              <h3 className="theme-heading mt-4 text-[18px] font-bold">
                {isAuthenticated ? "还没有可对话的 Agent" : "登录后开始使用 SiinX"}
              </h3>
              <p className="theme-muted mt-2 max-w-[280px] text-[14px] font-medium leading-6">
                {isAuthenticated
                  ? "创建你的第一个 Agent 后，这里会自动切换成和它对话的界面。"
                  : "登录或注册后，你可以创建自己的 Agent 并保存配置。"}
              </p>
              <Link
                className="theme-primary-bg mt-5 rounded-[12px] px-5 py-3 text-[14px] font-bold text-white shadow-[0_12px_24px_rgba(76,83,229,0.22)] transition"
                href={isAuthenticated ? "/agents/new" : "#"}
                onClick={(event) => {
                  if (!isAuthenticated) {
                    event.preventDefault();
                    onAuthClick();
                  }
                }}
              >
                {isAuthenticated ? "创建 Agent" : "登录 / 注册"}
              </Link>
            </div>
          )}

          {isEmptyConversation && (
            <div className="chat-welcome flex h-full min-h-[300px] flex-col items-center justify-center text-center">
              <div className="theme-primary-soft flex size-14 items-center justify-center rounded-[18px]">
                <Sparkles size={30} />
              </div>
              <h2 className="theme-heading mt-5 text-[32px] font-bold tracking-[-0.045em]">SiinX · 见心万象</h2>
              <p className="theme-muted mt-3 max-w-[480px] text-[14px] font-medium leading-6">
                {agent
                  ? "告诉我你想完成的事，我会协同专家团梳理、执行并呈现结果。"
                  : "登录并创建 Agent 后，即可开始一段由专家团协同完成的对话。"}
              </p>
              <div className="chat-welcome-modes theme-soft mt-5 flex items-center rounded-full border p-1">
                {chatScenarios.map((scenario) => (
                  <button
                    aria-pressed={scenario.id === selectedChatScenario}
                    className={`rounded-full px-4 py-2 text-[12px] font-bold transition ${scenario.id === selectedChatScenario ? "bg-[var(--app-text)] text-[var(--app-bg)] shadow-sm" : "theme-muted hover:text-[var(--app-primary-strong)]"}`}
                    key={scenario.id}
                    onClick={() => setSelectedChatScenario(scenario.id)}
                    type="button"
                  >
                    {scenario.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isEmptyConversation && (
            <>
              <div className="welcome-manifesto" aria-hidden="true">
                <span>THINK</span>
                <span>CREATE</span>
                <span>ACCOMPLISH</span>
              </div>
              <div className="welcome-signature" aria-hidden="true">AI FOR A BETTER TOMORROW</div>
              <div className="welcome-footer-note welcome-footer-note--left" aria-hidden="true">PERSONAL WORK PLATFORM</div>
              <div className="welcome-footer-note welcome-footer-note--right" aria-hidden="true">MORE POSSIBILITIES WITH AI</div>
            </>
          )}

          {messages.map((message) => (
            <MessageBubble
              align={message.role === "user" ? "right" : "left"}
              key={message.id}
              role={message.role}
              isStreaming={message.isStreaming}
              parts={message.parts}
              images={message.images}
              text={message.text}
              speakerName={message.speakerName}
              speakerRole={message.speakerRole}
              taskElapsedMs={message.isStreaming ? taskElapsedMs : undefined}
              onInteractionResponse={(interaction, response) => {
                void respondToInteraction(message.id, interaction, response);
              }}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="chat-error-notice mx-5 mb-3 flex flex-col gap-3 rounded-[13px] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] font-bold">
              <ShieldAlert className="shrink-0" size={16} />
              <span>{providerFailure ? "当前模型服务不可用" : "请求未完成"}</span>
            </div>
            <p className="mt-1 break-words text-[12px] font-medium leading-5">
              {providerFailure
                ? "当前 Provider 的订阅或凭证不可用。切换到其他可用模型后，可以继续发送消息。"
                : formatChatError(error)}
            </p>
          </div>
          {providerFailure && (
            <button
              className="chat-error-action inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-[10px] border px-3 text-[12px] font-bold transition sm:self-auto"
              onClick={openModelMenu}
              type="button"
            >
              <RefreshCw size={14} />
              切换模型
            </button>
          )}
        </div>
      )}

      {isEmptyConversation && (
        <div className="chat-quick-actions mx-5 mb-2 flex flex-wrap items-center gap-2">
          {currentChatScenario.quickActions.map(({ label, icon: Icon, prompt }) => (
            <button className="theme-soft inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition hover:border-[var(--app-primary)]" key={label} onClick={() => replaceDraft(prompt)} type="button">
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      )}

      <footer className="chat-composer theme-card mx-5 mb-5 rounded-[20px] border p-4 shadow-[0_18px_45px_rgba(70,82,120,0.12)]">
        <input
          accept={attachmentAccept}
          className="hidden"
          multiple
          onChange={(event) => {
            handleFilesSelected(event.target.files);
            event.currentTarget.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />
        {projectContext && (
          <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-[var(--app-primary)]/20 bg-[var(--app-primary)]/5 px-3 py-2 text-[11px] font-semibold text-[var(--app-primary-strong)]">
            <FolderKanban size={14} />
            <span className="min-w-0 truncate">已关联 Project：{projectContext.title || projectContext.projectName}</span>
          </div>
        )}
        {delegatedAgents.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2" aria-label="已召唤专家">
            {delegatedAgents.map((expert) => (
              <div
                className={`group flex h-14 min-w-0 max-w-full items-center gap-2 rounded-[12px] border px-2 pr-1.5 transition ${expert.id === activeExpert?.id ? "border-[var(--app-primary)] bg-[var(--app-primary)]/8" : "border-[var(--app-border)] bg-[var(--app-surface-soft)]"}`}
                key={expert.id}
              >
                <AgentStatusAvatar active={expert.id === activeExpert?.id} avatar={expert.avatar} initials={getInitials(expert.name)} size="small" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--app-primary-strong)]">
                    <UsersRound size={11} />
                    专家
                  </div>
                  <p className="max-w-[14rem] truncate text-[12px] font-bold text-[var(--app-text)]">{expert.name}</p>
                </div>
                <button
                  aria-label={`移除专家 ${expert.name}`}
                  className="theme-muted flex size-7 shrink-0 items-center justify-center rounded-[8px] transition hover:bg-[var(--app-surface-strong)] hover:text-[var(--app-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]"
                  onClick={() => onRemoveDelegatedAgent(expert.id)}
                  title="移除专家"
                  type="button"
                >
                  <CircleX size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        {!isEmptyConversation && <div className="theme-soft mb-3 flex min-h-7 items-center justify-between gap-3 rounded-[10px] px-3 text-[11px] font-bold uppercase tracking-normal">
          <span className="min-w-0 truncate">
            Tok {formatCompactCount(tokenUsage.total)} · In {formatCompactCount(tokenUsage.input)} · Out{" "}
            {formatCompactCount(tokenUsage.output)}
          </span>
        </div>}
        <div className="flex flex-col gap-3">
          {(pendingAttachments.length > 0 || isUploadingAttachments) && (
            <div aria-label="待发送附件" className="flex flex-wrap items-center gap-2">
              {pendingAttachments.map((attachment) => (
                <div className="group flex max-w-full items-center gap-2 rounded-[10px] border border-[var(--app-border)] bg-[var(--app-surface-soft)] py-1.5 pl-2.5 pr-1.5" key={attachment.path} title={attachment.path}>
                  <Paperclip className="shrink-0 text-[var(--app-primary-strong)]" size={14} />
                  <span className="max-w-[18rem] truncate text-[12px] font-semibold text-[var(--app-text)]">{attachment.name}</span>
                  <button aria-label={`移除附件 ${attachment.name}`} className="theme-muted flex size-6 shrink-0 items-center justify-center rounded-[7px] transition hover:bg-[var(--app-surface-strong)] hover:text-[var(--app-text)]" onClick={() => setPendingAttachments((current) => current.filter((item) => item.path !== attachment.path))} title="移除附件" type="button">
                    <CircleX size={14} />
                  </button>
                </div>
              ))}
              {isUploadingAttachments && <span className="theme-muted inline-flex items-center gap-1.5 text-[12px] font-semibold"><Loader2 className="animate-spin" size={14} />正在上传附件…</span>}
            </div>
          )}
          {draftImages.length > 0 && (
            <div className="flex h-14 shrink-0 flex-wrap gap-2">
              {draftImages.map((src, index) => (
                <div className="group relative size-14 overflow-hidden rounded-[10px] border border-[var(--app-border)] bg-[var(--app-surface-soft)]" key={src}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- clipboard image is a local data URL */}
                  <img alt={`待发送图片 ${index + 1}`} className="size-full object-cover" src={src} />
                  <button aria-label={`移除图片 ${index + 1}`} className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100" onClick={() => setDraftImages((current) => current.filter((_, imageIndex) => imageIndex !== index))} type="button">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex min-h-[78px] flex-1 items-end gap-3">
            <div className="relative min-w-0 flex-1">
              {visibleSlashCommands.length > 0 && (
                <div
                  aria-label="斜杠命令"
                  className="theme-card absolute bottom-[calc(100%+0.75rem)] left-0 z-30 w-full max-w-[31rem] overflow-hidden rounded-[14px] border p-1.5 shadow-[0_16px_34px_rgba(50,61,100,0.16)]"
                  role="listbox"
                >
                  {visibleSlashCommands.map((command, index) => (
                    <button
                      aria-selected={index === slashMenuIndex}
                      className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition ${index === slashMenuIndex ? "bg-[var(--app-surface-soft)] text-[var(--app-primary-strong)]" : "text-[var(--app-text)] hover:bg-[var(--app-surface-soft)]"}`}
                      key={command.name}
                      onClick={() => {
                        setDraftMessage(`/${command.name}`);
                        setSlashMenuIndex(0);
                      }}
                      role="option"
                      type="button"
                    >
                      <span className="theme-primary-soft rounded-md px-2 py-1 text-[12px] font-bold">/{command.name}</span>
                      <span className="theme-muted min-w-0 text-[12px] font-medium">{command.description}</span>
                    </button>
                  ))}
                </div>
              )}
            <textarea
              className="block min-h-[78px] w-full resize-none border-transparent bg-transparent px-1 pt-1 text-[14px] font-medium text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] focus:!border-transparent focus:!shadow-none focus-visible:!outline-none"
              disabled={!agent || isSending}
              onChange={(event) => {
                setDraftMessage(event.target.value);
                setSlashMenuIndex(0);
              }}
              onKeyDown={(event) => {
                const isComposing =
                  event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;

                if (!isComposing && visibleSlashCommands.length > 0) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setSlashMenuIndex((current) => (
                      (current + (event.key === "ArrowDown" ? 1 : visibleSlashCommands.length - 1)) % visibleSlashCommands.length
                    ));
                    return;
                  }
                  if (event.key === "Tab") {
                    event.preventDefault();
                    setDraftMessage(`/${visibleSlashCommands[slashMenuIndex]?.name ?? visibleSlashCommands[0].name}`);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setDraftMessage("");
                    return;
                  }
                }

                if (event.key === "Enter" && !event.shiftKey && !isComposing) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              onPaste={(event) => { void handleImagePaste(event); }}
              placeholder={taskAgent ? (activeExpert ? `将任务交给 @${activeExpert.name}…` : "输入你的任务，按 Enter 发送") : "创建 Agent 后即可对话"}
              value={draftMessage}
            />
            </div>
            <button
              className="theme-primary-bg flex size-[44px] shrink-0 items-center justify-center rounded-full text-white shadow-[0_10px_20px_rgba(76,83,229,0.24)] transition disabled:cursor-not-allowed disabled:bg-[#b9bfd4]"
              disabled={!agent || isUploadingAttachments || (!isSending && !draftMessage.trim() && !draftImages.length && !pendingAttachments.length)}
              onClick={isSending ? stopAgentExecution : () => { void sendMessage(); }}
              title={isSending ? "终止 Agent 执行" : "发送"}
              type="button"
            >
              {isSending ? <Square fill="currentColor" size={16} /> : <Send size={19} />}
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative" ref={attachmentMenuRef}>
              <button
                aria-controls="attachment-menu"
                aria-expanded={attachmentMenuOpen}
                className="flex size-10 items-center justify-center rounded-full text-[var(--app-text)] transition hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-primary-strong)]"
                onClick={() => setAttachmentMenuOpen((open) => !open)}
                title="添加附件"
                type="button"
              >
                <Paperclip size={20} />
              </button>
              {attachmentMenuOpen && (
                <div className="theme-menu absolute bottom-11 left-0 z-40 w-[220px] rounded-[14px] border p-1.5 shadow-[0_18px_44px_rgba(45,55,92,0.18)]" id="attachment-menu" role="menu">
                  {[
                    { label: "PDF 文档", accept: ".pdf,application/pdf" },
                    { label: "Word 文档", accept: ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
                    { label: "PowerPoint 演示文稿", accept: ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" },
                    { label: "文本与 Markdown", accept: ".txt,.md,text/plain,text/markdown" },
                    { label: "其他本地文件", accept: "*/*" },
                  ].map((option) => (
                    <button
                      className="flex w-full items-center rounded-[10px] px-3 py-2.5 text-left text-[12px] font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-primary-strong)]"
                      key={option.label}
                      onClick={() => {
                        setAttachmentAccept(option.accept);
                        setAttachmentMenuOpen(false);
                        window.setTimeout(() => fileInputRef.current?.click(), 0);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              aria-label="选择工作目录"
              className="inline-flex h-9 max-w-[13rem] items-center gap-2 rounded-[10px] px-2 text-[12px] font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSending || isSelectingDirectory}
              onClick={selectWorkingDirectory}
              title={workingDirectory ? `工作目录：${workingDirectory}` : "选择 Agent 工作目录"}
              type="button"
            >
              {isSelectingDirectory ? <Loader2 className="animate-spin" size={17} /> : <FolderOpen size={17} />}
              <span>工作目录</span>
            </button>
            <div className="relative" ref={permissionMenuRef}>
              <button
                aria-controls="permission-mode-menu"
                aria-expanded={permissionMenuOpen}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2 text-[12px] font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSending}
                onClick={() => setPermissionMenuOpen((open) => !open)}
                title={`权限模式：${permissionModes.find((item) => item.id === permissionMode)?.label}`}
                type="button"
              >
                <ShieldCheck size={16} />
                <span>{permissionModes.find((item) => item.id === permissionMode)?.label ?? "权限模式"}</span>
                <ChevronDown className={permissionMenuOpen ? "rotate-180 transition" : "transition"} size={13} />
              </button>
              {permissionMenuOpen && (
                <div
                  className="theme-menu absolute bottom-11 left-0 z-40 w-[260px] rounded-[14px] border p-1.5 shadow-[0_18px_44px_rgba(45,55,92,0.18)]"
                  id="permission-mode-menu"
                  role="menu"
                >
                  {permissionModes.map((item) => {
                    const active = item.id === permissionMode;
                    return (
                      <button
                        aria-checked={active}
                        className={`flex w-full items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition ${active ? "bg-[var(--app-primary)]/10 text-[var(--app-primary-strong)]" : "text-[var(--app-text)] hover:bg-[var(--app-surface-soft)]"}`}
                        key={item.id}
                        onClick={() => {
                          setPermissionMode(item.id);
                          if (taskAgent?.id) window.localStorage.setItem(`eido-permission-mode:${taskAgent.id}`, item.id);
                          setPermissionMenuOpen(false);
                        }}
                        role="menuitemradio"
                        type="button"
                      >
                        <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${active ? "border-[var(--app-primary)] bg-[var(--app-primary)] text-white" : "border-[var(--app-border)]"}`}>
                          {active && <Check size={11} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[12px] font-bold">{item.label}</span>
                          <span className="theme-muted mt-0.5 block text-[11px] font-medium leading-4">{item.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            {contextWindow && (
              <div
                aria-label={`当前模型上下文：约 ${formatCompactCount(contextUsage)} / ${formatCompactCount(contextWindow)} tokens，${contextPercent}%`}
                className="theme-muted relative hidden h-8 w-[88px] overflow-hidden rounded-[9px] border border-[var(--app-border)] bg-[var(--app-surface-soft)] sm:block"
                title={serverContextTokens !== null
                  ? "按后端下一次实际请求结构估算：包含 system prompt、会话消息、工具调用/结果和工具 schema；正在输入的草稿会实时叠加。"
                  : "正在等待后端上下文基线；当前先按可见消息、工具调用/结果和待发送草稿估算。"}
              >
                <div
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 ${contextTone} opacity-20 transition-[width,background-color] duration-200 ease-out`}
                  style={{ width: `${Math.max(contextUsage > 0 ? 2 : 0, contextPercent)}%` }}
                />
                <div className="relative flex h-full items-center justify-center px-2.5 text-[10px] font-bold tabular-nums">
                  <span>{contextPercent}%</span>
                </div>
              </div>
            )}
          <div className="relative" ref={modelMenuRef}>
            <button
              aria-controls="model-selection-menu"
              aria-expanded={modelMenuOpen}
              aria-label={`切换模型，当前为 ${currentModelLabel}`}
              className="theme-soft flex h-9 max-w-[220px] items-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-semibold text-[var(--app-text)] transition hover:border-[var(--app-primary)] hover:text-[var(--app-primary-strong)]"
              onClick={() => {
                if (modelMenuOpen) {
                  setModelMenuOpen(false);
                } else {
                  openModelMenu();
                }
              }}
              title={`切换模型 · 当前 ${currentModelLabel}`}
              type="button"
            >
              <span className="max-w-[160px] truncate">{currentModelLabel}</span>
              <ChevronDown className={modelMenuOpen ? "rotate-180 transition" : "transition"} size={14} />
            </button>
            {modelMenuOpen && (
              <div className="theme-menu absolute bottom-8 right-0 z-40 max-h-[320px] w-[280px] overflow-y-auto rounded-[16px] border p-2 shadow-[0_22px_60px_rgba(45,55,92,0.18)]" id="model-selection-menu">
                {isLoadingProviderConfigs ? (
                  <div className="theme-muted flex items-center gap-2 px-3 py-3 text-[13px] font-semibold leading-6">
                    <Loader2 className="animate-spin" size={14} />
                    读取配置中
                  </div>
                ) : providerConfigs.length > 0 ? (
                  providerConfigs.flatMap((config) => getProviderConfigModels(config).map((configModel) => {
                    const active = currentProviderConfigId === config.id && configModel === model;
                    const saving = savingProviderConfigId === `${config.id}:${configModel}`;

                    return (
                      <button
                        aria-pressed={active}
                        className="model-menu-item flex h-11 w-full items-center justify-between gap-3 rounded-[10px] px-3 text-left text-[13px] font-semibold transition"
                        data-active={active}
                        disabled={isModelSaving}
                        key={`${config.id}:${configModel}`}
                        onClick={() => applyModel(config, configModel)}
                        type="button"
                      >
                        <span className="min-w-0 truncate">{config.provider} / {configModel}</span>
                        <span className="model-menu-indicator flex size-5 shrink-0 items-center justify-center">
                          {saving ? (
                            <Loader2 className="animate-spin" size={15} />
                          ) : active ? (
                            <Check size={16} strokeWidth={3} />
                          ) : null}
                        </span>
                      </button>
                    );
                  }))
                ) : (
                  <div className="theme-muted px-3 py-3 text-[13px] font-semibold leading-6">
                    还没有配置模型。
                  </div>
                )}
                <button
                  className="model-menu-config mt-1 flex h-9 w-full items-center rounded-[10px] px-3 text-left text-[12px] font-semibold transition"
                  disabled={!taskAgent}
                  onClick={() => {
                    setModelMenuOpen(false);
                    onOpenModelConfig();
                  }}
                  type="button"
                >
                  打开模型配置
                </button>
              </div>
            )}
          </div>
          </div>
        </div>
      </footer>
      {executionPlan && <ExecutionPlanPanel plan={executionPlan} />}
      {browserView?.open && (
        <section aria-label="Agent 浏览器" className="agent-browser-panel">
          <div className="agent-browser-panel__heading">
            <div className="min-w-0"><strong>Agent 浏览器</strong><span>{browserView.busy ? "正在操作" : "实时画面"} · {browserView.action}</span></div>
            <button aria-label="收起浏览器" onClick={() => setBrowserView((current) => current ? { ...current, open: false } : current)} type="button"><PanelRightClose size={18} /></button>
          </div>
          <div className="agent-browser-panel__address" title={browserView.url}><span aria-hidden="true" className="agent-browser-panel__dot" />{browserView.url || "正在启动浏览器…"}</div>
          <div className="agent-browser-panel__viewport">
            {browserView.image ? <img alt={`浏览器实时画面：${browserView.title}`} src={browserView.image} /> : <div className="agent-browser-panel__loading"><Loader2 className="animate-spin" size={23} />正在打开网页…</div>}
          </div>
          <p className="agent-browser-panel__caption">{browserView.title || "网页画面"} · 画面由 Agent 操作后更新</p>
        </section>
      )}
      {browserView && !browserView.open && (
        <button className="agent-browser-reopen" onClick={() => setBrowserView((current) => current ? { ...current, open: true } : current)} type="button">
          <PanelRightOpen size={16} /> 打开 Agent 浏览器
        </button>
      )}
      {settingsOpen && agent && (
        <AgentSettingsDialog
          agent={agent}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updatedAgent) => {
            onAgentUpdated(updatedAgent);
            setSettingsOpen(false);
          }}
        />
      )}
    </aside>
  );
}

async function* readChatStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
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
      const event = parseChatStreamLine(line);
      if (event) {
        yield event;
      }
    }
  }

  buffer += decoder.decode();
  const event = parseChatStreamLine(buffer);
  if (event) {
    yield event;
  }
}

function parseChatStreamLine(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as ChatStreamEvent;
  } catch {
    return { type: "error", error: "Agent 回复流格式错误。" };
  }
}

function executionPlanFromToolEvent(event: ChatStreamEvent): ExecutionPlan | null {
  if (
    (event.type !== "tool.started" && event.type !== "tool.completed") ||
    event.tool !== "plan"
  ) {
    return null;
  }

  const source = event.type === "tool.started"
    ? event.arguments
    : event.result ?? event.metadata?.result;
  return normalizeExecutionPlan(source);
}

function normalizeExecutionPlan(value: unknown): ExecutionPlan | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }
  if (!isUnknownRecord(candidate) || !Array.isArray(candidate.steps)) {
    return null;
  }

  const validStatuses = new Set<PlanStepStatus>([
    "pending",
    "in_progress",
    "completed",
    "blocked",
    "skipped",
  ]);
  const steps = candidate.steps.flatMap((rawStep) => {
    if (!isUnknownRecord(rawStep)) return [];
    const id = typeof rawStep.id === "string" ? rawStep.id.trim() : "";
    const title = typeof rawStep.title === "string" ? rawStep.title.trim() : "";
    const status = typeof rawStep.status === "string" ? rawStep.status : "";
    if (!id || !title || !validStatuses.has(status as PlanStepStatus)) return [];
    return [{
      id,
      title,
      status: status as PlanStepStatus,
      detail: typeof rawStep.detail === "string" ? rawStep.detail.trim() : undefined,
    }];
  });
  if (!steps.length) return null;

  return {
    goal: typeof candidate.goal === "string" ? candidate.goal.trim() : "",
    status: typeof candidate.status === "string" ? candidate.status : "active",
    reason: typeof candidate.reason === "string" ? candidate.reason.trim() : undefined,
    updatedAt: typeof candidate.updated_at === "string"
      ? candidate.updated_at
      : typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : undefined,
    steps,
  };
}

function ExecutionPlanPanel({ plan }: { plan: ExecutionPlan }) {
  const completedCount = plan.steps.filter((step) => step.status === "completed").length;
  const progress = Math.round((completedCount / plan.steps.length) * 100);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const panel = panelRef.current;
    const container = panel?.offsetParent as HTMLElement | null;
    if (!panel || !container) return;

    const panelRect = panel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: panelRect.left - containerRect.left,
      startTop: panelRect.top - containerRect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    event.preventDefault();
  }

  function handleDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    const container = panel?.offsetParent as HTMLElement | null;
    if (!drag || !panel || !container || event.pointerId !== drag.pointerId) return;

    const edgeGap = 8;
    const maxLeft = Math.max(edgeGap, container.clientWidth - panel.offsetWidth - edgeGap);
    const maxTop = Math.max(edgeGap, container.clientHeight - panel.offsetHeight - edgeGap);
    setPosition({
      left: clamp(drag.startLeft + event.clientX - drag.startClientX, edgeGap, maxLeft),
      top: clamp(drag.startTop + event.clientY - drag.startClientY, edgeGap, maxTop),
    });
  }

  function handleDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsDragging(false);
  }

  return (
    <aside
      className={`execution-plan-panel theme-card absolute z-10 flex flex-col overflow-hidden rounded-[16px] border shadow-[0_14px_36px_rgba(55,65,95,0.14)] ${isDragging ? "is-dragging" : ""}`}
      aria-label="任务进展"
      ref={panelRef}
      style={position ? { left: position.left, right: "auto", top: position.top } : undefined}
    >
      <div
        className="execution-plan-drag-handle px-4 pb-3 pt-3.5"
        onPointerCancel={handleDragEnd}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        title="拖动任务进展卡片"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[12px] font-black text-[var(--app-text)]">
            <span className="flex size-6 items-center justify-center rounded-[8px] bg-[var(--app-primary)] text-[var(--app-primary-contrast)]">
              <Target size={13} />
            </span>
            任务进展
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-[var(--app-primary)]/10 px-2 py-0.5 text-[10px] font-black text-[var(--app-primary-strong)]">
              {completedCount}/{plan.steps.length}
            </span>
            <GripVertical className="theme-muted" size={14} />
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--app-border)]">
          <div className="h-full rounded-full bg-[var(--app-primary)] transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="execution-plan-steps min-h-0 overflow-y-auto border-t border-[var(--app-border)] px-3 py-2.5">
        <ol className="space-y-0.5">
          {plan.steps.map((step, index) => (
            <li className={`rounded-[10px] px-2 py-2 transition-colors ${planStepClassName(step.status)}`} key={step.id}>
              <div className="flex items-start gap-2">
                <PlanStepIcon index={index} status={step.status} />
                <div className="min-w-0 flex-1">
                  <p className={`line-clamp-2 text-[11px] font-bold leading-[18px] ${step.status === "completed" || step.status === "skipped" ? "line-through opacity-65" : ""}`}>{step.title}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function PlanStepIcon({ index, status }: { index: number; status: PlanStepStatus }) {
  if (status === "completed") {
    return <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#dff5e8] text-[#218852]"><Check size={13} strokeWidth={3} /></span>;
  }
  if (status === "in_progress") {
    return <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--app-primary)] text-white"><Loader2 className="animate-spin" size={12} strokeWidth={3} /></span>;
  }
  if (status === "blocked") {
    return <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#fff0f1] text-[#c43d4f]">!</span>;
  }
  return <span className="theme-soft mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-black">{index + 1}</span>;
}

function planStepClassName(status: PlanStepStatus) {
  if (status === "completed") return "text-[#286743]";
  if (status === "in_progress") return "bg-[var(--app-primary)]/8 text-[var(--app-primary-strong)]";
  if (status === "blocked") return "bg-[#fff7f8] text-[#9f3040]";
  return "text-[var(--app-text)]";
}

function isFactoryMutationEvent(
  event: ChatStreamEvent,
): event is Extract<ChatStreamEvent, { type: `tool.${string}` }> {
  if (event.type !== "tool.completed" || event.tool !== "exec") return false;
  const command = isUnknownRecord(event.arguments) && typeof event.arguments.command === "string"
    ? event.arguments.command
    : "";
  if (!/manage_factory\.py\s+(create|update|delete)\b/.test(command)) return false;
  const result = typeof event.result === "string"
    ? event.result
    : typeof event.metadata?.result === "string"
      ? event.metadata.result
      : JSON.stringify(event.result ?? event.metadata?.result ?? "");
  const parsed = factoryMutationResult(event);
  const succeeded = isUnknownRecord(parsed)
    ? ["created", "updated", "deleted"].includes(String(parsed.status || ""))
    : /exit_code=0\b/.test(result);
  return succeeded && /"status"\s*:\s*"(created|updated|deleted)"/.test(result);
}

function factoryMutationDetail(event: Extract<ChatStreamEvent, { type: `tool.${string}` }>) {
  const command = isUnknownRecord(event.arguments) && typeof event.arguments.command === "string"
    ? event.arguments.command
    : "";
  const action = command.match(/manage_factory\.py\s+(create|update|delete)\b/)?.[1] || "changed";
  const result = factoryMutationResult(event);
  const graph = isUnknownRecord(result?.graph) ? result.graph : undefined;
  const commandGraphId = command.match(/(?:^|\s)--id(?:=|\s+)(["']?)(graph-[a-zA-Z0-9_-]+)\1(?:\s|$)/)?.[2];
  const graphId = typeof graph?.id === "string"
    ? graph.id
    : typeof result?.id === "string"
      ? result.id
      : commandGraphId;
  return { action, graphId };
}

function factoryMutationResult(
  event: Extract<ChatStreamEvent, { type: `tool.${string}` }>,
): Record<string, unknown> | undefined {
  const raw = event.result ?? event.metadata?.result;
  if (isUnknownRecord(raw)) return raw;
  if (typeof raw !== "string") return undefined;
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw.slice(jsonStart));
    return isUnknownRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseModelErrorContent(content: string) {
  const text = content.trim();
  if (!/^Error:\s*/i.test(text)) {
    return "";
  }

  const code = text.match(/['"]code['"]\s*:\s*['"]([^'"]+)['"]/i)?.[1];
  const message = text.match(/['"]message['"]\s*:\s*['"]([^'"]+)['"]/i)?.[1];
  if (code === "InvalidSubscription") {
    return "当前 Provider 的订阅无效或已过期，请在输入框下方切换到其他模型后继续。";
  }
  const detail = [code, message].filter(Boolean).join(" - ");
  return detail || text.replace(/^Error:\s*/i, "").trim() || "模型 Provider 返回错误。";
}

function isProviderConfigurationError(error: string) {
  return /InvalidSubscription|订阅无效|订阅.*过期|subscription has expired|does not have a valid|api[ _-]?key|provider/i.test(error);
}

function formatChatError(error: string) {
  return error
    .replaceAll("&#x20;", " ")
    .replaceAll("\\&", "&")
    .replace(/\*\*\[([^\]]+)]\(([^)]+)\)\*\*/g, "$1")
    .trim();
}

function appendAssistantTextPart(parts: AssistantMessagePart[], content = "") {
  if (!content) {
    return parts;
  }

  const last = parts[parts.length - 1];
  if (last?.type === "text") {
    return [
      ...parts.slice(0, -1),
      {
        ...last,
        text: `${last.text}${content}`,
      },
    ];
  }

  return [
    ...parts,
    {
      id: createMessageId("part"),
      type: "text" as const,
      text: content,
    },
  ];
}

function appendAssistantThinkingPart(parts: AssistantMessagePart[], content = "") {
  if (!content) return parts;
  const last = parts[parts.length - 1];
  if (last?.type === "thinking") {
    return [...parts.slice(0, -1), { ...last, text: `${last.text}${content}` }];
  }
  return [...parts, { id: createMessageId("thinking"), type: "thinking" as const, text: content }];
}

function splitTaggedThinkingContent(content: string, idPrefix: string) {
  const parts: AssistantMessagePart[] = [];
  const pattern = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
  let answer = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const textBefore = content.slice(cursor, match.index);
    if (textBefore) {
      answer += textBefore;
      parts.push({ id: `${idPrefix}-text-${parts.length}`, type: "text", text: textBefore });
    }
    if (match[1]) {
      parts.push({ id: `${idPrefix}-thinking-${parts.length}`, type: "thinking", text: match[1].trim() });
    }
    cursor = pattern.lastIndex;
  }

  const textAfter = content.slice(cursor);
  if (textAfter) {
    answer += textAfter;
    parts.push({ id: `${idPrefix}-text-${parts.length}`, type: "text", text: textAfter });
  }

  if (parts.length === 0) {
    return {
      answer: content,
      parts: content ? [{ id: `${idPrefix}-text`, type: "text" as const, text: content }] : [],
    };
  }
  return { answer, parts };
}

function updateAssistantToolParts(
  parts: AssistantMessagePart[],
  event: Extract<ChatStreamEvent, { type: `tool.${string}` }>,
) {
  const name = event.tool || "工具";
  if (event.type === "tool.started") {
    return [
      ...parts,
      {
        id: createMessageId("tool"),
        type: "tool" as const,
        name,
        arguments: event.arguments,
        status: "running" as const,
      },
    ];
  }

  const nextStatus: ToolCallPart["status"] =
    event.type === "tool.completed" ? "completed" : "failed";
  const targetIndex = findLastIndex(
    parts,
    (part) => part.type === "tool" && part.name === name && part.status === "running",
  );
  const result = formatToolResult(event);

  if (targetIndex === -1) {
    return [
      ...parts,
      {
        id: createMessageId("tool"),
        type: "tool" as const,
        name,
        arguments: event.arguments,
        result,
        status: nextStatus,
        error: event.error,
      },
    ];
  }

  return parts.map((part, index) =>
    index === targetIndex && part.type === "tool"
      ? {
          ...part,
          arguments: part.arguments ?? event.arguments,
          result,
          status: nextStatus,
          error: event.error,
        }
      : part,
  );
}

function interactionPartFrom(interaction: Interaction): InteractionPart {
  return {
    id: `interaction-${interaction.id}`,
    type: "interaction",
    interaction,
    submission: interaction.status && interaction.status !== "pending" ? "submitted" : "idle",
  };
}

function upsertInteractionPart(parts: AssistantMessagePart[], interaction: Interaction) {
  const existing = parts.findIndex((part) => part.type === "interaction" && part.interaction.id === interaction.id);
  if (existing === -1) return [...parts, interactionPartFrom(interaction)];
  return parts.map((part, index) => index === existing && part.type === "interaction"
    ? { ...part, interaction: { ...part.interaction, ...interaction } }
    : part,
  );
}

function markInteractionSubmitting(parts: AssistantMessagePart[], interactionId: string) {
  return parts.map((part) => part.type === "interaction" && part.interaction.id === interactionId
    ? { ...part, submission: "submitting" as const }
    : part,
  );
}

function markInteractionSubmitted(parts: AssistantMessagePart[], interactionId: string) {
  return parts.map((part) => part.type === "interaction" && part.interaction.id === interactionId
    ? { ...part, submission: "submitted" as const }
    : part,
  );
}

function markInteractionIdle(parts: AssistantMessagePart[], interactionId: string) {
  return parts.map((part) => part.type === "interaction" && part.interaction.id === interactionId
    ? { ...part, submission: "idle" as const }
    : part,
  );
}

function formatToolResult(event: Extract<ChatStreamEvent, { type: `tool.${string}` }>) {
  if (event.error) {
    return event.error;
  }
  // The chat runtime puts the actual tool output in the top-level `result`.
  // Metadata is only a compatibility fallback for events emitted by other
  // runtimes.  Ignoring `result` meant completed tool cards had no detail to
  // expand even though the backend had sent the output.
  if (event.result !== undefined) {
    return stringifyToolValue(event.result);
  }
  if (typeof event.metadata?.detail === "string" && event.metadata.detail.trim()) {
    return event.metadata.detail;
  }
  if (event.metadata?.result !== undefined) {
    return stringifyToolValue(event.metadata.result);
  }
  return "";
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }
  return -1;
}

function estimateConversationTokens(messages: ChatMessage[]): ConversationTokenUsage {
  return messages.reduce<ConversationTokenUsage>(
    (usage, message) => {
      // `parts` mirrors the rendered assistant content, so including it here
      // would count streamed text twice.
      const tokens = estimateTextTokens(message.text);

      if (message.role === "user") {
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

function estimateContextTokens(messages: ChatMessage[], draftMessage: string) {
  // Before the server returns its canonical baseline, include every piece of
  // context available in the live transcript, including tool arguments and
  // results rendered inside assistant message parts.
  const transcriptTokens = messages.reduce((total, message) => {
    if (message.role === "system") return total;
    const toolTokens = message.parts?.reduce((partTotal, part) => {
      if (part.type !== "tool") return partTotal;
      return partTotal
        + estimateTextTokens(part.name)
        + estimateTextTokens(stringifyToolValue(part.arguments))
        + estimateTextTokens(part.result ?? "")
        + estimateTextTokens(part.error ?? "");
    }, 0) ?? 0;
    return total + estimateTextTokens(message.text) + toolTokens + 4;
  }, 0);
  const draftTokens = estimateTextTokens(draftMessage);
  return transcriptTokens + (draftTokens > 0 ? draftTokens + 4 : 0);
}

function getModelContextWindow(
  agent: AgentProfile | null,
  providerConfigs: ProviderConfig[],
  providerConfigId: string,
  model: string,
) {
  if (!model) return 0;

  const configuredProvider = providerConfigs.find((config) => config.id === providerConfigId);
  const providerSettings = configuredProvider?.model_settings
    ?? agent?.llm?.providers?.[0]?.model_settings;
  const contextWindow = providerSettings?.[model]?.context_window;

  return Number.isSafeInteger(contextWindow) && (contextWindow ?? 0) > 0
    ? contextWindow
    : 0;
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

function formatCompactCount(count: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: count >= 1000 ? 1 : 0,
    notation: count >= 1000 ? "compact" : "standard",
  }).format(count);
}

function formatElapsedTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function isScrolledToBottom(element: HTMLDivElement) {
  const bottomGap =
    element.scrollHeight - element.scrollTop - element.clientHeight;

  return bottomGap <= 48;
}

function AgentSettingsDialog({
  agent,
  onClose,
  onSaved,
}: {
  agent: AgentProfile;
  onClose: () => void;
  onSaved: (agent: AgentProfile) => void;
}) {
  const [name, setName] = useState(agent.name);
  const [identity, setIdentity] = useState(agent.bio || "");
  const [capabilities, setCapabilities] = useState(agent.capabilities || "");
  const [occupation, setOccupation] = useState(agent.public_facts?.occupation || "");
  const [city, setCity] = useState(agent.public_facts?.city || "");
  const [values, setValues] = useState((agent.values ?? []).join(", "));
  const [speakingStyle, setSpeakingStyle] = useState(agent.speaking_style || "");
  const [boundaries, setBoundaries] = useState((agent.boundaries ?? []).join("\n"));
  const [handoffPolicy, setHandoffPolicy] = useState(agent.handoff_policy || "");
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
  const [selectedProviderConfigId, setSelectedProviderConfigId] = useState(agent.provider_config_id || "");
  const [isLoadingProviderConfigs, setIsLoadingProviderConfigs] = useState(true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const currentProvider = agent.llm?.default_provider;
  const currentModel = agent.llm?.default_model;

  const loadProviderConfigs = useCallback(async () => {
    setIsLoadingProviderConfigs(true);
    setError("");

    try {
      const response = await fetch("/api/provider-configs", { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "读取 Provider 配置失败。");
      }

      const configs = Array.isArray(data?.providerConfigs) ? data.providerConfigs : [];
      setProviderConfigs(configs);
      setSelectedProviderConfigId((current) => {
        if (current && configs.some((config: ProviderConfig) => config.id === current)) {
          return current;
        }

        const matchedConfig = configs.find((config: ProviderConfig) => (
          config.provider === currentProvider && config.default_model === currentModel
        ));

        return matchedConfig?.id || configs[0]?.id || "";
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取 Provider 配置失败。");
    } finally {
      setIsLoadingProviderConfigs(false);
    }
  }, [currentModel, currentProvider]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProviderConfigs();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProviderConfigs]);

  async function saveSettings() {
    if (!selectedProviderConfigId) {
      setError("请先选择一个已配置的 Provider。");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: agent.id,
          name,
          identity,
          capabilities,
          occupation,
          city,
          values: splitTags(values),
          speakingStyle,
          boundaries,
          handoffPolicy,
          providerConfigId: selectedProviderConfigId,
          visibility: agent.public_facts?.visibility || "private",
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "保存 Agent 配置失败。");
      }

      onSaved(data.agent);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存 Agent 配置失败。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="theme-overlay fixed inset-0 z-[100] flex items-center justify-center px-4 backdrop-blur-sm">
      <section className="theme-card max-h-[88vh] w-full max-w-[720px] overflow-y-auto rounded-[22px] border p-5 shadow-[0_30px_90px_rgba(25,35,70,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="theme-primary flex items-center gap-2 text-[13px] font-bold">
              <Settings size={16} />
              Agent Settings
            </p>
            <h2 className="theme-heading mt-2 text-[24px] font-bold tracking-normal">
              配置 {agent.name}
            </h2>
          </div>
          <button
            className="theme-button flex size-9 items-center justify-center rounded-[10px] border transition"
            onClick={onClose}
            type="button"
          >
            <CircleX size={19} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <SettingsField label="Agent 名称" onChange={setName} value={name} />
          <SettingsField label="职业 / 角色" onChange={setOccupation} value={occupation} />
          <SettingsField label="城市 / 时区" onChange={setCity} value={city} />
          <SettingsField label="价值观标签" onChange={setValues} value={values} />
        </div>

        <div className="mt-4 grid gap-4">
          <SettingsArea label="身份信息" onChange={setIdentity} value={identity} />
          <SettingsArea label="能力描述" onChange={setCapabilities} value={capabilities} />
          <SettingsArea label="说话风格" onChange={setSpeakingStyle} value={speakingStyle} />
          <SettingsArea label="Agent 边界" onChange={setBoundaries} value={boundaries} />
          <SettingsArea label="真人接入策略" onChange={setHandoffPolicy} value={handoffPolicy} />
        </div>

        <div className="theme-soft mt-5 rounded-[16px] border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="theme-heading text-[15px] font-bold">Provider 与 Model</h3>
              <p className="theme-muted mt-1 text-[13px] font-medium">
                这里仅选择配置中心里已保存的 Provider。
              </p>
            </div>
            <button
              className="theme-button inline-flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-bold transition"
              disabled={isLoadingProviderConfigs}
              onClick={loadProviderConfigs}
              type="button"
            >
              {isLoadingProviderConfigs ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
              刷新配置
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {providerConfigs.map((config) => {
              const active = selectedProviderConfigId === config.id;

              return (
                <button
                  className={`rounded-[13px] border px-4 py-3 text-left transition ${
                    active
                      ? "border-[var(--app-primary)] bg-[var(--app-surface-strong)] text-[var(--app-text)] shadow-[0_12px_24px_rgba(83,98,216,0.12)]"
                      : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:bg-[var(--app-surface-strong)]"
                  }`}
                  key={config.id}
                  onClick={() => setSelectedProviderConfigId(config.id)}
                  type="button"
                >
                  <span className="block text-[14px] font-bold">{config.name || config.provider}</span>
                  <span className="theme-muted mt-1 block truncate text-[13px] font-medium">
                    {config.provider} / {config.default_model}
                  </span>
                </button>
              );
            })}

            {!isLoadingProviderConfigs && providerConfigs.length === 0 && (
              <p className="rounded-[12px] border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
                还没有 Provider 配置。请先通过左侧 Settings 里的 Provider 功能保存一个配置。
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-[12px] border border-[#ffd8df] bg-[#fff1f3] px-4 py-3 text-[13px] font-semibold text-[#b4233a]">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            className="theme-button h-11 rounded-[12px] border px-5 text-[14px] font-bold transition"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="theme-primary-bg flex h-11 items-center gap-2 rounded-[12px] px-5 text-[14px] font-bold text-white shadow-[0_12px_24px_rgba(76,83,229,0.22)] transition disabled:cursor-not-allowed disabled:bg-[#b9bfd4]"
            disabled={isSaving}
            onClick={saveSettings}
            type="button"
          >
            {isSaving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
            保存配置
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingsField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="theme-muted-strong text-[13px] font-bold">{label}</span>
      <input
        className="theme-input mt-2 h-11 w-full rounded-[12px] border px-4 text-[14px] font-medium outline-none transition focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-ring)]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function SettingsArea({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="theme-muted-strong text-[13px] font-bold">{label}</span>
      <textarea
        className="theme-input mt-2 min-h-20 w-full resize-y rounded-[12px] border px-4 py-3 text-[14px] font-medium leading-6 outline-none transition focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-ring)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function AgentStatusAvatar({
  active,
  avatar,
  initials,
  size = "small",
}: {
  active: boolean;
  avatar?: AgentProfile["avatar"];
  initials: string;
  size?: "small" | "medium" | "large";
}) {
  const shellSize =
    size === "large" ? "size-[70px]" : size === "medium" ? "size-[50px]" : "size-9";
  const coreSize =
    size === "large" ? "size-[48px]" : size === "medium" ? "size-[34px]" : "size-6";
  const textSize =
    size === "large" ? "text-[22px]" : size === "medium" ? "text-[16px]" : "text-[12px]";
  const presetGradient = avatar?.gradient || "from-[#101733] via-[#5362d8] to-[#39c4a3]";

  return (
    <span
      aria-label={active ? "Agent 正在处理任务" : "Agent 空闲"}
      className={`theme-card relative flex ${shellSize} shrink-0 items-center justify-center rounded-full border shadow-[0_12px_30px_rgba(76,86,120,0.10)]`}
    >
      <span className={`absolute inset-1 rounded-full bg-gradient-to-br ${presetGradient}`} />
      <span
        className={`absolute inset-0 rounded-full border ${
          active
            ? "animate-ping border-[#8da0ff] opacity-50"
            : "border-[#bfeee5] opacity-70"
        }`}
      />
      <span
        className={`relative z-10 flex ${coreSize} items-center justify-center overflow-hidden rounded-full bg-[var(--app-surface-strong)] ${textSize} font-black text-[var(--app-text)] shadow-inner`}
      >
        {avatar?.type === "upload" && avatar.data_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="Agent 头像" className="h-full w-full object-cover" src={avatar.data_url} />
        ) : (
          avatar?.emoji || initials || <Target size={size === "large" ? 28 : size === "medium" ? 20 : 15} />
        )}
      </span>
      {active && (
        <span className="absolute left-3 right-3 top-1/2 z-10 h-px animate-pulse bg-[#b7c4ff]" />
      )}
      <span
        className={`absolute bottom-1 right-1 z-20 size-3 rounded-full border-2 border-white ${
          active ? "animate-pulse bg-[#5362d8]" : "bg-[#30c970]"
        }`}
      />
    </span>
  );
}

function ProcessingPill({ status }: { status: string }) {
  return (
    <span
      aria-live="polite"
      className="theme-card inline-flex min-h-10 max-w-[min(420px,82%)] items-center gap-3 rounded-[14px] rounded-bl-sm border px-4 py-2 text-[13px] font-bold leading-5 text-[var(--app-primary)] shadow-[0_12px_30px_rgba(76,86,120,0.06)]"
    >
      <Loader2 className="shrink-0 animate-spin" size={15} />
      {status}
      <span className="flex items-center gap-1 text-[#7f8ab0]" aria-hidden="true">
        <span className="size-1.5 animate-pulse rounded-full bg-current opacity-50" />
        <span className="size-1.5 animate-pulse rounded-full bg-current opacity-50 [animation-delay:150ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-current opacity-50 [animation-delay:300ms]" />
      </span>
    </span>
  );
}

const MessageBubble = memo(function MessageBubble({
  align,
  isStreaming,
  images,
  parts,
  role,
  speakerName,
  speakerRole,
  onInteractionResponse,
  text,
  taskElapsedMs,
}: {
  align: "left" | "right";
  isStreaming?: boolean;
  images?: string[];
  parts?: AssistantMessagePart[];
  role: ChatMessage["role"];
  speakerName?: string;
  speakerRole?: ChatMessage["speakerRole"];
  onInteractionResponse?: (interaction: Interaction, response: string) => void;
  text: string;
  taskElapsedMs?: number;
}) {
  const isRight = align === "right";
  const isSystem = role === "system";
  return (
    <div className={`flex ${isRight ? "justify-end" : isSystem ? "justify-center" : "justify-start"}`}>
      <div
        className={`rounded-[14px] px-5 py-4 shadow-[0_12px_30px_rgba(76,86,120,0.06)] ${
          isSystem
            ? "theme-system-message max-w-[min(520px,92%)] text-[#755923]"
            : ""
        } ${
          isRight
            ? "theme-user-message max-w-[min(520px,82%)] rounded-br-sm text-white"
            : isSystem
              ? ""
              : "theme-agent-message max-w-[min(860px,92%)] rounded-bl-sm"
        }`}
      >
        {role === "assistant" && speakerName && (
          <div className={`mb-2 flex items-center gap-1.5 text-[11px] font-black ${speakerRole === "expert" ? "text-[#0f8c78]" : "text-[var(--app-primary-strong)]"}`}>
            <span className={`size-1.5 rounded-full ${speakerRole === "expert" ? "bg-[#25b99f]" : "bg-[var(--app-primary)]"}`} />
            <span>{speakerRole === "expert" ? `专家 · ${speakerName}` : "SiinX"}</span>
            {taskElapsedMs !== undefined && <span className="font-semibold text-[#7b879e]">· 已用时 {formatElapsedTime(taskElapsedMs)}</span>}
          </div>
        )}
        {images?.length ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {images.map((src, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded images are stored as data URLs
              <img alt={`用户图片 ${index + 1}`} className="max-h-56 max-w-full rounded-[10px] object-cover" key={src} src={src} />
            ))}
          </div>
        ) : null}
        {role === "assistant" ? (
          <AssistantPartsRenderer
            isStreaming={Boolean(isStreaming)}
            parts={parts ?? []}
            fallbackText={text}
            onInteractionResponse={onInteractionResponse}
          />
        ) : (
          <div className={`${isSystem ? "text-[13px]" : "text-[16px]"} font-medium leading-[1.55]`}>
            <RichMessage text={text} tone={isSystem ? "system" : isRight ? "visitor" : "agent"} />
          </div>
        )}
      </div>
    </div>
  );
});

function AssistantPartsRenderer({
  fallbackText,
  isStreaming,
  parts,
  onInteractionResponse,
}: {
  fallbackText: string;
  isStreaming: boolean;
  parts: AssistantMessagePart[];
  onInteractionResponse?: (interaction: Interaction, response: string) => void;
}) {
  const hasRenderableParts = parts.some(
    (part) => part.type === "tool" || part.type === "interaction" || part.text.trim(),
  );

  return (
    <div className="space-y-3">
      {hasRenderableParts ? (
        parts.map((part) => {
          if (part.type === "text") {
            if (!part.text.trim()) {
              return null;
            }
            return (
              <div className="text-[16px] font-medium leading-[1.55]" key={part.id}>
                <RichMessage text={part.text} tone="agent" />
              </div>
            );
          }
          if (part.type === "thinking") {
            return <ThinkingRow key={part.id} text={part.text} />;
          }
          if (part.type === "interaction") {
            return <InteractionCard key={part.id} part={part} onSubmit={onInteractionResponse} />;
          }
          return <ToolCallRow key={part.id} part={part} />;
        })
      ) : fallbackText.trim() ? (
        <div className="text-[16px] font-medium leading-[1.55]">
          <RichMessage text={fallbackText} tone="agent" />
        </div>
      ) : isStreaming ? (
        <ProcessingPill status="正在分析任务" />
      ) : null}
    </div>
  );
}

function ThinkingRow({ text }: { text: string }) {
  return (
    <details className="assistant-thinking-row group overflow-hidden rounded-[12px] border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-[13px] font-bold marker:content-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-primary)]">
        <Sparkles className="assistant-thinking-row__icon shrink-0" size={15} />
        <span>思考过程</span>
        <ChevronDown className="ml-auto shrink-0 transition-transform duration-200 group-open:rotate-180" size={15} />
      </summary>
      <div className="assistant-thinking-row__content border-t px-3.5 py-3 text-[13px] font-medium leading-6 whitespace-pre-wrap">{text}</div>
    </details>
  );
}

function InteractionCard({
  part,
  onSubmit,
}: {
  part: InteractionPart;
  onSubmit?: (interaction: Interaction, response: string) => void;
}) {
  const [customResponse, setCustomResponse] = useState("");
  const isApproval = part.interaction.kind === "approval";
  const isHandled = part.interaction.status !== "pending" || part.submission === "submitting" || part.submission === "submitted";
  const detail = part.interaction.action ? `将执行：${part.interaction.action}` : "等待你的补充后继续";
  const submit = (response: string) => {
    if (!response.trim() || isHandled || !onSubmit) return;
    onSubmit(part.interaction, response.trim());
  };

  return (
    <section aria-label={isApproval ? "操作授权" : "需要补充的信息"} className={`overflow-hidden rounded-[14px] border ${isApproval ? "border-[#e7cf9a] bg-[#fffaf0]" : "border-[#cfd9fb] bg-[#f8faff]"}`}>
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-[11px] ${isApproval ? "bg-[#fff0c9] text-[#9a6600]" : "bg-[#e8edff] text-[#4c5ecc]"}`}>
          {isApproval ? <ShieldAlert size={18} /> : <MessageSquare size={18} />}
        </span>
        <div className="min-w-0">
          <p className={`text-[12px] font-black ${isApproval ? "text-[#8a5b00]" : "text-[#4456bf]"}`}>{isApproval ? "需要你的授权" : "需要你补充信息"}</p>
          <p className="mt-1 text-[15px] font-bold leading-6 text-[#263049]">{part.interaction.prompt}</p>
          <p className="mt-1.5 text-[12px] font-medium text-[#68748c]">{detail}</p>
        </div>
      </div>
      <div className="border-t border-black/5 px-4 py-3">
        {isApproval && part.interaction.action_arguments && (
          <pre className="mb-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-[10px] bg-[#fff4dc] px-3 py-2 text-[12px] font-medium leading-5 text-[#5f4a20]">{stringifyToolValue(part.interaction.action_arguments)}</pre>
        )}
        {part.interaction.options?.length ? (
          <div className="flex flex-wrap gap-2">
            {part.interaction.options.map((option) => (
              <button className="rounded-[10px] border border-[#c8d2f7] bg-white px-3 py-2 text-[13px] font-bold text-[#384ba8] transition hover:border-[#798be9] hover:bg-[#eef1ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5362d8] disabled:cursor-not-allowed disabled:opacity-50" disabled={isHandled} key={option} onClick={() => submit(option)} type="button">{option}</button>
            ))}
          </div>
        ) : null}
        {isApproval ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-[10px] bg-[#263b9c] px-3 py-2 text-[13px] font-bold text-white transition hover:bg-[#1e2f7d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5362d8] disabled:cursor-not-allowed disabled:opacity-50" disabled={isHandled} onClick={() => submit("approve")} type="button">确认并继续</button>
            <button className="rounded-[10px] border border-[#d5aeb2] bg-white px-3 py-2 text-[13px] font-bold text-[#9f3343] transition hover:bg-[#fff4f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c22943] disabled:cursor-not-allowed disabled:opacity-50" disabled={isHandled} onClick={() => submit("reject")} type="button">取消</button>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <input className="min-w-0 flex-1 rounded-[10px] border border-[#cfd7ee] bg-white px-3 py-2 text-[13px] font-medium text-[#263049] outline-none placeholder:text-[#8b96ae] focus:border-[#7182df] focus:ring-2 focus:ring-[#7182df]/20 disabled:cursor-not-allowed disabled:opacity-50" disabled={isHandled} onChange={(event) => setCustomResponse(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(customResponse); }} placeholder="输入你的回复…" value={customResponse} />
            <button className="rounded-[10px] bg-[#5362d8] px-3 py-2 text-[13px] font-bold text-white transition hover:bg-[#4351c1] disabled:cursor-not-allowed disabled:opacity-50" disabled={isHandled || !customResponse.trim()} onClick={() => submit(customResponse)} type="button">提交</button>
          </div>
        )}
        {isHandled && <p className="mt-3 text-[12px] font-bold text-[#65718a]">{part.submission === "submitting" ? "已提交，Agent 正在继续处理…" : "此交互已处理。"}</p>}
      </div>
    </section>
  );
}

function ToolCallRow({ part }: { part: ToolCallPart }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(
    stringifyToolValue(part.arguments).trim() ||
      part.result?.trim() ||
      part.error?.trim(),
  );

  return (
    <div className="assistant-tool-call rounded-[12px] border border-[#dfe5f0] bg-white/72">
      <button
        className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left"
        disabled={!hasDetail}
        onClick={() => setExpanded((open) => !open)}
        type="button"
      >
        <ToolStatusIcon status={part.status} />
        <span className="assistant-tool-call__name min-w-0 flex-1 truncate text-[13px] font-bold text-[#263049]">
          {part.name}
          {part.arguments !== undefined && (
            <span className="assistant-tool-call__arguments font-semibold text-[#6d778e]">
              （{compactToolArguments(part.arguments)}）
            </span>
          )}
        </span>
        {hasDetail && (
          <ChevronDown
            className={`assistant-tool-call__chevron shrink-0 text-[#7b879e] transition ${expanded ? "rotate-180" : ""}`}
            size={15}
          />
        )}
      </button>
      {expanded && hasDetail && (
        <div className="assistant-tool-call__details border-t border-[#e5eaf3] px-3 py-3">
          {part.arguments !== undefined && (
            <ToolDetailBlock label="入参" value={stringifyToolValue(part.arguments)} />
          )}
          {part.result && (
            <ToolDetailBlock label="结果" value={part.result} />
          )}
          {part.error && part.error !== part.result && (
            <ToolDetailBlock tone="error" label="错误" value={part.error} />
          )}
        </div>
      )}
    </div>
  );
}

function ToolStatusIcon({ status }: { status: ToolCallPart["status"] }) {
  if (status === "completed") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#e7f8ee] text-[12px] font-black text-[#24965a]">
        ✓
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#fff1f3] text-[13px] font-black text-[#c22943]">
        ×
      </span>
    );
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#edf1ff] text-[#5362d8]">
      <Loader2 className="animate-spin" size={12} />
    </span>
  );
}

function ToolDetailBlock({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "error";
  value: string;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className={`assistant-tool-call__label mb-1 text-[12px] font-bold ${tone === "error" ? "text-[#b4233a]" : "text-[#5362d8]"}`}>
        {label}
      </p>
      <pre
        aria-label={`${label}（最多显示 10 行，可滚动查看完整内容）`}
        className="assistant-tool-call__value max-h-[224px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-[#f6f8fc] p-3 text-[12px] font-medium leading-5 text-[#263049]"
      >
        {value}
      </pre>
    </div>
  );
}

function compactToolArguments(value: unknown) {
  const text = stringifyToolValue(value).replace(/\s+/g, " ").trim();
  if (!text) {
    return "无入参";
  }
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

function stringifyToolValue(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
