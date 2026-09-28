import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { platformPaths } from "../../config/paths.ts";
import type { KnowledgeNode, KnowledgeSpace } from "../domain/types.ts";
import type {
  KnowledgeChunk,
  KnowledgeEmbedding,
  KnowledgeIndexStatus,
  KnowledgeIndexSyncResult,
  KnowledgeIndexVerification,
  KnowledgeSemanticMatch,
} from "../domain/retrieval-types.ts";
import type { EmbeddingProvider } from "./embedding-provider.ts";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (file: string) => SqliteDatabase };
const SCHEMA_VERSION = "1";
export const KNOWLEDGE_CHUNK_STRATEGY = "knowledge-chunk-v1";
const CHUNK_SIZE = 700;
const CHUNK_OVERLAP = 100;

type SqliteStatement = {
  run(...parameters: unknown[]): unknown;
  get(...parameters: unknown[]): Record<string, unknown> | undefined;
  all(...parameters: unknown[]): Array<Record<string, unknown>>;
};
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};

/** Storage boundary for the retrieval service; SQLite is one implementation. */
export interface KnowledgeVectorIndex {
  readonly databasePath: string;
  close(): void;
  status(spaces: KnowledgeSpace[], provider?: Pick<EmbeddingProvider, "model" | "dimensions">): KnowledgeIndexStatus;
  sync(spaces: KnowledgeSpace[], provider: EmbeddingProvider, rebuild?: boolean): Promise<KnowledgeIndexSyncResult>;
  recordSyncFailure(error: unknown): void;
  verify(spaces: KnowledgeSpace[], provider: Pick<EmbeddingProvider, "model" | "dimensions">): KnowledgeIndexVerification;
  search(queryVector: Float32Array, model: string, limit?: number, scope?: { ownerUserId?: string; spaceIds?: string[] }): KnowledgeSemanticMatch[];
}

/**
 * A local, exact vector index. SQLite is intentionally only a derivative of
 * knowledge_spaces.json, so deleting it never deletes user knowledge.
 */
export class SqliteKnowledgeVectorIndex implements KnowledgeVectorIndex {
  readonly databasePath: string;
  private readonly database: SqliteDatabase;

  constructor(databasePath = path.join(platformPaths().databaseDir, "knowledge_index.sqlite")) {
    this.databasePath = databasePath;
    this.database = new DatabaseSync(databasePath);
    this.migrate();
  }

  close() {
    this.database.close();
  }

  status(spaces: KnowledgeSpace[], provider?: Pick<EmbeddingProvider, "model" | "dimensions">): KnowledgeIndexStatus {
    const source = createKnowledgeChunks(spaces);
    const metadata = this.metadata();
    const activeModel = provider?.model ?? metadata.embeddingModel ?? null;
    const dimensions = provider?.dimensions ?? numberOrNull(metadata.dimensions);
    const rows = this.database.prepare("SELECT id, content_hash FROM knowledge_chunks").all();
    const storedChunks = new Map(rows.map((row) => [stringValue(row.id), stringValue(row.content_hash)]));
    const embeddings = activeModel
      ? this.database.prepare("SELECT chunk_id, dimensions, content_hash, normalized FROM knowledge_embeddings WHERE model = ?").all(activeModel)
      : [];
    const currentEmbeddings = new Map(embeddings.map((row) => [stringValue(row.chunk_id), row]));
    const pendingChunkCount = source.filter((chunk) => {
      const embedding = currentEmbeddings.get(chunk.id);
      return storedChunks.get(chunk.id) !== chunk.contentHash
        || !embedding
        || stringValue(embedding.content_hash) !== chunk.contentHash
        || numberOrNull(embedding.dimensions) !== dimensions
        || numberOrNull(embedding.normalized) !== 1;
    }).length;
    return {
      databasePath: this.databasePath,
      schemaVersion: metadata.schemaVersion ?? null,
      activeModel,
      dimensions,
      sourceChunkCount: source.length,
      indexedChunkCount: rows.length,
      activeEmbeddingCount: embeddings.length,
      pendingChunkCount,
      lastSyncError: metadata.lastSyncError || null,
      lastSyncFailedAt: metadata.lastSyncFailedAt || null,
    };
  }

  async sync(spaces: KnowledgeSpace[], provider: EmbeddingProvider, rebuild = false): Promise<KnowledgeIndexSyncResult> {
    const chunks = createKnowledgeChunks(spaces);
    const desired = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const existingRows = this.database.prepare("SELECT id, content_hash FROM knowledge_chunks").all();
    const existing = new Map(existingRows.map((row) => [stringValue(row.id), stringValue(row.content_hash)]));
    const now = new Date().toISOString();
    const insertions: KnowledgeChunk[] = [];
    const updates: KnowledgeChunk[] = [];
    const removals = existingRows
      .map((row) => stringValue(row.id))
      .filter((id) => rebuild || !desired.has(id));

    for (const chunk of chunks) {
      const currentHash = existing.get(chunk.id);
      if (!currentHash) insertions.push(chunk);
      else if (rebuild || currentHash !== chunk.contentHash) updates.push(chunk);
    }
    const activeRows = this.database.prepare("SELECT chunk_id, content_hash, dimensions, normalized FROM knowledge_embeddings WHERE model = ?").all(provider.model);
    const activeEmbeddings = new Map(activeRows.map((row) => [stringValue(row.chunk_id), row]));
    const embeddingsNeeded = chunks.filter((chunk) => {
      const existingEmbedding = activeEmbeddings.get(chunk.id);
      return rebuild
        || insertions.some((candidate) => candidate.id === chunk.id)
        || updates.some((candidate) => candidate.id === chunk.id)
        || !existingEmbedding
        || stringValue(existingEmbedding.content_hash) !== chunk.contentHash
        || numberOrNull(existingEmbedding.dimensions) !== provider.dimensions
        || numberOrNull(existingEmbedding.normalized) !== 1;
    });
    const vectors = embeddingsNeeded.length === 0 ? [] : await provider.embed(embeddingsNeeded.map((chunk) => chunk.text));
    if (vectors.length !== embeddingsNeeded.length) throw new Error("Embedding 返回数量与待写入 Chunk 数量不一致。");
    if (vectors.some((vector) => vector.length !== provider.dimensions)) throw new Error("Embedding 返回维度与 Provider 配置不一致。");

    this.transaction(() => {
      if (rebuild) {
        this.database.exec("DELETE FROM knowledge_chunks");
      } else {
        const deleteChunk = this.database.prepare("DELETE FROM knowledge_chunks WHERE id = ?");
        removals.forEach((id) => deleteChunk.run(id));
        const deleteChanged = this.database.prepare("DELETE FROM knowledge_chunks WHERE id = ?");
        updates.forEach((chunk) => deleteChanged.run(chunk.id));
      }
      const insertChunk = this.database.prepare(`INSERT INTO knowledge_chunks
        (id, owner_user_id, space_id, node_id, chunk_index, text, content_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const insertEmbedding = this.database.prepare(`INSERT OR REPLACE INTO knowledge_embeddings
        (chunk_id, model, dimensions, vector, normalized, content_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)`);
      const chunkIdsToWrite = new Set([...insertions, ...updates].map((chunk) => chunk.id));
      if (rebuild) chunks.forEach((chunk) => chunkIdsToWrite.add(chunk.id));
      chunks.filter((chunk) => chunkIdsToWrite.has(chunk.id)).forEach((chunk) => {
        insertChunk.run(chunk.id, chunk.ownerUserId, chunk.spaceId, chunk.nodeId, chunk.chunkIndex, chunk.text, chunk.contentHash, chunk.createdAt, chunk.updatedAt);
      });
      embeddingsNeeded.forEach((chunk, index) => {
        const vector = vectors[index];
        insertEmbedding.run(chunk.id, provider.model, provider.dimensions, encodeVector(vector), chunk.contentHash, now, now);
      });
      this.writeMetadata({
        schemaVersion: SCHEMA_VERSION,
        indexVersion: SCHEMA_VERSION,
        embeddingModel: provider.model,
        dimensions: String(provider.dimensions),
        chunkStrategy: KNOWLEDGE_CHUNK_STRATEGY,
        lastSyncError: "",
        lastSyncFailedAt: "",
      });
    });
    return {
      insertedChunkCount: rebuild ? chunks.length : insertions.length,
      updatedChunkCount: rebuild ? 0 : updates.length,
      removedChunkCount: rebuild ? existingRows.length : removals.length,
      embeddedChunkCount: embeddingsNeeded.length,
      status: this.status(spaces, provider),
    };
  }

  recordSyncFailure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.writeMetadata({
      lastSyncError: message.slice(0, 4_000),
      lastSyncFailedAt: new Date().toISOString(),
    });
  }

  verify(spaces: KnowledgeSpace[], provider: Pick<EmbeddingProvider, "model" | "dimensions">): KnowledgeIndexVerification {
    const status = this.status(spaces, provider);
    const issues: string[] = [];
    if (status.schemaVersion !== SCHEMA_VERSION) issues.push(`schemaVersion 应为 ${SCHEMA_VERSION}，实际为 ${status.schemaVersion ?? "未设置"}。`);
    if (status.pendingChunkCount > 0) issues.push(`存在 ${status.pendingChunkCount} 个缺失或过期的 Chunk/Embedding。`);
    if (status.indexedChunkCount > status.sourceChunkCount) issues.push("索引包含不再存在于知识源中的 Chunk。");
    return {
      valid: issues.length === 0,
      checkedChunkCount: status.sourceChunkCount,
      checkedEmbeddingCount: status.activeEmbeddingCount,
      issues,
    };
  }

  search(queryVector: Float32Array, model: string, limit = 20, scope?: { ownerUserId?: string; spaceIds?: string[] }): KnowledgeSemanticMatch[] {
    const clauses = ["e.model = ?", "e.dimensions = ?", "e.normalized = 1"];
    const parameters: unknown[] = [model, queryVector.length];
    if (scope?.ownerUserId) {
      clauses.push("c.owner_user_id = ?");
      parameters.push(scope.ownerUserId);
    }
    if (scope?.spaceIds?.length) {
      clauses.push(`c.space_id IN (${scope.spaceIds.map(() => "?").join(", ")})`);
      parameters.push(...scope.spaceIds);
    }
    const rows = this.database.prepare(`SELECT c.*, e.vector FROM knowledge_chunks c
      JOIN knowledge_embeddings e ON e.chunk_id = c.id
      WHERE ${clauses.join(" AND ")}`).all(...parameters);
    return rows.map((row) => ({
      chunk: rowToChunk(row),
      score: dot(queryVector, decodeVector(row.vector, queryVector.length)),
    })).sort((left, right) => right.score - left.score).slice(0, Math.max(1, Math.min(limit, 100)));
  }

  private migrate() {
    this.database.exec(`PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, space_id TEXT NOT NULL,
        node_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, text TEXT NOT NULL,
        content_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(node_id, chunk_index)
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_scope ON knowledge_chunks(owner_user_id, space_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_node ON knowledge_chunks(node_id);
      CREATE TABLE IF NOT EXISTS knowledge_embeddings (
        chunk_id TEXT NOT NULL, model TEXT NOT NULL, dimensions INTEGER NOT NULL,
        vector BLOB NOT NULL, normalized INTEGER NOT NULL DEFAULT 1, content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(chunk_id, model),
        FOREIGN KEY(chunk_id) REFERENCES knowledge_chunks(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS knowledge_index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    this.writeMetadata({ schemaVersion: SCHEMA_VERSION, indexVersion: SCHEMA_VERSION, chunkStrategy: KNOWLEDGE_CHUNK_STRATEGY });
  }

  private metadata() {
    return Object.fromEntries(this.database.prepare("SELECT key, value FROM knowledge_index_meta").all().map((row) => [stringValue(row.key), stringValue(row.value)]));
  }

  private writeMetadata(entries: Record<string, string>) {
    const statement = this.database.prepare("INSERT OR REPLACE INTO knowledge_index_meta (key, value) VALUES (?, ?)");
    Object.entries(entries).forEach(([key, value]) => statement.run(key, value));
  }

  private transaction(callback: () => void) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      callback();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

export function createKnowledgeChunks(spaces: KnowledgeSpace[]): KnowledgeChunk[] {
  return spaces.flatMap((space) => space.nodes.flatMap((node) => createNodeChunks(space, node)));
}

function createNodeChunks(space: KnowledgeSpace, node: KnowledgeNode): KnowledgeChunk[] {
  const prefix = [
    `标题：${node.title}`, `类型：${node.type}`,
    node.aliases.length ? `别名：${node.aliases.join("、")}` : "",
    node.tags.length ? `标签：${node.tags.join("、")}` : "",
    node.summary ? `摘要：${node.summary}` : "",
  ].filter(Boolean).join("\n");
  const bodies = splitText(node.content || node.summary || node.title);
  return bodies.map((body, chunkIndex) => {
    const text = `${prefix}\n内容：${body}`;
    const contentHash = sha256(`${KNOWLEDGE_CHUNK_STRATEGY}\n${text}`);
    return {
      id: sha256(`${space.ownerUserId}\n${space.id}\n${node.id}\n${chunkIndex}`).slice(0, 40),
      ownerUserId: space.ownerUserId,
      spaceId: space.id,
      nodeId: node.id,
      chunkIndex,
      text,
      contentHash,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  });
}

function splitText(text: string) {
  const source = text.trim();
  if (source.length <= CHUNK_SIZE) return [source];
  const parts: string[] = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(source.length, start + CHUNK_SIZE);
    if (end < source.length) {
      const boundary = Math.max(source.lastIndexOf("。", end), source.lastIndexOf("\n", end), source.lastIndexOf("！", end), source.lastIndexOf("？", end));
      if (boundary > start + Math.floor(CHUNK_SIZE * 0.55)) end = boundary + 1;
    }
    parts.push(source.slice(start, end).trim());
    if (end >= source.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return parts;
}

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function encodeVector(vector: Float32Array) { return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength); }
function decodeVector(value: unknown, dimensions: number) {
  const buffer = Buffer.from(value as Uint8Array);
  if (buffer.byteLength !== dimensions * Float32Array.BYTES_PER_ELEMENT) throw new Error("索引中的向量 BLOB 长度与维度不一致。");
  return new Float32Array(buffer.buffer, buffer.byteOffset, dimensions);
}
function dot(left: Float32Array, right: Float32Array) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += left[index] * right[index];
  return total;
}
function stringValue(value: unknown) { return typeof value === "string" ? value : String(value ?? ""); }
function numberOrNull(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function rowToChunk(row: Record<string, unknown>): KnowledgeChunk {
  return {
    id: stringValue(row.id), ownerUserId: stringValue(row.owner_user_id), spaceId: stringValue(row.space_id), nodeId: stringValue(row.node_id),
    chunkIndex: Number(row.chunk_index), text: stringValue(row.text), contentHash: stringValue(row.content_hash),
    createdAt: stringValue(row.created_at), updatedAt: stringValue(row.updated_at),
  };
}
