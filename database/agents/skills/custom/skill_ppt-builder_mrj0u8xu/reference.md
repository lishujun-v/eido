# deck.json 规格（ppt-builder）

本规格用于把“内容意图”与“素材引用”结构化，便于自动生成`.pptx`，也便于人类快速审阅与改版。

## 顶层结构

```json
{
  "meta": {
    "title": "演示标题",
    "subtitle": "可选副标题",
    "author": "可选",
    "language": "zh-CN",
    "aspectRatio": "16:9",
    "theme": {
      "accentColor": "#2F6FED",
      "fontFamily": "Calibri"
    }
  },
  "assetsRoot": "assets",
  "slides": []
}
```

## Slide 通用字段

每个 slide：

```json
{
  "id": "s01",
  "layout": "title|bullets|picture|two-column|quote|section",
  "title": "本页标题",
  "notes": "演讲者备注（可选）",
  "source": [
    {"type": "file", "path": "assets/report.pdf", "hint": "第2页图1"},
    {"type": "text", "hint": "用户输入/会议纪要"}
  ]
}
```

## 各 layout 字段

### 1) `title`

```json
{
  "id": "s01",
  "layout": "title",
  "title": "主标题",
  "subtitle": "副标题（可选）"
}
```

### 2) `bullets`

```json
{
  "id": "s02",
  "layout": "bullets",
  "title": "标题",
  "bullets": ["要点1", "要点2", "要点3"],
  "footnote": "可选页脚/数据口径"
}
```

### 3) `picture`

```json
{
  "id": "s03",
  "layout": "picture",
  "title": "标题",
  "image": {
    "path": "assets/figure-1.png",
    "fit": "contain|cover",
    "caption": "图注（可选）"
  },
  "bullets": ["一句结论", "一句证据（可选）"]
}
```

### 4) `two-column`

```json
{
  "id": "s04",
  "layout": "two-column",
  "title": "标题",
  "left": {
    "heading": "左侧小标题（可选）",
    "bullets": ["点1", "点2"]
  },
  "right": {
    "heading": "右侧小标题（可选）",
    "bullets": ["点A", "点B"]
  }
}
```

### 5) `section`（分节页）

```json
{
  "id": "s05",
  "layout": "section",
  "title": "第二部分：市场与增长",
  "subtitle": "可选"
}
```

### 6) `quote`（一句话强调）

```json
{
  "id": "s06",
  "layout": "quote",
  "title": "关键结论",
  "quote": "我们在过去12个月实现了xx增长，并具备可复制的获客飞轮。",
  "attribution": "可选：来源/人物"
}
```

## 约束建议（用于自动排版的经验值）
- `bullets`：建议 3–6 条；超过 6 条应拆页或改为两栏
- `picture.bullets`：建议 1–2 条，用于“结论 + 证据”
- 图片优先 PNG/JPG；如给的是PDF截图，建议先转为图片并放入`assets/`

