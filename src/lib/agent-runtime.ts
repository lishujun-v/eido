import { databaseDir, readObjectTable, type ObjectTable } from "@backend/shared/database";

export type AgentRuntimeKind = "eido-local" | "remote-ndjson";

export type AgentRuntimeConfig = {
  kind: AgentRuntimeKind;
  /** Root URL of a server implementing src/agents/server/AGENT_PROTOCOL.md. */
  endpoint?: string;
  /** Identifier understood by the target server, when it differs from Eido's id. */
  remote_agent_id?: string;
  protocol_version?: "eido-agent/v1";
};

export type RegisteredAgent = ObjectTable & {
  id: string;
  owner_user_id: string;
  agent_type?: string;
  is_default?: boolean;
  runtime?: AgentRuntimeConfig;
};

const LOCAL_AGENT_URL = process.env.EIDO_AGENT_API_URL ?? "http://127.0.0.1:8000";

export async function getOwnedRegisteredAgent(
  userId: string,
  agentId?: string,
): Promise<RegisteredAgent | null> {
  const agents = await readObjectTable(databaseDir(), "agents");
  const agent = Object.values(agents).find((candidate) => {
    if (!isRegisteredAgent(candidate) || candidate.owner_user_id !== userId) return false;
    if (agentId) return candidate.id === agentId;
    return candidate.agent_type === "siinx" && candidate.is_default === true;
  });
  return isRegisteredAgent(agent) ? agent : null;
}

export function resolveAgentRuntime(agent: RegisteredAgent): Required<AgentRuntimeConfig> {
  const configured = isRuntimeConfig(agent.runtime) ? agent.runtime : { kind: "eido-local" as const };
  const kind = configured.kind === "remote-ndjson" ? "remote-ndjson" : "eido-local";
  const endpoint = kind === "eido-local" ? LOCAL_AGENT_URL : normalizeEndpoint(configured.endpoint);
  if (!endpoint) {
    throw new Error("远程 Agent 缺少有效的 runtime.endpoint 配置。");
  }
  return {
    kind,
    endpoint,
    remote_agent_id: configured.remote_agent_id?.trim() || agent.id,
    protocol_version: "eido-agent/v1",
  };
}

export function runtimeUrl(runtime: Required<AgentRuntimeConfig>, pathname: string) {
  return new URL(pathname.replace(/^\//, ""), `${runtime.endpoint}/`).toString();
}

export function isRegisteredAgent(value: unknown): value is RegisteredAgent {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof (value as ObjectTable).id === "string"
    && typeof (value as ObjectTable).owner_user_id === "string";
}

function isRuntimeConfig(value: unknown): value is AgentRuntimeConfig {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && ((value as ObjectTable).kind === "eido-local" || (value as ObjectTable).kind === "remote-ndjson");
}

function normalizeEndpoint(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}
