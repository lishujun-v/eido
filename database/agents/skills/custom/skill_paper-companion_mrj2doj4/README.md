# paper-companion

> 讯飞 AI 算法比赛 · 智慧生活助理 Skill 开发挑战赛参赛作品
> AI 学术研究伴学 Skill — 把"读论文"变成"复利型学习资产"

[![Tests](https://img.shields.io/badge/tests-81%20passed-brightgreen)](tests/)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue)](.)
[![License](https://img.shields.io/badge/license-MIT-green)](.)

---

## ✨ 它能做什么

把一篇论文 PDF 喂进去,5 分钟后你得到:

```
paper_output/<paper_id>/
├── summary.md      ← 多层级摘要(全文/章节/关键句/方法论/实验/贡献)
├── graph.json      ← 知识图谱(概念/方法/引文/作者 + 关系)
├── plan.json       ← 分阶段学习路径(周/天粒度 + 推荐资源)
├── review.json     ← 间隔重复排序(SM-2 算法 + 复习统计)
├── cards.apkg      ← Anki 卡片包(可在 Anki Desktop / AnkiDroid 打开)
└── run.log         ← 完整运行日志(每步 preflight 决策 + warning)
```

**5 个 action 协同**:

1. **read_paper** — PDF 解析 + 多层级摘要(全文 / 章节 / 关键句 / 贡献 / 方法论 / 实验)
2. **build_graph** — 实体关系抽取(概念 / 方法 / 作者 / 引文)+ 中心度计算
3. **make_plan** — 学习目标分解 → 周/天粒度路径 + 资源推荐
4. **schedule_review** — SM-2 间隔重复算法 → 复习排序 + 掌握度统计
5. **export_anki** — 知识卡片 → `.apkg` Anki 卡片包

---

## 🎯 适用场景

- 📚 **学生/研究生**:导师让读的论文 → 5 分钟得到完整学习材料
- 🔬 **研究员**:跨论文综述 → 自动合并知识图谱
- 💼 **工程师**:周末想深挖一个方向 → 自动生成分阶段学习路径
- 🎓 **老师/培训师**:把论文拆成可分发的学习卡片

---

## 🚀 快速开始

### 1. 安装

```bash
cd paper-companion
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 配置(可选 — 无 key 也跑得通)

```bash
export XINGCHEN_API_KEY="your-api-key"
export XINGCHEN_CHAT_ENDPOINT="https://your-endpoint/v1/chat/completions"
```

无 key 时自动回退到 **MockLLMClient**(基于规则抽取,演示和评审现场断网也能跑)。

### 3. 跑一遍

```bash
# 一键跑通完整 pipeline
python3 scripts/main.py pipeline \
    --pdf examples/sample_paper.pdf \
    --goal "掌握 Transformer 注意力机制" \
    --weeks 4 \
    --out ./paper_output

# 只跑某一个 action
python3 scripts/main.py read_paper --pdf examples/sample_paper.pdf
python3 scripts/main.py export_anki --deck-name "我的牌组" --cards cards.json --out cards.apkg

# 健康检查
python3 scripts/main.py health
```

### 4. 跑测试

```bash
pytest tests/ -v
# 81 passed
```

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      paper-companion Skill                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  CLI (main.py)                                                │
│    ├── pipeline        (一键跑通 5 个 action)                │
│    ├── read_paper      (解析 PDF + 多层级摘要)               │
│    ├── build_graph     (实体关系抽取)                         │
│    ├── make_plan       (学习路径生成)                         │
│    ├── schedule_review (SM-2 间隔重复)                        │
│    ├── export_anki     (Anki .apkg 导出)                     │
│    └── health          (骨架自检)                             │
│                                                               │
│  Action 层 (5 个 action,每个走 preflight 校验)                │
│    ├── read_paper     → policy=off   (只读)                  │
│    ├── build_graph    → policy=off   (只读)                  │
│    ├── make_plan      → policy=required (写 plan.json)        │
│    ├── schedule_review → policy=required (写 review.json)    │
│    └── export_anki    → policy=required (写 .apkg 文件)      │
│                                                               │
│  基础设施层                                                    │
│    ├── llm_client.py  (XingchenClient + MockLLMClient + 工厂) │
│    ├── preflight.py   (action 级准入校验)                    │
│    ├── pdf_parser.py  (PyMuPDF 文本提取)                     │
│    ├── sanitize.py    (URL/PII/路径脱敏)                     │
│    ├── state_store.py (JSON 持久化)                          │
│    └── xingchen_client.py (复用)                              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ 接口契约(interface.yaml 摘要)

5 个 action,每个声明 `inputs/outputs/reversibility/preflight.policy`:

| action | reversibility | preflight.policy | IO |
|---|---|---|---|
| read_paper | high | off | pdf_path/url/max_pages → summary/chapters/key_sentences/... |
| build_graph | high | off | summary → nodes/edges/centrality |
| make_plan | low | required | goal/papers/weeks/hours_per_day → phases/daily_tasks/resources |
| schedule_review | low | required | cards/now → review_queue/stats |
| export_anki | low | required | deck_name/cards/out_path → apkg_path/card_count |

完整 schema 见 [interface.yaml](./interface.yaml),校验用 [skill_interface.schema.json](../Agent/schemas/skill_interface.schema.json)。

---

## 🧪 测试覆盖

```
tests/
├── test_main.py                (8 tests)  CLI + preflight + skeleton
├── test_paper_reader.py        (14 tests) MockLLM + JSON 解析 + 启发式 fallback
├── test_knowledge_graph.py     (6 tests)  实体抽取 + centrality + merge
├── test_learning_plan.py       (5 tests)  LLM plan + 启发式 fallback
├── test_spaced_repetition.py   (11 tests) SM-2 算法正确性(含数学验证)
├── test_anki_exporter.py       (7 tests)  genanki + zipfile 兼容
└── test_robustness.py          (27 tests) 异常输入矩阵 + 脱敏 + 错误分类

Total: 81 passed
```

---

## 🔒 安全合规

- ✅ URL 中的 `api_key` / `token` / `sig` 参数自动脱敏
- ✅ 邮箱 / 手机号 / 身份证号 PII 自动脱敏
- ✅ 用户家目录路径在日志中替换为 `~`
- ✅ 错误信息长度截断(默认 500 字符)
- ✅ 不抓取付费论文 / 加密 PDF(明确告知用户)
- ✅ LLM 失败不崩溃,降级到启发式 fallback
- ✅ 输入大小限制(默认 16K,防止 OOM)

---

## 📝 License

MIT