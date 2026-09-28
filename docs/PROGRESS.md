# 项目进度记录

更新时间：2026-06-30

## 当前状态

项目已经从产品想法推进到可运行的前端工程骨架。

本地开发服务：

```text
http://127.0.0.1:3000
```

当前已实现首页、Agent 公开主页、轻量创建 Agent 页面和可交互的请求对话页。初版 MVP 已收窄为“新建 Agent + 对当前 Agent 发起请求对话”，暂不引入登录、Prisma、LLM 和复杂后台。

## 已完成内容

### 产品与设计文档

- [PRD.md](./PRD.md)：完整产品需求
- [MVP_SPEC.md](./MVP_SPEC.md)：MVP 范围
- [WIREFRAMES.md](./WIREFRAMES.md)：页面原型说明
- [TECH_SPEC.md](./TECH_SPEC.md)：技术方案
- [TASKS.md](./TASKS.md)：开发任务清单
- [UI_DESIGN.md](./UI_DESIGN.md)：UI 设计方案
- [PROTOTYPE_DECISION.md](./PROTOTYPE_DECISION.md)：原型选择与开发参考

### 原型资产

已选定第一版原型方向：Open Identity Network。

参考图：

- [assets/eido-home-prototype-v1.png](./assets/eido-home-prototype-v1.png)

采用原则：

- 简约明亮
- 搜索和创建 Agent 是首页核心
- 右侧保留 Agent 对话预览
- 强调“数字代理”和“等待主人确认”
- 整体比原型图再简约一些

### 工程初始化

已完成：

- 初始化 Next.js 工程
- 使用 TypeScript
- 使用 Tailwind CSS
- 使用 App Router
- 安装 lucide-react 图标库
- 配置 metadata
- 移除在线 Google Fonts 依赖，改用系统字体，避免构建时网络失败
- 配置 `next.config.ts` 的 Turbopack root
- `.npm-cache` 已加入 `.gitignore`
- 2026-06-30：启动脚本切换到 webpack，避免 Next 16 默认 Turbopack 在当前环境中触发端口绑定权限问题
- 2026-06-30：新增 `npm run preview` 和 `npm run dev:alt`

### 当前页面

已实现首页静态版：

- 顶部导航
- Logo 与产品名 Eido
- Agent 图谱面板
- 已注册 Agent 层级节点
- 能力关系节点
- 搜索输入框
- 创建我的 Agent 按钮
- 右侧已注册 Agent 列表
- 当前 Agent 请求入口
- 移动端纵向层级展示

已实现 Agent 公开主页静态版：

- 路由：`/agents/li-xiaokong`
- Agent 头像、名称、数字代理标签
- 可联系状态、城市、职业、语言
- 一句话介绍与能力标签
- 可提供帮助
- 经历与作品
- 想认识的人
- 沟通风格
- 发起对话按钮
- 联系方式需主人确认提示
- 可信提示
- 举报入口

已实现 Agent 对话页静态版：

- 路由：`/chat/demo`
- 顶部对话对象信息
- 数字代理身份提示
- 访问者消息、Agent 消息、系统提示
- 等待主人确认状态
- 请求真人接入按钮
- 输入框
- 举报 / 拉黑入口占位
- 从 Agent 公开主页的“发起对话”跳转到对话页

已实现轻量创建 Agent 页面：

- 路由：`/agents/new`
- 首页和顶部导航的“创建我的 Agent”已跳转到创建页
- 核心字段表单：姓名、城市、职业、能力标签、介绍、可提供帮助、想被谁找到、Agent 边界
- 实时预览卡片
- 保存并发布按钮
- 使用浏览器 localStorage 暂存本机 Agent 草稿，不接数据库

对话页已升级为可交互请求对话：

- 访问者可以输入并发送消息
- 普通需求会得到 Agent 的规则化初步回复
- 涉及微信、电话、报价、时间、线下见面等内容时，自动进入“等待主人确认”
- 可以手动点击“请求真人接入”
- 当前状态只保存在前端，先用于验证核心交互

主要文件：

- [webui/src/app/page.tsx](../webui/src/app/page.tsx)
- [webui/src/app/agents/new/page.tsx](../webui/src/app/agents/new/page.tsx)
- [webui/src/app/agents/li-xiaokong/page.tsx](../webui/src/app/agents/li-xiaokong/page.tsx)
- [webui/src/app/chat/demo/page.tsx](../webui/src/app/chat/demo/page.tsx)
- [webui/src/components/new-agent-form.tsx](../webui/src/components/new-agent-form.tsx)
- [webui/src/components/chat-interface.tsx](../webui/src/components/chat-interface.tsx)
- [webui/src/components/top-nav.tsx](../webui/src/components/top-nav.tsx)
- [webui/src/components/agent-card.tsx](../webui/src/components/agent-card.tsx)
- [webui/src/components/agent-badges.tsx](../webui/src/components/agent-badges.tsx)
- [webui/src/components/conversation-preview.tsx](../webui/src/components/conversation-preview.tsx)
- [webui/src/data/demo.ts](../webui/src/data/demo.ts)
- [webui/src/app/layout.tsx](../webui/src/app/layout.tsx)
- [webui/src/app/globals.css](../webui/src/app/globals.css)
- [next.config.ts](../next.config.ts)
- [package.json](../package.json)

## 验证情况

已通过：

```text
npm run lint
npx tsc --noEmit
npm run build
```

最近一次验证：2026-06-30，修复启动脚本后，`lint`、`tsc`、`build` 均通过；`/`、`/agents/new`、`/chat/demo` 均返回 200。

2026-06-30：首页从欢迎/推荐布局改为 Agent 图谱面板后，`lint`、`tsc`、`build` 均通过。

注意：

- `npm run dev` 当前绑定到 `127.0.0.1:3000`
- 如果 3000 被占用，可以使用 `npm run dev:alt`，默认打开 `127.0.0.1:3002`
- `npm run preview` 会先执行生产构建，再启动 `next start`
- Playwright / headless Chrome 截图 QA 受本机权限限制，暂未完成自动截图验证。

## 当前运行方式

如果明天继续开发，先进入项目目录：

```text
/Users/sjl/myspace/eido
```

安装依赖已经完成，通常只需要启动：

```text
npm run dev
```

如果 3000 被占用：

```text
npm run dev:alt
```

如果想预览生产构建：

```text
npm run preview
```

打开：

```text
http://127.0.0.1:3000
```

## 下一步建议

下一步不要继续写更多产品文档，建议直接进入开发。

轻 MVP 当前推荐优先级：

1. 做一个主人请求处理页
2. 做移动端视觉检查和微调
3. 把新建 Agent 和对话请求接入轻量后端存储
4. 再考虑登录、Prisma 和 LLM

暂时不做：

- 用户注册 / 登录
- 多 Agent 后台管理
- 完整搜索 API
- Prisma / PostgreSQL
- LLM 自动回复
- 复杂风控和通知

### 已完成：Agent 对话页

目标：

实现一个可访问、可输入的页面，用于展示访问者与 Agent 的初步沟通体验。

建议路由：

```text
/chat/demo
```

页面包含：

- 顶部对话对象信息
- 数字代理身份提示
- 消息记录
- 访问者消息、Agent 消息、系统提示
- 等待主人确认状态
- 请求真人接入按钮
- 输入框
- 举报 / 拉黑入口占位
- 基于关键词触发主人确认请求

### 下一步 1：主人请求处理页

目标：

实现一个极轻后台页面，用于展示对话页触发的“等待主人确认”请求。

建议路由：

```text
/owner/requests
```

页面包含：

- 请求列表
- 请求摘要
- 访问者最近消息
- 接入 / 拒绝 / 让 Agent 继续沟通按钮
- 当前先用 demo 数据，不接真实登录

### 下一步 2：移动端视觉检查和微调

目标：

检查首页、Agent 公开主页和对话页在移动端的可读性、按钮尺寸、消息气泡宽度和 sticky 导航表现。

建议重点：

- 首页搜索框和推荐卡片
- Agent 公开页侧边栏在移动端的顺序
- 对话页消息区高度和输入栏布局
- 长文本换行和按钮文字适配

### 下一步 3：组件抽离

建议把首页中的组件逐步移到：

```text
webui/src/components/
```

候选组件：

- `TopNav`
- `AgentCard`
- `SkillChips`
- `ConversationPreview`
- `DigitalAgentBadge`
- `AgentStatusBadge`

### 下一步 3：基础 UI 组件

可以先建立：

```text
webui/src/components/ui/
```

候选组件：

- `Button`
- `Badge`
- `Card`
- `Input`

不需要一次性做完整设计系统，先服务当前页面即可。

## 明天继续时的提示词

可以直接说：

```text
继续根据 docs/PROGRESS.md 的轻 MVP 路线，从主人请求处理页开始开发。
```

## 当前重要判断

- 项目当前处于“前端静态产品骨架”阶段。
- 还没有接数据库、认证、搜索、真实对话或 AI。
- 下一步应该继续把核心页面做出来，而不是马上接复杂后端。
- 推荐顺序是：首页 -> Agent 公开主页 -> 对话页 -> 创建 Agent 流程 -> 再接数据。
