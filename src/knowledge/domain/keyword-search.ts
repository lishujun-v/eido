import type { KnowledgeNode, KnowledgeSearchResult } from "./types";

/**
 * The pre-vector-search retrieval baseline. Keep this function deterministic so
 * evaluation results can be compared with later retrieval implementations.
 */
export function scoreKnowledgeNode(
  spaceId: string,
  node: KnowledgeNode,
  normalizedQuery: string,
): KnowledgeSearchResult {
  const fields: Array<[string, string, number]> = [
    ["title", node.title, 8],
    ["alias", node.aliases.join(" "), 6],
    ["tag", node.tags.join(" "), 5],
    ["type", node.type, 3],
    ["summary", node.summary, 2],
    ["content", node.content, 1],
  ];
  const matchedFields: string[] = [];
  const score = fields.reduce((total, [name, value, weight]) => {
    const normalizedValue = value.toLocaleLowerCase();
    const reverseMatch = ["title", "alias", "tag"].includes(name)
      && normalizedValue.length >= 2
      && normalizedQuery.includes(normalizedValue);
    if (!normalizedValue.includes(normalizedQuery) && !reverseMatch) return total;
    matchedFields.push(name);
    return total + weight;
  }, 0);
  return { spaceId, node, score, matchedFields };
}
