export type AgentClientOptions = {
  baseUrl?: string;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  fetch?: typeof fetch;
};

export type CreateAgentInput = {
  name: string;
  identity: string;
  capabilities: string;
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
  runtime?: {
    kind?: "eido-local" | "remote-ndjson";
    endpoint?: string;
    remoteAgentId?: string;
  };
};

export type AgentSummary = {
  id: string;
  name: string;
  bio?: string;
  capabilities?: string;
  agent_type?: "siinx" | "expert";
  [key: string]: unknown;
};

export type ProviderConfigSummary = {
  id: string;
  name: string;
  provider: string;
  default_model: string;
  models: string[];
  [key: string]: unknown;
};

export class AgentApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
  }
}

/** Public client for the platform's Agent-management HTTP contract. */
export class AgentClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly options: AgentClientOptions;

  constructor(options: AgentClientOptions = {}) {
    this.options = options;
    this.fetcher = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  }

  list() {
    return this.request<{ agents: AgentSummary[]; siinXAgentId?: string }>("/api/agents", { cache: "no-store" });
  }

  listProviderConfigs() {
    return this.request<{ providerConfigs: ProviderConfigSummary[] }>("/api/provider-configs", { cache: "no-store" });
  }

  create(input: CreateAgentInput) {
    return this.request<{ agent: AgentSummary }>("/api/agents", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const configuredHeaders = typeof this.options.headers === "function"
      ? await this.options.headers()
      : this.options.headers;
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...configuredHeaders,
        ...init.headers,
      },
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Agent API 请求失败（${response.status}）。`;
      throw new AgentApiError(message, response.status);
    }
    return data as T;
  }
}

export function createAgentClient(options?: AgentClientOptions) {
  return new AgentClient(options);
}
