import type { KnowledgeSpace } from "./types";

export function createStarterSpaces(ownerUserId: string, now: string): KnowledgeSpace[] {
  return [
    {
      id: `legal-${ownerUserId}`,
      ownerUserId,
      name: "法律知识",
      description: "沉淀合同、合规与风险判断中的核心概念和依据。",
      domain: "法律与合规",
      color: "#3b82f6",
      agentIds: [],
      createdAt: now,
      updatedAt: now,
      nodes: [
        createNode("contract", "合同", "法律概念", "明确当事人之间权利与义务的协议。", "关注主体、标的、履行、违约与争议解决条款。", ["协议", "权利义务"], 25, 32, now),
        createNode("risk-review", "合同风险审查", "工作方法", "从效力、履行和责任三个层面识别合同风险。", "建议结合具体业务背景、适用法律和证据材料进行判断。", ["审查", "风险"], 61, 20, now),
        createNode("compliance", "合规义务", "法律概念", "组织在特定业务场景中需要持续满足的规范要求。", "可按行业、地域、数据类别和责任主体建立检查项。", ["监管", "义务"], 68, 68, now),
      ],
      edges: [
        createEdge("legal-e1", "contract", "risk-review", "审查对象", now),
        createEdge("legal-e2", "risk-review", "compliance", "需要核对", now),
      ],
    },
    {
      id: `ai-${ownerUserId}`,
      ownerUserId,
      name: "AI 知识",
      description: "组织模型、提示词、检索增强与智能体工程知识。",
      domain: "人工智能",
      color: "#7c5cff",
      agentIds: [],
      createdAt: now,
      updatedAt: now,
      nodes: [
        createNode("llm", "大语言模型", "核心技术", "基于大规模语料训练的生成式语言模型。", "适合理解、生成和转换自然语言，也需要外部知识与工具补足时效性。", ["LLM", "模型"], 23, 27, now),
        createNode("rag", "检索增强生成", "架构模式", "先检索可信知识，再将结果注入模型上下文。", "典型流程包括切分、索引、召回、重排和带引用生成。", ["RAG", "检索"], 58, 18, now),
        createNode("agent", "智能体", "应用形态", "能够规划、调用工具并根据结果继续行动的 AI 系统。", "知识库可以为智能体提供领域事实、规则与经验。", ["Agent", "工具调用"], 72, 62, now),
        createNode("knowledge-graph", "知识图谱", "数据结构", "以实体和关系组织可连接、可追溯的知识。", "适合表达复杂关系，并与语义检索组合使用。", ["Graph", "实体关系"], 35, 72, now),
      ],
      edges: [
        createEdge("ai-e1", "rag", "llm", "增强", now),
        createEdge("ai-e2", "knowledge-graph", "rag", "提供结构化知识", now),
        createEdge("ai-e3", "agent", "rag", "调用", now),
        createEdge("ai-e4", "agent", "llm", "基于", now),
      ],
    },
  ];
}

function createNode(id: string, title: string, type: string, summary: string, content: string, tags: string[], x: number, y: number, now: string) {
  return { id, title, type, summary, content, tags, aliases: [], x, y, createdAt: now, updatedAt: now };
}

function createEdge(id: string, source: string, target: string, relation: string, now: string) {
  return { id, source, target, relation, createdAt: now, updatedAt: now };
}
