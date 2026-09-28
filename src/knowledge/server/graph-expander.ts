import type {
  KnowledgeGraphPath,
  KnowledgeRetrievalMatch,
} from "../domain/retrieval-types.ts";
import type { KnowledgeEdge, KnowledgeNode, KnowledgeSpace } from "../domain/types.ts";

export type KnowledgeRelationRule = {
  weight: number;
  /** A directed relation can only be traversed from its persisted source. */
  direction: "forward" | "bidirectional";
};

export type KnowledgeGraphExpansion = {
  match: KnowledgeRetrievalMatch;
  graphScore: number;
};

export const DEFAULT_RELATION_RULE: KnowledgeRelationRule = {
  weight: 0.6,
  direction: "bidirectional",
};

/**
 * Text labels are still the source of truth for relations today. This small,
 * explicit mapping makes the ranking behaviour visible and lets later schema
 * migration replace labels with normalized relation types without changing
 * the retrieval contract.
 */
export const DEFAULT_RELATION_RULES: Record<string, KnowledgeRelationRule> = {
  "定义": { weight: 1, direction: "bidirectional" },
  "属于": { weight: 1, direction: "bidirectional" },
  "依据": { weight: 1, direction: "bidirectional" },
  "导致": { weight: 0.9, direction: "forward" },
  "影响": { weight: 0.9, direction: "forward" },
  "适用于": { weight: 0.9, direction: "forward" },
  "解决": { weight: 0.9, direction: "forward" },
  "预防": { weight: 0.9, direction: "forward" },
  "建议": { weight: 0.9, direction: "forward" },
  "相关": { weight: 0.6, direction: "bidirectional" },
  "参考": { weight: 0.6, direction: "bidirectional" },
};

const HOP_DECAY = 0.55;
const MAX_NEIGHBORS_PER_ANCHOR = 5;
const MAX_EXPANDED_NODES = 12;

/**
 * Expands direct retrieval anchors by exactly one graph hop. Keeping the
 * expander separate from ranking means future two-hop support cannot alter
 * lexical or semantic retrieval behaviour by accident.
 */
export class KnowledgeGraphExpander {
  private readonly relationRules: Record<string, KnowledgeRelationRule>;
  private readonly fallbackRule: KnowledgeRelationRule;

  constructor(
    relationRules: Record<string, KnowledgeRelationRule> = DEFAULT_RELATION_RULES,
    fallbackRule: KnowledgeRelationRule = DEFAULT_RELATION_RULE,
  ) {
    this.relationRules = relationRules;
    this.fallbackRule = fallbackRule;
  }

  expand(anchors: KnowledgeRetrievalMatch[], spaces: KnowledgeSpace[]): KnowledgeGraphExpansion[] {
    const nodes = new Map<string, { space: KnowledgeSpace; node: KnowledgeNode }>();
    const edgesByNode = new Map<string, Array<{ edge: KnowledgeEdge; direction: "forward" | "reverse" }>>();
    for (const space of spaces) {
      for (const node of space.nodes) nodes.set(key(space.id, node.id), { space, node });
      for (const edge of space.edges) {
        const rule = this.ruleFor(edge.relation);
        addEdge(edgesByNode, key(space.id, edge.source), { edge, direction: "forward" });
        if (rule.direction === "bidirectional") {
          addEdge(edgesByNode, key(space.id, edge.target), { edge, direction: "reverse" });
        }
      }
    }

    const anchorKeys = new Set(anchors.map((anchor) => key(anchor.spaceId, anchor.nodeId)));
    const bestByNode = new Map<string, KnowledgeGraphExpansion>();
    for (const anchor of anchors) {
      const neighbors = edgesByNode.get(key(anchor.spaceId, anchor.nodeId)) ?? [];
      let expandedForAnchor = 0;
      for (const { edge, direction } of neighbors) {
        if (expandedForAnchor >= MAX_NEIGHBORS_PER_ANCHOR) break;
        const neighborId = direction === "forward" ? edge.target : edge.source;
        const neighborKey = key(anchor.spaceId, neighborId);
        // Direct candidates are already ranked by lexical/semantic evidence.
        // Skipping them also keeps graph edges from inflating anchor scores.
        if (anchorKeys.has(neighborKey) || neighborKey === key(anchor.spaceId, anchor.nodeId)) continue;
        const neighbor = nodes.get(neighborKey);
        if (!neighbor) continue;
        expandedForAnchor += 1;

        const rule = this.ruleFor(edge.relation);
        const graphScore = anchor.score * rule.weight * HOP_DECAY;
        const path: KnowledgeGraphPath = {
          edgeId: edge.id,
          sourceNodeId: edge.source,
          relation: edge.relation,
          targetNodeId: edge.target,
          direction,
        };
        const candidate: KnowledgeGraphExpansion = {
          graphScore,
          match: {
            spaceId: neighbor.space.id,
            spaceName: neighbor.space.name,
            nodeId: neighbor.node.id,
            title: neighbor.node.title,
            type: neighbor.node.type,
            summary: neighbor.node.summary,
            content: neighbor.node.content,
            score: graphScore,
            scoreBreakdown: { lexical: 0, semantic: 0, fusion: 0, graph: graphScore },
            matchedChunkIds: [],
            matchedFields: [],
            retrievalReasons: [
              `关系扩展：由「${anchor.title}」经「${edge.relation || "关联"}」${direction === "reverse" ? "（反向）" : ""}关联`,
              `图谱分数：${graphScore.toFixed(6)}`,
            ],
            graphPath: [path],
          },
        };
        const existing = bestByNode.get(neighborKey);
        if (!existing || candidate.graphScore > existing.graphScore) bestByNode.set(neighborKey, candidate);
      }
    }

    return [...bestByNode.values()]
      .sort((left, right) => right.graphScore - left.graphScore || left.match.nodeId.localeCompare(right.match.nodeId))
      .slice(0, MAX_EXPANDED_NODES);
  }

  private ruleFor(relation: string): KnowledgeRelationRule {
    return this.relationRules[relation.trim()] ?? this.fallbackRule;
  }
}

function key(spaceId: string, nodeId: string) {
  return `${spaceId}\u0000${nodeId}`;
}

function addEdge(
  edgesByNode: Map<string, Array<{ edge: KnowledgeEdge; direction: "forward" | "reverse" }>>,
  nodeKey: string,
  value: { edge: KnowledgeEdge; direction: "forward" | "reverse" },
) {
  const entries = edgesByNode.get(nodeKey) ?? [];
  entries.push(value);
  edgesByNode.set(nodeKey, entries);
}
