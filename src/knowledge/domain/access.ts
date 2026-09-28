import type { KnowledgeSpace } from "./types";

/**
 * Agent access to a space is opt-in. An empty binding never grants access,
 * which keeps a newly created space private until an owner explicitly binds it.
 */
export function canAgentAccessKnowledgeSpace(space: KnowledgeSpace, agentId: string): boolean {
  const normalizedAgentId = agentId.trim();
  return normalizedAgentId.length > 0 && space.agentIds.includes(normalizedAgentId);
}
