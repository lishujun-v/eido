# 数字分身 Agent 平台 MVP 规格说明

版本：v0.1

状态：草案

关联文档：[PRD.md](./PRD.md)

## 1. MVP 目标

MVP 的目标不是一次性做完整的 Agent 社交网络，而是验证一个最小但完整的核心闭环：

```text
用户创建自己的数字分身 Agent
-> Agent 拥有公开主页
-> 其他人可以搜索并发现 Agent
-> 其他人可以和 Agent 对话
-> Agent 根据主人资料自动回复
-> Agent 在必要时通知主人接入
-> 双方建立联系
```

MVP 成功的标志是：

- 用户愿意认真填写自己的数字分身资料
- 访问者可以通过自然语言需求找到合适的 Agent
- Agent 的回答足够像一个可靠的初步沟通代理
- Agent 能够避免越权承诺和泄露隐私
- 主人愿意接入高质量请求

## 2. MVP 产品原则

### 2.1 先做人，不先做市场

第一版重点是让每个人能拥有一个可信、可展示、可对话的数字分身，而不是先做复杂交易市场。

### 2.2 先做被动发现，再做主动联系

第一版允许访问者搜索和联系 Agent。Agent-to-Agent 主动批量联系暂不作为 MVP 核心能力，避免过早引入骚扰和风控复杂度。

### 2.3 Agent 是数字代理，不是真人本人

Agent 必须明确说明自己是某个用户的数字代理，可以进行初步沟通，但不能伪装成真人，也不能替主人做重大承诺。

### 2.4 隐私和边界优先

联系方式、报价、线下见面、交易承诺等敏感事项必须受到配置和真人确认机制约束。

## 3. MVP 范围

### 3.1 MVP 包含

- 用户注册与登录
- 创建一个数字分身 Agent
- 编辑 Agent 档案
- 配置 Agent 行为规则
- 配置 Agent 隐私规则
- Agent 公开主页
- Agent 列表与自然语言搜索
- 与 Agent 对话
- Agent 基于主人资料自动回复
- Agent 判断是否需要真人接入
- 主人查看接入请求
- 主人接入或拒绝请求
- 基础举报、拉黑、频率限制

### 3.2 MVP 不包含

- 支付交易
- 复杂评价体系
- 复杂身份认证
- 多 Agent 创建
- 企业组织账号
- 开放 API
- 插件市场
- 完整 Agent-to-Agent 自主通信网络
- 婚恋、医疗、法律、金融等垂直场景专项能力
- 自动外呼、短信、微信主动联系

## 4. 目标用户与第一场景

### 4.1 MVP 推荐目标用户

第一版建议优先面向“技能和合作型用户”：

- 自由职业者
- 程序员
- 设计师
- 创作者
- 咨询顾问
- 创业者
- 本地技能服务者
- 正在寻找合作机会的人

### 4.2 推荐第一场景

MVP 不把产品限制死在单一行业，但运营和示例应优先围绕：

```text
我想被别人发现我的能力
别人可以通过需求找到我
我的 Agent 可以替我初步沟通
```

典型案例：

- 找人修摩托车
- 找设计师做品牌视觉
- 找 AI 产品顾问聊想法
- 找短视频剪辑合作
- 找创业者交流项目

## 5. 核心用户流程

### 5.1 用户创建 Agent 流程

```text
进入平台
-> 注册 / 登录
-> 点击创建我的 Agent
-> 填写基础信息
-> 填写能力与经历
-> 填写兴趣与性格
-> 填写想被谁找到
-> 配置联系方式
-> 配置隐私与接入规则
-> 预览 Agent 主页
-> 发布 Agent
```

验收标准：

- 用户可以完成 Agent 创建
- 创建后生成公开主页链接
- 公开主页只展示用户允许公开的字段
- Agent 创建后可被搜索到

### 5.2 访问者找人流程

```text
进入首页
-> 输入自然语言需求
-> 系统解析需求
-> 返回匹配 Agent 列表
-> 用户查看匹配原因
-> 进入 Agent 主页
-> 发起对话
```

验收标准：

- 用户可以输入一句自然语言找人需求
- 搜索结果展示 Agent、标签、简介、匹配原因
- 用户可以进入 Agent 主页并发起对话

### 5.3 与 Agent 对话流程

```text
访问者打开对话
-> Agent 声明自己是数字代理
-> 访问者说明需求
-> Agent 根据主人资料回答
-> Agent 询问必要补充信息
-> Agent 判断是否匹配
-> 匹配时触发主人接入
-> 不匹配时礼貌拒绝
```

验收标准：

- Agent 回答必须基于主人资料
- Agent 不得泄露私密字段
- Agent 不得代表主人承诺交易、时间、线下见面
- Agent 能在高匹配或高风险情况下触发接入请求

### 5.4 主人接入流程

```text
Agent 触发接入
-> 系统生成请求摘要
-> 主人收到待处理请求
-> 主人查看对话上下文
-> 主人选择接入 / 拒绝 / 让 Agent 继续沟通 / 拉黑
```

验收标准：

- 主人可以看到请求摘要和对话记录
- 主人可以接入对话
- 主人可以拒绝或拉黑
- 接入后对方能看到真人已加入

## 6. 页面信息架构

### 6.1 首页

目标：

让访问者快速搜索 Agent，让新用户快速创建自己的 Agent。

模块：

- 顶部导航
- 自然语言搜索框
- 创建我的 Agent 入口
- 推荐 Agent
- 热门能力标签
- 登录 / 注册入口

关键交互：

- 输入需求后进入搜索结果页
- 点击创建 Agent 进入创建流程
- 点击 Agent 卡片进入公开主页

### 6.2 注册 / 登录页

目标：

完成基础身份创建。

MVP 支持：

- 邮箱注册
- 邮箱登录
- 密码登录

后续扩展：

- 手机号验证码
- 微信登录
- Google 登录
- GitHub 登录

### 6.3 创建 Agent 页面

目标：

引导用户高质量地创建数字分身。

建议分 5 步：

1. 基础信息
2. 能力与经历
3. 性格与兴趣
4. 联系方式与可见性
5. Agent 行为边界

关键要求：

- 每一步保存草稿
- 提供示例占位文案
- 发布前展示预览
- 未完成核心字段时不可发布

### 6.4 Agent 公开主页

目标：

展示一个人的数字分身，并允许访问者发起对话。

模块：

- Agent 头像和名称
- 数字代理身份提示
- 一句话介绍
- 城市、职业、语言
- 能力标签
- 可提供帮助
- 想认识的人
- 作品 / 链接
- 联系状态
- 发起对话按钮
- 举报按钮

隐私规则：

- 仅展示公开字段
- 私密联系方式不直接展示
- 敏感字段需要主人确认后才可见

### 6.5 搜索结果页

目标：

让用户看到哪些 Agent 可能匹配自己的需求。

模块：

- 原始搜索需求
- 解析出的需求标签
- Agent 结果列表
- 匹配原因
- 匹配度
- 过滤条件

过滤条件：

- 城市
- 线上 / 线下
- 能力标签
- 当前是否可联系
- 是否认证

### 6.6 Agent 对话页

目标：

让访问者和数字分身进行初步沟通。

模块：

- 对话对象信息
- Agent 身份提示
- 对话记录
- 输入框
- 请求真人接入按钮
- 举报 / 拉黑入口

特殊状态：

- Agent 正在回复
- Agent 已触发主人接入
- 主人已接入
- 主人拒绝接入
- 对话因规则被终止

### 6.7 我的 Agent 后台

目标：

让主人管理自己的 Agent。

模块：

- Agent 状态
- 档案编辑
- 行为配置
- 隐私配置
- 收到的请求
- 待接入对话
- 对话历史
- 访问与对话统计

## 7. 核心数据模型

### 7.1 User

用户账号。

字段建议：

- id
- email
- password_hash
- display_name
- avatar_url
- role
- status
- created_at
- updated_at

### 7.2 Agent

数字分身主体。

字段建议：

- id
- owner_user_id
- name
- avatar_url
- slug
- short_bio
- city
- timezone
- languages
- occupation
- status
- visibility
- published_at
- created_at
- updated_at

### 7.3 AgentProfile

Agent 的详细档案。

字段建议：

- id
- agent_id
- skills
- industries
- services
- experiences
- projects
- interests
- personality
- communication_style
- values_text
- looking_for
- willing_to_help
- not_accepting
- service_area
- price_range
- external_links
- created_at
- updated_at

### 7.4 ContactMethod

联系方式。

字段建议：

- id
- agent_id
- type
- value
- visibility
- requires_owner_approval
- created_at
- updated_at

### 7.5 AgentRule

Agent 行为规则。

字段建议：

- id
- agent_id
- allow_unknown_contacts
- allow_agent_initiated_contact
- allow_share_contact
- allow_quote_price
- allow_schedule_meeting
- allow_sensitive_topics
- max_inbound_requests_per_day
- max_outbound_requests_per_day
- handoff_triggers
- rejection_rules
- blocked_keywords
- created_at
- updated_at

### 7.6 Conversation

对话会话。

字段建议：

- id
- visitor_user_id
- visitor_agent_id
- target_agent_id
- owner_user_id
- status
- source
- summary
- handoff_status
- created_at
- updated_at

### 7.7 Message

对话消息。

字段建议：

- id
- conversation_id
- sender_type
- sender_user_id
- sender_agent_id
- content
- metadata
- created_at

sender_type 可选：

- visitor
- visitor_agent
- target_agent
- owner
- system

### 7.8 HandoffRequest

真人接入请求。

字段建议：

- id
- conversation_id
- target_agent_id
- owner_user_id
- reason
- summary
- risk_level
- status
- owner_action
- created_at
- updated_at

### 7.9 Report

举报记录。

字段建议：

- id
- reporter_user_id
- target_agent_id
- target_conversation_id
- reason
- description
- status
- created_at
- updated_at

### 7.10 Block

拉黑关系。

字段建议：

- id
- blocker_user_id
- blocked_user_id
- blocked_agent_id
- reason
- created_at

## 8. Agent 对话逻辑

### 8.1 Agent 输入上下文

每次 Agent 回复时，应输入以下上下文：

- Agent 公开资料
- 用户授权可用于对话的私密资料
- Agent 行为规则
- 隐私规则
- 当前对话历史
- 对方需求摘要
- 平台安全规则

### 8.2 Agent 回复约束

Agent 必须遵守：

- 说明自己是数字代理
- 只基于授权资料回答
- 不泄露私密联系方式
- 不做未经授权的承诺
- 涉及金钱、线下、合同、隐私时触发接入
- 无法判断时请求主人确认

### 8.3 触发真人接入的条件

P0 触发条件：

- 对方明确提出合作
- 对方请求联系方式
- 对方提出线下见面
- 对方询问报价或交易
- Agent 无法确定答案
- 匹配度高于阈值
- 对话轮数超过阈值

### 8.4 自动拒绝条件

P0 拒绝条件：

- 命中主人拒绝规则
- 涉嫌垃圾广告
- 涉嫌骚扰
- 请求明显不相关
- 请求违法违规
- 对方频率超过限制

## 9. 搜索与匹配逻辑

### 9.1 MVP 搜索策略

MVP 建议采用混合搜索：

- 关键词搜索
- 标签匹配
- 向量语义搜索
- 城市和状态过滤

### 9.2 需求解析

用户输入自然语言后，系统解析：

- 需求类型
- 能力关键词
- 地点
- 是否线下
- 预算
- 时间
- 意图

### 9.3 匹配结果排序

排序因素：

- 能力匹配度
- 地点匹配度
- Agent 资料完整度
- 当前可联系状态
- 响应率
- 被举报风险
- 是否认证

### 9.4 匹配原因

每个搜索结果应展示简短匹配原因。

示例：

```text
匹配原因：该 Agent 标注了摩托车维修、本地服务，所在城市为上海，并允许陌生人发起维修咨询。
```

## 10. 权限、隐私与风控

### 10.1 字段可见性

每个敏感字段应支持：

- 公开
- 登录后可见
- 匹配后可见
- 主人确认后可见
- 永不公开

### 10.2 频率限制

MVP 建议：

- 未登录用户只能浏览公开主页，不能发起无限对话
- 新用户每日发起对话数有限
- 单个 Agent 每日接收陌生请求数有限
- 命中高风险规则后临时限制发送

### 10.3 举报与拉黑

MVP 必须支持：

- 举报 Agent
- 举报对话
- 拉黑用户 / Agent
- 被拉黑后不可继续发起对话

### 10.4 高风险场景

MVP 对以下场景默认保守处理：

- 金钱交易
- 线下见面
- 婚恋推进
- 医疗建议
- 法律建议
- 金融建议
- 身份证件与隐私信息

处理原则：

- Agent 不直接推进
- Agent 提示需要主人确认
- 必要时提示平台安全注意事项

## 11. 技术方案建议

### 11.1 推荐技术栈

Web 应用：

- Next.js
- React
- TypeScript
- Tailwind CSS

后端：

- Next.js API Routes 或独立 Node.js 服务
- PostgreSQL
- Prisma

搜索：

- PostgreSQL 全文搜索
- pgvector 语义向量搜索

AI：

- LLM 对话服务
- Embedding 服务
- Agent 回复策略层
- 安全与隐私过滤层

文件与媒体：

- 对象存储，用于头像和作品图片

### 11.2 系统模块

- Auth 模块
- User 模块
- Agent Profile 模块
- Search 模块
- Conversation 模块
- Handoff 模块
- Notification 模块
- Safety 模块
- Admin 模块

### 11.3 架构草图

```text
Frontend
  |
  v
API Layer
  |
  +-> Auth Service
  +-> Agent Service
  +-> Search Service
  +-> Conversation Service
  +-> Handoff Service
  +-> Safety Service
  |
  v
PostgreSQL + pgvector
  |
  v
LLM / Embedding Provider
```

## 12. 开发里程碑

### 12.1 Milestone 1：项目基础

目标：

建立 Web 项目基础。

交付：

- 项目脚手架
- 基础页面路由
- 数据库连接
- 用户模型
- Agent 模型
- 基础 UI 组件

### 12.2 Milestone 2：创建和展示 Agent

目标：

用户可以创建并发布自己的数字分身。

交付：

- 注册登录
- Agent 创建表单
- Agent 编辑
- Agent 公开主页
- 字段可见性基础逻辑

### 12.3 Milestone 3：搜索 Agent

目标：

用户可以通过自然语言找到 Agent。

交付：

- 搜索入口
- 需求解析
- 搜索结果页
- 匹配原因
- 基础过滤

### 12.4 Milestone 4：Agent 对话

目标：

访问者可以和 Agent 进行初步沟通。

交付：

- 对话页
- 消息存储
- Agent 回复生成
- 隐私过滤
- 越权承诺拦截

### 12.5 Milestone 5：真人接入与风控

目标：

Agent 可以触发主人接入，平台具备基础保护能力。

交付：

- 接入请求
- 主人处理面板
- 举报
- 拉黑
- 频率限制
- 基础风险规则

## 13. 验收清单

### 13.1 产品验收

- 用户可以注册登录
- 用户可以创建并发布 Agent
- Agent 主页可以公开访问
- 隐私字段不会被公开展示
- 用户可以搜索 Agent
- 搜索结果有匹配原因
- 用户可以和 Agent 对话
- Agent 能基于资料回答
- Agent 能拒绝不合适请求
- Agent 能触发真人接入
- 主人可以处理接入请求
- 用户可以举报和拉黑

### 13.2 安全验收

- Agent 不伪装成真人本人
- Agent 不泄露私密联系方式
- Agent 不代表主人做重大承诺
- 高频请求会被限制
- 被拉黑对象无法继续联系
- 举报记录可被管理员查看

### 13.3 体验验收

- 创建 Agent 流程清晰
- Agent 主页像一个可信的个人数字身份
- 搜索结果能解释为什么匹配
- 对话中能明确感知当前是 Agent 还是真人
- 主人接入前有摘要，不需要重读完整对话

## 14. 后续扩展方向

MVP 之后可以逐步扩展：

- 完整 Agent-to-Agent 自动沟通
- 多 Agent 身份
- 场景模板
- 认证体系
- 评价体系
- 支付交易
- 企业组织
- API 和外部嵌入
- 移动端 App / 小程序
- 垂直场景：招聘、自由职业、本地生活、婚恋、创业撮合

## 15. 当前待决策问题

进入开发前建议确认：

1. 第一版是否确定 Web 优先？
2. 是否接受邮箱密码登录作为 MVP 登录方式？
3. 第一版是否只允许每个用户创建一个 Agent？
4. Agent 公开主页是否允许搜索引擎收录？
5. 第一版是否默认禁止 Agent 主动批量联系陌生 Agent？
6. 是否采用 Next.js + PostgreSQL + Prisma + pgvector 作为初始技术栈？
7. 第一批种子用户希望从哪个圈层开始邀请？

## 16. 推荐下一步

建议下一步进入两个并行方向：

1. 产品方向：设计低保真页面原型和关键用户流程。
2. 技术方向：初始化 Web 项目，建立数据模型和基础路由。

如果只选一个方向，建议先做低保真原型。因为这个产品的核心体验是“我如何创建一个可信的数字分身”和“别人如何通过 Agent 认识我”，页面流程比底层代码更早决定产品味道。
