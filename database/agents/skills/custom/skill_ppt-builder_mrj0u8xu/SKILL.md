---
name: ppt-builder
description: Build a .pptx presentation from mixed input materials (text, images, PDFs, docs, spreadsheets) and user instructions. Use when the user asks to create/make/generate a PPT/PPTX/slide deck, convert materials into slides, or assemble slides from provided files and requirements.
---

# PPT Builder（基于多格式资料生成PPT）

## 目标
根据用户指令与提供的资料（文本、图片、PDF、Word、Excel/CSV等），产出**符合要求**的`.pptx`演示文稿，并同时给出可审阅的“大纲/讲稿”和可复用的结构化`deck.json`。

## 你需要向用户确认的最小信息（缺省值可直接采用）
- **受众与场景**：缺省为“业务汇报/评审”
- **语言**：缺省跟随用户输入语言
- **时长/页数**：缺省 8–12 页
- **风格**：缺省“简洁、商务、深色标题+浅色正文”
- **版式比例**：缺省 16:9

若用户已给出上述信息，直接进入构建流程，不要反复追问。

## 工作流（按顺序执行）
### 1) 资料盘点与约束提炼
- 列出所有输入资料（文件名/类型/可用内容：文本段落、表格、图片、关键结论）。
- 从用户指令中提炼**硬约束**（必须包含/必须避免、品牌色/Logo、必须引用的数据源、截止页数、截止日期等）。
- 识别缺口并用**最少问题**补齐（最多 3 个问题）；否则采用缺省值继续。

### 2) 生成“可审阅大纲”
输出`output/deck-outline.md`，包含：
- 目录（每页标题）
- 每页 3–6 条要点（短句）
- 每页素材来源（来自哪个文件/哪张图/哪段文本）
- 图表/图片页的说明文字（用于讲述）

### 3) 结构化成 deck.json
生成`output/deck.json`（规范见`reference.md`），要求：
- 每页有唯一`id`
- 所有素材用相对路径引用
- 文字尽量短，避免把整段论文/长文塞进一页

### 4) 生成 PPTX（可执行路径）
优先用随附脚本生成：
- 将素材放到`assets/`（保持原文件名；如需重命名，在`deck.json`里同步）
- 运行：
  - `SKILL_DIR="$(cd ../../database/agents/skills/custom/skill_ppt-builder_mrj0u8xu && pwd)"; python "$SKILL_DIR/scripts/build_ppt.py" --spec output/deck.json --out output/deck.pptx`

如果环境无法执行Python或缺依赖，退而求其次：
- 仍然产出`deck-outline.md` + `deck.json`
- 同时给出“逐页粘贴到PPT软件”的排版指引（标题字号、正文行数、图片比例、页脚等）

### 5) 质量检查（必须做）
- **一致性**：术语/大小写/数字格式一致（如 2026-04-06 vs 2026/4/6 统一）
- **可读性**：每页不超过 6 行要点；每行尽量不超过 12–16 个汉字（或 8–12 个英文单词）
- **信息流**：从背景→问题→方案→数据/证据→结论→下一步
- **素材合法性**：图片不拉伸；裁切不过度；必要时标注来源

## 交付物（默认路径）
- `output/deck.pptx`：最终PPT
- `output/deck-outline.md`：可审阅大纲/讲稿
- `output/deck.json`：结构化规格（可复用/可改版）

## 版式建议（默认）
- 标题：32–40pt；正文：18–24pt；行距 1.1–1.2
- 每页留白：四边至少 5% 画布
- 图片页：优先“图片 + 一句结论 + 一句证据/注释”

## 快速示例（用户怎么说→你怎么做）
**用户输入**：给这些资料做一个10页路演PPT，受众是投资人，突出增长与壁垒。
**你输出**：
1) `output/deck-outline.md`（10页结构）
2) `output/deck.json`（把每页内容结构化）
3) 用脚本生成`output/deck.pptx`

## 附加资源
- 规格与字段说明见：[reference.md](reference.md)
