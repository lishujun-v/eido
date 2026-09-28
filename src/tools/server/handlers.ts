import { NextRequest, NextResponse } from "next/server";
import { platformPaths } from "@backend/config/paths";
import {
  readObjectTable,
  tablePath,
  writeJson,
  type ObjectTable,
} from "@backend/shared/database";

type ToolPayload = {
  id?: string;
  ids?: string[];
  name?: string;
  description?: string;
  method?: string;
  endpoint?: string;
  parameters?: unknown;
  agentId?: string;
  enabledToolIds?: string[];
};

const BUILTIN_TOOLS = [
  {
    id: "remember_owner_fact",
    name: "remember_owner_fact",
    description: "Save durable facts explicitly supplied by the SiinX owner.",
    source: "siinx",
    kind: "builtin",
    availableTo: "siinx",
  },
  {
    id: "delegate_task",
    name: "delegate_task",
    description: "Delegate a bounded subtask to an equipped expert.",
    source: "siinx",
    kind: "builtin",
    availableTo: "siinx",
  },
  {
    id: "update_sustained_goal",
    name: "update_sustained_goal",
    description: "Track an explicit long-running objective in a SiinX conversation.",
    source: "siinx",
    kind: "builtin",
    availableTo: "siinx",
  },
  {
    id: "web_search",
    name: "web_search",
    description: "Search current public information through Baidu AI Search.",
    source: "eido-local",
    kind: "builtin",
  },
  {
    id: "web_fetch",
    name: "web_fetch",
    description: "Fetch and read the contents of a web page.",
    source: "nanobot",
    kind: "builtin",
  },
  {
    id: "knowledge_search",
    name: "knowledge_search",
    description: "Search only the knowledge spaces bound to the current Agent.",
    source: "eido-local",
    kind: "builtin",
  },
  {
    id: "browser",
    name: "browser",
    description: "Open and operate a browser with live visual feedback in the chat workspace.",
    source: "eido-local",
    kind: "builtin",
  },
  {
    id: "read_file",
    name: "read_file",
    description: "Read files from the agent workspace.",
    source: "nanobot",
    kind: "builtin",
  },
  {
    id: "write_file",
    name: "write_file",
    description: "Write files in the agent workspace.",
    source: "nanobot",
    kind: "builtin",
  },
  {
    id: "edit_file",
    name: "edit_file",
    description: "Edit files in the agent workspace.",
    source: "nanobot",
    kind: "builtin",
  },
  {
    id: "exec_command",
    name: "exec_command",
    description: "Run shell commands in the agent workspace.",
    source: "nanobot",
    kind: "builtin",
  },
  {
    id: "apply_patch",
    name: "apply_patch",
    description: "Apply structured source-code patches.",
    source: "nanobot",
    kind: "builtin",
  },
  {
    id: "list_dir",
    name: "list_dir",
    description: "List files in the agent workspace.",
    source: "nanobot",
    kind: "builtin",
  },
  {
    id: "find_files",
    name: "find_files",
    description: "Find files in the agent workspace.",
    source: "nanobot",
    kind: "builtin",
  },
  {
    id: "grep",
    name: "grep",
    description: "Search text within files in the agent workspace.",
    source: "nanobot",
    kind: "builtin",
  },
  {
    id: "image_generation",
    name: "image_generation",
    description: "Generate images when the model asks for visual output.",
    source: "nanobot",
    kind: "builtin",
  },
];

export async function listTools(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ tools: [], agents: [] });
  }

  const databaseDir = platformPaths().databaseDir;
  const [tools, agents, mcpServers] = await Promise.all([
    readObjectTable(databaseDir, "tools"),
    readObjectTable(databaseDir, "agents"),
    readObjectTable(databaseDir, "mcp_servers"),
  ]);
  const customTools = Object.values(tools)
    .flatMap((tool) => {
      if (!isRecord(tool) || tool.owner_user_id !== userId) {
        return [];
      }
      return [{
        id: stringValue(tool.id),
        name: stringValue(tool.name),
        description: stringValue(tool.description),
        source: "custom",
        kind: stringValue(tool.kind) || "http",
        method: stringValue(tool.method) || "POST",
        endpoint: stringValue(tool.endpoint),
        parameters: isRecord(tool.parameters) ? tool.parameters : defaultParametersSchema(),
        createdAt: stringValue(tool.created_at),
        updatedAt: stringValue(tool.updated_at),
      }];
    })
    .filter((tool) => tool.id && tool.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  const ownedAgents = Object.values(agents)
    .flatMap((agent) => {
      if (!isRecord(agent) || agent.owner_user_id !== userId) {
        return [];
      }
      return [{
        id: stringValue(agent.id),
        name: stringValue(agent.name) || "Agent",
        enabledToolIds: normalizeToolIds(agent.enabled_tool_ids),
      }];
    })
    .filter((agent) => agent.id);
  const mcpTools = flattenMcpTools(mcpServers, userId);

  return NextResponse.json({
    tools: [...BUILTIN_TOOLS, ...customTools, ...mcpTools],
    builtinToolIds: BUILTIN_TOOLS.map((tool) => tool.id),
    agents: ownedAgents,
  });
}

export async function createTool(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ error: "请先登录后再新增 Tool。" }, { status: 401 });
  }

  const payload = await readPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  const validation = validateToolPayload(payload);
  if (validation.error) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const databaseDir = platformPaths().databaseDir;
  const tools = await readObjectTable(databaseDir, "tools");
  const name = validation.name;
  const duplicate = Object.values(tools).some((tool) => {
    return isRecord(tool) && tool.owner_user_id === userId && stringValue(tool.name) === name;
  });

  if (duplicate || BUILTIN_TOOLS.some((tool) => tool.name === name)) {
    return NextResponse.json({ error: "Tool name 已存在，请换一个名称。" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const id = uniqueId(`tool_${name}`);
  const tool = {
    id,
    owner_user_id: userId,
    kind: "http",
    name,
    description: validation.description,
    method: validation.method,
    endpoint: validation.endpoint,
    parameters: validation.parameters,
    created_at: now,
    updated_at: now,
  };

  tools[id] = tool;
  await writeJson(tablePath(databaseDir, "tools"), tools);
  return NextResponse.json({ tool });
}

export async function updateTool(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ error: "请先登录后再配置 Tool。" }, { status: 401 });
  }

  const payload = await readPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  const databaseDir = platformPaths().databaseDir;

  if (payload.agentId) {
    const agents = await readObjectTable(databaseDir, "agents");
    const agent = agents[payload.agentId];

    if (!isRecord(agent) || agent.owner_user_id !== userId) {
      return NextResponse.json({ error: "Agent 不存在或无权配置。" }, { status: 404 });
    }

    const [tools, mcpServers] = await Promise.all([
      readObjectTable(databaseDir, "tools"),
      readObjectTable(databaseDir, "mcp_servers"),
    ]);
    const availableIds = new Set([
      ...BUILTIN_TOOLS
        .filter((tool) => tool.availableTo !== "siinx" || agent.agent_type === "siinx")
        .map((tool) => tool.id),
      ...Object.values(tools)
        .flatMap((tool) => {
          if (!isRecord(tool) || tool.owner_user_id !== userId) {
            return [];
          }
          return [stringValue(tool.id)];
        })
        .filter(Boolean),
      ...flattenMcpTools(mcpServers, userId).map((tool) => tool.id),
    ]);
    const enabledToolIds = normalizeToolIds(payload.enabledToolIds)
      .filter((id) => availableIds.has(id));

    agents[payload.agentId] = {
      ...agent,
      enabled_tool_ids: enabledToolIds,
      updated_at: new Date().toISOString(),
    };
    await writeJson(tablePath(databaseDir, "agents"), agents);
    return NextResponse.json({ agent: agents[payload.agentId] });
  }

  const toolId = payload.id?.trim();
  if (!toolId) {
    return NextResponse.json({ error: "缺少 Tool 或 Agent 标识。" }, { status: 400 });
  }

  const tools = await readObjectTable(databaseDir, "tools");
  const currentTool = tools[toolId];
  if (!isRecord(currentTool) || currentTool.owner_user_id !== userId) {
    return NextResponse.json({ error: "Tool 不存在或无权修改。" }, { status: 404 });
  }

  const validation = validateToolPayload(payload, stringValue(currentTool.name));
  if (validation.error) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const duplicate = Object.values(tools).some((tool) => {
    return (
      isRecord(tool) &&
      tool.owner_user_id === userId &&
      stringValue(tool.id) !== toolId &&
      stringValue(tool.name) === validation.name
    );
  });
  if (duplicate || BUILTIN_TOOLS.some((tool) => tool.name === validation.name)) {
    return NextResponse.json({ error: "Tool name 已存在，请换一个名称。" }, { status: 409 });
  }

  tools[toolId] = {
    ...currentTool,
    name: validation.name,
    description: validation.description,
    method: validation.method,
    endpoint: validation.endpoint,
    parameters: validation.parameters,
    updated_at: new Date().toISOString(),
  };
  await writeJson(tablePath(databaseDir, "tools"), tools);
  return NextResponse.json({ tool: tools[toolId] });
}

export async function deleteTools(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ error: "请先登录后再删除 Tool。" }, { status: 401 });
  }

  const payload = await readPayload(request);
  const ids = normalizeToolIds(payload?.id ? [payload.id] : payload?.ids);
  if (!ids.length) {
    return NextResponse.json({ error: "请选择要删除的 Tool。" }, { status: 400 });
  }

  const databaseDir = platformPaths().databaseDir;
  const [tools, agents] = await Promise.all([
    readObjectTable(databaseDir, "tools"),
    readObjectTable(databaseDir, "agents"),
  ]);
  const deletedIds: string[] = [];

  for (const id of ids) {
    const tool = tools[id];
    if (isRecord(tool) && tool.owner_user_id === userId) {
      delete tools[id];
      deletedIds.push(id);
    }
  }

  for (const [agentId, agent] of Object.entries(agents)) {
    if (!isRecord(agent) || agent.owner_user_id !== userId) {
      continue;
    }
    const enabledToolIds = normalizeToolIds(agent.enabled_tool_ids).filter((id) => !deletedIds.includes(id));
    agents[agentId] = { ...agent, enabled_tool_ids: enabledToolIds };
  }

  await Promise.all([
    writeJson(tablePath(databaseDir, "tools"), tools),
    writeJson(tablePath(databaseDir, "agents"), agents),
  ]);

  return NextResponse.json({ deletedIds });
}

async function readPayload(request: NextRequest): Promise<ToolPayload | null> {
  try {
    const payload = await request.json();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function validateToolPayload(payload: ToolPayload, fallbackName = "") {
  const name = (payload.name?.trim() || fallbackName).trim();
  const description = payload.description?.trim() || "";
  const endpoint = payload.endpoint?.trim() || "";
  const method = (payload.method?.trim().toUpperCase() || "POST") === "GET" ? "GET" : "POST";
  const parameters = isRecord(payload.parameters) ? payload.parameters : defaultParametersSchema();

  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
    return { error: "Tool name 只能包含字母、数字和下划线，并且不能以数字开头。" };
  }
  if (!description) {
    return { error: "请填写 Tool 描述。" };
  }
  if (!endpoint) {
    return { error: "请填写 HTTP Endpoint。" };
  }
  try {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { error: "Endpoint 只支持 http 或 https。" };
    }
  } catch {
    return { error: "Endpoint URL 无效。" };
  }
  if (parameters.type !== "object" || !isRecord(parameters.properties)) {
    return { error: "Parameters 必须是 JSON Schema object，并包含 properties。" };
  }

  return { name, description, endpoint, method, parameters };
}

function defaultParametersSchema() {
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

function flattenMcpTools(servers: ObjectTable, userId: string) {
  return Object.values(servers).flatMap((server) => {
    if (!isRecord(server) || server.owner_user_id !== userId) return [];
    const serverId = stringValue(server.id);
    const serverName = stringValue(server.name) || "MCP";
    if (!serverId || !Array.isArray(server.tools)) return [];
    return server.tools.flatMap((tool) => {
      if (!isRecord(tool) || !stringValue(tool.name)) return [];
      const name = stringValue(tool.name);
      return [{
        id: `mcp:${serverId}:${name}`,
        name,
        description: stringValue(tool.description) || `Tool provided by ${serverName}.`,
        source: "mcp",
        kind: "mcp",
        serverId,
        serverName,
        parameters: isRecord(tool.inputSchema) ? tool.inputSchema : defaultParametersSchema(),
      }];
    });
  });
}

function normalizeToolIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => stringValue(item)).filter(Boolean)))
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is ObjectTable {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueId(baseId: string) {
  return `${baseId}_${Date.now().toString(36)}`;
}
