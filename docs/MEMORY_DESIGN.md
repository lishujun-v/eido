# Eido Memory：自动化记忆与关系图谱设计

版本：v1.0  
状态：待实现  
关联模块：`src/agents/server/python/eido_agent`、`webui/src/app`、`database/`、`runtime/workspace/`

## 1. 决策摘要

Eido Memory 是一个由 Agent 自动沉淀、用户可控、可追溯的长期记忆系统。它同时服务两件事：

1. 在下一次任务中向 Agent 提供真正相关的上下文；
2. 以局部优先、可探索的关系图谱，帮助用户理解人、项目、文件、决策和任务如何相互关联。

采用 **“原始证据 + 记忆单元 + 图谱索引”** 三层模型。系统预置小而稳定的分类与关系，用于筛选、检索和视觉表达；同时保留自由文本关系与原始内容，避免有限枚举压缩或丢失记忆含义。

文件仍保留在现有文件系统及 workspace 中；Memory 仅保存其稳定引用、摘要和必要元数据，不复制文件内容。

## 2. 目标、非目标与原则

### 2.1 目标

- 自动从聊天、工具调用、Agent 委派、Graph 运行与文件变动中提炼长期有价值的信息。
- 支持 `personal`（个人）和 `workspace`（项目）双作用域；一次记忆可同时在两个作用域可见，但只有一个规范记录。
- 每一条可被 Agent 使用的记忆都可追溯至对话、运行、文件或用户手动输入。
- 以当前任务、项目或文件为中心显示局部图谱，提供全局探索能力但不把“全量星云图”作为默认界面。
- 支持确认、编辑、固定、归档、遗忘、纠错和“已被替代”的历史链路。

### 2.2 非目标（MVP 不做）

- 不把每一段对话或每条 tool log 都自动转为长期记忆。
- 不支持跨用户共享个人记忆；共享 workspace 记忆的多人权限模型在后续迭代处理。
- 不在第一期构建通用知识图谱推理引擎、复杂本体编辑器或自动关系训练。
- 不复制、索引 workspace 之外没有明确授权读取的文件内容。
- 不用图谱替代原始对话、文件或执行日志的事实来源。

### 2.3 产品原则

1. **证据优先**：图上的结论必须能打开来源。
2. **写入克制**：只有未来可复用或会影响决策的信息进入长期记忆。
3. **语义开放**：预置结构帮助组织，无法表达的关系保留为自由标签。
4. **用户可控**：用户可以查看、修改、删除或禁止自动沉淀。
5. **历史不静默丢失**：新结论替代旧结论时建立 `supersedes` 链路，不覆盖原记录。
6. **检索优先于展示**：图谱是记忆系统的可视化界面；Agent 能正确找到信息是第一成功标准。

## 3. 用户与关键场景

### 3.1 场景 A：聊天中形成稳定偏好

用户说“以后所有产品文档都用中文、先给结论再写过程”。Agent 提取一条个人偏好记忆，默认状态为 `active`，并链接到该会话消息。后续所有个人 Agent 对话可召回它。

### 3.2 场景 B：任务执行得到项目决策和文件产物

Agent 在 `focus-board` 项目中决定使用本地 JSON 数据，并创建 `runtime/projects/focus-board/data/tasks.json`。运行结束后产生：

- 一条 `decision` 记忆：“Focus Board 第一阶段使用本地 JSON 持久化。”
- 一个 `file` 证据引用，指向实际 workspace 文件；
- 一条 `affects` 边，将决策连接到项目实体与文件证据；
- 一条执行证据，包含 run/session、调用 Agent 和工具事件摘要。

### 3.3 场景 C：结论变化

后来用户决定迁移到 PostgreSQL。Agent 创建新的 `decision`，以 `supersedes` 指向旧决策，旧决策状态置为 `superseded`。图谱默认只突出新决策，用户仍可沿时间链查看演变。

### 3.4 场景 D：开始新任务时自动召回

用户打开某项目并让 Agent“继续实现 Memory”。系统以当前 `projectId`、打开文件、用户输入和 Agent 身份为检索条件，注入少量高相关记忆与其证据链接；不把全部历史塞进 prompt。

## 4. 概念模型

```text
Evidence（原始证据）
  ├─ Conversation message / Session
  ├─ Agent run / Agent call / Graph run
  ├─ Tool event
  ├─ Workspace file
  └─ User manual note
          │ supports
          ▼
Memory（可复用结论） ── relates to ── Entity（人 / 项目 / 文件 / 技术等）
          │
          ├─ personal scope
          └─ workspace scope

Graph View = Memory + Entity + Evidence 的按需投影
```

### 4.1 原始证据层（Evidence）

Evidence 是不可被图谱概括替代的来源定位信息。它可包含一个小型快照/摘录，原文仍在会话、运行记录或文件系统中。

| `kind` | 原始位置 | 必填定位信息 |
|---|---|---|
| `conversation_message` | `database/sessions.json` / Agent data dir | `session_id`、`message_index` |
| `agent_call` | `agent_calls.json` | `agent_call_id` |
| `graph_run` | `runtime/graphs/<id>/runs/*.json` | `graph_id`、`run_id` |
| `tool_event` | 会话/运行的事件记录 | `session_id` 或 `run_id`、事件序号 |
| `workspace_file` | `runtime/workspace/...` 或项目目录 | `workspace_id`、相对路径、可选 hash |
| `manual` | Memory 本身 | 用户输入内容 |

文件证据禁止存放完整二进制内容。文本文件仅保存最多 1,000 字符的提取摘要和内容 hash，用于“文件变更后证据是否过期”的检测。

### 4.2 记忆单元层（Memory）

一条 Memory 是对未来工作可能有用、可独立理解的陈述。它不是原始聊天消息，也不是无限制的笔记。

预置 `kind`：

| 类型 | 含义 | 例子 |
|---|---|---|
| `preference` | 用户或团队的稳定偏好 | “文档默认使用中文” |
| `fact` | 相对稳定的已知事实 | “该 Agent 的 workspace 是 ws_LILI” |
| `decision` | 已作出的取舍或规则 | “项目先用 JSON 存储” |
| `task` | 未完成、可跟进的工作 | “为图谱加入筛选器” |
| `event` | 对未来有意义的发生事项 | “2026-08-08 发布 MVP” |
| `knowledge` | 可复用的领域知识/方法 | “pgvector 用于语义检索” |
| `observation` | 低确定性但有价值的发现 | “用户通常在下午处理设计反馈” |

`kind` 不可扩展为任意字符串，以确保 API、筛选器、颜色与召回策略稳定；但 `tags` 与关系 `label` 完全开放。

### 4.3 实体层（Entity）

实体是被多条记忆反复引用的稳定对象，用于降低图谱重复和改善检索。MVP 自动管理以下实体类型：`person`、`agent`、`workspace`、`project`、`file`、`technology`、`topic`、`organization`。

自动提取只有在名称/路径稳定且置信度足够时创建实体；否则仅保留在 Memory 的文本和 tags 中。实体可合并，合并后保留 alias。

### 4.4 关系层（Relation）

关系端点可以是 `memory`、`entity` 或 `evidence`。使用如下受控关系类型：

| 关系 | 用途 |
|---|---|
| `mentions` | 文本明确提到对象 |
| `related_to` | 有关联但无法可靠细分 |
| `belongs_to` | 文件、任务或概念归属项目/workspace |
| `affects` | 决策、事件对对象产生影响 |
| `supports` | 证据支持某条记忆 |
| `contradicts` | 两个结论冲突，需用户确认 |
| `supersedes` | 新记忆替代旧记忆 |
| `derived_from` | 汇总/抽象自另一记忆或证据 |

每条关系另有 `label`（自由文本，如“曾参与评审”“导致兼容性风险”）、`confidence`、`created_by`。受控 `type` 负责结构与交互；`label` 保留未枚举语义。这是兼顾可构图与不丢信息的关键设计。

## 5. 数据契约与持久化

### 5.1 MVP 存储方式

沿用现有 JSON 原子写入能力。新增 `database/memory/`，按表拆分文件，避免与 `agents.json`、`sessions.json` 混写：

```text
database/memory/
  memories.json
  entities.json
  relations.json
  evidence.json
  extraction-jobs.json
  settings.json
```

生产迁移目标为 PostgreSQL + pgvector；API 与领域模型保持不变。JSON 阶段的检索采用关键词、标签和图邻接；向量字段允许为空。迁移时导入 ID 和时间戳，文件系统证据路径不变。

### 5.2 TypeScript / Python 共用 JSON 结构

```ts
type MemoryScope =
  | { type: "personal"; ownerUserId: string }
  | { type: "workspace"; workspaceId: string; ownerUserId: string };

type MemoryRecord = {
  id: string;                         // mem_<uuid>
  ownerUserId: string;
  scopes: MemoryScope[];              // 至少一项，可同时有两项
  kind: "preference" | "fact" | "decision" | "task" | "event" | "knowledge" | "observation";
  title: string;                      // <= 120 chars，图节点标题
  content: string;                    // <= 4,000 chars，可独立理解的陈述
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  confidence: number;                 // 0..1
  status: "active" | "pending_review" | "superseded" | "archived";
  source: "auto" | "user" | "import";
  createdBy: { agentId?: string; userId?: string; runId?: string };
  evidenceIds: string[];
  embedding?: number[];               // MVP 可缺省
  lastConfirmedAt?: string;
  expiresAt?: string;                 // 任务、观察可选
  createdAt: string;
  updatedAt: string;
};

type EvidenceRecord = {
  id: string;                         // ev_<uuid>
  ownerUserId: string;
  kind: "conversation_message" | "agent_call" | "graph_run" | "tool_event" | "workspace_file" | "manual";
  locator: Record<string, string | number>;
  excerpt: string;                    // <= 1,000 chars，脱敏后的摘录
  contentHash?: string;
  capturedAt: string;
  createdAt: string;
};

type EntityRecord = {
  id: string;                         // ent_<uuid>
  ownerUserId: string;
  type: "person" | "agent" | "workspace" | "project" | "file" | "technology" | "topic" | "organization";
  name: string;
  normalizedName: string;
  aliases: string[];
  attributes: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type RelationRecord = {
  id: string;                         // rel_<uuid>
  ownerUserId: string;
  from: { type: "memory" | "entity" | "evidence"; id: string };
  to: { type: "memory" | "entity" | "evidence"; id: string };
  type: "mentions" | "related_to" | "belongs_to" | "affects" | "supports" | "contradicts" | "supersedes" | "derived_from";
  label?: string;                     // 自由关系文本，<= 120 chars
  confidence: number;
  createdBy: "auto" | "user" | "system";
  createdAt: string;
};
```

### 5.3 不变量

- 所有记录必须有 `ownerUserId`；读取时先按 owner 过滤。
- `scopes` 至少包含一项；workspace scope 必须同时有 `workspaceId` 与 `ownerUserId`。
- `supports` 的 `from` 必须为 evidence、`to` 必须为 memory。
- `supersedes` 两端必须是 memory；新记录为 `from`，旧记录为 `to`。
- 删除 Memory 不删除其 Evidence；Evidence 在无引用且超出保留期后才可 GC。
- 文件引用只接受由服务端解析且位于受控 workspace/project 根目录内的相对路径。

## 6. 自动沉淀流程

### 6.1 触发点

| 事件 | 触发时机 | 可用输入 |
|---|---|---|
| 对话轮次结束 | `AgentRuntime.chat()` 写入 assistant 消息后 | 最新用户/助手消息、工具事件、session 摘要 |
| Agent 委派结束 | `delegate_task()` 完成、失败或超时 | call、结果、worker session、artifacts |
| Graph 运行结束 | `run_graph()` / `submit_graph()` 终态 | GraphRun、节点事件、输出 |
| 文件写入成功 | `write_file`、`exec` 等工具完成后 | workspace、相对路径、变动摘要、hash |
| 用户手动保存 | Memory UI 操作 | 用户文本、当前上下文 |

MVP 不监听所有底层文件系统事件。优先利用 Agent 已知的工具成功事件，避免外部编辑器产生大量无意义自动记忆。后续可提供显式“扫描 workspace 变更”功能。

### 6.2 两阶段异步任务

聊天请求不得因提炼而变慢。主流程写入原始会话与事件后，仅创建 `extraction-job`；后台 worker 异步运行。

```text
主任务完成
  → 捕获 Evidence
  → 创建 queued ExtractionJob
  → 立即返回聊天/任务结果

后台 worker
  → 规则预筛选
  → LLM 提取候选记忆
  → 校验 schema + 脱敏
  → 去重/冲突/替代判断
  → 保存 Memory、Entity、Relation
  → 发送 memory.created / memory.updated 事件
```

`ExtractionJob` 需记录 `sourceType`、`sourceId`、状态（`queued/running/completed/failed/skipped`）、尝试次数、错误、产出 IDs 和幂等键。幂等键为 `sourceType:sourceId:sourceVersion`，同一运行不会重复写入。

### 6.3 规则预筛选

无需 LLM 的内容直接跳过：寒暄、重复工具日志、短暂状态、无结论的失败尝试、敏感字段、仅有代码 diff 但没有语义说明的文件事件。

优先候选信号：用户明确表达“记住/以后/默认”；最终决策；约束与偏好；可复用知识；任务承诺；新文件/重要文件；Agent 运行最终产物。

### 6.4 LLM 提取输出

提取模型只能输出符合 JSON schema 的候选，不允许直接写数据库。每项包含：`kind/title/content/tags/importance/confidence/entities/relations/evidenceSpans/suggestedScopes`。

系统提示词必须要求：

- 每条陈述独立、短小、面向未来复用；
- 不推断未在证据中出现的信息；
- 私钥、访问令牌、密码、身份证明、精确住址及用户标记为私密的内容不得输出；
- 不确定时使用 `observation` 且降低 confidence，或返回空数组；
- 关系优先使用受控 type；需要时填 `label`，不要发明 type；
- 对“新决定取代旧决定”的情况给出 `supersedesCandidate`，由服务层最终核验。

### 6.5 自动写入阈值

| 条件 | 行为 |
|---|---|
| `confidence >= 0.85` 且 `importance >= 3` | 自动写为 `active` |
| `0.60 <= confidence < 0.85` | 写为 `pending_review`，默认不注入 prompt |
| `confidence < 0.60` | 不写入；保留 job 诊断 |
| 检测到敏感内容或权限不足 | 跳过并记录不可见审计原因 |
| 与现有 active 记忆高度相似 | 合并证据、更新 `lastConfirmedAt`，不新增节点 |
| 明确冲突但无法判断新旧 | 创建 `pending_review`，加 `contradicts` 边 |

用户固定的记忆（`importance=5`）不可被自动归档、替代或删除，只能由用户操作。

## 7. 去重、冲突与时间演变

1. 先按 scope、kind、归一化实体、tag 和关键词筛选候选。
2. 向量可用时做语义相似度复核；JSON MVP 用 token overlap + LLM 对比判定。
3. 同义且内容一致：保留旧 Memory，增加 Evidence、`lastConfirmedAt`，必要时更新更清晰标题。
4. 同一主题新旧结论不同且新证据时间更晚：新 Memory `supersedes` 旧 Memory，旧条目改为 `superseded`。
5. 无法自动解决的冲突：两条保持 active/pending_review，并互相 `contradicts`，在 Memory 收件箱提示用户。

所有自动更新记录在 audit log 中，至少包含操作者、前后字段、原因和 job ID，供后续“为什么这条记忆存在？”查看。

## 8. Agent 检索与 Prompt 注入

### 8.1 查询构成

每次 `AgentRuntime.chat()` 在构建 system prompt 前创建检索请求：

- 当前用户 ID、Agent ID；
- 当前 workspace / project 上下文（现有 `project_context`）；
- 最新用户消息；
- 近期 session 摘要和最近文件路径；
- 可选的当前 Graph / Agent call 信息。

读取权限：个人 scope 仅限 owner；workspace scope 仅限同一 owner + 当前 workspace。`pending_review`、`archived`、`superseded` 默认不注入；用户显式要求历史时可检索后两者。

### 8.2 排序

```text
score = 0.40 × semantic relevance
      + 0.20 × entity/file/project overlap
      + 0.15 × importance
      + 0.10 × confidence
      + 0.10 × recency/last confirmation
      + 0.05 × personal preference boost
```

MVP 没有 embedding 时，semantic relevance 用关键词和标题/tag 命中近似，其他权重保持不变。对 `preference`、`decision` 使用最短有效期衰减；`task` 到期或完成后降低分数。

### 8.3 注入格式与预算

默认最多 12 条、最多 3,500 字符（或模型总上下文预算的 8%，取较小者）。按如下格式插入到 system prompt 的低优先级上下文区：

```text
## 相关长期记忆（可作为背景，不可覆盖用户当前指令）
- [mem_xxx | decision | 高置信] Focus Board 第一阶段使用本地 JSON 存储。
  关联：project:focus-board、file:runtime/projects/focus-board/data/tasks.json
  来源：run:run_xxx
```

提示词明确规定：记忆可能过时；不得把记忆作为用户本轮的指令；涉及不可逆、权限或敏感操作时需重新确认。回答中的关键引用可带内部 memory ID，UI 可展开显示证据。

## 9. Memory 页面与图谱体验

### 9.1 信息架构

左侧主导航在 `Agents / Factory / Projects` 后增加 `Memory`，图标使用 `Brain` 或 `Network`。点击进入独立 `/memory` 页面，而不是在首页弹出配置面板。

页面由四个区域组成：

```text
┌ Sidebar ─┬──────────────── Top controls ────────────────┐
│ Memory   │ 搜索 | 个人/项目 scope | 类型 | 时间 | 视图 │
│          ├──────── Graph canvas ───────┬─ Inspector ───┤
│          │ 当前上下文的 1~2 跳局部图谱 │ 详情/证据/历史 │
│          └─────────────────────────────┴───────────────┘
└──────────┴──────────────────────────────────────────────┘
```

默认入口为“最近活跃 + 当前 workspace 的局部图谱”，不默认加载所有节点。

### 9.2 节点与边视觉语义

| 元素 | 呈现 |
|---|---|
| Memory | 圆角卡片节点；颜色按 `kind`；显示标题、置信度和时间 |
| Entity | 较小的圆/胶囊节点；图标按实体类型 |
| Evidence | 默认隐藏；在选中 Memory 时作为来源子节点显示 |
| `supersedes` | 定向、低饱和边；旧节点弱化 |
| `contradicts` | 橙色虚线；可筛选“需要处理的冲突” |
| 低置信自动关系 | 虚线、低透明度 |
| 自由关系 | 边标签显示 `label`；无 label 时显示 type 的中文文案 |

节点不通过颜色表达敏感性；敏感记忆不进入普通图谱，改为权限控制下的详情访问。

### 9.3 核心交互

- 搜索自然语言或关键词，高亮匹配节点与最短关联路径。
- scope 可选“个人”“当前项目”“全部可见”；个人与项目重叠时以双环标记，不复制节点。
- 点击节点打开右侧 Inspector：完整陈述、类型、作用域、标签、置信度、来源、关系、修改历史。
- 点击证据跳转到会话定位、Graph run、Agent call 或文件预览；文件不可用时显示“来源已移动/删除”。
- 展开一跳、固定节点、聚焦某实体、按类型/时间/置信度过滤。
- 用户可创建、编辑、归档、忘记和固定记忆；编辑关系时可选择受控 type 并填写自由 label。
- “待确认”收件箱单列显示 `pending_review`、冲突、无法读取的文件证据。

### 9.4 性能与降噪

- 局部图最大 80 个节点、120 条边；超过后按 score 聚合并显示“还有 N 条可展开”。
- 全局图采用分页/按需扩展；不一次性把所有 JSON 传至浏览器。
- 默认隐藏 Evidence、已替代、已归档、低于 0.75 的边。
- 初期使用 `react-force-graph` 或 `@xyflow/react`；选择前以现有 Next.js bundle 和交互需求做一次技术 spike。图引擎必须支持 canvas、缩放、拖拽、可访问的列表替代视图。

## 10. API 设计

以下为 Next.js BFF 接口；由其转发/调用 Python Agent runtime 或直接访问统一存储服务。所有接口从认证上下文获取 `ownerUserId`，不信任客户端传入的 owner。

| 方法与路径 | 用途 |
|---|---|
| `GET /api/memory` | 列表/搜索；参数：`q, scope, workspaceId, kinds, status, cursor, limit` |
| `POST /api/memory` | 用户手动创建记忆 |
| `GET /api/memory/:id` | Memory + 实体、关系、证据、审计摘要 |
| `PATCH /api/memory/:id` | 编辑内容、scope、标签、importance、status |
| `DELETE /api/memory/:id` | 用户遗忘；软删除并从召回与普通图谱移除 |
| `POST /api/memory/:id/confirm` | 确认 pending 记忆或更新确认时间 |
| `POST /api/memory/:id/relations` | 手动新增关系 |
| `DELETE /api/memory/relations/:id` | 删除关系 |
| `GET /api/memory/graph` | 图投影；参数：`seed, workspaceId, scope, hops, filters, limit` |
| `GET /api/memory/inbox` | 待确认/冲突/失效证据 |
| `PATCH /api/memory/settings` | 自动记忆开关、阈值、保留策略 |
| `GET /api/memory/events` | SSE：`memory.created/updated/deleted/job.completed` |

内部 Python 接口（不直接向浏览器公开）：`MemoryService.enqueue_extraction()`、`retrieve_context()`、`capture_file_evidence()`、`apply_extraction()`。

## 11. 与现有 Eido 代码的集成点

### 11.1 后端

- 在 `src/agents/server/python/eido_agent/models.py` 新增上述 Pydantic 数据模型和 extraction job。
- 在 `src/agents/server/python/eido_agent/storage.py` 增加 Memory JSON 表读写，复用原子写入及 owner 过滤模式。
- 新增 `src/agents/server/python/eido_agent/memory/`：`service.py`、`extractor.py`、`retriever.py`、`graph.py`、`policy.py`。
- 在 `AgentRuntime.chat()` 中，助手消息写入后 enqueue chat extraction；构建 `build_system_prompt()` 前调用 retriever，将结果作为独立 memory context 注入。
- 在 `delegate_task()` 与 `_run_delegated_task()` 的终态创建 Agent-call evidence 并 enqueue extraction。
- 在 Graph run 完成事件处创建 Graph evidence 并 enqueue extraction。
- 在 builtin tool 的文件写入成功回调中调用 `capture_file_evidence()`；只传服务端验证后的 workspace 相对路径。
- 扩展 SSE，以非阻塞方式向前端发送 `memory.*` 事件；不得将提取失败转化为聊天失败。

### 11.2 前端

- 在 `webui/src/app/page.tsx` 的 `workspaceNavItems` 中加入 Memory，扩展 `ActiveSection`，或（推荐）改为 `webui/src/app/memory/page.tsx` 独立路由，避免首页组件继续膨胀。
- 新建 `webui/src/components/memory/`：`memory-graph.tsx`、`memory-inspector.tsx`、`memory-filters.tsx`、`memory-inbox.tsx`、`memory-editor.tsx`。
- 新增 `webui/src/app/api/memory/**/route.ts`；沿用 `src/lib/json-database.ts` 的原子写入原则，但 Memory 表路径应由一个专用 repository 封装，避免 API route 与 Python runtime 无锁并发写同一 JSON 文件。

### 11.3 并发约束

当前 Next.js 与 Python runtime 均可能读写本地 JSON。因此 MVP 必须指定单一写入所有者：**Python `MemoryService` 是 Memory 数据唯一写入者**；Next.js route 通过本地 Agent server RPC 访问它。若短期无法完成 RPC，必须引入进程间文件锁，而不是让两端同时 read-modify-write。

## 12. 权限、隐私与保留

- 自动记忆默认为开启，但首次启用时告知会从对话与 agent 执行中提取长期信息，提供全局关闭与单 workspace 关闭。
- 用户每次手动“忘记”后，Memory 软删除；默认 30 天后硬删除及 evidence GC。用户可在设置中立即永久删除。
- 私人 scope 不会因同一文件被项目 scope 引用而自动共享；跨 scope 复制必须由用户确认。
- 任何 token、password、cookie、Authorization header、私钥、支付卡号等命中敏感规则时，在 Evidence 摘录和提取 prompt 前被替换为 `[REDACTED]`。
- Memory 不自动保存工具调用完整参数或完整输出，仅保存必要的脱敏摘要；原日志的访问仍遵循原有权限。
- 删除 workspace 或文件后，Memory 保留“已失效来源”的审计信息，但不保留不该继续保留的文件摘录。

## 13. 分期实施计划

### Phase 0：领域层与安全基线

- 定义模型、JSON repository、唯一写入者和审计日志。
- 实现手动创建/编辑/忘记、Evidence 引用与文件路径校验。
- 覆盖 owner/scope 隔离、敏感字段脱敏、软删及路径穿越测试。

### Phase 1：自动记忆与基础检索

- 对话完成和 Agent-call 完成后的异步 extraction job。
- 规则预筛选、结构化 LLM 提取、阈值、去重和待确认队列。
- 将个人偏好与当前 workspace 决策注入 Agent prompt。
- 在 chat SSE 中展示“已保存记忆”状态，但不阻塞答案。

### Phase 2：Memory 列表、局部图与证据回溯

- 左侧 Memory 入口、列表/搜索/过滤/收件箱。
- `GET /graph` 局部投影、Inspector、会话/run/文件证据跳转。
- 支持关系编辑、固定节点、替代与冲突可视化。

### Phase 3：执行与文件记忆

- Tool event、Graph run、受控文件写入的 evidence capture。
- 文件 hash 失效检测、项目实体自动关联和任务记忆过期策略。
- 单项目/个人 scope 切换和跨 scope 明确复制。

### Phase 4：生产化

- PostgreSQL + pgvector migration、后台队列、embedding 检索。
- 多用户 workspace 权限、细粒度保留策略、导入导出与可观测性。

## 14. 验收标准

### 自动化

- 用户明确表达稳定偏好后，一次对话结束 10 秒内产生可追溯的 personal Memory，且下一轮可被正确召回。
- Agent 在 workspace 中完成一个有决策和文件产物的任务后，产生 decision + file evidence + 项目关联；文件内容不被复制进 Memory。
- 同一 source 重试不创建重复记忆；相同结论的新证据会合并。
- 提取服务失败不会影响聊天、Graph 或 Agent 委派的完成状态。

### 图谱与编辑

- Memory 页面默认加载不超过 80 节点的局部图，并在 1.5 秒内可交互（本地开发基准）。
- 选中任何自动记忆都可打开至少一条来源；失效来源有可理解状态。
- 用户可编辑内容/类型/作用域、确认候选、固定、归档和忘记；忘记后该记录不再进入检索或普通图谱。
- 新决策替代旧决策时，默认图突出新决策，且可回溯旧决策及其来源。

### 安全

- 用户 A 不能通过任何 list、graph、detail 或检索接口获取用户 B 的 personal/workspace Memory。
- 文件 locator 不能越出允许根目录，敏感字符串不会进入 Evidence excerpt、LLM 提取输入或 UI。
- pending/低置信记忆不会默认影响 Agent 回答。

## 15. 需在开发前确认的产品默认值

以下默认值已按当前讨论写入本文档，若无异议可直接实现：

1. 自动记忆默认开启，但 UI 提供总开关与 workspace 开关。
2. 自动写入阈值为 `confidence >= 0.85`；中置信度进入待确认。
3. 默认图展示当前 workspace 的局部图；无项目上下文时展示个人最近活跃图。
4. 个人与 workspace 使用同一条 Memory 的多 scope 表达，不复制内容。
5. Phase 1 使用现有 JSON 存储与关键词检索，向量检索留到 PostgreSQL 迁移阶段。
