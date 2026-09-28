# Evolution OS 设计方案

```
> **Evolution OS = Agent OS 的持续进化控制层。**
>
> Agent OS 负责稳定执行；Evolution OS 负责在可验证、可回滚、可治理的前提下持续改进能力。

版本：v1.0  
整理日期：2026-08-11  
来源：2026 年 Agent 自进化技术调研及 Evolution OS 方案讨论


```

## 1. 核心定位

```
Evolution Control Plane
  └─ policy / approval / version / experiment / audit / rollback
          ↓
Evolution OS
  └─ Observe → Trigger → Diagnose → Propose → Verify → Promote → Monitor
          ↓
Agent OS
  └─ supervisor / skill runtime / memory / tool policy / LLM gateway / sandbox
```

最重要的边界是：

```text
Agent OS      = Execution Plane
Evolution OS  = Improvement Plane
```

生产任务可以产生证据，但不能在同一会话中直接改写正式 Skill、Prompt 或运行时代码。

## 2. 统一进化闭环

1. **Observe**：采集轨迹、奖励、失败、用户反馈、成本和环境信息。
2. **Trigger**：判断是否值得进化、进化什么、优先级多高。
3. **Diagnose**：做失败归因、经验挖掘与能力边界分析。
4. **Propose**：生成 Memory、Prompt、Skill、Workflow 或 Harness 的候选变更。
5. **Verify**：执行 replay、测试生成、反事实、回归和安全验证。
6. **Promote**：按 Exploration → Canary → Production 逐步晋升。
7. **Monitor**：监控长期收益、回归、污染与分布漂移，并回流下一轮观察。

## 3. Evolution Object：统一资产模型

任何可进化资产都通过统一对象模型登记：

```yaml
object_id: skill_excel_analysis
object_type: skill
current_version: v12
owner: data_agent
scope:
  domain: excel
  capabilities: [file.read, python.execute]
metrics:
  success_rate: 0.91
  avg_reward: 0.87
  token_cost: 4280
  latency_ms: 6100
policy:
  mode: auto
  risk_level: L2
lineage:
  parent_version: v11
  evolved_from: [trace_123, trace_782, incident_028]
status: production
```

统一接口：`evolve(object, evidence, policy)`。

## 4. 分级 Evolution Authority


| 等级 | 进化对象                            | 风险 | 默认策略                       |
| ---- | ----------------------------------- | ---- | ------------------------------ |
| E0   | Memory / 事实修正                   | 极低 | 自动；来源、去重、冲突检查     |
| E1   | Heuristic / Prompt                  | 低   | 自动验证 + replay              |
| E2   | Skill（说明、脚本、资源）           | 中   | Sandbox + Admission Gate       |
| E3   | Workflow（工具顺序、Agent 编排）    | 中高 | Replay + 对照实验 + Canary     |
| E4   | Harness（路由、重试、状态机、代码） | 高   | 隔离沙箱 + 完整回归 + 人工批准 |
| E5   | Model（Adapter / LoRA / Policy）    | 极高 | 仅离线训练和独立评估           |

规则：风险越高，验证、审批、版本留存与回滚要求越严格；自动化程度越低。

## 5. Evolution OS Kernel


| 模块                | 职责                                             |
| ------------------- | ------------------------------------------------ |
| Evolution Manager   | 生命周期状态机、任务调度、配额和重试             |
| Policy Engine       | 范围、风险、审批、冻结和预算控制                 |
| Evidence Engine     | 轨迹归一化、聚类、归因、经验与边界挖掘           |
| Evolution Engine    | 对各类资产生成候选变更，包含 Meta Evolution      |
| Verification Engine | replay、testgen、judge、反事实、回归与安全验证   |
| Promotion Manager   | Exploration、Canary、Production 的流量和状态管理 |
| Registry / Lineage  | 版本、依赖、证据、实验和回滚点的可追溯登记       |

## 6. Evidence Engine：不能“一失败就进化”

禁止如下链路：

```text
Task Failed → LLM Reflection → 直接修改 Skill
```

应改为：

```text
Raw Trace → Normalize → Cluster → Failure Attribution → Evidence
```

Evidence Engine 需要记录：用户目标、LLM 输出、工具调用、重试、错误、用户反馈、奖励、成本、时延、环境版本。

候选进化只能消费结构化 Evidence，而不是原始轨迹。示例：

```yaml
evidence_id: ev_01922
type: repeated_failure
target:
  object_type: skill
  object_id: web_search
symptom: search_timeout
root_cause:
  type: procedure_error
  confidence: 0.91
statistics:
  occurrence: 18
  total_runs: 41
  failure_rate: 0.439
positive_examples: [trace_21, trace_32]
negative_examples: [trace_88, trace_91, trace_97]
```

## 7. Trigger：多维优先级，而不是单一失败阈值

```text
E = w1·FailureSeverity
  + w2·FailureFrequency
  + w3·RetryRate
  + w4·UserNegativeFeedback
  + w5·RewardDrop
  + w6·CostRegression
  + w7·Novelty

EvolutionPriority = E × Confidence × Impact ÷ Risk
```


| 区间     | 动作                            |
| -------- | ------------------------------- |
| `< T1`   | 仅观察                          |
| `T1–T2` | 收集更多证据                    |
| `T2–T3` | 生成并离线验证 Candidate        |
| `≥ T3`  | 进入紧急队列，但仍遵守安全 Gate |

## 8. 双池机制：Exploration 与 Exploitation 分离

```text
Candidate → Exploration Pool → Verify → Exploitation Pool → Skill Bank
```


| 池                | 内容与用途                                                     | 关键限制                         |
| ----------------- | -------------------------------------------------------------- | -------------------------------- |
| Exploration Pool  | 候选经验、候选 Skill、待验证假设；仅在隔离实验和低风险沙箱使用 | 不得成为默认生产指令或跨租户传播 |
| Exploitation Pool | 已验证有效的正式能力；可用于生产检索和默认路由                 | 发现回归或污染时立即降级/撤回    |

这条边界解决的核心问题是：未经验证的经验不能直接污染正式能力库。

## 9. Verification 与 Admission Gate

生成器与验证器必须信息隔离：验证器自动构造测试和断言，输出结构化失败反馈；生成器基于反馈迭代候选。


| 验证层           | 主要问题                       | 典型检查                                                 |
| ---------------- | ------------------------------ | -------------------------------------------------------- |
| Structural       | 工件是否可加载？               | schema、依赖、权限、静态检查                             |
| Behavioral       | 是否完成目标行为？             | sandbox、replay、testgen、assertion                      |
| Semantic         | 是否保持意图且无副作用？       | 对照任务、边界场景、政策检查                             |
| Security         | 是否固化不可信指令或扩大权限？ | 注入、泄露、越权、危险调用                               |
| Marginal Utility | 有候选是否真的更好？           | matched rollout；比较`Reward(with)` 与 `Reward(without)` |

核心准入条件：

```text
ΔUtility = Reward(with candidate) − Reward(without candidate) > 0
```

“LLM 觉得有用”不是准入依据。

## 10. 发布、回滚和持续评估

```text
Candidate → Exploration → Canary → Production → Monitor
                                  ↘ rollback / retire
```

- **Candidate**：完成基本结构与安全预检。
- **Exploration**：仅在沙箱和隔离任务内使用。
- **Canary**：低比例真实流量验证，持续比较基线。
- **Production**：通过稳定窗口与策略审批。
- **Retired**：被替换、不适用或存在安全问题；保留谱系但不再默认调用。

评估必须采用连续任务流，而不是只看单一任务的局部提升。长期监控：能力收益、回归、任务漂移、污染传播、成本/时延、负反馈、安全事件和回滚率。

## 11. Meta Evolution 与 Harness Evolution

### 两个时间尺度

```text
快循环：Experience → Memory / Prompt / Skill
慢循环：Evolution History → Meta-Skill / Evolution Policy
```

慢循环学习的是“在什么条件下，以何种验证和演化策略最有效”；政策本身也必须版本化并离线评估。

### Harness Evolution

Harness 覆盖路由、Hook 顺序、状态机、重试、错误处理和工具编排。它属于高风险进化：只能在临时沙箱中打补丁，通过完整回归后做 Canary，并且保持快速回滚。

### Federated Evolution

跨 Agent 或租户不共享原始用户数据；仅共享经过 scope-typed、evidence-guided 处理的 Patch。中央系统负责合并、冲突解决、隐私过滤与回归测试。

## 12. MVP 路线图


| 阶段                | 范围  | 关键交付物                                          | 验收重点                       |
| ------------------- | ----- | --------------------------------------------------- | ------------------------------ |
| Phase 1：可观测性   | E0/E1 | Trace Schema、Evidence Engine、Registry、基础控制台 | 可复现、可归因、可追溯         |
| Phase 2：Skill 进化 | E2    | Candidate Sandbox、Verifier、Admission Gate、双池   | 正边际效用、无高危安全回归     |
| Phase 3：受控发布   | E2/E3 | Replay、Canary、Promotion Manager、Rollback Runbook | 连续任务流中稳定提升           |
| Phase 4：平台化     | E3/E4 | Meta Evolution、Harness Sandbox、审批策略、联邦聚合 | 治理成熟、成本可控、可跨域复用 |

第一批建议从 Excel 分析、文档处理、代码修复或检索工作流开始：它们的 replay、testcase 和成功指标更明确。

## 13. 核心风险与防线


| 风险       | 防线                                                  |
| ---------- | ----------------------------------------------------- |
| 能力污染   | Pre-Commit Gate、谱系追踪、双池、依赖影响分析         |
| 轨迹投毒   | Evidence Sanitization、跨轨迹佐证、对抗测试、最小权限 |
| 局部最优   | matched rollout、回归集、流式评估、Canary             |
| 不可逆变更 | 分级授权、隔离沙箱、版本冻结、快速回滚                |
| 指标投机   | 多目标指标、人工抽检、负反馈与安全硬约束              |

## 14. 首版技术接口

```text
record_trace(trace)
build_evidence(trace_ids, policy)
propose_evolution(object_id, evidence_id)
verify(candidate_id, suite)
promote(candidate_id, stage)
rollback(object_id, version)
freeze(scope)
```

首版优先保证：每次进化可审计、可解释、可回放、可中止、可回滚。

## 15. 结论

Evolution OS 的目标不是让 Agent 更频繁地修改自己，而是让 Agent 的能力资产以可证明价值、可控制风险、可回溯因果的方式持续演进。

最值得优先落地的组合：

```text
Experience → Skill 抽象
  + Generator / Verifier 共进化
  + Pre-Commit Admission Gate
  + Exploration / Exploitation 双池
  + 分层 Evolution Authority
```

```

```
