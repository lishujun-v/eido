# Knowledge 领域样板

Knowledge 按依赖方向拆分，数据仍保存在仓库根目录的 `database/`：

- `domain/`：纯领域模型、错误和初始化数据，不依赖 Next.js 或数据库。
- `server/`：应用服务、JSON Repository 和 HTTP handlers；其他后端领域只依赖这里公开的服务。
- `sdk/`：面向 Web UI、脚本和第三方调用者的类型化 HTTP Client。
- `cli/`：面向顶层 CLI 的命令适配层，复用 SDK，不直接访问数据库。

依赖方向为 `cli/UI -> sdk -> HTTP handler -> service -> repository -> shared/database`。
Next.js 路由只做 HTTP 方法映射，浏览器代码不能导入 `server/`。

## 对外能力

- SDK：`KnowledgeClient` 提供知识空间 CRUD、节点 CRUD、搜索、`addBatch` 原子批量新增和 `updateNodes` 原子批量修改。
- CLI：项目根目录运行 `npm run knowledge -- <命令>`；默认访问 `http://127.0.0.1:3000`，通过 `EIDO_USER_ID` 传递用户身份，也可使用 `--base-url` / `--user`。
- Agent Skill：`database/agents/skills/knowledge-manage/` 提供 Agent 可装备的知识库管理流程和无依赖 CLI 脚本。

批量新增中的每个节点使用请求内唯一的 `ref`；关系端点既可使用新节点 `ref`，也可使用空间内已有节点 ID。服务会在单次写入前校验全部节点与关系，避免部分成功导致悬空关系。

## 检索演进

知识库面向 Agent 的混合检索、Embedding 存储和一跳知识图谱关系扩展方案见
[`docs/KNOWLEDGE_RETRIEVAL_DESIGN.md`](../../docs/KNOWLEDGE_RETRIEVAL_DESIGN.md)。该文档同时定义了 API、SDK、CLI、Agent Tool 和分阶段实施计划。

当前关键词检索的固定评测集位于
[`database/knowledge_retrieval_evaluation.json`](../../database/knowledge_retrieval_evaluation.json)，可通过
`npm run knowledge:evaluate` 运行。基线指标和维护说明见
[`docs/knowledge-retrieval-baseline.md`](../../docs/knowledge-retrieval-baseline.md)。

## SQLite 语义索引

`database/knowledge_spaces.json` 始终是事实来源；`database/knowledge_index.sqlite`
是可删除、可重建的派生索引。阶段 1 使用本地
`BAAI/bge-small-zh-v1.5`（512 维）生成 Float32 BLOB 向量：

```bash
npm run knowledge -- index status
npm run knowledge -- index sync
npm run knowledge -- index verify
```

首次运行前需按项目根目录的模型下载说明准备模型；`sync` 不会修改知识源 JSON。
若本地尚未有模型，可运行 `npm run knowledge:model:download` 下载到
`data/models/bge-small-zh-v1.5`。模型和可重建的 SQLite 索引均被 Git 忽略。

阶段 2 的 `KnowledgeSemanticRetriever` 会把 Chunk 结果合并为知识节点，并且仅在索引缺失或内容哈希变化时补齐向量。知识节点、空间的写入成功后会在后台串行同步索引；连续三次失败会记录最近的错误和时间，`index status` 可见，`index sync` 可恢复。保存知识不会因本地模型暂时不可用而失败，现有关键词检索保持可用。

阶段 3 新增了内部 `KnowledgeLexicalRetriever` 与 `KnowledgeHybridRetriever`：前者封装稳定的关键词候选，后者以 RRF（`k = 60`）融合关键词和语义排名。每个结果都带有命中字段、匹配 Chunk、原始关键词/语义分数、融合分数及召回原因；语义不可用时自动只使用关键词结果。对外 API、CLI、SDK 和 Agent 接入留待阶段 5，当前页面和 Agent 的既有检索行为不变。
