# SiinX CLI 能力库设计

版本：v0.1  
状态：设计草案  
目标：为 SiinX Agent、人工运维和未来的 Tool / Skill 提供同一套可发现、可组合、可审计的平台操控能力。

## 1. 设计结论

CLI 的定位不是一组零散脚本，而是 SiinX 的“平台控制面”。推荐同时提供两种入口：

```bash
# 面向人，按业务领域组织
siinx expert create --input @expert.json
siinx knowledge space create --input @space.json

# 面向 Agent / Tool，统一的机器调用入口
siinx capability invoke expert.create --input-json '{...}' --output json
siinx capability invoke knowledge.space.create --input @space.json --output json
```

两种入口调用同一个 `CapabilityRegistry` 和同一个领域服务，不能分别实现业务逻辑。

推荐的整体结构：

```text
Web UI ───────────────┐
                     v
SiinX CLI ──> Capability Registry ──> Application Services ──> Repositories
                     ^                         |                    |
Agent Tool / Skill ──┘                         |                    +─ JSON（当前）
                                               +─ Provider / Runtime
                                               +─ PostgreSQL（未来）
```

原则：

- Web、CLI、Tool 共用领域服务和校验规则。
- CLI 不直接读写 `database/*.json`。
- 所有机器调用均支持 JSON 输入和 JSON 输出。
- stdout 只放结果；日志、进度和诊断信息写 stderr。
- 命令默认非交互，避免 Agent 调用时卡在提示符。
- 修改类能力必须有身份、权限、审计和稳定错误码。
- 危险操作必须显式确认，Agent 调用时由授权机制接管。

## 2. 为什么不直接封装现有 API

当前项目已经有 `/api/agents`、`/api/knowledge`、`/api/skills`、`/api/tools`、`/api/provider-configs` 等接口，但部分校验、存储和业务规则仍直接写在 Route Handler 中。

如果 CLI 仅调用这些页面接口，会产生几个问题：

1. 当前登录主要依赖浏览器 Cookie，CLI 缺少稳定的凭证模型。
2. 路由的请求结构偏 UI，例如知识库通过 `action` 字段区分操作，不适合作为长期能力协议。
3. CLI、Tool 和网页容易各自实现一套参数转换与错误处理。
4. Agent 无法可靠发现命令的输入 Schema、风险等级和所需权限。
5. 将来迁移数据库时，CLI 容易和具体 JSON 文件结构耦合。

因此应先逐步把 Route Handler 中的业务规则抽到 Application Service，再让 HTTP 路由和 CLI 共同调用。

## 3. 命令分域

首期按业务场景分域，不按页面分域。页面变化不应导致 CLI 契约变化。

### 3.1 Expert（专家）

```text
siinx expert list
siinx expert get <expert-id>
siinx expert create
siinx expert update <expert-id>
siinx expert delete <expert-id>
siinx expert bind-model <expert-id>
siinx expert skills list <expert-id>
siinx expert skills set <expert-id>
siinx expert tools list <expert-id>
siinx expert tools set <expert-id>
siinx expert knowledge list <expert-id>
siinx expert knowledge attach <expert-id> <space-id>
siinx expert knowledge detach <expert-id> <space-id>
```

建议能力 ID：

- `expert.list`
- `expert.get`
- `expert.create`
- `expert.update`
- `expert.delete`
- `expert.model.bind`
- `expert.skills.set`
- `expert.tools.set`
- `expert.knowledge.attach`
- `expert.knowledge.detach`

说明：界面称“专家”，底层当前存储为 `agent_type: expert`。CLI 对外固定使用 `expert`，不要把系统内置 SiinX Agent 和用户专家混成一个资源。

### 3.2 Knowledge（知识库）

```text
siinx knowledge space list
siinx knowledge space get <space-id>
siinx knowledge space create
siinx knowledge space update <space-id>
siinx knowledge space delete <space-id>

siinx knowledge node list --space <space-id>
siinx knowledge node get <node-id> --space <space-id>
siinx knowledge node create --space <space-id>
siinx knowledge node update <node-id> --space <space-id>
siinx knowledge node delete <node-id> --space <space-id>

siinx knowledge edge list --space <space-id>
siinx knowledge edge create --space <space-id>
siinx knowledge edge delete <edge-id> --space <space-id>

siinx knowledge search <query> [--space <space-id>]
siinx knowledge import --space <space-id> --file <path>
siinx knowledge export <space-id> --format json
```

建议能力 ID 使用同样的层级，例如 `knowledge.space.create`、`knowledge.node.update`、`knowledge.edge.create`、`knowledge.search`。

当前后端已覆盖空间、节点、边的增删改和关键词检索；`space.get`、节点/边独立读取、批量导入导出需要补充。

### 3.3 后续领域

命名规则统一为 `<domain>.<resource>.<action>`，便于继续增加：

```text
model.provider.list / model.provider.create / model.provider.test
skill.list / skill.create / skill.import / skill.assign
tool.list / tool.create / tool.assign
conversation.list / conversation.get / conversation.delete
project.list / project.get
workspace.file.list / workspace.file.read / workspace.file.write
system.health / system.version / system.capabilities
```

不要一开始把所有页面全部实现。第一阶段优先让 SiinX 完成“新建专家”和“新建知识空间”两条闭环。

## 4. 双层调用界面

### 4.1 领域命令

领域命令面向开发者和运维人员，参数易读：

```bash
siinx expert create \
  --name "合同审查专家" \
  --identity "企业法务顾问" \
  --capabilities "审查合同风险并给出修改建议" \
  --provider-config provider_volc \
  --model doubao-seed-code
```

复杂输入优先使用文件或 stdin：

```bash
siinx expert create --input @expert.json --output json
printf '%s' '{"name":"AI 知识"}' | siinx knowledge space create --input -
```

二进制名固定使用小写 `siinx`；文档示例也应保持一致。

### 4.2 通用能力命令

通用入口面向 Agent，协议长期稳定：

```bash
siinx capability list --output json
siinx capability describe expert.create --output json
siinx capability invoke expert.create --input @expert.json --output json
```

未来 Tool 层只需暴露三个基础工具，也可以按白名单把具体能力展开成独立工具：

- `siinx_capability_list`
- `siinx_capability_describe`
- `siinx_capability_invoke`

生产环境更推荐将批准的能力展开为 `siinx_expert_create` 等窄工具，降低 Agent 误调用范围；通用 `invoke` 适合开发和管理场景。

## 5. 能力描述规范

每项能力都由 manifest 描述，而不是从命令帮助文本反向解析：

```ts
type CapabilityDefinition<I, O> = {
  id: string;                       // expert.create
  version: "1.0.0";
  domain: string;                   // expert
  summary: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  permissions: string[];            // expert:write
  risk: "read" | "write" | "destructive" | "external";
  idempotent: boolean;
  supportsDryRun: boolean;
  handler: CapabilityHandler<I, O>;
};
```

`capability describe expert.create` 示例：

```json
{
  "id": "expert.create",
  "version": "1.0.0",
  "summary": "创建一个归当前用户所有的专家",
  "permissions": ["expert:write", "provider:read"],
  "risk": "write",
  "idempotent": true,
  "supportsDryRun": true,
  "inputSchema": {
    "type": "object",
    "required": ["name", "identity", "capabilities"],
    "properties": {
      "name": { "type": "string", "minLength": 1 },
      "identity": { "type": "string", "minLength": 1 },
      "capabilities": { "type": "string", "minLength": 1 },
      "providerConfigId": { "type": "string" },
      "model": { "type": "string" },
      "knowledgeSpaceIds": {
        "type": "array",
        "items": { "type": "string" },
        "uniqueItems": true
      }
    },
    "additionalProperties": false
  }
}
```

能力定义应是生成以下内容的单一来源：

- CLI 参数校验和 `--help`
- Agent function/tool JSON Schema
- Skill 中的调用说明
- API 文档
- 权限白名单和审计字段

## 6. 稳定的输入输出契约

### 6.1 成功结果

所有 `--output json` 调用返回统一 Envelope：

```json
{
  "ok": true,
  "apiVersion": "siinx.io/v1",
  "capability": "knowledge.space.create",
  "requestId": "req_01J...",
  "data": {
    "space": {
      "id": "space_01J...",
      "name": "AI 知识"
    }
  },
  "warnings": []
}
```

### 6.2 失败结果

```json
{
  "ok": false,
  "apiVersion": "siinx.io/v1",
  "capability": "expert.create",
  "requestId": "req_01J...",
  "error": {
    "code": "PROVIDER_SUBSCRIPTION_INVALID",
    "message": "模型服务订阅无效，请更换模型或续订。",
    "retryable": false,
    "details": {
      "providerConfigId": "provider_volc"
    }
  }
}
```

要求：

- `code` 是稳定的机器标识，不能使用中文句子代替。
- `message` 面向用户，可本地化。
- Provider 的原始响应只能进入受控的 `details` 或日志，不能泄漏 API Key。
- `requestId` 贯穿 CLI、API、领域服务和审计日志。
- JSON 模式下即使失败也把完整 Envelope 写 stdout，诊断日志写 stderr。

建议退出码：

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 2 | 参数或 Schema 校验失败 |
| 3 | 未认证 |
| 4 | 无权限 |
| 5 | 资源不存在 |
| 6 | 冲突或重复资源 |
| 7 | 需要确认或批准 |
| 8 | 外部 Provider / 网络失败 |
| 9 | 服务内部错误 |

## 7. 身份、配置与执行模式

配置文件建议使用：

```text
~/.config/siinx/config.json
```

也允许通过 `SIINX_CONFIG` 指定其他位置，但敏感凭证不应直接保存在普通 JSON 中。优先使用系统 Keychain；开发环境才允许环境变量。

```json
{
  "currentContext": "local",
  "contexts": {
    "local": {
      "transport": "http",
      "baseUrl": "http://127.0.0.1:3000",
      "credentialRef": "keychain:siinx/local"
    }
  },
  "defaults": {
    "output": "table"
  }
}
```

全局参数：

```text
--context <name>       选择目标环境
--output table|json|ndjson|yaml
--input <json|@file|->
--request-id <id>
--idempotency-key <key>
--dry-run
--yes                  仅用于已获授权的确认
--timeout <duration>
--quiet
--debug
```

首期采用 HTTP transport 最清晰，CLI 使用专门的 CLI token 或本地短期 token，不复用浏览器 Cookie。以后如需离线维护，可增加 `local` transport，但仍必须调用相同 Application Service，禁止直接编辑 JSON 表。

## 8. 安全与 Agent 调用约束

能力按风险分级：

| 风险 | 示例 | 默认策略 |
| --- | --- | --- |
| `read` | list、get、search | 可直接执行 |
| `write` | create、update、attach | 需要对应写权限，保留审计 |
| `destructive` | delete、批量覆盖 | 人工确认或已有审批令牌 |
| `external` | 调用第三方、发布内容 | 明示目标和影响范围 |

必须满足：

- `delete` 不因传入 `--output json` 而跳过确认；必须有 `--yes` 或审批令牌。
- Agent 不应自行拼接 shell 字符串；Tool wrapper 使用参数数组启动进程。
- 输入文件路径必须限制在允许目录内，避免任意文件读取。
- 每次写操作记录 actor、capability、resource、requestId、结果和时间。
- API Key、token、密码字段在输出和审计中统一脱敏。
- 支持 `--dry-run` 的写命令应返回计划变更，不落盘。
- 使用 `--idempotency-key` 防止 Agent 重试时重复创建专家或知识空间。

建议新增审计事件：

```ts
type AuditEvent = {
  id: string;
  requestId: string;
  actor: { type: "user" | "agent" | "service"; id: string };
  capability: string;
  resource?: { type: string; id: string };
  risk: "read" | "write" | "destructive" | "external";
  status: "succeeded" | "failed" | "denied";
  inputDigest: string;
  createdAt: string;
};
```

## 9. 推荐代码结构

```text
cli/
  package.json
  src/
    bin.ts
    app.ts
    commands/
      capability.ts
      expert.ts
      knowledge.ts
      model.ts
      skill.ts
      tool.ts
    core/
      config.ts
      context.ts
      errors.ts
      io.ts
      output.ts
      process.ts
    transport/
      client.ts
      http.ts
    generated/
      capability-schemas.json

src/server/
  capabilities/
    registry.ts
    definition.ts
    catalog.ts
  domains/
    expert/
      service.ts
      repository.ts
      schemas.ts
      capabilities.ts
    knowledge/
      service.ts
      repository.ts
      schemas.ts
      capabilities.ts
    model/
    skill/
    tool/
  infrastructure/
    json/
    audit/
    auth/
```

依赖方向必须保持：

```text
commands -> transport/capability client -> application services -> repository interfaces
                                                     ^
                                                     |
                                         JSON repository implementation
```

领域服务不能依赖 Next.js 的 `NextRequest` / `NextResponse`。Route Handler 只负责认证上下文、解析请求、调用能力和映射 HTTP 状态。

## 10. 第一阶段详细范围

建议第一阶段只实现 10 个能力，足以支撑 SiinX 自动创建和配置专家：

1. `expert.list`
2. `expert.get`
3. `expert.create`
4. `expert.update`
5. `knowledge.space.list`
6. `knowledge.space.get`
7. `knowledge.space.create`
8. `knowledge.space.update`
9. `expert.knowledge.attach`
10. `expert.knowledge.detach`

第一条端到端验收场景：

```text
用户：帮我创建一个合同审查专家，并给它新建一个法律知识空间。
  1. Agent 查询 expert.create 与 knowledge.space.create 的 Schema
  2. 创建知识空间（带 idempotency key）
  3. 创建专家（带 idempotency key）
  4. 调用 expert.knowledge.attach
  5. 查询 expert.get 验证最终状态
  6. 向用户返回专家和知识空间的 ID / 名称
```

验收标准：

- 同一 idempotency key 重试不会产生重复资源。
- 任一步失败时返回稳定错误码和 requestId。
- 绑定关系可通过 CLI 查询验证。
- 未登录、越权访问、缺少 Provider 等情况可被 Agent 区分处理。
- 所有写操作都有审计记录。
- CLI 的 JSON 输出不夹杂 spinner、颜色码或普通日志。

## 11. 实施顺序

### Phase 1：能力内核

- 定义 `CapabilityDefinition`、Registry、统一 Result/Error。
- 抽取 ExpertService 和 KnowledgeService。
- 为现有 JSON 存储实现 Repository。
- 增加 `/api/capabilities` 与 `/api/capabilities/[id]/invoke`，或等价的版本化控制面 API。
- 建立短期 CLI token / service token 认证方式。

### Phase 2：CLI

- 建立 `cli/` TypeScript 包和 `siinx` 可执行文件。
- 实现 `capability list/describe/invoke`。
- 实现 expert、knowledge 的友好命令别名。
- 加入 JSON 输出、退出码、dry-run、idempotency 和测试。

### Phase 3：Agent Tool

- 从 capability manifest 生成 Tool Schema。
- 在 Eido Runtime 中加入受限的 SiinX 平台工具适配器。
- 将风险等级接入现有 `AuthorizationRequired` / interaction 审批流程。
- 默认只给系统 SiinX Agent 开启平台写能力，专家 Agent 不自动继承。

### Phase 4：扩域

- Model Provider、Skill、Tool、Conversation。
- 批量操作、导入导出和异步 Job。
- PostgreSQL Repository 替换当前 JSON Repository，而不改变 CLI 契约。

## 12. 需要提前修正的现有契约

在正式实现 CLI 前，建议处理以下接口缺口：

- Expert API 当前没有明确的 `GET /:id` 和删除能力。
- Knowledge API 使用 `action` 分发，需转换为独立能力或资源化路由。
- Knowledge 缺少单空间、单节点、单关系读取接口。
- Expert 与 Knowledge 的绑定目前通过更新整个 `agentIds` 数组完成，容易产生并发覆盖；应提供 attach / detach 原子操作。
- 当前不同 API 的用户识别方式不完全一致，有的只读 Cookie，有的支持 Header；需要统一 AuthContext。
- Provider 配置中的密钥相关字段必须从普通结果中脱敏。
- JSON 文件写入虽然使用了临时文件替换，但跨多个表的操作不是事务；“创建专家并绑定知识库”应由 Saga / 补偿或数据库事务保证一致性。

这些调整完成后，CLI 就可以作为长期稳定接口，而不是随 UI 请求格式变化的薄包装。
