import type { KnowledgeSpace } from "../domain/types.ts";
import type { KnowledgeIndexSyncResult } from "../domain/retrieval-types.ts";
import { LocalBgeSmallZhEmbeddingProvider, type EmbeddingProvider } from "./embedding-provider.ts";
import { SqliteKnowledgeVectorIndex, type KnowledgeVectorIndex } from "./vector-index.ts";

/**
 * Keeps the derived index behind the JSON source of truth. Callers deliberately
 * do not await `schedule`: saving knowledge must still succeed when a local
 * embedding model is temporarily unavailable.
 */
export interface KnowledgeIndexMaintainer {
  schedule(spaces: KnowledgeSpace[]): Promise<KnowledgeIndexSyncResult | undefined>;
}

type IndexFactory = () => KnowledgeVectorIndex;

export class LocalKnowledgeIndexMaintainer implements KnowledgeIndexMaintainer {
  private pending: Promise<KnowledgeIndexSyncResult | undefined> = Promise.resolve(undefined);
  private readonly provider: EmbeddingProvider;
  private readonly createIndex: IndexFactory;
  private readonly maxAttempts: number;

  constructor(
    provider: EmbeddingProvider = new LocalBgeSmallZhEmbeddingProvider(),
    createIndex: IndexFactory = () => new SqliteKnowledgeVectorIndex(),
    maxAttempts = 3,
  ) {
    this.provider = provider;
    this.createIndex = createIndex;
    this.maxAttempts = maxAttempts;
  }

  schedule(spaces: KnowledgeSpace[]) {
    // Copy the snapshot so later in-memory edits cannot change the queued work.
    const source = structuredClone(spaces);
    this.pending = this.pending.catch(() => undefined).then(() => this.synchronize(source));
    return this.pending;
  }

  private async synchronize(spaces: KnowledgeSpace[]) {
    let latestError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const index = this.createIndex();
      try {
        return await index.sync(spaces, this.provider);
      } catch (error) {
        latestError = error;
        if (attempt === this.maxAttempts) index.recordSyncFailure(error);
      } finally {
        index.close();
      }
      await delay(150 * attempt);
    }
    throw latestError;
  }
}

let defaultMaintainer: LocalKnowledgeIndexMaintainer | undefined;

/** Instantiate only after a knowledge write, never while a route module loads. */
export function defaultKnowledgeIndexMaintainer() {
  defaultMaintainer ??= new LocalKnowledgeIndexMaintainer();
  return defaultMaintainer;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
