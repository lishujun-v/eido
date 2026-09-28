import type {
  KnowledgeBatchInput,
  KnowledgeBatchResult,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeUpdateInput,
  KnowledgeSearchResult,
  KnowledgeSpace,
} from "../domain/types.ts";
import type { KnowledgeRetrievalResult, KnowledgeSearchInput } from "../domain/retrieval-types.ts";

export type KnowledgeClientOptions = {
  baseUrl?: string;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  fetch?: typeof fetch;
};

export class KnowledgeApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "KnowledgeApiError";
    this.status = status;
  }
}

export class KnowledgeClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly options: KnowledgeClientOptions;

  constructor(options: KnowledgeClientOptions = {}) {
    this.options = options;
    this.fetcher = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  }

  list(query?: string, spaceId?: string) {
    const params = new URLSearchParams();
    if (query?.trim()) params.set("q", query.trim());
    if (spaceId?.trim()) params.set("spaceId", spaceId.trim());
    const suffix = params.size ? `?${params}` : "";
    return this.request<{ spaces: KnowledgeSpace[]; results: KnowledgeSearchResult[] }>(`/api/knowledge${suffix}`, { cache: "no-store" });
  }

  /** Search through the versioned retrieval contract rather than the legacy UI list API. */
  search(input: KnowledgeSearchInput) {
    return this.request<KnowledgeRetrievalResult>("/api/knowledge/search", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  createSpace(space: Partial<KnowledgeSpace>) {
    return this.request<{ space: KnowledgeSpace }>("/api/knowledge", { method: "POST", body: JSON.stringify({ action: "createSpace", space }) });
  }

  updateSpace(spaceId: string, space: Partial<KnowledgeSpace>) {
    return this.request<{ space: KnowledgeSpace }>("/api/knowledge", { method: "PATCH", body: JSON.stringify({ action: "updateSpace", spaceId, space }) });
  }

  deleteSpace(spaceId: string) {
    return this.request<{ deleted: true }>(`/api/knowledge?${new URLSearchParams({ spaceId })}`, { method: "DELETE" });
  }

  createNode(spaceId: string, node: Partial<KnowledgeNode>) {
    return this.request<{ space: KnowledgeSpace; node: KnowledgeNode }>("/api/knowledge", { method: "POST", body: JSON.stringify({ action: "createNode", spaceId, node }) });
  }

  addBatch(spaceId: string, batch: KnowledgeBatchInput) {
    return this.request<KnowledgeBatchResult>("/api/knowledge", { method: "POST", body: JSON.stringify({ action: "addBatch", spaceId, batch }) });
  }

  updateNode(spaceId: string, nodeId: string, node: Partial<KnowledgeNode>) {
    return this.request<{ space: KnowledgeSpace; node: KnowledgeNode }>("/api/knowledge", { method: "PATCH", body: JSON.stringify({ action: "updateNode", spaceId, nodeId, node }) });
  }

  updateNodes(spaceId: string, updates: KnowledgeNodeUpdateInput[]) {
    return this.request<{ space: KnowledgeSpace; nodes: KnowledgeNode[] }>("/api/knowledge", { method: "PATCH", body: JSON.stringify({ action: "updateNodes", spaceId, updates }) });
  }

  deleteNode(spaceId: string, nodeId: string) {
    return this.request<{ space: KnowledgeSpace }>(`/api/knowledge?${new URLSearchParams({ spaceId, nodeId })}`, { method: "DELETE" });
  }

  createEdge(spaceId: string, edge: Partial<KnowledgeEdge>) {
    return this.request<{ space: KnowledgeSpace; edge: KnowledgeEdge }>("/api/knowledge", { method: "POST", body: JSON.stringify({ action: "createEdge", spaceId, edge }) });
  }

  deleteEdge(spaceId: string, edgeId: string) {
    return this.request<{ space: KnowledgeSpace }>(`/api/knowledge?${new URLSearchParams({ spaceId, edgeId })}`, { method: "DELETE" });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const configuredHeaders = typeof this.options.headers === "function" ? await this.options.headers() : this.options.headers;
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...configuredHeaders, ...init.headers },
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : `Knowledge API 请求失败（${response.status}）。`;
      throw new KnowledgeApiError(message, response.status);
    }
    return data as T;
  }
}

export function createKnowledgeClient(options?: KnowledgeClientOptions) {
  return new KnowledgeClient(options);
}
