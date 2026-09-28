# Agent 自进化（Self-Evolution）调研综述

## 一、什么是 Agent 自进化

Agent 自进化指 AI Agent 在部署后，无需人工干预（或仅需极少量干预），能够基于自身运行经验、环境反馈和交互数据，**自动改进**自身能力的行为。其核心目标是从"静态配置的 Agent"走向"持续适应的终身学习系统"。

---

## 二、两大综述框架

### 1. What / When / How / Where 四维度框架
> 来源：*A Survey of Self-Evolving Agents: What, When, How, and Where to Evolve on the Path to ASI*（arXiv 2507.21046, 王梦迪团队）

- **What to evolve**：进化什么——Prompt、Tool、Skill、Memory、Workflow、模型参数
- **When to evolve**：何时进化——在线（实时）/ 离线（批量）/ 触发式
- **How to evolve**：如何进化——反馈驱动、搜索优化、强化学习、进化算法
- **Where to evolve**：在哪进化——单 Agent / 多 Agent / 环境协同

### 2. System Inputs / Agent System / Environment / Optimisers 四组件框架
> 来源：*A Comprehensive Survey of Self-Evolving AI Agents*（arXiv 2508.07407, Glasgow & 中科院）

强调自进化的**反馈回路**：Agent 在环境中执行任务 → 产生交互数据 → Optimiser 基于反馈优化 Agent 的某个组件 → 改进后的 Agent 重新投入环境。

---

## 三、六大技术路径

### 路径 1：LLM 行为优化（训练型）

**核心思路**：通过 SFT 或 RL 直接改变模型参数，让 Agent "学会"更好的行为模式。

| 方法 | 代表项目 | 要点 |
|------|---------|------|
| SFT 自举 | STaR (NeurIPS'22) | 用模型自己生成的推理链做训练数据，迭代提升 |
| 自奖励 RL | Self-Rewarding LM (ICML'24) | LLM 自己当裁判，给自己生成的回答打分，用 DPO 训练 |
| 零数据自博弈 | Absolute Zero (2025) | 完全不需要外部数据，通过自博弈产生训练信号 |
| 多模态自进化 | mSTAR (ICML'25) | 多模态推理的自进化训练 |

**优点**：能力提升天花板高，能改变模型底层行为
**缺点**：需要 GPU 训练资源；容易 reward hacking；可能遗忘旧能力

---

### 路径 2：Prompt 优化（推理时，无需训练）

**核心思路**：不改模型参数，通过自动搜索/进化 Prompt 来提升 Agent 表现。

| 子方向 | 代表项目 | 要点 |
|--------|---------|------|
| 编辑式搜索 | GrIPS (EACL'23) | 对 instruction 做删除/增改/替换等编辑操作，择优保留 |
| 进化算法 | EvoPrompt (ICLR'24), Promptbreeder (ICML'24) | 用遗传算法/差分进化生成候选 prompt，适应度选择 |
| 生成式优化 | OPRO (ICLR'24), DSPy (EMNLP'24) | LLM 作为优化器，基于历史轨迹生成更好的 prompt |
| 反思式进化 | GEPA (2025) | 读取执行轨迹，理解失败原因后提出针对性修改；ICLR 2026 Oral |
| 文本梯度 | TextGrad (2024) | 模拟反向传播，用文本"梯度"指导 prompt 更新 |

**优点**：无需 GPU，API 调用即可；迭代快（$2-10/次）；可解释性强
**缺点**：受限于模型固有能力上限；搜索空间大时效率低

---

### 路径 3：技能库与记忆系统

**核心思路**：Agent 将成功经验沉淀为可复用的"技能"或"记忆"，在未来遇到类似任务时直接调用。

| 项目 | 要点 |
|------|------|
| **Voyager** (NVIDIA, 2023) | Minecraft Agent，自动编写代码技能 → 验证 → 存入 skill library → 复用；终身学习 |
| **SAGE** (2024) | 反思 + 记忆增强的自进化 Agent，从失败中提取经验存入记忆库 |
| **MemSkill** (2025) | 学习和进化记忆管理技能本身，让 Agent 更好地"记住该记的" |
| **EvolveR** (2025) | 经验驱动的生命周期模型：感知→反思→记忆→规划→行动，形成闭环 |

**优点**：能力可积累、可迁移；不改变模型本身，安全可控
**缺点**：技能库管理复杂；需要好的检索机制；可能积累低质量技能

---

### 路径 4：工作流自进化

**核心思路**：Agent 的工作流（节点、连接、工具调用顺序）本身作为优化对象，自动调整结构。

| 项目 | 要点 |
|------|------|
| **EvoAgentX** (EMNLP'25 Demo) | 开源框架，自动进化 Agent 工作流：变异 → 评估 → 选择最优结构 |
| **TextGrad** | 不仅优化 prompt，也可优化整个 agent pipeline 的结构 |
| **Retroformer** (ICLR'24) | 回溯式 Agent，从失败轨迹中学习，用 policy gradient 优化 agent 策略 |

**优点**：优化粒度更大，能发现人想不到的工作流结构
**缺点**：搜索空间爆炸；评估成本高

---

### 路径 5：多 Agent 协同进化

**核心思路**：多个 Agent 组成系统，通过角色分工、辩论、对抗等方式共同进化。

| 项目 | 要点 |
|------|------|
| **SPIRAL** (2025) | 零和博弈自博弈，多 Agent 多轮 RL 激励推理能力 |
| **MAS-GPT** (ICML'25) | 训练 LLM 直接生成多 Agent 系统架构 |
| **SE-Agent** (NeurIPS'25) | 多步任务中的自进化轨迹优化框架 |

**优点**：能涌现出复杂的协作策略；适合复杂任务分解
**缺点**：系统复杂度高；通信开销大；难以稳定收敛

---

### 路径 6：端到端实战方案 — Hermes Agent Self-Evolution

> 来源：Nous Research, 2026 开源

这是目前最接近"工程落地"的自进化方案，值得单独关注：

**核心机制**：
- **DSPy + GEPA** 作为进化引擎
- 对 Agent 的 **Skill 文件（SKILL.md）、Tool 描述、System Prompt、Tool 代码** 分阶段自动优化
- 读取执行轨迹理解失败原因 → 生成候选变体 → 约束门控（测试通过、大小限制、语义保持）→ 最优变体提交 PR

**进化目标分 5 阶段**：
1. ✅ Skill 文件优化（已实现）
2. 🔲 Tool 描述优化
3. 🔲 System Prompt 优化
4. 🔲 Tool 实现代码进化（Darwinian Evolver）
5. 🔲 持续改进闭环

**工程保障**：
- 每个变体必须 100% 通过测试套件
- Skill ≤15KB，Tool 描述 ≤500 字符
- 所有变更走 PR 人工审核
- 无需 GPU，纯 API 调用，$2-10/次优化

---

## 四、关键论文与项目索引

### 综述论文
| 论文 | 来源 | 核心贡献 |
|------|------|---------|
| A Survey of Self-Evolving Agents | arXiv 2507.21046 | What/When/How/Where 四维分类法 |
| A Comprehensive Survey of Self-Evolving AI Agents | arXiv 2508.07407 | 反馈回路四组件框架 + 领域特化进化 |
| Awesome-Self-Evolving-Agents | GitHub EvoAgentX | 最全的论文/项目索引列表 |

### 代表性项目
| 项目 | 类型 | 链接 |
|------|------|------|
| Hermes Agent Self-Evolution | 工程框架 | github.com/NousResearch/hermes-agent-self-evolution |
| EvoAgentX | 工作流进化框架 | github.com/EvoAgentX/EvoAgentX |
| Voyager | 技能库终身学习 | github.com/MineDojo/Voyager |
| DSPy | Prompt/程序优化 | github.com/stanfordnlp/dspy |
| GEPA | 反思式 prompt 进化 | github.com/gepa-ai/gepa |
| TextGrad | 文本梯度优化 | github.com/zou-group/textgrad |
| SE-Agent | 多步自进化 | github.com/JARVIS-Xs/SE-Agent |

---

## 五、趋势与挑战

### 四大趋势
1. **从训练型到推理时优化**：无需 GPU 的 prompt/skill 进化方案（GEPA、DSPy）正在成为主流，门槛低、迭代快
2. **从单点到系统级**：从优化单一 prompt 到优化整个 Agent 工作流、技能库、工具链
3. **从离线到在线闭环**：Hermes 式的"执行→反思→进化→部署"持续闭环正在工程化
4. **安全约束成为标配**：测试门控、语义保持、人工审核等 guardrail 被越来越多的方案采纳

### 核心挑战
1. **Reward hacking / 模式坍缩**：自进化可能找到"捷径"而非真正能力提升
2. **灾难性遗忘**：训练型方案进化新能力时可能丢失旧能力
3. **评估困难**：如何衡量"真的变好了"而非"恰好通过了测试"
4. **安全对齐**：自进化 Agent 可能发展出非预期行为，需要持续监控
5. **搜索效率**：进化算法在巨大搜索空间中容易陷入局部最优

---

## 六、如果要做 Agent 自进化，怎么选

| 场景 | 推荐路径 | 推荐工具 |
|------|---------|---------|
| 快速提升 Agent 效果，无 GPU | Prompt 优化 | DSPy + GEPA |
| 需要积累领域技能，终身学习 | 技能库 + 记忆 | Voyager 模式 / SAGE |
| 有训练资源，追求能力突破 | RL 自博弈 | Absolute Zero / Self-Rewarding LM |
| 多步骤复杂任务 | 工作流自进化 | EvoAgentX / TextGrad |
| 工程落地，需要安全可控 | 端到端框架 | Hermes Agent Self-Evolution |
