# Eido

Eido 是一个本地优先的 AI Agent 工作台。项目由 Next.js WebUI、Python Agent
服务，以及知识库、项目、Graph 和消息渠道等领域模块组成。

## 环境要求

- Node.js 24（与 CI 保持一致）
- npm 10+
- Python 3.11

## 快速启动

克隆仓库后，在项目根目录执行：

```bash
# 1. 安装 WebUI 和 Node.js 依赖
npm ci

# 2. 创建 Python 虚拟环境并安装 Agent 服务依赖
python3.11 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r src/agents/server/python/requirements.txt

# 3. 安装 Agent 浏览器工具所需的 Chromium（首次运行一次即可）
.venv/bin/python -m playwright install chromium
```

打开两个终端，分别启动 Agent 服务和 WebUI：

```bash
# 终端 1：http://127.0.0.1:8000
npm run agent:server
```

```bash
# 终端 2：http://127.0.0.1:3000
npm run dev
```

浏览器访问 [http://127.0.0.1:3000](http://127.0.0.1:3000)。未配置模型密钥时，
Agent 服务默认使用 mock 响应，因此可以先完成界面和基础流程验证。

## 配置模型

默认配置位于 `src/agents/server/python/config.json`，使用 OpenAI 兼容接口。启动
Agent 服务前可通过环境变量覆盖：

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # 可选
export EIDO_AGENT_MODEL="gpt-4.1-mini"              # 可选
npm run agent:server
```

也可以在 WebUI 中维护 Provider 配置。请勿提交 API Key、`database/` 下的本地数据
或其他敏感信息。

## 本地数据与模型

- `database/`：用户、会话、Provider 等运行数据，应用会按需创建；默认不提交。
- `database/agents/skills/`：可复用的 Agent Skill 包，会正常纳入版本控制。
- `data/models/`：本地模型文件，默认不提交；下载方式见
  [`data/models/README.md`](data/models/README.md)。
- `runtime/`：Agent 工作区、可运行项目和 Graph 文件。

如需下载默认中文向量模型：

```bash
npm run knowledge:model:download
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 WebUI 开发服务 |
| `npm run agent:server` | 启动本地 Python Agent 服务 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动已构建的生产版本 |
| `npm run verify` | 执行构建、架构、SDK、渠道、Python 和契约测试 |
| `npm run channel:weixin` | 启动可选的微信渠道 |

完整验证说明见 [`docs/VALIDATION.md`](docs/VALIDATION.md)。微信渠道的配对和运行方式
见 [`src/channels/weixin/README.md`](src/channels/weixin/README.md)。

## 项目结构

```text
eido/
├── webui/                         # Next.js 前端与 API 路由
├── src/agents/                    # Agent SDK、CLI 与 Python 服务
├── src/knowledge/                 # 知识库领域
├── src/channels/                  # 外部消息渠道
├── database/agents/skills/        # 可版本化的 Agent Skills
├── runtime/                       # 本地工作区、项目和 Graph
├── data/models/                   # 本地模型（不提交）
└── tests/                         # 架构、契约和单元测试
```

更多模块说明：

- [`src/agents/README.md`](src/agents/README.md)
- [`src/knowledge/README.md`](src/knowledge/README.md)
- [`webui/README.md`](webui/README.md)
- [`docs/PATHS_AND_DATABASE.md`](docs/PATHS_AND_DATABASE.md)
- [`docs/API_DOMAIN_MODULES.md`](docs/API_DOMAIN_MODULES.md)

## 可选配置

服务端路径可通过 `EIDO_ROOT_DIR`、`EIDO_DATABASE_DIR`、`EIDO_RUNTIME_DIR`、
`EIDO_WORKSPACE_DIR`、`EIDO_PROJECTS_DIR`、`EIDO_GRAPHS_DIR` 和
`EIDO_SKILLS_DIR` 覆盖。单个账号可创建的 Agent 数量由
`EIDO_MAX_AGENTS_PER_USER` 控制，默认值为 `999`。
