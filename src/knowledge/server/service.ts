import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { KnowledgeError } from "@backend/knowledge/domain/errors";
import { canAgentAccessKnowledgeSpace } from "@backend/knowledge/domain/access";
import { scoreKnowledgeNode } from "@backend/knowledge/domain/keyword-search";
import { createStarterSpaces } from "@backend/knowledge/domain/seeds";
import type {
  KnowledgeBatchInput,
  KnowledgeBatchResult,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeUpdateInput,
  KnowledgeSearchResult,
  KnowledgeSpace,
} from "@backend/knowledge/domain/types";
import type {
  KnowledgeRetrievalMatch,
  KnowledgeRetrievalResult,
  KnowledgeSemanticNodeMatch,
  KnowledgeSearchInput,
  KnowledgeSearchMode,
} from "@backend/knowledge/domain/retrieval-types";
import type { KnowledgeIndexMaintainer } from "./index-maintenance";
import type { KnowledgeLlmEnhancer } from "./llm-enhancer";
import { JsonKnowledgeRepository, type KnowledgeRepository } from "./repository";

type ObjectTable = Record<string, unknown>;

export class KnowledgeService {
  private readonly repository: KnowledgeRepository;
  private indexMaintainer: KnowledgeIndexMaintainer | undefined;
  private readonly llmEnhancer: KnowledgeLlmEnhancer | undefined;

  constructor(
    repository: KnowledgeRepository = new JsonKnowledgeRepository(),
    indexMaintainer?: KnowledgeIndexMaintainer,
    llmEnhancer?: KnowledgeLlmEnhancer,
  ) {
    this.repository = repository;
    this.indexMaintainer = indexMaintainer;
    this.llmEnhancer = llmEnhancer;
  }

  async list(ownerUserId: string) {
    const table = await this.ensureStarterSpaces(ownerUserId);
    return Object.values(table)
      .filter((value): value is ObjectTable => isRecord(value) && value.ownerUserId === ownerUserId)
      .map(normalizeSpace)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createSpace(ownerUserId: string, input: Partial<KnowledgeSpace>) {
    const now = new Date().toISOString();
    const table = await this.ensureStarterSpaces(ownerUserId);
    const space: KnowledgeSpace = {
      id: randomUUID(), ownerUserId, name: requiredText(input.name, "知识空间名称不能为空。"),
      description: cleanText(input.description) || "用于沉淀和连接领域知识。",
      domain: cleanText(input.domain) || "通用知识", color: normalizeColor(input.color),
      agentIds: normalizeIds(input.agentIds), nodes: [], edges: [], createdAt: now, updatedAt: now,
    };
    table[space.id] = space;
    await this.persistSpaces(table);
    return space;
  }

  async updateSpace(ownerUserId: string, spaceId: string, input: Partial<KnowledgeSpace>) {
    const { table, space } = await this.getOwned(ownerUserId, spaceId);
    const updated: KnowledgeSpace = {
      ...space,
      name: input.name === undefined ? space.name : requiredText(input.name, "知识空间名称不能为空。"),
      description: input.description === undefined ? space.description : cleanText(input.description),
      domain: input.domain === undefined ? space.domain : cleanText(input.domain),
      color: input.color === undefined ? space.color : normalizeColor(input.color),
      agentIds: input.agentIds === undefined ? space.agentIds : normalizeIds(input.agentIds),
      updatedAt: new Date().toISOString(),
    };
    table[spaceId] = updated;
    await this.persistSpaces(table);
    return updated;
  }

  async deleteSpace(ownerUserId: string, spaceId: string) {
    const { table, space } = await this.getOwned(ownerUserId, spaceId);
    delete table[space.id];
    await this.persistSpaces(table);
  }

  async createNode(ownerUserId: string, spaceId: string, input: Partial<KnowledgeNode>) {
    const { table, space } = await this.getOwned(ownerUserId, spaceId);
    const now = new Date().toISOString();
    const node = buildNode(input, space.nodes.length, now);
    space.nodes.push(node);
    space.updatedAt = now;
    table[spaceId] = space;
    await this.persistSpaces(table);
    return { space, node };
  }

  async addBatch(ownerUserId: string, spaceId: string, input: Partial<KnowledgeBatchInput>): Promise<KnowledgeBatchResult> {
    const { table, space } = await this.getOwned(ownerUserId, spaceId);
    if (!Array.isArray(input.nodes) || input.nodes.length === 0) throw new KnowledgeError("批量新增至少需要一个知识节点。", 400);
    if (input.nodes.length > 500) throw new KnowledgeError("单次最多新增 500 个知识节点。", 400);
    if (input.edges !== undefined && !Array.isArray(input.edges)) throw new KnowledgeError("知识关系必须是数组。", 400);
    const edgeInputs = input.edges ?? [];
    if (edgeInputs.length > 2_000) throw new KnowledgeError("单次最多新增 2000 条知识关系。", 400);

    const now = new Date().toISOString();
    const existingIds = new Set(space.nodes.map((node) => node.id));
    const refs = new Set<string>();
    const refMap: Record<string, string> = {};
    const nodes = input.nodes.map((item, index) => {
      if (!isRecord(item)) throw new KnowledgeError(`第 ${index + 1} 个知识节点格式无效。`, 400);
      const ref = requiredText(item.ref, `第 ${index + 1} 个知识节点缺少 ref。`);
      if (refs.has(ref)) throw new KnowledgeError(`知识节点 ref 重复：${ref}`, 400);
      if (existingIds.has(ref)) throw new KnowledgeError(`知识节点 ref 与已有节点 ID 冲突：${ref}`, 400);
      refs.add(ref);
      const node = buildNode(item, space.nodes.length + index, now);
      refMap[ref] = node.id;
      return node;
    });

    const allNodeIds = new Set([...existingIds, ...nodes.map((node) => node.id)]);
    const relationshipKeys = new Set(space.edges.map(edgeKey));
    const edges = edgeInputs.map((item, index) => {
      if (!isRecord(item)) throw new KnowledgeError(`第 ${index + 1} 条知识关系格式无效。`, 400);
      const sourceRef = requiredText(item.source, `第 ${index + 1} 条关系缺少 source。`);
      const targetRef = requiredText(item.target, `第 ${index + 1} 条关系缺少 target。`);
      const source = refMap[sourceRef] ?? sourceRef;
      const target = refMap[targetRef] ?? targetRef;
      if (source === target) throw new KnowledgeError(`第 ${index + 1} 条关系的起点和终点不能相同。`, 400);
      if (!allNodeIds.has(source) || !allNodeIds.has(target)) {
        throw new KnowledgeError(`第 ${index + 1} 条关系引用了不存在的节点或 ref。`, 400);
      }
      const edge: KnowledgeEdge = {
        id: randomUUID(), source, target, relation: cleanText(item.relation) || "关联", createdAt: now, updatedAt: now,
      };
      const key = edgeKey(edge);
      if (relationshipKeys.has(key)) throw new KnowledgeError(`第 ${index + 1} 条知识关系重复。`, 400);
      relationshipKeys.add(key);
      return edge;
    });

    space.nodes = [...space.nodes, ...nodes];
    space.edges = [...space.edges, ...edges];
    assertValidGraph(space);
    space.updatedAt = now;
    table[spaceId] = space;
    await this.persistSpaces(table);
    return { space, nodes, edges, refMap };
  }

  async updateNode(ownerUserId: string, spaceId: string, nodeId: string, input: Partial<KnowledgeNode>) {
    const { table, space } = await this.getOwned(ownerUserId, spaceId);
    const index = space.nodes.findIndex((node) => node.id === nodeId);
    if (index < 0) throw new KnowledgeError("没有找到这个知识节点。", 404);
    const current = space.nodes[index];
    const now = new Date().toISOString();
    const updated = updateNodeFields(current, input, now);
    space.nodes[index] = updated;
    space.updatedAt = now;
    table[spaceId] = space;
    await this.persistSpaces(table);
    return { space, node: updated };
  }

  async updateNodes(ownerUserId: string, spaceId: string, updates: KnowledgeNodeUpdateInput[]) {
    const { table, space } = await this.getOwned(ownerUserId, spaceId);
    if (!Array.isArray(updates) || updates.length === 0) throw new KnowledgeError("批量修改至少需要一个知识节点。", 400);
    if (updates.length > 500) throw new KnowledgeError("单次最多修改 500 个知识节点。", 400);
    const seen = new Set<string>();
    const now = new Date().toISOString();
    const replacements = new Map<string, KnowledgeNode>();
    for (const [index, update] of updates.entries()) {
      if (!isRecord(update) || !isRecord(update.node)) throw new KnowledgeError(`第 ${index + 1} 个修改项格式无效。`, 400);
      const nodeId = requiredText(update.nodeId, `第 ${index + 1} 个修改项缺少 nodeId。`);
      if (seen.has(nodeId)) throw new KnowledgeError(`知识节点重复修改：${nodeId}`, 400);
      seen.add(nodeId);
      const current = space.nodes.find((node) => node.id === nodeId);
      if (!current) throw new KnowledgeError(`没有找到知识节点：${nodeId}`, 404);
      replacements.set(nodeId, updateNodeFields(current, update.node, now));
    }
    space.nodes = space.nodes.map((node) => replacements.get(node.id) ?? node);
    space.updatedAt = now;
    table[spaceId] = space;
    await this.persistSpaces(table);
    return { space, nodes: [...replacements.values()] };
  }

  async deleteNode(ownerUserId: string, spaceId: string, nodeId: string) {
    const { table, space } = await this.getOwned(ownerUserId, spaceId);
    if (!space.nodes.some((node) => node.id === nodeId)) throw new KnowledgeError("没有找到这个知识节点。", 404);
    space.nodes = space.nodes.filter((node) => node.id !== nodeId);
    space.edges = space.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
    space.updatedAt = new Date().toISOString();
    table[spaceId] = space;
    await this.persistSpaces(table);
    return space;
  }

  async createEdge(ownerUserId: string, spaceId: string, input: Partial<KnowledgeEdge>) {
    const { table, space } = await this.getOwned(ownerUserId, spaceId);
    const source = requiredText(input.source, "请选择起点节点。");
    const target = requiredText(input.target, "请选择终点节点。");
    if (source === target) throw new KnowledgeError("关系的起点和终点不能相同。", 400);
    if (![source, target].every((id) => space.nodes.some((node) => node.id === id))) {
      throw new KnowledgeError("关系引用了不存在的知识节点。", 400);
    }
    const now = new Date().toISOString();
    const edge: KnowledgeEdge = { id: randomUUID(), source, target, relation: cleanText(input.relation) || "关联", createdAt: now, updatedAt: now };
    space.edges.push(edge);
    space.updatedAt = now;
    table[spaceId] = space;
    await this.persistSpaces(table);
    return { space, edge };
  }

  async deleteEdge(ownerUserId: string, spaceId: string, edgeId: string) {
    const { table, space } = await this.getOwned(ownerUserId, spaceId);
    space.edges = space.edges.filter((edge) => edge.id !== edgeId);
    space.updatedAt = new Date().toISOString();
    table[spaceId] = space;
    await this.persistSpaces(table);
    return space;
  }

  async search(ownerUserId: string, query: string, spaceId?: string): Promise<KnowledgeSearchResult[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return [];
    const spaces = await this.list(ownerUserId);
    return spaces.filter((space) => !spaceId || space.id === spaceId)
      .flatMap((space) => space.nodes.map((node) => scoreKnowledgeNode(space.id, node, normalizedQuery)))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || b.node.updatedAt.localeCompare(a.node.updatedAt)).slice(0, 50);
  }

  async searchForAgent(ownerUserId: string, agentId: string, query: string) {
    return this.searchRetrieval(ownerUserId, { query, agentId, mode: "graph", topK: 6 });
  }

  /**
   * The single authorization boundary for every public retrieval caller.
   * Agent identity only narrows the owner's spaces; it never grants access to
   * an unbound knowledge space.
   */
  async searchRetrieval(ownerUserId: string, input: KnowledgeSearchInput): Promise<KnowledgeRetrievalResult> {
    const query = requiredText(input.query, "检索内容不能为空。");
    if (query.length > 1_000) throw new KnowledgeError("检索内容不能超过 1000 个字符。", 400);
    const mode = normalizeSearchMode(input.mode);
    const topK = normalizeTopK(input.topK);
    const maxHops = input.maxHops === undefined ? 1 : input.maxHops;
    if (!Number.isInteger(maxHops) || maxHops < 0 || maxHops > 1) {
      throw new KnowledgeError("当前最大关系跳数必须是 0 或 1。", 400);
    }

    const requestedIds = normalizeRequestedSpaceIds(input.spaceIds);
    const ownedSpaces = await this.list(ownerUserId);
    const ownedById = new Map(ownedSpaces.map((space) => [space.id, space]));
    if (requestedIds.some((spaceId) => !ownedById.has(spaceId))) {
      throw new KnowledgeError("指定的知识空间不存在或无权访问。", 404);
    }
    let spaces = requestedIds.length ? requestedIds.map((spaceId) => ownedById.get(spaceId)!) : ownedSpaces;
    if (input.agentId?.trim()) {
      spaces = spaces.filter((space) => canAgentAccessKnowledgeSpace(space, input.agentId!.trim()));
      if (requestedIds.length && spaces.length !== requestedIds.length) {
        throw new KnowledgeError("Agent 无权访问指定的知识空间。", 403);
      }
    }
    return this.runRetrieval(query, spaces, mode, topK, maxHops, input.llm);
  }

  private async runRetrieval(
    query: string,
    spaces: KnowledgeSpace[], mode: KnowledgeSearchMode, topK: number, maxHops: number,
    llmOptions: KnowledgeSearchInput["llm"],
  ): Promise<KnowledgeRetrievalResult> {
    const startedAt = performance.now();
    const base = await this.runBaseRetrieval(query, spaces, mode, topK, maxHops);
    if (llmOptions?.enhancement === "off") return base;

    const enhancer = this.llmEnhancer ?? (await import("./llm-enhancer")).defaultKnowledgeLlmEnhancer();
    if (!enhancer.configured) return base;
    const reason = llmOptions?.enhancement === "force"
      ? "调用方明确请求"
      : (await import("./llm-enhancer")).llmEnhancementReason(query, base.matches);
    if (!reason) return withLlmMetadata(base, { configured: true, attempted: false, reason: "基础检索置信度充足" });

    try {
      const plan = await enhancer.plan(query);
      const variants = uniqueQueries(query, plan.rewrittenQuery, plan.subQueries);
      let result = base;
      if (variants.length > 1) {
        const additional = await Promise.all(variants.slice(1).map((item) => this.runBaseRetrieval(item, spaces, mode, topK, maxHops)));
        result = mergeLlmResults(base, additional, topK);
      }
      let reranked = false;
      if (llmOptions?.rerank === true && enhancer.rerankEnabled && result.matches.length > 1) {
        const ordered = await enhancer.rerank(query, result.matches.slice(0, 12));
        if (ordered.length) {
          result = applyRerank(result, ordered, topK);
          reranked = true;
        }
      }
      return withLlmMetadata(result, {
        configured: true, attempted: true, reason,
        ...(plan.rewrittenQuery ? { rewrittenQuery: plan.rewrittenQuery } : {}),
        ...(plan.subQueries.length ? { subQueries: plan.subQueries } : {}),
        ...(reranked ? { reranked: true } : {}),
        elapsedMs: performance.now() - startedAt,
      });
    } catch (error) {
      // Enhancement is intentionally fail-open: factual retrieval remains the
      // answer source even when an optional remote model is unhealthy.
      return withLlmMetadata(base, {
        configured: true, attempted: true, reason,
        unavailableReason: error instanceof Error ? error.message : "LLM 增强暂不可用。",
        elapsedMs: performance.now() - startedAt,
      });
    }
  }

  private async runBaseRetrieval(query: string, spaces: KnowledgeSpace[], mode: KnowledgeSearchMode, topK: number, maxHops: number): Promise<KnowledgeRetrievalResult> {
    if (mode === "lexical") {
      const { KnowledgeLexicalRetriever } = await import("./lexical-retriever");
      const startedAt = performance.now();
      const matches = new KnowledgeLexicalRetriever().search(query, spaces, topK);
      return retrievalResult(query, "lexical", matches, spaces.map((space) => space.id), performance.now() - startedAt, matches.length);
    }
    if (mode === "semantic") {
      const { KnowledgeSemanticRetriever } = await import("./semantic-retriever");
      const startedAt = performance.now();
      const semantic = await new KnowledgeSemanticRetriever().search(query, spaces, topK);
      const nodes = new Map(spaces.flatMap((space) => space.nodes.map((node) => [`${space.id}\u0000${node.id}`, { space, node }] as const)));
      const matches = semantic.matches.flatMap((match) => {
        const source = nodes.get(`${match.spaceId}\u0000${match.nodeId}`);
        return source ? [semanticMatch(match, source.space, source.node)] : [];
      });
      return retrievalResult(query, "semantic", matches, spaces.map((space) => space.id), performance.now() - startedAt, semantic.matches.length, semantic.embeddingModel, semantic.unavailableReason);
    }
    if (mode === "graph" && maxHops > 0) {
      const { KnowledgeGraphRetriever } = await import("./graph-retriever");
      return new KnowledgeGraphRetriever().search(query, spaces, topK);
    }
    const { KnowledgeHybridRetriever } = await import("./hybrid-retriever");
    const result = await new KnowledgeHybridRetriever().search(query, spaces, topK);
    return { ...result, mode };
  }

  private async getOwned(ownerUserId: string, spaceId: string) {
    const table = await this.ensureStarterSpaces(ownerUserId);
    const raw = table[spaceId];
    if (!isRecord(raw) || raw.ownerUserId !== ownerUserId) throw new KnowledgeError("没有找到这个知识空间。", 404);
    return { table, space: normalizeSpace(raw) };
  }

  private async persistSpaces(table: ObjectTable) {
    await this.repository.writeSpaces(table);
    // The JSON write is already durable. Indexing is derived work and cannot
    // make a successful knowledge edit fail; the maintainer persists failures
    // for `knowledge index status/sync` to expose and repair.
    void this.scheduleIndex(spacesFromTable(table)).catch(() => undefined);
  }

  private async ensureStarterSpaces(ownerUserId: string) {
    const [table, meta] = await Promise.all([this.repository.readSpaces(), this.repository.readMeta()]);
    const hasOwnedSpace = Object.values(table).some((value) => isRecord(value) && value.ownerUserId === ownerUserId);
    if (meta[ownerUserId] !== true) {
      if (!hasOwnedSpace) {
        for (const space of createStarterSpaces(ownerUserId, new Date().toISOString())) table[space.id] = space;
      }
      meta[ownerUserId] = true;
      await Promise.all([this.repository.writeSpaces(table), this.repository.writeMeta(meta)]);
      void this.scheduleIndex(spacesFromTable(table)).catch(() => undefined);
    }
    return table;
  }

  private async scheduleIndex(spaces: KnowledgeSpace[]) {
    // Dynamic loading keeps Node's experimental SQLite module out of static
    // route evaluation. It is initialized only once a source write succeeds.
    if (!this.indexMaintainer) {
      const { defaultKnowledgeIndexMaintainer } = await import("./index-maintenance");
      this.indexMaintainer = defaultKnowledgeIndexMaintainer();
    }
    await this.indexMaintainer.schedule(spaces);
  }
}

function spacesFromTable(table: ObjectTable) {
  return Object.values(table).filter(isRecord).map(normalizeSpace);
}

function normalizeSpace(value: ObjectTable): KnowledgeSpace {
  return {
    id: cleanText(value.id), ownerUserId: cleanText(value.ownerUserId), name: cleanText(value.name),
    description: cleanText(value.description), domain: cleanText(value.domain), color: normalizeColor(value.color),
    agentIds: normalizeIds(value.agentIds), nodes: Array.isArray(value.nodes) ? value.nodes.filter(isRecord).map(normalizeNode) : [],
    edges: Array.isArray(value.edges) ? value.edges.filter(isRecord).map(normalizeEdge) : [],
    createdAt: cleanText(value.createdAt), updatedAt: cleanText(value.updatedAt),
  };
}

function normalizeNode(value: ObjectTable): KnowledgeNode {
  return {
    id: cleanText(value.id), title: cleanText(value.title), type: cleanText(value.type), summary: cleanText(value.summary),
    content: cleanText(value.content), tags: normalizeTextList(value.tags), aliases: normalizeTextList(value.aliases),
    x: clampCoordinate(value.x, 50), y: clampCoordinate(value.y, 50), createdAt: cleanText(value.createdAt), updatedAt: cleanText(value.updatedAt),
  };
}

function normalizeEdge(value: ObjectTable): KnowledgeEdge {
  return { id: cleanText(value.id), source: cleanText(value.source), target: cleanText(value.target), relation: cleanText(value.relation), createdAt: cleanText(value.createdAt), updatedAt: cleanText(value.updatedAt) };
}

function buildNode(input: Partial<KnowledgeNode>, index: number, now: string): KnowledgeNode {
  return {
    id: randomUUID(), title: requiredText(input.title, "知识节点标题不能为空。"),
    type: cleanText(input.type) || "知识点", summary: cleanText(input.summary), content: cleanText(input.content),
    tags: normalizeTextList(input.tags), aliases: normalizeTextList(input.aliases),
    x: clampCoordinate(input.x, 18 + ((index * 19) % 68)),
    y: clampCoordinate(input.y, 22 + ((index * 23) % 58)), createdAt: now, updatedAt: now,
  };
}

function updateNodeFields(current: KnowledgeNode, input: Partial<KnowledgeNode>, now: string): KnowledgeNode {
  return {
    ...current,
    title: input.title === undefined ? current.title : requiredText(input.title, "知识节点标题不能为空。"),
    type: input.type === undefined ? current.type : cleanText(input.type),
    summary: input.summary === undefined ? current.summary : cleanText(input.summary),
    content: input.content === undefined ? current.content : cleanText(input.content),
    tags: input.tags === undefined ? current.tags : normalizeTextList(input.tags),
    aliases: input.aliases === undefined ? current.aliases : normalizeTextList(input.aliases),
    x: input.x === undefined ? current.x : clampCoordinate(input.x, current.x),
    y: input.y === undefined ? current.y : clampCoordinate(input.y, current.y),
    updatedAt: now,
  };
}

function edgeKey(edge: Pick<KnowledgeEdge, "source" | "target" | "relation">) {
  return `${edge.source}\u0000${edge.target}\u0000${edge.relation}`;
}

function assertValidGraph(space: KnowledgeSpace) {
  const ids = new Set(space.nodes.map((node) => node.id));
  if (ids.size !== space.nodes.length) throw new KnowledgeError("知识空间中存在重复的节点 ID。", 409);
  for (const edge of space.edges) {
    if (edge.source === edge.target || !ids.has(edge.source) || !ids.has(edge.target)) {
      throw new KnowledgeError("知识空间中存在无效的节点关联。", 409);
    }
  }
}

function isRecord(value: unknown): value is ObjectTable { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function cleanText(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 20_000) : ""; }
function requiredText(value: unknown, message: string) { const text = cleanText(value); if (!text) throw new KnowledgeError(message, 400); return text; }
function normalizeIds(value: unknown) { return Array.from(new Set(Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [])); }
function normalizeTextList(value: unknown) { return Array.from(new Set(Array.isArray(value) ? value.map(cleanText).filter(Boolean).slice(0, 30) : [])); }
function normalizeColor(value: unknown) { const color = cleanText(value); return /^#[0-9a-f]{6}$/i.test(color) ? color : "#2b79e8"; }
function clampCoordinate(value: unknown, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? Math.min(92, Math.max(8, value)) : fallback; }

function normalizeSearchMode(value: unknown): KnowledgeSearchMode {
  return value === "lexical" || value === "semantic" || value === "hybrid" || value === "graph" ? value : "hybrid";
}

function normalizeTopK(value: unknown): number {
  if (value === undefined) return 6;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 50) throw new KnowledgeError("topK 必须是 1 到 50 的整数。", 400);
  return value;
}

function normalizeRequestedSpaceIds(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new KnowledgeError("spaceIds 必须是最多 50 个知识空间 ID 的数组。", 400);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function semanticMatch(match: KnowledgeSemanticNodeMatch, space: KnowledgeSpace, node: KnowledgeNode): KnowledgeRetrievalMatch {
  return {
    spaceId: space.id, spaceName: space.name, nodeId: node.id, title: node.title,
    type: node.type, summary: node.summary, content: node.content, score: match.score,
    scoreBreakdown: { lexical: 0, semantic: match.score, fusion: match.score, graph: 0 },
    matchedChunkIds: match.matchedChunkIds, matchedFields: [],
    retrievalReasons: [`语义相似度：${match.score.toFixed(4)}`],
  };
}

function retrievalResult(
  query: string,
  mode: KnowledgeSearchMode,
  matches: KnowledgeRetrievalMatch[],
  searchedSpaceIds: string[],
  elapsedMs: number,
  candidateCount: number,
  embeddingModel?: string,
  semanticUnavailableReason?: string,
): KnowledgeRetrievalResult {
  return {
    query, normalizedQuery: query.trim().toLocaleLowerCase(), mode, matches,
    metadata: {
      searchedSpaceIds, candidateCount, elapsedMs,
      ...(embeddingModel ? { embeddingModel } : {}),
      ...(semanticUnavailableReason ? { semanticUnavailableReason } : {}),
    },
  };
}

function withLlmMetadata(
  result: KnowledgeRetrievalResult,
  info: NonNullable<KnowledgeRetrievalResult["metadata"]["llm"]> & { elapsedMs?: number },
): KnowledgeRetrievalResult {
  const { elapsedMs, ...llm } = info;
  return {
    ...result,
    metadata: {
      ...result.metadata,
      ...(elapsedMs === undefined ? {} : { elapsedMs }),
      llm,
    },
  };
}

function uniqueQueries(original: string, rewritten: string | undefined, subQueries: string[]) {
  const seen = new Set<string>();
  return [original, rewritten, ...subQueries].filter((item): item is string => {
    if (!item?.trim()) return false;
    const key = item.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

function mergeLlmResults(
  base: KnowledgeRetrievalResult,
  additional: KnowledgeRetrievalResult[],
  topK: number,
): KnowledgeRetrievalResult {
  const matches = new Map<string, KnowledgeRetrievalMatch>();
  for (const result of [base, ...additional]) {
    for (const match of result.matches) {
      const id = `${match.spaceId}\u0000${match.nodeId}`;
      const existing = matches.get(id);
      if (!existing || match.score > existing.score) {
        matches.set(id, {
          ...match,
          retrievalReasons: [...match.retrievalReasons, "LLM 查询增强召回"],
        });
      }
    }
  }
  return {
    ...base,
    matches: [...matches.values()]
      .sort((left, right) => right.score - left.score || left.nodeId.localeCompare(right.nodeId))
      .slice(0, topK),
    metadata: { ...base.metadata, candidateCount: matches.size },
  };
}

function applyRerank(result: KnowledgeRetrievalResult, orderedNodeIds: string[], topK: number): KnowledgeRetrievalResult {
  const rank = new Map(orderedNodeIds.map((nodeId, index) => [nodeId, index]));
  const matches = [...result.matches].sort((left, right) => {
    const leftRank = rank.get(left.nodeId) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.nodeId) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || right.score - left.score || left.nodeId.localeCompare(right.nodeId);
  }).map((match, index) => ({
    ...match,
    // Rerank is an explicit ordering signal. Preserve original lexical,
    // semantic, fusion and graph values for auditability.
    score: 1 / (index + 1),
    scoreBreakdown: { ...match.scoreBreakdown, rerank: 1 / (index + 1) },
    retrievalReasons: [...match.retrievalReasons, `LLM 候选重排：第 ${index + 1} 位`],
  })).slice(0, topK);
  return { ...result, matches };
}
