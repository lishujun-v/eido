# Eido Agent Server 接口契约（替换实现对齐指南）

本文定义 Eido WebUI 与 Agent Server 之间的 HTTP 接口契约。后续替换 Agent Server 时，只要保持本文标为 **必需** 的接口、字段和流式事件兼容，WebUI 无需改动即可接入。

> 当前 WebUI 通过 `EIDO_AGENT_API_URL` 配置 Agent Server 根地址，默认值为 `http://127.0.0.1:8000`。所有路径均相对此根地址。

## 1. 范围与兼容性等级

| 等级 | 含义 | 当前 WebUI 使用位置 |
| --- | --- | --- |
| **必需** | 常规聊天工作台必须实现 | `/chat`、停止会话、交互回复 |
| **可选（GraphLines）** | 启用“业务线 / GraphLines”功能时必须实现 | Graph 运行、查询、SSE 事件流 |
| **管理兼容** | 供服务管理、调试或第三方集成使用；当前 WebUI 不通过这些接口管理 Agent | 健康检查、用户、Agent、会话、技能、OpenAI 兼容接口 |

WebUI 自身负责登录态、用户与 Agent 的归属校验、附件上传、项目上下文整理，以及将浏览器请求代理到本服务。当前服务之间没有传递用户 Cookie、Bearer Token 或其他 HTTP 鉴权头。因此替换服务至少需要信任运行在同一受控部署边界内的 WebUI；若增加服务端鉴权，必须同时修改 WebUI 代理以注入对应凭据。

## 2. 通用约定

- 请求与普通响应均为 UTF-8 JSON：`Content-Type: application/json`。
- JSON 字段采用 `snake_case`；WebUI 会将自己的 `camelCase` 字段转换后再请求 Agent Server。
- 未特别说明时，成功响应为 `200`。
- 错误响应为 `{ "detail": "可展示给用户的错误原因" }`。兼容 `{ "error": "..." }` 或 `{ "message": "..." }` 也可；WebUI 会依次读取 `detail`、`error`、`message`。
- 流式聊天是 NDJSON，而不是 SSE：每行一个完整 JSON 对象，以 `\n` 结束；不得拆分单个 JSON 对象，也不应输出日志、空行或非 JSON 文本。
- 长时间流式连接的空闲保活周期应不超过 15 秒。WebUI 对聊天和 Graph 事件流均使用 **150 秒无数据超时**（可用环境变量调整），不是总执行时长限制。
- ID 作为不透明字符串处理。现有实现通常使用 `session_<12位hex>`、`interaction_<16位hex>`、`run-<12位hex>`，替换实现可使用其他形式，只要前后端在一次会话内原样传递即可。Graph 端点的 WebUI 目前会校验 `run-[a-f0-9]{12}`，若更改该格式需同步修改 WebUI。

## 3. 必需：聊天接口

### 3.1 `POST /chat`

创建或延续一个 Agent 会话。`stream` 决定返回普通 JSON 还是 NDJSON 流。

#### 请求体

```json
{
  "agent_id": "li-xiaokong",
  "message": "帮我分析这个项目",
  "session_id": "session_ab12cd34ef56",
  "visitor_id": "user_123",
  "images": ["data:image/png;base64,iVBORw0..."],
  "attachment_paths": ["/absolute/path/to/file.pdf"],
  "model": "gpt-5",
  "stream": true,
  "slash_command": "compact",
  "working_directory": "/absolute/path/to/workspace",
  "permission_mode": "smart",
  "project_context": {
    "project_id": "paper-reader",
    "project_name": "论文阅读器",
    "kind": "general",
    "title": "当前文档",
    "file_path": "src/App.tsx",
    "content": "可供 Agent 参考的文件内容",
    "metadata": {}
  }
}
```

| 字段 | 类型 | 必填 | 约束与语义 |
| --- | --- | --- | --- |
| `agent_id` | string | 是 | 目标 Agent ID；不存在应返回 `404`。 |
| `message` | string | 是 | 用户输入。若仅发送图片/附件，WebUI 会传空字符串；替换服务应接受。 |
| `session_id` | string | 否 | 会话 ID；缺失时服务必须新建，并在响应 / `meta` 事件中返回。相同 ID 表示延续会话。 |
| `visitor_id` | string | 否 | 会话所有者标识，用于交互回复的归属校验。 |
| `images` | string[] | 否 | Data URL 图片；最多 4 张，格式为 png/jpeg/gif/webp。服务可选择不支持视觉模型，但不可因字段存在而报格式错误。 |
| `attachment_paths` | string[] | 否 | 已由 WebUI 上传后的绝对文件路径；最多 8 个。Agent Server 应只允许访问部署策略允许的工作目录内文件。 |
| `model` | string | 否 | 本次调用覆盖模型配置；返回中应回显实际使用的模型。 |
| `stream` | boolean | 否，默认 `false` | `true` 时返回 NDJSON。WebUI 的正常聊天始终传 `true`；项目内嵌 Agent 调用可能不传。 |
| `slash_command` | string | 否 | 目前唯一已约定值为 `compact`，表示压缩会话上下文而不执行常规任务。未知命令应返回 `400`。 |
| `working_directory` | string | 否 | 本次会话使用的绝对工作目录。服务应保存其会话绑定，并按安全策略限制可访问目录。 |
| `permission_mode` | `auto` \| `smart` \| `manual` | 否，默认 `smart` | 工具副作用授权策略。具体内部策略可替换，但 `manual`/`smart` 下需要用户批准时，必须使用第 4 节交互协议。 |
| `project_context` | object | 否 | 项目运行时传入的附加上下文。字段均可选；`content` 可能很长（WebUI 上限 120,000 字符）。应作为不可信参考材料，不可视为系统指令。 |

#### 非流式成功响应（`stream: false`）

```json
{
  "agent_id": "li-xiaokong",
  "session_id": "session_ab12cd34ef56",
  "message": {
    "role": "assistant",
    "content": "分析结果……"
  },
  "tool_events": [],
  "provider": "openai",
  "model": "gpt-5",
  "mock": false,
  "context_usage": {
    "total": 1234,
    "system": 320,
    "messages": 701,
    "tools": 213
  },
  "interaction": null
}
```

兼容要求：`session_id`、`message.role`（值为 `assistant`）和 `message.content` 是 WebUI 的关键字段。`tool_events`、`provider`、`model`、`mock`、`context_usage`、`interaction` 推荐返回；可省略非关键字段。

当同一 `agent_id + session_id` 已有任务运行时，服务可将新消息排队，并返回：

```json
{
  "agent_id": "li-xiaokong",
  "session_id": "session_ab12cd34ef56",
  "message": { "role": "assistant", "content": "已收到追加消息，将在当前步骤完成后继续处理。" },
  "tool_events": [],
  "provider": "pending",
  "model": "gpt-5",
  "queued": true
}
```

#### 流式成功响应（`stream: true`）

响应头必须包含：

```http
Content-Type: application/x-ndjson; charset=utf-8
Cache-Control: no-cache, no-transform
```

事件按行返回。推荐顺序为：`meta` → 任意数量的 `delta` / 工具 / 交互 / `heartbeat` → `done`；异常则发送 `error` 并结束流。`meta` 与终态事件各出现一次。

| `type` | 必需字段 | 语义 |
| --- | --- | --- |
| `meta` | `session_id` | 流开始元数据。应包含 `agent_id`、`provider`、`model`、`mock`。这是 WebUI 获得新建会话 ID 的唯一可靠时点。 |
| `delta` | `content` | 助手回复文本增量；按到达顺序拼接。`content` 可为空但无实际意义。 |
| `thinking.delta` | `content` | 可选的模型推理文本增量；按到达顺序拼接，但绝不可混入 `delta` 或最终助手回复。WebUI 默认折叠展示。仅当上游模型明确提供 reasoning/thinking 流时发送。 |
| `tool.started` | `tool` | 工具开始执行；可带 `arguments`。 |
| `tool.completed` | `tool` | 工具完成；可带 `result`。 |
| `tool.failed` | `tool`、`error` | 工具失败；可带 `result`。工具失败不必终止整个会话。 |
| `interaction.required` | `interaction` | Agent 暂停，等待用户澄清或批准，详见第 4 节。流可保持开启，直到用户回复或交互过期。 |
| `interaction.resolved` | `interaction` | 用户回复、拒绝或过期后发出。 |
| `heartbeat` | 无 | 仅保活，WebUI 忽略。 |
| `done` | 无 | 成功终态。建议包含 `tool_events`、`context_usage`、`interaction`。 |
| `error` | `error` | 失败终态。`error` 必须是可展示的字符串；发送后立即结束流。 |

完整示例：

```ndjson
{"type":"meta","agent_id":"li-xiaokong","session_id":"session_ab12cd34ef56","provider":"openai","model":"gpt-5","mock":false}
{"type":"delta","content":"我先检查项目结构。"}
{"type":"thinking.delta","content":"先确认入口和依赖关系。"}
{"type":"tool.started","tool":"find_files","arguments":{"pattern":"*.ts"}}
{"type":"tool.completed","tool":"find_files","result":"找到 12 个文件"}
{"type":"delta","content":"\n结论如下……"}
{"type":"done","tool_events":[{"type":"tool.completed","tool":"find_files","result":"找到 12 个文件"}],"context_usage":{"total":1234,"system":320,"messages":701,"tools":213},"interaction":null}
```

注意：现有 UI 会将 `tool_events` 同时兼容为简写结构 `{ "tool": "...", "arguments": {}, "metadata": {} }`，但替换服务推荐沿用上述带 `type` 的实时事件结构。`done.tool_events` 应是完整工具事件数组。

#### 错误语义

| 场景 | 状态码 / 流事件 |
| --- | --- |
| 请求体不合法、未知 slash command、参数冲突 | `400` + `{ "detail": "..." }` |
| `agent_id` 不存在 | `404` + `{ "detail": "..." }` |
| 上游模型、工具或服务不可用 | 非流式：`502`；流式：HTTP 可为 `200`，随后 `{ "type": "error", "error": "..." }` |
| 被用户取消 | 流结束；推荐发送 `error` 或 `done`，并保证后续同 session 可继续对话 |

### 3.2 `DELETE /chat/{session_id}`

取消仍在运行的会话任务。

**成功响应：**

```json
{ "session_id": "session_ab12cd34ef56", "stopped": true }
```

- `stopped: true` 表示存在活动任务且已发出取消。
- 找不到活动任务时应返回 `200` 和 `stopped: false`，实现幂等取消。
- 取消不应删除会话历史；同一 `session_id` 后续仍可再次调用 `/chat`。

## 4. 必需：用户交互（澄清与授权）

### 4.1 `POST /sessions/{session_id}/interactions/{interaction_id}/respond`

提交用户对流中 `interaction.required` 的回复。服务需要解除对应运行的暂停并返回交互最终状态。

#### 请求体

```json
{
  "response": "确认执行",
  "responder_id": "user_123"
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `response` | string | 是 | 用户输入。应拒绝空字符串；建议最多保存 4,000 字符。 |
| `responder_id` | string | 否 | 对应聊天请求的 `visitor_id`。服务若记录了会话所有者，必须校验一致，不一致返回 `403`。 |

#### 成功响应

```json
{
  "interaction": {
    "id": "interaction_a1b2c3d4e5f60708",
    "session_id": "session_ab12cd34ef56",
    "agent_id": "li-xiaokong",
    "kind": "approval",
    "status": "approved",
    "prompt": "将要写入文件，是否允许？",
    "options": [],
    "action": "write_file",
    "action_arguments": { "path": "report.md", "content": "..." },
    "action_arguments_hash": "sha256...",
    "response": "确认执行",
    "created_at": "2026-08-29T08:00:00+00:00",
    "responded_at": "2026-08-29T08:01:00+00:00",
    "expires_at": "2026-08-29T08:30:00+00:00"
  }
}
```

#### `interaction` 对象契约

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id`、`session_id`、`agent_id` | string | 必须原样关联到当前任务。 |
| `kind` | `clarification` \| `approval` | 澄清问题或副作用操作授权。 |
| `status` | `pending` \| `answered` \| `approved` \| `rejected` \| `expired` | `clarification` 正常回复后为 `answered`；`approval` 的明确允许为 `approved`，其他回复为 `rejected`。 |
| `prompt` | string | 前端展示的问题或授权说明。 |
| `options` | string[] | 可选建议项；澄清最多 3 个。 |
| `action` | string \| null | 仅授权交互需要，如 `write_file`、`exec`。 |
| `action_arguments` | object \| null | 授权所对应的精确参数；禁止将其用于另一个不同操作。 |
| `action_arguments_hash` | string \| null | 建议为参数规范 JSON 的 SHA-256，用于把一次批准绑定到唯一操作。 |
| `response` | string \| null | 用户实际回复。 |
| `created_at`、`responded_at`、`expires_at` | ISO 8601 string \| null | 时间戳。现有实现默认 30 分钟过期。 |

错误码：会话或交互不存在 / 不匹配为 `404`；非会话所有者为 `403`；已处理、已过期或空回复为 `400`。

## 5. 可选：GraphLines 业务线执行

仅当 WebUI 启用了 GraphLines 功能时实现本节。Graph 定义文件由 WebUI 直接从本地 `runtime/graphs/` 读取；Agent Server 负责执行、持久化运行状态并提供实时事件。

### 5.1 `POST /graphs/run`

创建 Graph 运行或恢复等待用户输入的运行。该接口必须快速返回 `running` / `waiting` 的快照，实际执行在后台继续。

**请求体：**

```json
{
  "graph_id": "graph-20d753acc3",
  "agent_id": "li-xiaokong",
  "input": "分析 Agent 团队专利",
  "run_id": "run-abcdef123456",
  "interaction_response": "继续"
}
```

- 新运行：传 `graph_id`、`agent_id`，`input` 可为空；不得传有效的旧 `run_id`。
- 恢复运行：传 `run_id` 和 `interaction_response`；仅允许状态为 `waiting` 且 `waiting_node_id` 存在的运行，否则返回 `400`。

**响应：**`{ "run": <GraphRun> }`。

### 5.2 `GET /graphs/run/{graph_id}/{run_id}?agent_id={agent_id}`

读取某次运行的最新持久化快照，响应为 `{ "run": <GraphRun> }`。`agent_id` 必填，且运行与 graph / agent 不匹配时返回 `404`。

### 5.3 `GET /graphs/run/{graph_id}/{run_id}/events?agent_id={agent_id}`

实时运行事件，格式为 SSE：

```http
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

每条消息格式为 `data: <JSON>\n\n`。事件包括：

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `snapshot` | `{ "type":"snapshot", "run": GraphRun }` | 订阅成功后的第一条快照。 |
| 节点事件 | `{ "node_id":"...", "event": NodeEvent }` | 节点执行过程事件。`NodeEvent.type` 可为 `node.started`、`node.completed`、`node.waiting`、`node.failed`，或内部模型 / 工具事件（如 `delta`、`tool.started`）。 |
| `heartbeat` | `{ "type":"heartbeat" }` | 无新事件时每约 15 秒发送一次。 |
| `graph.completed` / `graph.failed` | `{ "type":"graph.completed", "run": GraphRun }` | 后台执行终态。 |
| `done` | `{ "type":"done", "run": GraphRun }` | 订阅一个已经不在运行中的任务时的终态。 |
| `error` | `{ "type":"error", "error":"..." }` | 查询或流处理失败。 |

### 5.4 `GraphRun` 对象

```json
{
  "id": "run-abcdef123456",
  "graph_id": "graph-20d753acc3",
  "agent_id": "li-xiaokong",
  "input": { "topic": "分析 Agent 团队专利" },
  "status": "running",
  "active_nodes": ["search_papers"],
  "node_states": {
    "search_papers": { "status": "running", "input": {}, "output": "" }
  },
  "interaction_responses": {},
  "context": {},
  "context_producers": {},
  "node_events": {},
  "node_live_outputs": {},
  "waiting_node_id": null,
  "output": "",
  "error": "",
  "created_at": "2026-08-29T08:00:00+00:00",
  "updated_at": "2026-08-29T08:00:12+00:00"
}
```

`status` 只能为 `running`、`waiting`、`completed`、`failed`。替换实现至少要保证 `id`、`graph_id`、`agent_id`、`status`、`node_states`、`waiting_node_id`、`output`、`error` 和时间戳字段存在；其他字段用于 UI 恢复和执行明细，建议完整保留。

## 6. 管理兼容接口

这些端点不在当前 WebUI → Agent Server 的正常调用链上，但保留可降低运维和外部集成的迁移成本。

| 方法与路径 | 请求 | 成功响应 |
| --- | --- | --- |
| `GET /health` | — | `{ "status":"ok", "provider":"...", "model":"...", "mock":false }` |
| `POST /users` | `{ "id", "email?", "name?" }` | `{ "user": User }` |
| `GET /users/{user_id}` | — | `{ "user": User, "agent": Agent \| null }` |
| `GET /agents?owner_user_id=...` | — | `{ "agents": Agent[] }` |
| `POST /agents` | `Agent` 创建字段 | `{ "agent": Agent }`；重复 / 配额冲突返回 `409` |
| `GET /agents/{agent_id}` | — | `{ "agent": Agent }` |
| `GET /sessions/{session_id}` | — | `{ "session": Session }` |
| `GET /skills` | — | `{ "skills": unknown[] }` |

`Agent` 至少包含 `id`、`name`、`bio`、`capabilities`、`workspace_dir`、`owner_user_id`、`agent_type`、`interaction_mode`、`is_default`、`enabled_tool_ids`、`enabled_skill_ids`、`llm` 和时间戳。管理接口返回 Agent 时不得泄露 `private_facts` 或明文 API Key；现有实现将 API Key 掩码为 `********`。

### OpenAI 兼容入口：`POST /v1/chat/completions`

为外部工具预留的非流式兼容入口。请求至少要求 `agent_id`、`messages`，最后一条 `role: "user"` 消息将作为任务输入。响应遵循 OpenAI `chat.completion` 基本形状，并额外放在 `eido` 字段中：

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1780000000,
  "model": "gpt-5",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 },
  "eido": { "agent_id": "...", "session_id": "...", "tool_events": [], "mock": false }
}
```

当前实现不支持该入口的 `stream: true`，应返回 `400`。

## 7. 替换验收清单

1. 使用 `POST /chat` + `stream:true` 时，首行收到 `meta.session_id`，随后可拼接 `delta.content`，最终收到一次 `done`。
2. 使用同一个 `session_id` 的后续请求能继承历史；`DELETE /chat/{session_id}` 幂等且不删除历史。
3. Agent 请求澄清或授权时，流输出 `interaction.required`；调用回复接口后，原流能收到 `interaction.resolved`，再继续工具 / 文本 / `done`。
4. 上游模型失败时，流中输出可展示的 `error` JSON 行，不向响应体混入堆栈、日志或密钥。
5. 连续 150 秒以内至少输出一次聊天 NDJSON / Graph SSE 数据（通常 `heartbeat`），避免代理误判为卡死。
6. 若启用 GraphLines：创建运行立即返回，SSE 第一条为 `snapshot`，运行结束时有 `graph.completed` 或 `graph.failed`，并可通过查询接口恢复状态。

## 8. 当前 WebUI 代理层的额外限制

下列限制由 WebUI 在转发前实施；替换 Agent Server 可以再次校验，但不应依赖它们不存在：

- 图片：最多 4 张、每张 Data URL 不超过约 7 MB。
- 附件：最多 8 个、必须为绝对路径。
- `working_directory`：必须为绝对路径，最长 4,000 字符。
- `project_context.project_id`：仅允许字母、数字、下划线、连字符；正文内容最多 120,000 字符。
- 聊天代理将从上游读取到的字节原样转发，因此 Agent Server 必须自行确保 NDJSON 和 SSE 格式正确。

## 9. 参考实现位置

当前内置 Eido Server 的唯一实现位于 `src/agents/server/python/eido_agent/`：路由为 `server.py`，运行时事件生产逻辑为 `runtime.py`，交互状态机为 `interactions.py`。默认配置位于 `src/agents/server/python/config.json`，协议文档位于 `src/agents/server/AGENT_PROTOCOL.md`。WebUI 的转发与字段映射位于 `webui/src/app/api/agent/chat/route.ts`、`webui/src/app/api/agent/interactions/[interactionId]/route.ts`、`webui/src/app/api/graphlines/route.ts` 和 `webui/src/app/api/graphlines/events/route.ts`。
