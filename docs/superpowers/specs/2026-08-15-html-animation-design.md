# HTML Animation Skill Design

## 概述

创建一个 skill，将文字故事/叙述转化为可在浏览器中播放的 HTML 动画。由于没有视频生成模型，使用 HTML/CSS/JS 模拟动画视频的播放体验。

## 需求决策

| 维度 | 决策 |
|------|------|
| 输入 | 文字故事/叙述 |
| 动画类型 | 全部（粒子、CSS、Canvas、SVG、3D、文字、物理） |
| 故事类型 | 产品演示、数据叙事、通用 |
| 场景结构 | Agent 自动判断（多场景/单场景） |
| 音频旁白 | 集成 kokoro-text-to-speech |
| 输出格式 | Agent 自动判断（单文件/目录） |

## 架构方案：Agent 生成 + 播放器引擎混合

- **播放器引擎**（player/）：统一的时间线管理、场景切换、TTS 同步、字幕、播放控制
- **Agent 生成**：每个场景内部的动画内容由 Agent 自由发挥，不受引擎限制

## Skill 目录结构

```
database/agents/skills/html-animation/
├── SKILL.md              # Agent 执行指令
└── player/
    ├── template.html      # 播放器 HTML 骨架
    ├── player.css         # 播放器样式
    └── player.js          # 播放器引擎
```

## 工作流（5 步）

1. **解析故事** → 拆分为场景序列，每场景包含：旁白文本、视觉描述、建议动画类型、预估时长
2. **生成场景内容** → 每个场景生成独立的 HTML 片段（Canvas/CSS/SVG 动画）
3. **生成 TTS 音频** → 调用 kokoro-text-to-speech，每场景生成 WAV 旁白
4. **组装** → 场景片段 + 音频 + 字幕注入播放器模板，生成完整 HTML
5. **输出** → 保存到 runtime/workspace/html-animation/ 或用户指定路径

## 场景数据格式

Agent 和 Player 之间的约定接口：

```js
const scenes = [
  {
    id: "intro",
    narration: "欢迎来到产品演示...",
    audio: "audio/scene-0.wav",
    duration: 8000,        // 毫秒
    transition: "fade",    // fade | slide | zoom | none
    content: "<div>...场景动画 HTML...</div>"
  },
  // ...
];
```

## 播放器引擎

### player.js — 核心逻辑
- 时间线管理：按 scenes 数组顺序播放，自动计算总时长
- 场景切换：场景结束前触发转场动画（fade/slide/zoom）
- 音频同步：每个场景开始时播放对应 WAV
- 字幕同步：根据音频播放进度显示字幕
- 播放控制：播放/暂停、上一场景/下一场景、进度条拖拽
- 倍速播放：0.5x / 1x / 1.5x / 2x
- 全屏：Fullscreen API
- 键盘快捷键：空格=暂停，左右箭头=跳转场景

### player.css — 样式
- 播放器容器：16:9 黑色背景
- 控制栏：半透明深色底栏
- 字幕样式：底部居中，黑底白字
- 转场动画：fade/slide/zoom 的 CSS 实现
- 加载状态：初始 loading 动画
- 响应式：自适应窗口大小

### template.html — 骨架
- 引入 player.css + player.js
- 提供播放器 DOM 结构
- 预留 scenes 数据注入点
- 所有场景内容内联在 HTML 中

## SKILL.md 指令要点

1. **触发条件**：用户说"做动画"、"生成动画"、"把这段文字做成动画"等
2. **缺省值**：风格=现代简约深色背景、画幅=16:9、语言跟随输入
3. **场景拆分**：按叙事节奏拆分，每场景 1 个核心信息点，旁白 2-4 句，时长 3-15 秒
4. **动画选型**：根据场景内容选择最合适的动画技术
5. **组装输出**：读取 player/template.html，注入 scenes 数据，默认输出到 runtime/workspace/html-animation/
6. **TTS 集成**：调用 kokoro-text-to-speech，使用 zf_xiaobei 语音

## 实现范围

### 需要创建的文件
1. `database/agents/skills/html-animation/SKILL.md`
2. `database/agents/skills/html-animation/player/template.html`
3. `database/agents/skills/html-animation/player/player.css`
4. `database/agents/skills/html-animation/player/player.js`

### 不包含
- 不依赖外部 CDN 框架（保持零依赖）
- 不需要额外的 Python 脚本
- 不需要修改现有 skill 或配置
