# 路径配置与数据库访问

服务端路径统一由 `src/config/paths.ts` 解析。WebUI 启动时，`webui/next.config.ts` 会在没有显式覆盖时把 `EIDO_ROOT_DIR` 固定到仓库根目录。持久化表和运行时文件分开管理：

- `database/`：持久化数据（JSON 数据表及 Agent Skill 包）
- `database/agents/skills/`：Agent Skill 包
- `data/models/`：本地下载的大体积模型文件
- `runtime/workspace/`：Agent 工作目录
- `runtime/projects/`：项目包
- `runtime/graphs/`：Graph 定义与运行记录

数据库中历史 Agent 的 `workspace_dir: "workspace"` 仍被视作逻辑别名，映射到
`runtime/workspace/`。历史版本保存的仓库根目录下 `workspace/` 绝对路径也会按
相同规则转换，因此迁移目录时不需要批量改写数据库。

部署或测试环境可以通过以下变量覆盖路径。相对路径以 `EIDO_ROOT_DIR` 为基准，绝对路径保持不变：

| 环境变量 | 用途 |
| --- | --- |
| `EIDO_ROOT_DIR` | 所有默认路径的应用根目录 |
| `EIDO_RUNTIME_DIR` | 运行时目录根，默认 `runtime/` |
| `EIDO_DATABASE_DIR` | 数据库目录 |
| `EIDO_WORKSPACE_DIR` | 默认工作目录 |
| `EIDO_PROJECTS_DIR` | 项目目录 |
| `EIDO_GRAPHS_DIR` | Graph 目录 |
| `EIDO_SKILLS_DIR` | Skill 目录 |

JSON 数据访问实现在 `src/shared/database/`。业务模块应从 `@backend/shared/database` 导入，不再自行拼接 `database/*.json`。该层负责表名校验、缺省值、短暂解析失败重试和临时文件原子替换。

业务模块不得从当前工作目录自行拼接 `workspace/`、`projects/` 或 `graphs/`。
TypeScript 使用 `platformPaths()`；解析 Agent 保存的工作目录时使用
`resolveWorkspaceDirectory()`。Python Agent 使用 `AgentConfig` 的
`resolved_workspace_dir` 与 `resolved_graphs_dir`。

`src/lib/json-database.ts` 仅作为旧代码兼容入口保留；新代码不得继续依赖该路径。后续把功能模块迁入独立目录时，可逐步改用 `JsonDatabase` 或 `platformDatabase()`，无需接触底层文件读写。
