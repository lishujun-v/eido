---
name: paper-companion
description: AI 学术研究伴学 Skill — 输入论文 PDF/URL → 多层级精读摘要 + 知识图谱 → 自动生成分阶段学习路径 + 间隔重复提醒 + Anki 导出。Use when 用户需要快速理解一篇论文(精读/扫读)、把论文转化成结构化学习材料、为某领域制定学习计划、做知识卡片复习,或希望把论文知识沉淀进 Anki 做长期记忆。
license: MIT
metadata:
  author: yijian
  competition: 讯飞AI算法比赛 智慧生活助理Skill开发挑战赛
  skill_id: paper-companion
---

# paper-companion

一个端到端的"论文 → 学习材料"AI 助手。围绕一篇论文,完成精读、图谱、计划、复习、导出五段闭环。

## When to Use This Skill

Use when users:
- 拿到一篇 arxiv / 期刊 / 会议论文,需要快速抓住核心贡献、方法论、实验结论
- 想要把多篇论文串成某个研究主题的学习路径
- 在做长期学习规划,需要间隔重复算法 + 知识卡片导出(Anki)
- 研究生 / 博士生 / 工程师需要把"读论文"变成"复利型学习资产"
- 老师 / 培训师需要把论文转化成可分发的学习材料

**支持的输入/前置**:
- 输入:`.pdf` 本地文件 / arxiv URL(如 `https://arxiv.org/abs/2301.12345`)/ 普通网页 URL(博客/知乎)
- 前置:已配置讯飞星辰 MaaS API key(环境变量 `XINGCHEN_API_KEY` + `XINGCHEN_CHAT_ENDPOINT`)

**默认推荐**: 走 Approach 1(一键完整 Pipeline),从论文到 Anki 卡片全跑通。

## Approach 1: Complete Pipeline (Recommended)

```bash
SKILL_DIR="$(cd ../../database/agents/skills/custom/skill_paper-companion_mrj2doj4 && pwd)"; python3 "$SKILL_DIR/scripts/main.py" pipeline --pdf "$SKILL_DIR/examples/sample_paper.pdf" --goal "掌握 Transformer 注意力机制"
```

**When to use this approach**:
- 第一次接触一篇论文
- 想生成完整学习材料交付
- 批量处理多篇论文

**Requirements**: `pymupdf`, `requests`, `pyyaml`, `genanki`, `jsonschema`

**Parameters**:
- `--pdf <path>` - 本地 PDF 路径
- `--url <url>` - arxiv / 网页 URL(与 `--pdf` 互斥)
- `--goal <text>` - 学习目标(驱动 make_plan)
- `--out <dir>` - 输出目录(默认 `./paper_output`)
- `--no-anki` - 跳过 Anki 导出(纯文本 + JSON)

**Outputs**:
- `<out>/<paper_id>/summary.md` - 多层级摘要
- `<out>/<paper_id>/graph.json` - 知识图谱
- `<out>/<paper_id>/plan.md` - 学习路径
- `<out>/<paper_id>/review.json` - 复习排序
- `<out>/<paper_id>/cards.apkg` - Anki 卡片包
- `<out>/<paper_id>/run.log` - 完整运行日志(含 preflight 决策)

### Workflow Steps

主脚本执行的步骤:
1. **preflight 校验** — 按 `interface.yaml` + `action_preflight.schema.json` 检查每个 action 的输入风险
2. **read_paper** — PDF / URL 解析 → 多层级摘要(全文/章节/关键句)+ 关键贡献 + 方法论 + 实验
3. **build_graph** — 从摘要抽取实体关系(概念 / 方法 / 引文 / 作者)→ 图 JSON
4. **make_plan** — 学习目标 + 论文 → 周/天粒度学习路径 + 推荐资源
5. **schedule_review** — 间隔重复算法(SM-2)排序 → 复习清单
6. **export_anki** — 知识卡片 → `.apkg` 文件,可在 Anki Desktop / AnkiDroid 打开

## Approach 2: Modular Building Blocks

只跑其中一两个 action,定制场景用。

```python
from paper_reader import read_paper
from preflight import check_action
import json

decision = check_action("read_paper", {"pdf_path": "./examples/sample_paper.pdf"})
if decision["continuation_decision"]["decision"] == "proceed":
    result = read_paper(pdf_path="./examples/sample_paper.pdf")
    print(json.dumps(result, ensure_ascii=False, indent=2))
```

**When to use this approach**:
- 已有摘要,只想跑 `build_graph`
- 想跳过 Anki 导出
- 集成进更大的研究工作流

**Available utility functions**:

From `scripts/paper_reader.py`:
- `read_paper(pdf_path=None, url=None)` → `dict` 含 `summary` / `chapters` / `key_sentences` / `contributions` / `methodology` / `experiments` / `page_refs`

From `scripts/knowledge_graph.py`:
- `build_graph(summary: dict)` → `dict` 含 `nodes` / `edges` / `centrality`

From `scripts/learning_plan.py`:
- `make_plan(goal: str, papers: list[dict], weeks: int = 4)` → `dict` 含 `phases` / `daily_tasks` / `resources`

From `scripts/spaced_repetition.py`:
- `schedule_review(cards: list[dict], now=None)` → `list[dict]` 含 `card_id` / `next_review` / `interval` / `ease`

From `scripts/anki_exporter.py`:
- `export_anki(deck_name: str, cards: list[dict], out_path: str)` → `str`(apkg 路径)

From `scripts/preflight.py`:
- `check_action(action_name: str, inputs: dict, context_override: dict | None = None)` → `dict`(遵循 `action_preflight.schema.json`)

**Example workflows**:

**Example 1: 只生成摘要,不调 LLM**
```python
from pdf_parser import extract_text
text = extract_text("./examples/sample_paper.pdf", max_pages=3)
print(text[:500])
```

**Example 2: 把多篇论文合并成一个图谱**
```python
from knowledge_graph import build_graph, merge_graphs
g1 = build_graph(read_paper(pdf_path="paper1.pdf"))
g2 = build_graph(read_paper(pdf_path="paper2.pdf"))
merged = merge_graphs([g1, g2])
```

**Example 3: 跳过 preflight(已知输入安全)**
```bash
SKILL_DIR="$(cd ../../database/agents/skills/custom/skill_paper-companion_mrj2doj4 && pwd)"; python3 "$SKILL_DIR/scripts/main.py" read_paper --pdf "$SKILL_DIR/examples/sample_paper.pdf" --skip-preflight
```

## Best Practices

1. **PDF 优先于 URL** — 本地 PDF 解析比抓网页稳定得多;只有论文在线且没 PDF 时才用 URL
2. **学习目标具体化** — `make_plan` 的质量强依赖于 `--goal` 的具体程度;"掌握 Transformer" 比 "学深度学习" 输出更好
3. **复习节奏不要堆** — `schedule_review` 每天推荐 ≤20 张新卡片,过多反而疲劳
4. **Anki 导出后记得 sync** — `.apkg` 是文件格式,Anki 打开后还需要手动 sync 到 AnkiWeb 才能在手机端看到

## Reference Materials

For 鲁棒性测试矩阵 / 安全合规设计 / 评审材料模板, see `references/` (TBD during D8).

## Machine-readable interface

机器可读的 action 契约见 `interface.yaml`(5 个 action + 依赖声明),每个 action 声明 `inputs/outputs` + `reversibility` + `preflight.policy`。本 skill 所有有副作用 action(`make_plan` 写文件 / `export_anki` 写文件 / `schedule_review` 写状态)均标 `policy: required`。

## Next Steps

跑完后典型下游:
- **跟踪学习进度**:把 `<paper_id>/review.json` 喂给一个 scheduler skill,每天定时推送复习清单
- **多论文合成综述**:`merge_graphs` 已有,再叠一个 `synthesize_review.py` 即可产出多论文综述(后续扩展)
- **学术情报订阅**:结合 `agent-reach` skill 订阅 arxiv RSS,新论文自动跑 pipeline
