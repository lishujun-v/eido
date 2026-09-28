# API 路由与领域模块

Next.js API 路由是传输层入口，不再承载业务实现。已迁移的路由只负责把 HTTP 方法映射到对应领域的服务端处理器：

```text
webui/src/app/api/agents/route.ts
  -> src/agents/server/handlers.ts

webui/src/app/api/agent/chat/route.ts
  -> src/agents/server/chat-handlers.ts
```

本轮按原路由长度超过 150 行作为优先迁移范围，共拆出以下领域：

| 领域目录 | 接管的 API |
| --- | --- |
| `src/agents/server/` | Agent 管理、Agent Chat |
| `src/auth/server/` | 登录态与认证 |
| `src/conversations/server/` | 会话查询与删除 |
| `src/graphlines/server/` | GraphLines 管理与运行 |
| `src/knowledge/server/` | 知识空间、节点、关系与检索 |
| `src/mcp/server/` | MCP Server 管理 |
| `src/projects/server/` | 项目运行时存储 |
| `src/providers/server/` | Provider 配置 |
| `src/skills/server/` | Skill 管理、SkillHub 安装 |
| `src/tools/server/` | Tool 管理 |

## 边界规则

- `webui/src/app/api/**/route.ts` 只做方法映射，以及将来必要的传输层适配。
- WebUI 内部模块使用 `@/`，跨到根 `src/` 后端领域时必须使用 `@backend/`，让依赖边界可见。
- 校验、权限、业务编排、数据访问和外部服务调用放在对应的 `src/<领域>/server/`。
- 浏览器代码不得导入 `server/`；未来对外提供的稳定编程接口放在各领域的 `sdk/`，命令行入口放在 `cli/`。
- 领域实现通过 `@backend/shared/database` 和 `@backend/config/paths` 使用共用基础能力，不自行恢复数据库或根路径拼接。
- URL、HTTP 方法、状态码和响应 JSON 属于现有契约；迁移时必须保持兼容。

`npm run test:architecture` 会检查本轮迁移的路由仍是轻量适配器，`npm run test:contracts` 继续验证对外 HTTP 行为。

Knowledge 是首个完成 `domain/sdk/cli/server` 分层的领域样板，具体依赖方向和职责见
[`src/knowledge/README.md`](../src/knowledge/README.md)。
