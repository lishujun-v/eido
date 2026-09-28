# 自动化验证基线

重构期间统一使用下面的命令验证已有功能边界：

```bash
npm run verify
```

该命令按顺序执行：

1. `npm run build`：执行 Next.js 生产构建和 TypeScript 检查。
2. `npm run test:architecture`：确保已迁移的 Next.js API 路由保持为轻量领域适配器。
3. `npm run test:python`：运行 `tests/python/agents` 下的 Python 单元测试及 Agent Server API 契约测试，直接加载 `src/agents/server/python/eido_agent` 中的唯一实现。
4. `npm run test:contracts`：启动构建后的 Next.js 服务，通过 HTTP 校验关键 API 契约。

API 契约测试默认自行选择空闲端口并启动本地生产服务，因此需要先存在成功的 `webui/.next` 构建。若要检查一个已经运行的实例，可以指定：

```bash
EIDO_CONTRACT_BASE_URL=http://127.0.0.1:3000 npm run test:contracts
```

当前契约覆盖认证、Agent、会话、Provider、Skill、Tool、MCP、知识库、项目、Graph 和 Agent Chat 的关键匿名访问、鉴权、状态码及 JSON 结构。Python 契约测试还覆盖 Agent Server 的健康检查、列表、错误响应和敏感字段过滤。Next.js 契约服务通过 `EIDO_DATABASE_DIR` 使用临时数据库目录，并且只调用只读接口或不会写入数据的失败路径，不修改根目录 `database/` 中的数据。

GitHub Actions 会在每次 push 和 pull request 时执行同一条 `npm run verify` 命令，确保本地与 CI 使用同一套基线。
