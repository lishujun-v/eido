# Knowledge 混合检索与图谱增强设计

> 状态：阶段 0 至阶段 6 已完成；阶段 7 按规模需要评估。  
> 适用模块：`src/knowledge`、`src/agents`  
> 数据源：`database/knowledge_spaces.json`  
> 派生索引：`database/knowledge_index.sqlite`

## 1. 背景

平台中的知识空间可以绑定给专家或 Agent。Agent 在处理任务时，需要从已绑定的知识空间中检索相关知识，并利用知识节点之间的关系补全上下文。

当前实现已经具备知识空间、知识节点和知识关系的数据模型，也支持基于标题、别名、标签、类型、摘要和正文的字符串匹配。但当前检索仍存在以下限制：

- 只能命中词面相同或互相包含的内容，无法稳定处理同义表达和自然语言问题。
- 知识图谱中的关系没有参与召回，检索结果是彼此孤立的节点。
- Agent 只能获得拼接后的节点内容，缺少检索分数、召回原因和关系路径。
- 缺少独立、可复用的检索 SDK、CLI 和 Agent Tool 契约。
- 当前 `knowledge_spaces.json` 是业务数据文件，不适合直接保存体积较大的向量数组。

截至本设计编写时，现有三个知识空间共包含 46 个节点、58 条关系，适合先使用本地精确向量检索，不需要立即部署独立向量数据库。

## 2. 目标与非目标

### 2.1 目标

- 支持关键词和语义混合检索。
- 使用知识图谱的一跳或两跳关系扩展召回结果。
- 严格限制 Agent 只能检索已绑定且属于当前用户的知识空间。
- 返回可解释的结果，包括召回来源、分数组成和图关系路径。
- 提供 Server、SDK、CLI 和 Agent Tool 四种调用形式。
- 支持知识节点新增、修改、删除后的增量索引。
- 保持 `knowledge_spaces.json` 为知识事实来源，Embedding 索引可删除、可重建。
- 通过接口抽象为未来迁移 Qdrant 等向量引擎保留空间。

### 2.2 非目标

第一阶段不实现以下能力：

- 不让 LLM 直接遍历整个知识库充当基础检索器。
- 不引入完整的社区发现、全局摘要等重型 GraphRAG 索引流程。
- 不在 `knowledge_spaces.json` 中保存 Embedding 数组。
- 不在第一版中部署独立向量数据库。
- 不把所有关系都自动转换成严格的本体或知识图谱 Schema。

## 3. 核心架构决策

检索采用以下组合：

```text
关键词召回 + Embedding 召回
          ↓
       排名融合
          ↓
       锚点节点
          ↓
    知识图谱关系扩展
          ↓
  规则重排 / 可选模型重排
          ↓
  带来源和路径的最终结果
```

各组件职责如下：

| 组件 | 职责 |
| --- | --- |
| 关键词检索 | 精确匹配标题、别名、标签、专有名词和编号 |
| Embedding 检索 | 处理同义表达、自然语言问题和跨字段语义匹配 |
| 图谱扩展 | 从相关锚点扩展出原因、影响、依据、解决方法等关联节点 |
| LLM | 可选的查询改写、复杂问题拆解、候选重排和最终答案生成 |

Embedding 和 LLM 不是二选一。Embedding 是基础语义召回能力；LLM 只在复杂查询中作为增强层使用。

## 4. 模块设计

Knowledge 模块继续遵循现有依赖方向：

```text
Agent / CLI / WebUI
        ↓
       SDK
        ↓
 HTTP Handler / Agent Tool Adapter
        ↓
 KnowledgeRetrievalService
        ├── LexicalRetriever
        ├── SemanticRetriever
        ├── ResultFusion
        ├── GraphExpander
        └── OptionalReranker
                 ↓
          Repository / Index
```

建议目录：

```text
src/knowledge/
├── domain/
│   ├── types.ts
│   └── retrieval-types.ts
├── server/
│   ├── service.ts
│   ├── retrieval-service.ts
│   ├── lexical-retriever.ts
│   ├── semantic-retriever.ts
│   ├── graph-expander.ts
│   ├── result-fusion.ts
│   ├── embedding-provider.ts
│   ├── vector-index.ts
│   └── handlers.ts
├── sdk/
└── cli/
```

领域服务只能依赖 `EmbeddingProvider` 和 `KnowledgeVectorIndex` 接口，不能直接依赖某个云厂商或某个向量数据库。

## 5. 索引单位与文本分块

Embedding 的最小索引单位为 `KnowledgeChunk`，而不是整个知识空间，也不一定是整个知识节点。

```ts
export type KnowledgeChunk = {
  id: string;
  ownerUserId: string;
  spaceId: string;
  nodeId: string;
  chunkIndex: number;
  text: string;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};
```

### 5.1 分块规则

- 标题、类型、别名、标签和摘要始终放在每个分块的前部。
- 正文建议按 400～800 个中文字符切分。
- 相邻正文块重叠 80～120 个字符。
- 短节点只生成一个分块。
- 优先在标题、段落和句号等自然边界处分割。
- 分块算法必须带版本号，算法变化时可以触发重建。

Embedding 输入示例：

```text
标题：猫咪呕吐
类型：宠物健康
别名：猫呕吐、猫反胃
标签：猫咪、消化系统、健康
摘要：猫咪呕吐的常见原因和危险信号。
内容：……
```

### 5.2 内容哈希

每个节点生成索引前计算哈希：

```text
SHA-256(
  chunkStrategyVersion +
  title + type + aliases + tags + summary + content
)
```

哈希未变化时不重新生成 Embedding。关系变化默认不触发 Embedding 更新，因为关系由图谱扩展阶段单独处理。

## 6. Embedding 存储设计

### 6.1 文件布局

```text
database/
├── knowledge_spaces.json
└── knowledge_index.sqlite
```

- `knowledge_spaces.json` 是知识节点和关系的唯一事实来源。
- `knowledge_index.sqlite` 是可重建的派生索引。
- 索引文件不应替代源数据，也不应被其他领域直接修改。

### 6.2 向量编码

Embedding 使用 SQLite `BLOB` 保存：

- 数值格式：IEEE 754 Float32。
- 字节序：Little Endian。
- 写入前执行 L2 归一化。
- 不保存为 JSON 数组。
- 不使用 Base64，避免额外的体积膨胀。
- 每条向量必须保存模型名称、维度、内容哈希和归一化状态。

以 1024 维向量为例：

```text
1024 × 4 bytes = 4096 bytes
```

归一化后，余弦相似度可以使用点积计算：

```text
cosine(query, document) = dot(normalizedQuery, normalizedDocument)
```

### 6.3 SQLite Schema

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE knowledge_chunks (
  id             TEXT PRIMARY KEY,
  owner_user_id  TEXT NOT NULL,
  space_id       TEXT NOT NULL,
  node_id        TEXT NOT NULL,
  chunk_index    INTEGER NOT NULL,
  text           TEXT NOT NULL,
  content_hash   TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE(node_id, chunk_index)
);

CREATE INDEX idx_knowledge_chunks_scope
ON knowledge_chunks(owner_user_id, space_id);

CREATE INDEX idx_knowledge_chunks_node
ON knowledge_chunks(node_id);

CREATE TABLE knowledge_embeddings (
  chunk_id       TEXT NOT NULL,
  model          TEXT NOT NULL,
  dimensions     INTEGER NOT NULL,
  vector         BLOB NOT NULL,
  normalized     INTEGER NOT NULL DEFAULT 1,
  content_hash   TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY(chunk_id, model),
  FOREIGN KEY(chunk_id)
    REFERENCES knowledge_chunks(id)
    ON DELETE CASCADE
);

CREATE TABLE knowledge_index_meta (
  key            TEXT PRIMARY KEY,
  value          TEXT NOT NULL
);
```

元数据至少包括：

```json
{
  "schemaVersion": "1",
  "embeddingModel": "configured-model-name",
  "dimensions": 1024,
  "chunkStrategy": "knowledge-chunk-v1",
  "indexVersion": "1"
}
```

### 6.4 多模型与模型切换

`knowledge_embeddings` 使用 `(chunk_id, model)` 作为主键，因此可以暂时并存新旧模型的向量。

模型切换流程：

1. 使用新模型生成一套新向量。
2. 执行固定评测集并比较结果。
3. 切换活动模型配置。
4. 稳定后清理旧模型向量。

读取向量时必须校验：

```text
stored.model == configuredModel
stored.dimensions == configuredDimensions
stored.contentHash == currentContentHash
stored.normalized == true
```

任一条件不满足时，该索引视为过期。

## 7. 索引生命周期与一致性

### 7.1 写入顺序

`knowledge_spaces.json` 是事实来源，因此写入顺序必须是：

```text
1. 校验知识数据
2. 成功写入 knowledge_spaces.json
3. 标记相关节点待索引
4. 更新 knowledge_index.sqlite
5. 标记索引完成
```

索引失败不能回滚已经成功保存的知识，但必须留下可重试状态并记录错误。

### 7.2 增量更新

| 知识操作 | 索引操作 |
| --- | --- |
| 新增节点 | 分块并生成 Embedding |
| 修改节点且哈希变化 | 删除旧分块，重新分块并生成 Embedding |
| 修改节点但哈希未变化 | 不处理 |
| 删除节点 | 删除 Chunk，级联删除 Embedding |
| 新增、删除或修改关系 | 不更新 Embedding，图检索立即使用最新关系 |
| 删除知识空间 | 删除该空间所有 Chunk 和 Embedding |

节点的一次重建必须在 SQLite 事务中完成，避免出现一半旧分块、一半新分块。

### 7.3 自愈与重建

索引必须提供以下 CLI：

```bash
npm run knowledge -- index status
npm run knowledge -- index sync
npm run knowledge -- index rebuild
npm run knowledge -- index verify
```

- `status`：显示模型、维度、待索引数量和失败数量。
- `sync`：只补齐缺失或过期索引。
- `rebuild`：从 `knowledge_spaces.json` 完整重建。
- `verify`：检查节点、Chunk、Embedding、模型和哈希的一致性。

## 8. 检索流程

### 8.1 权限过滤

检索开始前必须确定允许访问的知识空间：

```text
ownerUserId 必须匹配当前用户
AND
space.agentIds 必须包含当前 agentId
```

内部管理界面可以显式传递 `spaceIds`，但仍必须验证空间属于当前用户。Agent Tool 不允许指定其他用户，也不允许绕过绑定检索任意空间。

### 8.2 查询预处理

默认只执行确定性的轻量处理：

- 去除首尾空白。
- 统一大小写和常见标点。
- 保留原始查询用于展示和追踪。
- 不默认调用 LLM。

只有在指代不清、问题复杂或检索置信度不足时，才允许调用 LLM 进行查询改写或问题拆解。

### 8.3 并行召回

关键词和语义检索并行执行：

```text
LexicalRetriever  → Top 20
SemanticRetriever → Top 20
```

关键词字段初始权重延续当前实现：

| 字段 | 初始权重 |
| --- | ---: |
| title | 8 |
| aliases | 6 |
| tags | 5 |
| type | 3 |
| summary | 2 |
| content | 1 |

后续可以将包含匹配升级为 BM25，但不能移除标题、别名、标签等精确召回能力。

### 8.4 排名融合

默认使用 Reciprocal Rank Fusion，避免直接比较不同量纲的关键词分数和余弦相似度。

```text
RRF(document) = Σ 1 / (k + rank)
```

第一版建议：

- 关键词候选 Top 20。
- 语义候选 Top 20。
- RRF 常数 `k = 60`，作为可配置项。
- 融合后保留 Top 6～10 个锚点节点。
- 同一节点的多个 Chunk 先聚合到节点级别，避免单个节点占满结果。

### 8.5 图谱扩展

融合后的节点作为图谱锚点。默认扩展一跳，复杂查询最多两跳。

```text
graphScore = anchorScore × relationWeight × hopDecay^hop
```

建议初始参数：

```text
maxHops = 1
hopDecay = 0.55
maxNeighborsPerAnchor = 5
maxExpandedNodes = 12
```

图遍历要求：

- 记录已访问节点，防止环路。
- 同一节点通过多条路径抵达时保留最高分路径，并可记录其他证据路径。
- 根据关系方向决定是否允许反向扩展。
- 未识别的关系类型使用默认低权重。
- 扩展结果必须保留完整的关系路径。

初始关系权重建议：

| 关系类型 | 权重 |
| --- | ---: |
| 定义、属于、依据 | 1.0 |
| 导致、影响、适用于 | 0.9 |
| 解决、预防、建议 | 0.9 |
| 相关、参考、未识别关系 | 0.6 |

第一版通过关系文本映射类型。后续可以将边扩展为规范字段：

```ts
type KnowledgeRelationType =
  | "is_a"
  | "causes"
  | "applies_to"
  | "requires"
  | "supports"
  | "related_to";
```

### 8.6 最终结果

默认最终返回 Top 6～8 个节点，并控制总字符或 Token 预算。优先保留：

1. 高置信度锚点。
2. 能直接回答问题的知识内容。
3. 能补充原因、依据、风险或处理方法的图扩展节点。
4. 来源和关系路径完整的结果。

## 9. LLM 的使用边界

LLM 只用于以下可选环节：

### 9.1 查询改写

结合有限的会话历史解决代词和上下文缺失，例如将“它老是吐怎么办”改写为“猫咪频繁呕吐的原因、危险信号和处理方式”。

### 9.2 问题拆解

复杂比较或多目标问题可以拆分为多个子查询，分别检索后合并。

### 9.3 候选重排

只对初步召回的少量候选执行重排，例如从 12 个候选中选择 6 个，不允许让 LLM 扫描全库。

### 9.4 答案生成

Agent 根据检索证据生成答案。检索内容是参考数据，不是用户指令；注入上下文时必须继续保留该安全边界。

以下情况默认不调用额外 LLM：

- 查询包含明确的标题、别名、标签或专有名词。
- 混合检索已有高置信度结果。
- 用户只要求查找或列出知识，而不要求综合推理。

## 10. 对外接口

### 10.1 Server API

已实现独立端点：

```http
POST /api/knowledge/search
Content-Type: application/json
```

请求：

```json
{
  "query": "猫咪频繁呕吐需要注意什么",
  "agentId": "agent-xxx",
  "spaceIds": [],
  "mode": "hybrid",
  "topK": 6,
  "maxHops": 1,
  "includeContent": true,
  "explain": true
}
```

检索模式：

```ts
export type KnowledgeSearchMode =
  | "lexical"
  | "semantic"
  | "hybrid"
  | "graph";
```

约束：

- `query` 必填并限制长度。
- `topK` 默认 6，设置合理上限。
- `maxHops` 默认 1；当前实现最大 1，后续关系扩展成熟后再提高。
- `agentId` 调用必须校验知识空间绑定。
- 管理端指定 `spaceIds` 时仍需验证所有权。

### 10.2 返回结构

```ts
export type KnowledgeRetrievalResult = {
  query: string;
  normalizedQuery: string;
  mode: KnowledgeSearchMode;
  matches: Array<{
    spaceId: string;
    spaceName: string;
    nodeId: string;
    title: string;
    type: string;
    summary: string;
    content?: string;
    score: number;
    scoreBreakdown: {
      lexical: number;
      semantic: number;
      fusion: number;
      graph: number;
      rerank?: number;
    };
    matchedChunkIds: string[];
    matchedFields: string[];
    retrievalReasons: string[];
    graphPath?: Array<{
      edgeId: string;
      sourceNodeId: string;
      relation: string;
      targetNodeId: string;
    }>;
  }>;
  metadata: {
    searchedSpaceIds: string[];
    embeddingModel?: string;
    candidateCount: number;
    elapsedMs: number;
    indexVersion?: string;
  };
};
```

### 10.3 SDK

```ts
knowledgeClient.search({
  query: "猫咪频繁呕吐怎么办",
  agentId: "agent-xxx",
  mode: "hybrid",
  topK: 6,
  maxHops: 1,
});
```

SDK 只负责类型化请求，不实现检索算法。

### 10.4 CLI

```bash
npm run knowledge -- search \
  --agent agent-xxx \
  --query "猫咪频繁呕吐怎么办" \
  --mode hybrid \
  --top-k 6 \
  --max-hops 1 \
  --explain
```

### 10.5 Agent Tool

已对 Agent 暴露 `knowledge_search`：

```json
{
  "name": "knowledge_search",
  "description": "检索当前 Agent 已绑定的知识空间，并返回相关知识和关系路径。",
  "parameters": {
    "query": "string",
    "top_k": "integer",
    "max_hops": "integer"
  }
}
```

Agent Tool 的服务端根据当前身份注入 `ownerUserId` 和 `agentId`，不接受模型自行指定用户身份。

## 11. Agent 集成策略

为保证现有对话功能不受影响，分两步集成：

1. 已用新的统一检索服务替换 `searchForAgent()` 内部实现，自动注入仍保持原有上下文预算。
2. 已提供显式 `knowledge_search` Tool；运行时注入当前用户与 Agent 身份，模型只能提供查询、结果数和跳数。

自动注入应限制结果数和总上下文预算。显式 Tool 适合：

- 第一次结果不足。
- 需要沿关系继续追问。
- 复杂任务需要多轮检索。
- Agent 需要查看具体来源和路径。

建议在 Agent 上下文中采用结构化文本：

```text
[知识来源]
空间：宠物知识
节点：脱水
召回方式：图关系扩展
关系路径：猫咪呕吐 --可能导致--> 脱水
内容：……
```

## 12. 配置建议

配置通过环境变量或统一配置模块读取：

```text
EIDO_KNOWLEDGE_EMBEDDING_PROVIDER
EIDO_KNOWLEDGE_EMBEDDING_MODEL
EIDO_KNOWLEDGE_EMBEDDING_DIMENSIONS
EIDO_KNOWLEDGE_INDEX_PATH
EIDO_KNOWLEDGE_RETRIEVAL_TOP_K
EIDO_KNOWLEDGE_GRAPH_MAX_HOPS
EIDO_KNOWLEDGE_RERANK_ENABLED
```

任何密钥只能进入环境配置，不能写入知识数据、索引元数据或日志。

## 13. 监控与可观测性

每次检索记录结构化指标，但不默认记录完整敏感正文：

- 查询 ID。
- Agent ID、用户 ID的安全标识或哈希。
- 检索空间数量。
- 关键词和语义候选数量。
- 图扩展节点数量。
- 最终结果数量。
- 各阶段耗时和总耗时。
- 使用的模型、维度和索引版本。
- 是否执行查询改写或重排。
- 空结果、索引缺失、模型不一致和降级次数。

Embedding 服务不可用时，系统应降级为关键词检索和图扩展，而不是使 Agent 对话整体失败。

## 14. 测试与评测

### 14.1 单元测试

- 文本分块边界、重叠和稳定 ID。
- Float32 BLOB 编码、解码和维度校验。
- L2 归一化及点积相似度。
- 内容哈希和增量索引判断。
- RRF 排名融合。
- 一跳、两跳、环路和方向性图遍历。
- 权限过滤和未绑定空间拒绝。

### 14.2 集成测试

- 新增节点后可被检索。
- 修改节点后旧内容不再命中，新内容可以命中。
- 删除节点后 Chunk 和 Embedding 被级联删除。
- 索引文件删除后能够完整重建。
- Embedding Provider 失败时能够降级。
- Agent 不能检索未绑定空间。

### 14.3 固定评测集

每个知识空间维护一组查询及期望节点：

```ts
type RetrievalEvaluationCase = {
  query: string;
  agentId: string;
  expectedNodeIds: string[];
  expectedRelatedNodeIds?: string[];
  forbiddenNodeIds?: string[];
};
```

核心指标：

- Recall@5、Recall@10。
- MRR 或首个正确结果排名。
- 图关系节点召回率。
- 无关节点比例。
- P50、P95 检索延迟。
- 平均返回字符数或 Token 数。
- Embedding 调用次数和重建成本。

## 15. 分阶段实施计划

### 阶段 0：检索基线与评测集

状态：已完成。基线结果见 [`knowledge-retrieval-baseline.md`](knowledge-retrieval-baseline.md)，可用 `npm run knowledge:evaluate` 重新运行。

工作内容：

- 固化当前关键词检索行为。
- 为法律、AI、宠物知识分别建立代表性查询。
- 记录当前 Recall、空结果比例和延迟。
- 增加权限契约测试。

验收条件：

- 固定评测集可以自动运行。
- 能够比较改造前后的检索质量。
- 现有 API 和 Agent 对话行为无回归。

### 阶段 1：索引抽象与 SQLite 存储

状态：已完成。使用 `BAAI/bge-small-zh-v1.5`（本地 512 维模型）验证了现有 46 个
Chunk 的生成、向量写入和一致性检查。通过 `npm run knowledge -- index <命令>` 管理索引。

工作内容：

- 定义 `EmbeddingProvider` 和 `KnowledgeVectorIndex`。
- 建立 SQLite Schema 和迁移初始化。
- 实现 Float32 BLOB 编解码、维度和模型校验。
- 实现 Chunk 分块与内容哈希。
- 实现 `index status/sync/rebuild/verify` CLI。

验收条件：

- 可以从现有 JSON 完整生成索引。
- 重建结果稳定且可重复。
- 删除索引文件不会损坏知识数据。
- 索引一致性检查能够发现缺失、过期和维度错误。

### 阶段 2：语义检索与增量索引

状态：已完成。`KnowledgeSemanticRetriever` 使用本地 BGE 向量进行节点级语义召回；每次知识源成功写入后，后台维护器会按内容哈希串行补齐索引。Embedding 不可用时，写入不会失败，SQLite 会记录最近一次同步错误，后续写入或 `npm run knowledge -- index sync` 会重试。

工作内容：

- 接入可配置的 Embedding Provider。
- 实现本地精确点积检索。
- 在节点新增、修改和删除后同步更新索引。
- 加入 Provider 失败降级和重试机制。

验收条件：

- 同义表达能够召回目标节点。
- 未变化节点不会重复生成向量。
- 修改和删除操作不会留下陈旧结果。
- Provider 不可用时关键词检索仍然可用。

### 阶段 3：混合检索

状态：已完成（内部检索层）。`KnowledgeLexicalRetriever` 保留既有的确定性字段匹配规则；`KnowledgeHybridRetriever` 在节点粒度将关键词和语义候选通过 Reciprocal Rank Fusion（`k = 60`）合并。返回项包含关键词命中字段、语义相似度、匹配 Chunk、RRF 分数与可读的召回原因。语义模型或索引临时不可用时，会显式记录原因并只返回关键词结果，精确专有名词不会退化。

阶段 5 再将该服务接入 HTTP API、SDK、CLI 和 Agent 自动知识注入，以避免在尚未定义对外契约前改变当前线上调用行为。

工作内容：

- 抽出 `LexicalRetriever`。
- 实现 Chunk 到节点的候选聚合。
- 使用 RRF 融合关键词和语义排名。
- 增加分数明细和召回原因。

验收条件：

- 精确专有名词不因引入 Embedding 而退化。
- 自然语言查询优于当前纯关键词基线。
- 返回结果可以解释关键词、语义和融合贡献。

### 阶段 4：知识图谱关系扩展

状态：已完成（内部检索层，当前固定为一跳）。`KnowledgeGraphRetriever` 先取得混合检索锚点（默认结果数的一半，最多 6 个），再由 `KnowledgeGraphExpander` 以 `anchorScore × relationWeight × 0.55` 扩展相邻节点。每个锚点最多扩展 5 个邻居，总共最多返回 12 个扩展候选；同一节点只保留最高分路径。结果会标明锚点、关系、正/反向遍历，以及持久化边的完整路径。

当前关系文本规则：定义、属于、依据（权重 1.0、双向）；导致、影响、适用于、解决、预防、建议（0.9、正向）；相关、参考及未识别关系（0.6、双向）。`mode: "graph"` 已在阶段 5 接入 HTTP API、SDK、CLI 与 Agent，同时保留旧调用的默认行为。

工作内容：

- 实现关系类型映射和权重配置。
- 实现一跳扩展、衰减、去重和边界控制；两跳扩展后续按需要加入。
- 返回完整关系路径。
- 控制扩展数量和上下文预算。

验收条件：

- 能够通过锚点召回直接相关的原因、影响或处理节点。
- 不会因高连接度节点造成结果爆炸。
- 图扩展结果能够说明来源路径。

### 阶段 5：API、SDK、CLI 与 Agent Tool

状态：已完成。统一的 `KnowledgeService.searchRetrieval()` 是所有入口的授权和检索边界：管理端仅能检索自己的空间，带 `agentId` 时额外校验空间绑定。自动注入改为调用图检索；显式 Tool 由 Agent 运行时注入所有者和 Agent 身份，模型不能伪造这两个字段。

工作内容：

- 已新增 `POST /api/knowledge/search`。
- 扩展 Knowledge SDK 和 CLI。
- 已添加 `knowledge_search` Agent Tool。
- 已使用新服务替换当前 `searchForAgent()` 内部实现。
- 复用现有的知识空间 Agent 绑定入口作为访问授权配置。

验收条件：

- 四种调用形式返回一致的结构。
- Agent 只能检索已绑定空间。
- 旧的自动知识注入继续兼容。
- Agent 能按需执行显式二次检索。

### 阶段 6：可选 LLM 增强

状态：已完成（默认关闭）。服务会先完成确定性的基础检索；仅当查询存在指代不清、复合意图，或候选不足且未出现高权重精确命中时，才会调用已配置的 LLM 生成一个改写和最多三个子查询。所有子查询仍走同一权限过滤和混合/图谱检索链路。

LLM 只会看到原始问题及最多 12 个已授权候选，不能浏览整个知识空间。候选重排需要同时满足请求 `llm.rerank: true` 和服务端开关 `EIDO_KNOWLEDGE_LLM_RERANK_ENABLED=true`；因此在评测集验证收益前不会影响默认排序。任一步调用失败会返回原始基础结果，并在 `metadata.llm.unavailableReason` 中记录原因。

配置（均为服务端环境变量，不应发送给客户端）：

```text
EIDO_KNOWLEDGE_LLM_ENABLED=true
EIDO_KNOWLEDGE_LLM_API_KEY=...
EIDO_KNOWLEDGE_LLM_BASE_URL=https://.../v1        # 可选，默认 OpenAI API
EIDO_KNOWLEDGE_LLM_MODEL=gpt-4.1-mini             # 可选
EIDO_KNOWLEDGE_LLM_RERANK_ENABLED=true            # 可选，默认 false
```

API/SDK/CLI 可用 `llm.enhancement: "off" | "auto" | "force"`（CLI：`--llm`）控制查询增强。`auto` 为默认策略，`force` 仅适合评测或诊断。

工作内容：

- 已增加低置信度判定和精确命中短路。
- 已对指代不清的查询进行改写。
- 已对复杂查询进行最多三个子问题拆解。
- 已对最多 12 个候选提供受开关保护的可选重排。

验收条件：

- 简单查询不会额外调用 LLM。
- LLM 调用失败时检索仍能返回基础结果。
- 重排在评测集上有可量化收益后才默认开启。

### 阶段 7：规模化与外部向量引擎

只有在以下情况出现时才评估迁移：

- Chunk 数量达到数万至数十万。
- 本地精确扫描的 P95 延迟不可接受。
- 多进程或多实例需要共享索引。
- 需要更复杂的过滤、ANN、稀疏向量或多阶段检索。

迁移时新增 `QdrantKnowledgeVectorIndex` 等实现，保持领域服务、API、SDK、CLI 和 Agent Tool 契约不变。

## 16. 上线、降级与回滚

建议通过功能开关逐步上线：

```text
keyword-only
→ hybrid-shadow（计算但不影响结果）
→ hybrid-enabled
→ graph-enabled
→ rerank-enabled
```

回滚原则：

- 关闭语义检索后立即回退到现有关键词检索。
- 关闭图扩展后仍返回混合召回锚点。
- 删除或重建 SQLite 不影响知识源数据。
- 新 API 上线期间保留现有查询接口，直到调用方迁移完成。

## 17. 风险与约束

| 风险 | 应对方式 |
| --- | --- |
| Embedding 模型切换导致向量不可比 | 保存模型与维度，按模型隔离并重建 |
| 长内容语义被稀释 | 使用稳定分块和重叠策略 |
| 图关系质量不稳定 | 关系类型映射、权重、跳数和数量限制 |
| Agent 越权检索 | 服务端基于用户和绑定关系过滤 |
| 索引与源数据不一致 | 内容哈希、状态检查、同步和完整重建 |
| Embedding 服务中断 | 降级到关键词检索和图扩展 |
| 上下文过长 | Top-K、节点聚合和 Token 预算控制 |
| 过早引入复杂基础设施 | 当前使用 SQLite 精确检索，达到阈值再迁移 |

## 18. 最终落地方案摘要

第一版采用以下默认流程：

```text
权限过滤
→ 关键词 Top 20 + Embedding Top 20
→ RRF 融合
→ Top 8 锚点节点
→ 一跳图扩展
→ 最终 Top 6
→ 携带来源、分数明细和关系路径返回 Agent
```

存储方案确定为：

```text
knowledge_spaces.json  = 事实来源
knowledge_index.sqlite = Chunk + Float32 BLOB Embedding + 索引元数据
```

该方案能够满足当前小规模本地运行，同时保证未来更换 Embedding 模型、引入重排模型或迁移专业向量数据库时，不需要推翻上层接口与 Agent 集成方式。
