# 数字分身 Agent 平台技术方案

版本：v0.1

状态：草案

关联文档：

- [PRD.md](./PRD.md)
- [MVP_SPEC.md](./MVP_SPEC.md)
- [WIREFRAMES.md](./WIREFRAMES.md)

## 1. 技术目标

MVP 技术目标：

- 支持用户注册登录
- 支持创建、编辑、发布数字分身 Agent
- 支持 Agent 公开主页
- 支持自然语言搜索 Agent
- 支持访问者与 Agent 对话
- 支持 Agent 基于资料自动回复
- 支持隐私字段过滤和越权拦截
- 支持真人接入请求
- 支持举报、拉黑和基础频率限制

系统设计应优先保证：

- 业务可快速迭代
- 数据模型清晰
- Agent 行为可控
- 隐私边界明确
- 搜索和对话能力可扩展

## 2. 推荐技术栈

### 2.1 Web 应用

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui 或自建基础组件

选择理由：

- 适合快速构建 Web MVP
- 支持服务端渲染和公开 Agent 主页 SEO
- API Routes 可承载早期后端逻辑
- TypeScript 有利于复杂数据结构维护

### 2.2 数据库

- PostgreSQL
- Prisma ORM
- pgvector

选择理由：

- PostgreSQL 适合关系型核心数据
- Prisma 提升开发效率
- pgvector 支持语义搜索，避免 MVP 阶段引入独立向量数据库

### 2.3 AI 能力

- LLM Chat Completion
- Embedding Model
- Prompt 策略层
- Safety Guard 层

AI 主要用于：

- Agent 自动回复
- 用户需求解析
- Agent 资料向量化
- 搜索匹配原因生成
- 对话摘要
- 真人接入判断辅助

### 2.4 文件存储

MVP 可先使用：

- 本地文件存储，开发环境
- 对象存储，生产环境

用于：

- 用户头像
- Agent 头像
- 作品图片

### 2.5 部署建议

MVP 可选：

- Vercel 部署 Next.js
- Supabase / Neon / Railway 托管 PostgreSQL
- 对象存储使用 S3 兼容服务

如果先本地开发：

- Next.js 本地服务
- Docker PostgreSQL
- Prisma migration

## 3. 系统架构

### 3.1 总体架构

```text
Browser
  |
  v
Next.js App
  |
  +-> Page Routes / App Router
  +-> API Routes / Server Actions
  |
  v
Application Services
  |
  +-> Auth Service
  +-> User Service
  +-> Agent Service
  +-> Search Service
  +-> Conversation Service
  +-> Handoff Service
  +-> Safety Service
  +-> Notification Service
  |
  v
PostgreSQL + pgvector
  |
  +-> Relational Data
  +-> Embeddings
  |
  v
LLM Provider
```

### 3.2 模块边界

Auth：

- 注册
- 登录
- 会话管理
- 权限校验

Agent：

- 创建 Agent
- 编辑档案
- 发布 / 下线
- 隐私字段控制
- 行为规则配置

Search：

- 需求解析
- 关键词搜索
- 标签搜索
- 向量搜索
- 结果排序
- 匹配原因生成

Conversation：

- 创建对话
- 存储消息
- 调用 Agent 回复
- 维护对话状态

Handoff：

- 触发真人接入
- 生成请求摘要
- 主人处理接入请求
- 对话切换为真人参与

Safety：

- 隐私过滤
- 越权承诺检测
- 敏感话题检测
- 频率限制
- 举报和拉黑

Notification：

- 站内通知
- 待处理请求提醒
- 后续扩展邮件、短信、微信通知

## 4. 数据库设计

### 4.1 User

用户账号表。

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  displayName  String?
  avatarUrl    String?
  role         UserRole @default(USER)
  status       UserStatus @default(ACTIVE)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

枚举：

```prisma
enum UserRole {
  USER
  ADMIN
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  DELETED
}
```

### 4.2 Agent

数字分身主体表。

```prisma
model Agent {
  id          String      @id @default(cuid())
  ownerUserId String
  name        String
  avatarUrl   String?
  slug        String      @unique
  shortBio    String
  city        String?
  timezone    String?
  languages   String[]
  occupation  String?
  status      AgentStatus @default(DRAFT)
  visibility  Visibility  @default(PUBLIC)
  publishedAt DateTime?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  owner       User        @relation(fields: [ownerUserId], references: [id])
  profile     AgentProfile?
  rules       AgentRule?
}
```

枚举：

```prisma
enum AgentStatus {
  DRAFT
  PUBLISHED
  PAUSED
  ARCHIVED
}

enum Visibility {
  PUBLIC
  LOGGED_IN
  MATCHED_ONLY
  OWNER_APPROVAL
  PRIVATE
}
```

### 4.3 AgentProfile

Agent 详细资料表。

```prisma
model AgentProfile {
  id                 String   @id @default(cuid())
  agentId            String   @unique
  skills             String[]
  industries         String[]
  services           String[]
  experiences        Json?
  projects           Json?
  interests          String[]
  personality        String?
  communicationStyle String?
  valuesText         String?
  lookingFor         String?
  willingToHelp      String?
  notAccepting       String?
  serviceArea        String?
  priceRange         String?
  externalLinks      Json?
  searchableText     String?
  embedding          Unsupported("vector")?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  agent              Agent    @relation(fields: [agentId], references: [id])
}
```

### 4.4 ContactMethod

联系方式表。

```prisma
model ContactMethod {
  id                    String     @id @default(cuid())
  agentId               String
  type                  ContactType
  value                 String
  visibility            Visibility @default(OWNER_APPROVAL)
  requiresOwnerApproval Boolean    @default(true)
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt

  agent                 Agent      @relation(fields: [agentId], references: [id])
}

enum ContactType {
  EMAIL
  WECHAT
  PHONE
  WEBSITE
  SOCIAL
  CALENDLY
  OTHER
}
```

### 4.5 AgentRule

Agent 行为规则表。

```prisma
model AgentRule {
  id                         String   @id @default(cuid())
  agentId                    String   @unique
  allowUnknownContacts        Boolean  @default(true)
  allowAgentInitiatedContact  Boolean  @default(false)
  allowShareContact           Boolean  @default(false)
  allowQuotePrice             Boolean  @default(false)
  allowScheduleMeeting        Boolean  @default(false)
  allowSensitiveTopics        Boolean  @default(false)
  maxInboundRequestsPerDay    Int      @default(20)
  maxOutboundRequestsPerDay   Int      @default(5)
  handoffTriggers             String[]
  rejectionRules              String[]
  blockedKeywords             String[]
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt

  agent                       Agent    @relation(fields: [agentId], references: [id])
}
```

### 4.6 Conversation

对话表。

```prisma
model Conversation {
  id              String             @id @default(cuid())
  visitorUserId   String?
  visitorAgentId  String?
  targetAgentId   String
  ownerUserId     String
  status          ConversationStatus @default(ACTIVE)
  source          ConversationSource @default(DIRECT)
  summary         String?
  handoffStatus   HandoffStatus      @default(NONE)
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  targetAgent     Agent              @relation(fields: [targetAgentId], references: [id])
  owner           User               @relation(fields: [ownerUserId], references: [id])
}

enum ConversationStatus {
  ACTIVE
  WAITING_OWNER
  OWNER_JOINED
  REJECTED
  BLOCKED
  CLOSED
}

enum ConversationSource {
  DIRECT
  SEARCH
  PROFILE
  AGENT_TO_AGENT
}

enum HandoffStatus {
  NONE
  REQUESTED
  ACCEPTED
  REJECTED
}
```

### 4.7 Message

消息表。

```prisma
model Message {
  id             String      @id @default(cuid())
  conversationId String
  senderType     SenderType
  senderUserId   String?
  senderAgentId  String?
  content        String
  metadata       Json?
  createdAt      DateTime    @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id])
}

enum SenderType {
  VISITOR
  VISITOR_AGENT
  TARGET_AGENT
  OWNER
  SYSTEM
}
```

### 4.8 HandoffRequest

真人接入请求表。

```prisma
model HandoffRequest {
  id             String        @id @default(cuid())
  conversationId String
  targetAgentId  String
  ownerUserId    String
  reason         String
  summary        String
  riskLevel      RiskLevel     @default(LOW)
  status         HandoffStatus @default(REQUESTED)
  ownerAction    String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  conversation   Conversation  @relation(fields: [conversationId], references: [id])
}

enum RiskLevel {
  LOW
  MEDIUM
  HIGH
}
```

### 4.9 Report

举报表。

```prisma
model Report {
  id                   String       @id @default(cuid())
  reporterUserId        String?
  targetAgentId         String?
  targetConversationId  String?
  reason               ReportReason
  description          String?
  status               ReportStatus @default(OPEN)
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt
}

enum ReportReason {
  FAKE_IDENTITY
  SPAM
  HARASSMENT
  ILLEGAL
  ADULT_CONTENT
  SCAM
  OTHER
}

enum ReportStatus {
  OPEN
  REVIEWING
  RESOLVED
  DISMISSED
}
```

### 4.10 Block

拉黑表。

```prisma
model Block {
  id             String   @id @default(cuid())
  blockerUserId  String
  blockedUserId  String?
  blockedAgentId String?
  reason         String?
  createdAt      DateTime @default(now())
}
```

### 4.11 RateLimitEvent

频率限制事件表。

```prisma
model RateLimitEvent {
  id        String   @id @default(cuid())
  actorKey  String
  action    String
  targetKey String?
  createdAt DateTime @default(now())
}
```

## 5. API 设计

### 5.1 Auth API

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### 5.2 Agent API

```text
POST   /api/agents
GET    /api/agents/me
GET    /api/agents/:slug
PATCH  /api/agents/:id
POST   /api/agents/:id/publish
POST   /api/agents/:id/pause
POST   /api/agents/:id/archive
```

### 5.3 Agent Profile API

```text
PUT /api/agents/:id/profile
PUT /api/agents/:id/rules
PUT /api/agents/:id/contact-methods
```

### 5.4 Search API

```text
POST /api/search/agents
```

请求：

```json
{
  "query": "帮我找一个会修复古摩托车的人，最好在上海",
  "filters": {
    "city": "上海",
    "onlineOnly": false
  }
}
```

响应：

```json
{
  "parsedIntent": {
    "type": "service",
    "skills": ["摩托车维修"],
    "city": "上海",
    "needsOffline": true
  },
  "results": [
    {
      "agentId": "agent_123",
      "name": "小李的数字代理",
      "slug": "xiaoli",
      "shortBio": "复古摩托车维修爱好者",
      "matchScore": 0.91,
      "matchReason": "该 Agent 标注了摩托车维修和本地服务，城市为上海。",
      "tags": ["摩托车维修", "复古车", "上海"]
    }
  ]
}
```

### 5.5 Conversation API

```text
POST /api/conversations
GET  /api/conversations/:id
POST /api/conversations/:id/messages
POST /api/conversations/:id/request-handoff
POST /api/conversations/:id/close
```

发送消息请求：

```json
{
  "content": "你好，我想问一下你能修川崎复古摩托吗？"
}
```

响应：

```json
{
  "message": {
    "senderType": "TARGET_AGENT",
    "content": "你好，我是小李的数字代理..."
  },
  "handoff": {
    "triggered": false
  }
}
```

### 5.6 Handoff API

```text
GET  /api/handoffs
GET  /api/handoffs/:id
POST /api/handoffs/:id/accept
POST /api/handoffs/:id/reject
POST /api/handoffs/:id/continue-agent
```

### 5.7 Safety API

```text
POST /api/reports
POST /api/blocks
DELETE /api/blocks/:id
```

## 6. 搜索与匹配实现

### 6.1 Agent 可搜索文本

每个 Agent 发布或更新时，生成 searchableText：

```text
名称
一句话介绍
职业
城市
技能标签
行业
服务
经历
兴趣
想认识的人
愿意提供的帮助
不接受的请求
```

### 6.2 Embedding 生成

当 Agent 发布或更新资料时：

```text
读取 AgentProfile
-> 拼接 searchableText
-> 调用 embedding 模型
-> 存储 embedding
```

### 6.3 搜索流程

```text
用户输入 query
-> LLM 解析需求结构
-> query 生成 embedding
-> PostgreSQL 全文搜索召回
-> pgvector 语义搜索召回
-> 合并结果
-> 应用过滤条件
-> 计算综合分
-> 生成匹配原因
-> 返回结果
```

### 6.4 综合评分

建议评分：

```text
score =
  semanticScore * 0.45
  + keywordScore * 0.25
  + cityScore * 0.10
  + availabilityScore * 0.10
  + profileCompletenessScore * 0.05
  + trustScore * 0.05
```

MVP 可先简化：

- 语义匹配
- 标签匹配
- 城市匹配
- 是否可联系

## 7. Agent 对话实现

### 7.1 回复生成流程

```text
用户发送消息
-> 检查对话权限
-> 检查拉黑关系
-> 检查频率限制
-> 保存用户消息
-> 构建 Agent 上下文
-> 调用 Safety Precheck
-> 调用 LLM 生成回复
-> 调用 Safety Postcheck
-> 判断是否触发真人接入
-> 保存 Agent 回复
-> 必要时创建 HandoffRequest
-> 返回响应
```

### 7.2 Agent 上下文结构

```json
{
  "agent": {
    "name": "小李的数字代理",
    "shortBio": "复古摩托车维修爱好者",
    "city": "上海",
    "occupation": "摩托车维修师"
  },
  "profile": {
    "skills": ["摩托车维修", "复古摩托车"],
    "services": ["故障诊断", "基础保养"],
    "communicationStyle": "友好温和",
    "notAccepting": "不接违法改装"
  },
  "rules": {
    "allowShareContact": false,
    "allowQuotePrice": false,
    "allowScheduleMeeting": false,
    "handoffTriggers": ["contact_request", "offline_meeting", "pricing", "high_match"]
  },
  "conversation": {
    "recentMessages": []
  }
}
```

### 7.3 System Prompt 核心约束

Agent 必须：

- 表明自己是数字代理
- 只基于授权资料回答
- 不编造主人经历和能力
- 不泄露私密联系方式
- 不代表主人做交易、报价、线下见面、时间承诺
- 遇到不确定问题时请求主人确认
- 请求方需求明显匹配时建议触发主人接入
- 请求不合适时礼貌拒绝

### 7.4 结构化输出

LLM 回复建议使用结构化输出：

```json
{
  "reply": "你好，我是小李的数字代理...",
  "shouldHandoff": true,
  "handoffReason": "对方提出了线下维修需求，需要主人确认时间和地点。",
  "riskLevel": "LOW",
  "detectedIntent": "offline_service_request",
  "blocked": false
}
```

### 7.5 隐私过滤

回复前检查：

- 是否包含私密联系方式
- 是否包含未授权价格
- 是否包含线下见面承诺
- 是否包含敏感身份信息
- 是否违反 AgentRule

如果命中，替换为：

```text
这个信息需要主人确认后才能提供。我可以帮你把请求转给主人。
```

## 8. 真人接入实现

### 8.1 触发条件

自动触发：

- 请求联系方式
- 请求报价
- 请求线下见面
- 明确合作意向
- 高匹配需求
- Agent 无法确定答案
- 对话轮数超过阈值

手动触发：

- 访问者点击请求真人接入
- 主人主动加入对话

### 8.2 HandoffRequest 创建

创建时生成：

- reason
- summary
- riskLevel
- suggestedAction

### 8.3 主人操作

主人可以：

- 接入对话
- 拒绝
- 让 Agent 继续沟通
- 拉黑
- 举报

### 8.4 状态变化

```text
Conversation.ACTIVE
-> WAITING_OWNER
-> OWNER_JOINED / REJECTED / ACTIVE / BLOCKED
```

## 9. 隐私与权限

### 9.1 字段权限

每个敏感字段都应经过 visibility 判断。

可见性规则：

- PUBLIC：所有人可见
- LOGGED_IN：登录用户可见
- MATCHED_ONLY：匹配或对话后可见
- OWNER_APPROVAL：主人确认后可见
- PRIVATE：永不对外展示

### 9.2 API 权限

规则：

- 只有 owner 可以编辑自己的 Agent
- 未发布 Agent 只有 owner 可见
- 私密字段不通过公开 API 返回
- 对话参与者才能读取对话
- 接入请求只有 Agent owner 可见
- 管理员可查看举报和风险内容

### 9.3 对话权限

发起对话前检查：

- Agent 是否 published
- Agent 是否 paused
- 是否允许陌生请求
- 是否被拉黑
- 是否超过频率限制

## 10. 风控与安全

### 10.1 MVP 风控策略

- 每用户每日发起对话限制
- 每 Agent 每日接收陌生请求限制
- 被拉黑后禁止继续发送
- 举报记录进入管理员待审
- 高风险词触发保守回复
- AI 输出经过隐私和承诺检查

### 10.2 频率限制建议

默认：

- 未登录用户不可发起对话，只能浏览公开页
- 新用户每日最多发起 10 个对话
- 单 Agent 每日最多接收 20 个陌生请求
- 单会话每分钟最多发送 10 条消息

### 10.3 审计记录

以下行为建议记录：

- Agent 发布
- Agent 规则修改
- 对话创建
- Handoff 触发
- 主人接入
- 举报
- 拉黑
- 管理员处理

## 11. 前端路由建议

```text
/                         首页
/login                    登录
/register                 注册
/agents/[slug]            Agent 公开主页
/search                   搜索结果页
/chat/[conversationId]    对话页
/dashboard                我的 Agent 概览
/dashboard/profile        档案编辑
/dashboard/rules          行为边界
/dashboard/privacy        隐私设置
/dashboard/handoffs       待处理请求
/dashboard/handoffs/[id]  接入请求详情
/dashboard/conversations  对话历史
```

## 12. 前端组件建议

基础组件：

- Button
- Input
- Textarea
- Select
- Switch
- Badge
- Card
- Modal
- Tabs
- Toast

业务组件：

- AgentCard
- AgentProfileHeader
- SkillTagList
- SearchBox
- SearchResultList
- ChatThread
- ChatInput
- HandoffBanner
- VisibilitySelector
- AgentStatusBadge
- ReportDialog
- ContactMethodEditor
- RuleEditor

## 13. 开发顺序建议

### 13.1 Phase 1：项目初始化

- Next.js 初始化
- TypeScript 配置
- Tailwind 配置
- 基础 UI 组件
- Prisma 初始化
- PostgreSQL 连接
- 基础布局和路由

### 13.2 Phase 2：用户与 Agent

- 注册登录
- Session 管理
- 创建 Agent
- 编辑 Agent
- 发布 Agent
- Agent 公开主页

### 13.3 Phase 3：搜索

- searchableText 生成
- embedding 生成
- 搜索 API
- 搜索结果页
- 匹配原因

### 13.4 Phase 4：对话

- 创建 Conversation
- 消息存储
- 对话页
- Agent 回复生成
- 隐私过滤
- 触发 handoff

### 13.5 Phase 5：接入与安全

- Handoff 后台
- 主人接入
- 举报
- 拉黑
- 频率限制
- 管理员基础审核

## 14. 环境变量

建议：

```text
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
LLM_API_KEY=
LLM_MODEL=
EMBEDDING_MODEL=
STORAGE_ENDPOINT=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
```

## 15. 测试策略

### 15.1 单元测试

重点测试：

- 权限判断
- 隐私字段过滤
- AgentRule 判断
- Handoff 触发规则
- 搜索评分函数

### 15.2 集成测试

重点测试：

- 注册登录
- 创建并发布 Agent
- 搜索 Agent
- 创建对话
- Agent 回复
- 触发真人接入
- 拉黑后无法继续发送

### 15.3 人工验收

重点检查：

- Agent 是否会伪装真人
- Agent 是否泄露联系方式
- Agent 是否做越权承诺
- 搜索结果是否符合直觉
- 接入流程是否清晰

## 16. 已知技术风险

### 16.1 Agent 幻觉

风险：

Agent 可能编造主人能力或经历。

缓解：

- Prompt 明确只能基于资料回答
- 资料外问题要求表示不确定
- 高风险回答触发主人确认
- 后续可引入 RAG 引用来源

### 16.2 隐私泄露

风险：

Agent 可能输出私密字段。

缓解：

- 构建上下文时不放入不可见字段
- 输出后做隐私过滤
- 联系方式默认主人确认后可见

### 16.3 搜索质量不足

风险：

早期数据少，搜索结果不稳定。

缓解：

- 支持标签和城市强过滤
- 展示匹配原因
- 鼓励完善资料
- 种子用户定向邀请

### 16.4 风控不足

风险：

陌生请求可能变成骚扰。

缓解：

- 默认频率限制
- 举报拉黑
- 关闭陌生请求选项
- Agent 主动联系 MVP 阶段默认关闭

## 17. 下一步

技术方案确认后，建议进入：

1. 创建 `TASKS.md`，把 MVP 拆成开发任务。
2. 初始化 Next.js 项目。
3. 建立 Prisma schema。
4. 先实现用户、Agent 创建和公开主页。
