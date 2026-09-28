import { NextRequest, NextResponse } from "next/server";
import { KnowledgeError } from "@backend/knowledge/domain/errors";
import type {
  KnowledgeBatchInput,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeUpdateInput,
  KnowledgeSpace,
} from "@backend/knowledge/domain/types";
import type { KnowledgeRetrievalMatch, KnowledgeSearchInput } from "@backend/knowledge/domain/retrieval-types";
import { KnowledgeService } from "./service";

const knowledge = new KnowledgeService();

export async function listKnowledge(request: NextRequest) {
  return handle(request, async (userId) => {
    const query = request.nextUrl.searchParams.get("q")?.trim() || "";
    const spaceId = request.nextUrl.searchParams.get("spaceId")?.trim() || undefined;
    const spaces = await knowledge.list(userId);
    const results = query ? await knowledge.search(userId, query, spaceId) : [];
    return NextResponse.json({ spaces, results });
  });
}

export async function createKnowledge(request: NextRequest) {
  return handle(request, async (userId) => {
    const payload = await readPayload(request);
    if (payload.action === "createSpace") return NextResponse.json({ space: await knowledge.createSpace(userId, payload.space ?? {}) }, { status: 201 });
    if (payload.action === "createNode") return NextResponse.json(await knowledge.createNode(userId, requiredId(payload.spaceId), payload.node ?? {}), { status: 201 });
    if (payload.action === "createEdge") return NextResponse.json(await knowledge.createEdge(userId, requiredId(payload.spaceId), payload.edge ?? {}), { status: 201 });
    if (payload.action === "addBatch") return NextResponse.json(await knowledge.addBatch(userId, requiredId(payload.spaceId), payload.batch ?? {}), { status: 201 });
    throw new KnowledgeError("不支持的知识库操作。", 400);
  });
}

export async function updateKnowledge(request: NextRequest) {
  return handle(request, async (userId) => {
    const payload = await readPayload(request);
    if (payload.action === "updateSpace") return NextResponse.json({ space: await knowledge.updateSpace(userId, requiredId(payload.spaceId), payload.space ?? {}) });
    if (payload.action === "updateNode") return NextResponse.json(await knowledge.updateNode(userId, requiredId(payload.spaceId), requiredId(payload.nodeId), payload.node ?? {}));
    if (payload.action === "updateNodes") return NextResponse.json(await knowledge.updateNodes(userId, requiredId(payload.spaceId), payload.updates ?? []));
    throw new KnowledgeError("不支持的知识库操作。", 400);
  });
}

export async function deleteKnowledge(request: NextRequest) {
  return handle(request, async (userId) => {
    const spaceId = requiredId(request.nextUrl.searchParams.get("spaceId"));
    const nodeId = request.nextUrl.searchParams.get("nodeId")?.trim();
    const edgeId = request.nextUrl.searchParams.get("edgeId")?.trim();
    if (nodeId) return NextResponse.json({ space: await knowledge.deleteNode(userId, spaceId, nodeId) });
    if (edgeId) return NextResponse.json({ space: await knowledge.deleteEdge(userId, spaceId, edgeId) });
    await knowledge.deleteSpace(userId, spaceId);
    return NextResponse.json({ deleted: true });
  });
}

/** Public retrieval endpoint. CRUD keeps its legacy GET keyword search so UI
 * rendering remains stable; new callers use this typed POST contract. */
export async function searchKnowledge(request: NextRequest) {
  return handle(request, async (userId) => {
    const payload = await readSearchPayload(request);
    const result = await knowledge.searchRetrieval(userId, payload);
    return NextResponse.json({
      ...result,
      matches: result.matches.map((match) => publicMatch(match, payload.includeContent !== false, payload.explain !== false)),
    });
  });
}

async function handle(request: NextRequest, action: (userId: string) => Promise<NextResponse>) {
  const userId = request.headers.get("x-eido-user-id")?.trim() || request.cookies.get("eido_user_id")?.value.trim();
  if (!userId) return NextResponse.json({ error: "请先登录后管理专家知识库。" }, { status: 401 });
  try {
    return await action(userId);
  } catch (error) {
    if (error instanceof KnowledgeError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "知识库操作失败。" }, { status: 500 });
  }
}

type KnowledgePayload = {
  action?: string;
  spaceId?: string;
  nodeId?: string;
  space?: Partial<KnowledgeSpace>;
  node?: Partial<KnowledgeNode>;
  edge?: Partial<KnowledgeEdge>;
  batch?: Partial<KnowledgeBatchInput>;
  updates?: KnowledgeNodeUpdateInput[];
};

type KnowledgeSearchPayload = KnowledgeSearchInput;

async function readPayload(request: NextRequest): Promise<KnowledgePayload> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as KnowledgePayload : {};
  } catch {
    throw new KnowledgeError("请求格式不是有效 JSON。", 400);
  }
}

async function readSearchPayload(request: NextRequest): Promise<KnowledgeSearchPayload> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as KnowledgeSearchPayload;
  } catch {
    throw new KnowledgeError("请求格式不是有效 JSON。", 400);
  }
}

function publicMatch(match: KnowledgeRetrievalMatch, includeContent: boolean, explain: boolean) {
  return {
    spaceId: match.spaceId, spaceName: match.spaceName, nodeId: match.nodeId,
    title: match.title, type: match.type, summary: match.summary,
    ...(includeContent ? { content: match.content } : {}),
    score: match.score,
    ...(explain ? {
      scoreBreakdown: match.scoreBreakdown,
      matchedChunkIds: match.matchedChunkIds,
      matchedFields: match.matchedFields,
      retrievalReasons: match.retrievalReasons,
      ...(match.graphPath ? { graphPath: match.graphPath } : {}),
    } : {}),
  };
}

function requiredId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new KnowledgeError("缺少必要的资源标识。", 400);
  return value.trim();
}
