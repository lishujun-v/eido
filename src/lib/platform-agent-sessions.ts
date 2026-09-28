import { databaseDir, readObjectTable, tablePath, writeJson } from "@backend/shared/database";

type PlatformSessionInput = {
  sessionId: string;
  agentId: string;
  visitorId: string;
  message: string;
  images: string[];
  runtimeKind: string;
  workingDirectory?: string;
};

/**
 * Remote Agent Servers own their context, but Eido owns the user-visible
 * conversation index. Store a compact mirror in the existing sessions table.
 */
export async function appendRemoteUserMessage(input: PlatformSessionInput) {
  const directory = databaseDir();
  const sessions = await readObjectTable(directory, "sessions");
  const now = new Date().toISOString();
  const rawExisting = sessions[input.sessionId];
  const existing: Record<string, unknown> | null = isRecord(rawExisting) ? rawExisting : null;
  const messages = Array.isArray(existing?.messages) ? existing.messages : [];
  sessions[input.sessionId] = {
    id: input.sessionId,
    agent_id: input.agentId,
    visitor_id: input.visitorId,
    summary: typeof existing?.summary === "string" ? existing.summary : "",
    messages: [...messages, {
      role: "user",
      content: input.message,
      images: input.images,
      created_at: now,
    }],
    metadata: {
      ...(isRecord(existing?.metadata) ? existing.metadata : {}),
      runtime_kind: input.runtimeKind,
      ...(input.workingDirectory ? { working_directory: input.workingDirectory } : {}),
    },
    created_at: typeof existing?.created_at === "string" ? existing.created_at : now,
    updated_at: now,
  };
  await writeJson(tablePath(directory, "sessions"), sessions);
}

export async function appendRemoteAssistantMessage(sessionId: string, content: string) {
  if (!content) return;
  const directory = databaseDir();
  const sessions = await readObjectTable(directory, "sessions");
  const rawExisting = sessions[sessionId];
  const existing: Record<string, unknown> | null = isRecord(rawExisting) ? rawExisting : null;
  if (!existing) return;
  const now = new Date().toISOString();
  const messages = Array.isArray(existing.messages) ? existing.messages : [];
  sessions[sessionId] = {
    ...existing,
    messages: [...messages, { role: "assistant", content, created_at: now }],
    updated_at: now,
  };
  await writeJson(tablePath(directory, "sessions"), sessions);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
