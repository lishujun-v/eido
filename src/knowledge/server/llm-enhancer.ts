import type { KnowledgeRetrievalMatch } from "../domain/retrieval-types.ts";

export type KnowledgeLlmQueryPlan = {
  rewrittenQuery?: string;
  subQueries: string[];
};

export type KnowledgeLlmEnhancer = {
  readonly configured: boolean;
  readonly rerankEnabled: boolean;
  plan(query: string): Promise<KnowledgeLlmQueryPlan>;
  rerank(query: string, candidates: KnowledgeRetrievalMatch[]): Promise<string[]>;
};

type OpenAICompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  rerankEnabled: boolean;
};

/**
 * A deliberately narrow OpenAI-compatible adapter. It receives the query and
 * at most twelve already-authorized candidates; it can never enumerate source
 * knowledge or bypass retrieval authorization.
 */
export class OpenAICompatibleKnowledgeLlmEnhancer implements KnowledgeLlmEnhancer {
  readonly configured = true;
  readonly rerankEnabled: boolean;
  private readonly config: OpenAICompatibleConfig;
  private readonly fetcher: typeof fetch;

  constructor(config: OpenAICompatibleConfig, fetcher: typeof fetch = globalThis.fetch) {
    this.config = config;
    this.fetcher = fetcher;
    this.rerankEnabled = config.rerankEnabled;
  }

  async plan(query: string): Promise<KnowledgeLlmQueryPlan> {
    const value = await this.complete([
      "你是知识库检索查询规划器。不要回答问题，只输出严格 JSON：",
      '{"rewrite":"可选的单句检索改写","subQueries":["最多 3 个短子查询"]}',
      "改写必须忠于原问题，不能补造事实。简单问题返回空 rewrite 和空数组。",
      `原问题：${query}`,
    ].join("\n"));
    const parsed = parseObject(value);
    return {
      ...(text(parsed.rewrite) ? { rewrittenQuery: text(parsed.rewrite) } : {}),
      subQueries: strings(parsed.subQueries, 3),
    };
  }

  async rerank(query: string, candidates: KnowledgeRetrievalMatch[]): Promise<string[]> {
    if (!this.rerankEnabled || candidates.length < 2) return [];
    const value = await this.complete([
      "你是知识库检索重排器。仅根据问题与候选内容相关性排序，不要输出答案。",
      '输出严格 JSON：{"nodeIds":["按相关性从高到低的候选 nodeId"]}。',
      `问题：${query}`,
      "候选（只能返回这些 nodeId）：",
      JSON.stringify(candidates.map((item) => ({ nodeId: item.nodeId, title: item.title, type: item.type, summary: item.summary, content: item.content.slice(0, 800) }))),
    ].join("\n"));
    const allowed = new Set(candidates.map((item) => item.nodeId));
    return [...new Set(strings(parseObject(value).nodeIds, candidates.length).filter((id) => allowed.has(id)))];
  }

  private async complete(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({ model: this.config.model, temperature: 0, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`LLM 请求失败（${response.status}）。`);
      const body: unknown = await response.json();
      const content = body && typeof body === "object" && "choices" in body && Array.isArray(body.choices)
        ? body.choices[0]?.message?.content : undefined;
      if (typeof content !== "string") throw new Error("LLM 未返回有效内容。");
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

class DisabledKnowledgeLlmEnhancer implements KnowledgeLlmEnhancer {
  readonly configured = false;
  readonly rerankEnabled = false;
  async plan(): Promise<KnowledgeLlmQueryPlan> { return { subQueries: [] }; }
  async rerank(): Promise<string[]> { return []; }
}

export function defaultKnowledgeLlmEnhancer(env: Record<string, string | undefined> = process.env): KnowledgeLlmEnhancer {
  if (env.EIDO_KNOWLEDGE_LLM_ENABLED !== "true") return new DisabledKnowledgeLlmEnhancer();
  const apiKey = env.EIDO_KNOWLEDGE_LLM_API_KEY ?? env.OPENAI_API_KEY;
  if (!apiKey) return new DisabledKnowledgeLlmEnhancer();
  return new OpenAICompatibleKnowledgeLlmEnhancer({
    baseUrl: env.EIDO_KNOWLEDGE_LLM_BASE_URL ?? env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey,
    model: env.EIDO_KNOWLEDGE_LLM_MODEL ?? "gpt-4.1-mini",
    rerankEnabled: env.EIDO_KNOWLEDGE_LLM_RERANK_ENABLED === "true",
  });
}

/** Keep the heuristic explicit and deterministic so ordinary lookups stay free. */
export function llmEnhancementReason(query: string, matches: KnowledgeRetrievalMatch[]): string | undefined {
  const normalized = query.trim();
  if (/^(?:它|这(?:个|些|种)?|那(?:个|些|种)?|前者|后者)/u.test(normalized)) return "指代不清";
  if (/(比较|区别|分别|以及|同时|并且|方案|利弊|优缺点|怎么选)/u.test(normalized)) return "复合问题";
  // An exact title/alias/tag hit is already a high-confidence simple lookup;
  // do not spend an extra LLM request merely because the space is small.
  if (matches[0]?.scoreBreakdown.lexical >= 5) return undefined;
  if (matches.length <= 1) return "低置信度候选";
  return undefined;
}

function parseObject(value: string): Record<string, unknown> {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? value;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LLM 返回不是 JSON 对象。");
  const parsed: unknown = JSON.parse(fenced.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("LLM 返回不是 JSON 对象。");
  return parsed as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1_000) : undefined;
}

function strings(value: unknown, limit: number) {
  return Array.isArray(value) ? [...new Set(value.map(text).filter((item): item is string => Boolean(item)))].slice(0, limit) : [];
}
