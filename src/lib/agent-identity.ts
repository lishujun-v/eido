import {
  readObjectTable,
  tablePath,
  writeJson,
  type ObjectTable,
} from "@backend/shared/database";

export const SIINX_AGENT_TYPE = "siinx";
export const EXPERT_AGENT_TYPE = "expert";
const DEFAULT_SIINX_TOOL_IDS = [
  "remember_owner_fact", "delegate_task", "update_sustained_goal",
  "read_file", "write_file", "edit_file", "apply_patch", "list_dir",
  "find_files", "grep", "exec_command", "web_search", "web_fetch",
  "knowledge_search", "browser",
];
const DEFAULT_SIINX_SKILL_IDS = ["agent-manage"];

export async function ensureSiinXAgent(
  databaseDir: string,
  user: ObjectTable,
) {
  const userId = stringValue(user.id);
  if (!userId) {
    throw new Error("无法为缺少用户标识的账号创建默认分身。");
  }

  const [users, agents] = await Promise.all([
    readObjectTable(databaseDir, "users"),
    readObjectTable(databaseDir, "agents"),
  ]);
  const storedUser = isRecord(users[userId]) ? users[userId] : user;
  const configuredId = stringValue(storedUser.siinx_agent_id || storedUser.personal_agent_id);
  const ownedAgents = Object.values(agents).flatMap((agent) =>
    isRecord(agent) && agent.owner_user_id === userId ? [agent] : [],
  );
  const configured = configuredId && isRecord(agents[configuredId]) && agents[configuredId].owner_user_id === userId
    ? agents[configuredId]
    : null;
  const existingSiinX: ObjectTable | undefined = ownedAgents.find(
    (agent) => agent.agent_type === SIINX_AGENT_TYPE || agent.agent_type === "personal" || agent.is_default === true,
  );
  const siinX = configured || existingSiinX || ownedAgents[0] || null;
  const now = new Date().toISOString();

  let siinXAgent: ObjectTable;
  if (siinX && typeof siinX.id === "string") {
    siinXAgent = {
      ...siinX,
      agent_type: SIINX_AGENT_TYPE,
      interaction_mode: "conversation",
      is_default: true,
      system_managed: true,
      enabled_tool_ids: Array.isArray(siinX.enabled_tool_ids) && siinX.enabled_tool_ids.length
        ? Array.from(new Set([...siinX.enabled_tool_ids, "knowledge_search", "browser"]))
        : DEFAULT_SIINX_TOOL_IDS,
      enabled_skill_ids: Array.isArray(siinX.enabled_skill_ids)
        ? Array.from(new Set([...siinX.enabled_skill_ids, ...DEFAULT_SIINX_SKILL_IDS]))
        : DEFAULT_SIINX_SKILL_IDS,
      updated_at: now,
    };
  } else {
    siinXAgent = buildDefaultSiinXAgent(userId, stringValue(storedUser.name), now);
  }

  for (const agent of ownedAgents) {
    if (typeof agent.id !== "string" || agent.id === siinXAgent.id) {
      continue;
    }
    agents[agent.id] = {
      ...agent,
      agent_type: EXPERT_AGENT_TYPE,
      interaction_mode: "task_only",
      is_default: false,
      system_managed: false,
    };
  }
  agents[String(siinXAgent.id)] = siinXAgent;
  users[userId] = {
    ...user,
    ...storedUser,
    siinx_agent_id: siinXAgent.id,
    updated_at: now,
  };

  const memories = await readObjectTable(databaseDir, "agent_memories");
  memories[String(siinXAgent.id)] ??= "";
  await Promise.all([
    writeJson(tablePath(databaseDir, "users"), users),
    writeJson(tablePath(databaseDir, "agents"), agents),
    writeJson(tablePath(databaseDir, "agent_memories"), memories),
  ]);

  return siinXAgent;
}

function buildDefaultSiinXAgent(userId: string, userName: string, now: string): ObjectTable {
  const id = `siinx-${Date.now().toString(36)}`;
  const name = "SiinX";
  return {
    id,
    name,
    bio: "我是另一个你，按照你的性格、表达习惯和判断方式与你交流，也能替你在 SiinX 中处理事情。",
    capabilities: "可以与你持续对话、使用获准的 SiinX 工具，并协调其他工作 Agent 完成任务；不会主动用产品说明式语言介绍自己。",
    avatar: {
      type: "preset",
      preset_id: "focus",
      label: "数字分身",
      emoji: "我",
      gradient: "from-violet-600 via-blue-600 to-cyan-500",
    },
    allowed_providers: [],
    llm: { default_provider: null, default_model: null, providers: [] },
    // All agents operate in the shared application workspace. Agent-specific
    // configuration (such as enabled tools and skills) lives in the database.
    workspace_dir: "workspace",
    owner_user_id: userId,
    agent_type: SIINX_AGENT_TYPE,
    interaction_mode: "conversation",
    is_default: true,
    system_managed: true,
    runtime: { kind: "eido-local" },
    values: ["像本人一样思考和表达", "忠实于用户意图", "行动边界清晰"],
    speaking_style: "像本人一样自然、直接、简洁地说话；简单问题优先一句话回答，可以有口语和轻微调侃；不使用客服话术，不主动介绍 Agent 身份、能力或规则，不在结尾机械地询问还有什么可以帮忙。",
    boundaries: ["不替用户进行未经确认的敏感或不可逆操作。"],
    public_facts: { city: "", occupation: "我的数字分身", visibility: "private" },
    private_facts: {},
    enabled_tool_ids: DEFAULT_SIINX_TOOL_IDS,
    enabled_skill_ids: DEFAULT_SIINX_SKILL_IDS,
    handoff_policy: "遇到高风险、不可逆或权限不足的操作时，请求用户确认。",
    created_at: now,
    updated_at: now,
  };
}

function isRecord(value: unknown): value is ObjectTable {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
