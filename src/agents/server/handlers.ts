import { mkdir } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { platformPaths } from "@backend/config/paths";
import {
  readListTable,
  readObjectTable,
  tablePath,
  writeJson,
  type ObjectTable,
} from "@backend/shared/database";
import {
  ensureSiinXAgent,
  SIINX_AGENT_TYPE,
  EXPERT_AGENT_TYPE,
} from "@backend/lib/agent-identity";

type CreateAgentPayload = {
  name?: string;
  identity?: string;
  capabilities?: string;
  avatar?: {
    type?: "preset" | "upload";
    preset_id?: string;
    label?: string;
    emoji?: string;
    gradient?: string;
    data_url?: string;
    file_name?: string;
  };
  providerConfigId?: string;
  model?: string;
  temperature?: number;
  city?: string;
  occupation?: string;
  speakingStyle?: string;
  values?: string[];
  boundaries?: string;
  handoffPolicy?: string;
  visibility?: "private" | "unlisted" | "public";
  clearProvider?: boolean;
  runtime?: {
    kind?: "eido-local" | "remote-ndjson";
    endpoint?: string;
    remoteAgentId?: string;
  };
};

const DEFAULT_HANDOFF_POLICY =
  "当访客明确希望联系真人，或问题超出 Agent 可回答范围时，建议发起真人接入。";
const DEFAULT_MAX_AGENTS_PER_USER = 999;

type ResolvedLlmConfig = {
  id: string;
  provider: string;
  default_model: string;
  models: string[];
  model_settings: ObjectTable;
  api_base: string;
  api_key_env: string;
  protocol: string;
  auth_header: string;
};

export async function listAgents(request: NextRequest) {
  const databaseDir = platformPaths().databaseDir;
  const user = resolveRequestUser(request, new Date().toISOString());

  if (!user) {
    return NextResponse.json({ user: null, agents: [] });
  }

  const siinXAgent = await ensureSiinXAgent(databaseDir, user);
  const agents = await readObjectTable(databaseDir, "agents");
  const ownedAgents = Object.values(agents).flatMap((agent) => {
    return isRecord(agent) && agent.owner_user_id === user.id ? [agent] : [];
  }).sort((a, b) => Number(b.id === siinXAgent.id) - Number(a.id === siinXAgent.id));

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    agents: ownedAgents,
    siinXAgentId: siinXAgent.id,
    limits: {
      maxAgentsPerUser: getMaxAgentsPerUser(),
      remainingAgents: Math.max(0, getMaxAgentsPerUser() - ownedAgents.length),
    },
  });
}

export async function createAgent(request: NextRequest) {
  let payload: CreateAgentPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  const name = payload.name?.trim();
  const identity = payload.identity?.trim();
  const capabilities = payload.capabilities?.trim();

  if (!name || !identity || !capabilities) {
    return NextResponse.json(
      { error: "Agent 名称、身份信息和能力描述是必填项。" },
      { status: 400 },
    );
  }

  const agentId = uniqueId(slugify(name));
  const workspaceName = "workspace";
  const workspaceDir = platformPaths().workspaceDir;
  const databaseDir = platformPaths().databaseDir;
  const now = new Date().toISOString();
  const user = resolveRequestUser(request, now);

  if (!user) {
    return NextResponse.json({ error: "请先登录后再创建 Agent。" }, { status: 401 });
  }

  const runtime = normalizeRuntime(payload.runtime);
  const llmConfig = runtime.kind === "remote-ndjson"
    ? null
    : await resolveLlmConfig(databaseDir, payload, user.id);

  if (!llmConfig && runtime.kind !== "remote-ndjson") {
    return NextResponse.json(
      { error: "请先配置 Provider 和 Model，并在创建 Agent 时选择一个模型。" },
      { status: 400 },
    );
  }

  const profile = {
    id: agentId,
    name,
    bio: identity,
    capabilities,
    avatar: normalizeAvatar(payload.avatar, name),
    provider_config_id: llmConfig?.id,
    allowed_providers: llmConfig ? [llmConfig.provider] : [],
    llm: llmConfig ? {
      default_provider: llmConfig.provider,
      default_model: llmConfig.default_model,
      providers: [
        {
          provider: llmConfig.provider,
          protocol: llmConfig.protocol,
          api_base: llmConfig.api_base,
          api_key_env: llmConfig.api_key_env,
          auth_header: llmConfig.auth_header,
          default_model: llmConfig.default_model,
          models: llmConfig.models,
          model_settings: llmConfig.model_settings,
          temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
          mock_when_no_key: true,
        },
      ],
    } : { default_provider: null, default_model: null, providers: [] },
    runtime,
    workspace_dir: workspaceName,
    owner_user_id: user.id,
    agent_type: EXPERT_AGENT_TYPE,
    interaction_mode: "task_only",
    is_default: false,
    system_managed: false,
    values: normalizeList(payload.values),
    speaking_style: payload.speakingStyle?.trim() || "自然、简洁、会先澄清需求再行动。",
    boundaries: splitLines(payload.boundaries),
    public_facts: {
      city: payload.city?.trim() ?? "",
      occupation: payload.occupation?.trim() ?? "",
      visibility: payload.visibility ?? "private",
    },
    private_facts: {},
    handoff_policy: payload.handoffPolicy?.trim() || DEFAULT_HANDOFF_POLICY,
    created_at: now,
    updated_at: now,
  };

  const workspace = {
    id: workspaceName,
    agent_id: agentId,
    owner_user_id: user.id,
    name: workspaceName,
    path: profile.workspace_dir,
    absolute_path: workspaceDir,
    created_at: now,
    updated_at: now,
  };

  try {
    await mkdir(databaseDir, { recursive: true });
    const ownedAgents = await findAgentsByOwner(databaseDir, user.id);
    const maxAgentsPerUser = getMaxAgentsPerUser();
    if (ownedAgents.length >= maxAgentsPerUser) {
      return NextResponse.json(
        {
          error: `当前账户最多可创建 ${maxAgentsPerUser} 个 Agent。`,
          limit: maxAgentsPerUser,
          current: ownedAgents.length,
        },
        { status: 409 },
      );
    }

    await mkdir(workspaceDir, { recursive: true });

    await Promise.all([
      mergeObjectTable(databaseDir, "users", user.id, user),
      upsertObjectTable(databaseDir, "agents", agentId, profile),
      upsertObjectTable(databaseDir, "agent_memories", agentId, ""),
      upsertObjectTable(databaseDir, "workspaces", agentId, workspace),
      ensureObjectTable(databaseDir, "sessions"),
      ensureListTable(databaseDir, "agent_history"),
    ]);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建 Agent 失败。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    agent: profile,
    database: {
      users: "database/users.json",
      agents: "database/agents.json",
      memories: "database/agent_memories.json",
      workspaces: "database/workspaces.json",
    },
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    workspace: {
      name: workspaceName,
      path: profile.workspace_dir,
    },
  });
}

export async function updateAgent(request: NextRequest) {
  let payload: CreateAgentPayload & { id?: string };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  const databaseDir = platformPaths().databaseDir;
  const user = resolveRequestUser(request, new Date().toISOString());

  if (!user) {
    return NextResponse.json({ error: "请先登录后再修改 Agent。" }, { status: 401 });
  }

  const agents = await readObjectTable(databaseDir, "agents");
  const currentAgent = Object.values(agents).find((agent) => {
    return isRecord(agent) && agent.owner_user_id === user.id && (!payload.id || agent.id === payload.id);
  });

  if (!isRecord(currentAgent) || typeof currentAgent.id !== "string") {
    return NextResponse.json({ error: "当前用户还没有 Agent。" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const currentLlm = isRecord(currentAgent.llm) ? currentAgent.llm : {};
  const currentPublicFacts = isRecord(currentAgent.public_facts) ? currentAgent.public_facts : {};
  const llmConfig = payload.clearProvider
    ? null
    : await resolveLlmConfig(databaseDir, payload, user.id, currentAgent);

  const updatedAgent = {
    ...currentAgent,
    name: payload.name?.trim() || currentAgent.name,
    bio: payload.identity?.trim() || currentAgent.bio,
    capabilities: payload.capabilities?.trim() || currentAgent.capabilities,
    avatar: normalizeAvatar(payload.avatar, String(currentAgent.name || "Agent"), currentAgent.avatar),
    provider_config_id: payload.clearProvider ? undefined : (llmConfig?.id ?? currentAgent.provider_config_id),
    allowed_providers: payload.clearProvider ? [] : (llmConfig ? [llmConfig.provider] : currentAgent.allowed_providers),
    llm: payload.clearProvider
      ? { ...currentLlm, default_provider: null, default_model: null, providers: [] }
      : (llmConfig ? buildAgentLlm(currentLlm, llmConfig, payload.temperature) : currentLlm),
    values: normalizeList(payload.values),
    speaking_style: payload.speakingStyle?.trim() || currentAgent.speaking_style,
    boundaries: splitLines(payload.boundaries),
    public_facts: {
      ...currentPublicFacts,
      city: payload.city?.trim() ?? currentPublicFacts.city ?? "",
      occupation: payload.occupation?.trim() ?? currentPublicFacts.occupation ?? "",
      visibility: payload.visibility ?? currentPublicFacts.visibility ?? "private",
    },
    handoff_policy: payload.handoffPolicy?.trim() || currentAgent.handoff_policy,
    agent_type: currentAgent.agent_type === SIINX_AGENT_TYPE ? SIINX_AGENT_TYPE : EXPERT_AGENT_TYPE,
    interaction_mode: currentAgent.agent_type === SIINX_AGENT_TYPE ? "conversation" : "task_only",
    is_default: currentAgent.agent_type === SIINX_AGENT_TYPE,
    system_managed: currentAgent.agent_type === SIINX_AGENT_TYPE,
    runtime: payload.runtime ? normalizeRuntime(payload.runtime) : currentAgent.runtime ?? { kind: "eido-local" },
    updated_at: now,
  };

  agents[currentAgent.id] = updatedAgent;
  await writeJson(tablePath(databaseDir, "agents"), agents);

  return NextResponse.json({ agent: updatedAgent });
}

async function findAgentsByOwner(databaseDir: string, ownerUserId: string) {
  const agents = await readObjectTable(databaseDir, "agents");
  return Object.values(agents).filter((agent) => {
    return isRecord(agent) && agent.owner_user_id === ownerUserId;
  });
}

function getMaxAgentsPerUser() {
  const configured = Number.parseInt(process.env.EIDO_MAX_AGENTS_PER_USER ?? "", 10);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_AGENTS_PER_USER;
}

async function upsertObjectTable(
  databaseDir: string,
  tableName: string,
  rowId: string,
  row: unknown,
) {
  const table = await readObjectTable(databaseDir, tableName);
  table[rowId] = row;
  await writeJson(tablePath(databaseDir, tableName), table);
}

async function mergeObjectTable(
  databaseDir: string,
  tableName: string,
  rowId: string,
  row: ObjectTable,
) {
  const table = await readObjectTable(databaseDir, tableName);
  const existing = isRecord(table[rowId]) ? table[rowId] : {};
  table[rowId] = { ...existing, ...row };
  await writeJson(tablePath(databaseDir, tableName), table);
}

async function ensureObjectTable(databaseDir: string, tableName: string) {
  const table = await readObjectTable(databaseDir, tableName);
  await writeJson(tablePath(databaseDir, tableName), table);
}

async function ensureListTable(databaseDir: string, tableName: string) {
  const filePath = tablePath(databaseDir, tableName);
  const table = await readListTable(databaseDir, tableName);
  await writeJson(filePath, table);
}

function isRecord(value: unknown): value is ObjectTable {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeList(values: string[] | undefined) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeRuntime(value: CreateAgentPayload["runtime"]) {
  if (!value || value.kind !== "remote-ndjson") return { kind: "eido-local" as const };
  const endpoint = value.endpoint?.trim() || "";
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return {
      kind: "remote-ndjson" as const,
      endpoint: parsed.toString().replace(/\/$/, ""),
      remote_agent_id: value.remoteAgentId?.trim() || undefined,
      protocol_version: "eido-agent/v1" as const,
    };
  } catch {
    throw new Error("远程 Agent Server 地址必须是有效的 HTTP(S) URL。");
  }
}

async function resolveLlmConfig(
  databaseDir: string,
  payload: CreateAgentPayload,
  ownerUserId: string,
  currentAgent?: ObjectTable,
): Promise<ResolvedLlmConfig | null> {
  const providerConfigId = payload.providerConfigId?.trim();

  if (providerConfigId) {
    const configs = await readObjectTable(databaseDir, "provider_configs");
    const providerConfig = configs[providerConfigId];

    if (!isRecord(providerConfig) || providerConfig.owner_user_id !== ownerUserId) {
      return null;
    }

    const provider = stringValue(providerConfig.provider);
    const models = normalizeUnknownList(providerConfig.models, stringValue(providerConfig.default_model));
    const requestedModel = payload.model?.trim();
    const defaultModel = requestedModel || stringValue(providerConfig.default_model);

    if (!provider || !defaultModel || !models.includes(defaultModel)) {
      return null;
    }

    return {
      id: providerConfigId,
      provider,
      default_model: defaultModel,
      models,
      model_settings: isRecord(providerConfig.model_settings) ? providerConfig.model_settings : {},
      api_base: stringValue(providerConfig.api_base) || "https://api.openai.com/v1",
      api_key_env: stringValue(providerConfig.api_key_env) || "OPENAI_API_KEY",
      protocol: stringValue(providerConfig.protocol) || "openai",
      auth_header: stringValue(providerConfig.auth_header) || "authorization_bearer",
    };
  }

  if (currentAgent) {
    const currentLlm = isRecord(currentAgent.llm) ? currentAgent.llm : {};
    const currentProvider = stringValue(currentLlm.default_provider);
    const currentModel = stringValue(currentLlm.default_model);
    const providerSettings = Array.isArray(currentLlm.providers) && isRecord(currentLlm.providers[0])
      ? currentLlm.providers[0]
      : {};

    if (currentProvider && currentModel) {
      return {
        id: stringValue(currentAgent.provider_config_id),
        provider: currentProvider,
        default_model: currentModel,
        models: normalizeUnknownList(providerSettings.models, currentModel),
        model_settings: isRecord(providerSettings.model_settings) ? providerSettings.model_settings : {},
        api_base: stringValue(providerSettings.api_base) || "https://api.openai.com/v1",
        api_key_env: stringValue(providerSettings.api_key_env) || "OPENAI_API_KEY",
        protocol: stringValue(providerSettings.protocol) || "openai",
        auth_header: stringValue(providerSettings.auth_header) || "authorization_bearer",
      };
    }
  }

  return null;
}

function buildAgentLlm(
  currentLlm: ObjectTable,
  llmConfig: ResolvedLlmConfig,
  temperature: number | undefined,
) {
  return {
    ...currentLlm,
    default_provider: llmConfig.provider,
    default_model: llmConfig.default_model,
    providers: [
      {
        provider: llmConfig.provider,
        protocol: llmConfig.protocol,
        api_base: llmConfig.api_base,
        api_key_env: llmConfig.api_key_env,
        auth_header: llmConfig.auth_header,
        default_model: llmConfig.default_model,
        models: llmConfig.models,
        model_settings: llmConfig.model_settings,
        temperature: typeof temperature === "number" ? temperature : 0.7,
        mock_when_no_key: true,
      },
    ],
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUnknownList(value: unknown, fallback: string) {
  const values = Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean)
    : [];

  return Array.from(new Set([fallback, ...values].filter(Boolean)));
}

function normalizeAvatar(
  avatar: CreateAgentPayload["avatar"],
  fallbackName: string,
  currentAvatar?: unknown,
) {
  if (!avatar) {
    if (currentAvatar) {
      return currentAvatar;
    }

    return {
      type: "preset",
      preset_id: "focus",
      label: "专注",
      emoji: fallbackName.trim().slice(0, 1) || "A",
      gradient: "from-slate-900 via-blue-700 to-teal-500",
    };
  }

  if (avatar.type === "upload" && avatar.data_url?.startsWith("data:image/")) {
    return {
      type: "upload",
      data_url: avatar.data_url,
      file_name: avatar.file_name?.trim() || "",
    };
  }

  return {
    type: "preset",
    preset_id: avatar.preset_id?.trim() || "focus",
    label: avatar.label?.trim() || "预置头像",
    emoji: avatar.emoji?.trim() || fallbackName.trim().slice(0, 1) || "A",
    gradient: avatar.gradient?.trim() || "from-slate-900 via-blue-700 to-teal-500",
  };
}

function resolveRequestUser(request: NextRequest, now: string) {
  const id =
    request.headers.get("x-eido-user-id")?.trim() ||
    request.cookies.get("eido_user_id")?.value.trim();

  if (!id) {
    return null;
  }

  const email =
    request.headers.get("x-eido-user-email")?.trim() ||
    decodeCookieValue(request.cookies.get("eido_user_email")?.value.trim()) ||
    null;
  const name =
    request.headers.get("x-eido-user-name")?.trim() ||
    decodeCookieValue(request.cookies.get("eido_user_name")?.value.trim()) ||
    "本地用户";

  return {
    id,
    email,
    name,
    created_at: now,
    updated_at: now,
  };
}

function decodeCookieValue(value: string | undefined) {
  if (!value) {
    return "";
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitLines(value: string | undefined) {
  return (value ?? "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "agent";
}

function uniqueId(baseId: string) {
  return `${baseId}-${Date.now().toString(36)}`;
}
