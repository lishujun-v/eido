---
name: html-animation
description: "Generate HTML animations from text stories. Use when asked to create animations, product demos, data stories, or visual narratives from text — produces a self-contained HTML file playable in any browser with TTS voiceover."
---

# HTML Animation

Turn a text story into a browser-playable HTML animation with scene transitions, TTS voiceover, and subtitles.

## Trigger

User says "做动画", "生成动画", "把这段文字做成动画", "做一个XX的演示动画", or similar requests to create animated visual narratives from text.

## ⚠️ Execution requirement

This workflow produces **concrete files on disk**. Every step that creates or modifies a file requires a tool call — do not output file contents as text. After the analysis in Steps 1-2, Steps 3-6 each produce real files the user will open in a browser. If any step is skipped, the final output will be broken.

## Locating resources

This skill ships with its own player template and assembly script. Before starting, resolve the directory containing this SKILL.md — refer to it as `SKILL_DIR` in all commands below. The layout:

```
SKILL_DIR/
├── player/template.html   ← the bundled player
├── player/player.css       ← inlined in template
├── player/player.js        ← inlined in template
└── scripts/assemble.py     ← deterministic assembly
```

## Defaults

Apply silently unless the user overrides:

| Item | Default |
|------|---------|
| Style | Modern minimalist, dark background |
| Aspect ratio | 16:9 |
| Duration | Auto-determined from story length |
| Language | Follow user's input language |
| Output directory | `html-animation/` in the current working directory |

## Workflow

### Step 1 — Analyze: parse the story into scenes

Read the user's input and split the narrative into a sequence of scenes. For each scene, determine:

- 1 core message point
- 2-4 sentences of narration
- 3-15 seconds suggested duration
- A visual description

### Step 2 — Analyze: choose animation techniques

Match each scene to the best technique:

| Content type | Technique |
|---|---|
| Fireworks, stars, rain/snow, magic | Particle effects (Canvas) |
| Element entrance, emphasis, bounce | CSS animation |
| Waveforms, data visualization, drawing | Canvas |
| Icon motion, path strokes, logos | SVG |
| Product rotation, spatial display | 3D / CSS 3D transforms |
| Title screens, typewriter, big text | Text animation (CSS) |
| Gravity, collision, elasticity | Physics simulation (Canvas) |

### Step 3 — Write: create scene fragment files

Create each scene as a separate HTML file under `<output_dir>/scenes/`. Each fragment is injected into the player's scene container — use absolute positioning and the full container area. The player handles timeline, transitions, audio, subtitles, and controls.

Scope every scene to itself using `data-scene="<scene-id>"` as the root selector. Create one file per scene — do not combine them into a single file.

### Step 4 — Generate: create TTS audio

For each scene's narration text, generate audio to `<output_dir>/audio/scene-<index>.wav`. If a TTS tool is available, use it with voice `zf_xiaobei` for Chinese and speed 1.0. If no TTS tool is available, skip audio — the animation will play silently with subtitles.

### Step 5 — Write: create the scenes manifest

Create `<output_dir>/scenes.json` as a JSON array. Each entry:

```json
[
  {
    "id": "intro",
    "narration": "Welcome to the product demo...",
    "audio": "audio/scene-0.wav",
    "duration": 8000,
    "transition": "fade",
    "content_file": "scenes/intro.html"
  }
]
```

| Field | Notes |
|---|---|
| `id` | Unique scene identifier |
| `narration` | Subtitle text, displayed while the scene plays |
| `audio` | Path relative to `scenes.json`; skip the field if no audio |
| `duration` | Milliseconds; use actual TTS audio duration when available |
| `transition` | `fade` / `slide` / `zoom` / `none` |
| `content_file` | Path to the scene fragment, relative to `scenes.json` |

### Step 6 — Execute: assemble and verify

Run the assembly script to bundle everything into the player template:

```bash
python "$SKILL_DIR/scripts/assemble.py" \
  --template "$SKILL_DIR/player/template.html" \
  --scenes <output_dir>/scenes.json \
  --output <output_dir>/index.html \
  --verify
```

The `--verify` flag checks that every fragment and audio file exists. If the command fails, fix the reported issue and re-run — do not manually patch the output.

### Step 7 — Confirm

Report the output path to the user. The animation opens in any browser:

- `index.html` — always the entry point
- `audio/` — present only when TTS audio was generated
- `scenes/` — source fragments (not needed at runtime)

## Transition types

| Transition | Best for |
|---|---|
| `fade` | General purpose, calm transitions |
| `slide` | Process flow, sequential progression |
| `zoom` | Emphasis, focus shifts |
| `none` | Abrupt cuts, dynamic pacing |

## Player features (built-in)

- Play/pause, previous/next scene, progress bar with drag-to-seek
- Speed control: 0.5x / 1x / 1.5x / 2x
- Fullscreen toggle
- Keyboard shortcuts: Space = play/pause, ← → = previous/next scene
- Auto-advancing subtitles synced to audio
- Responsive scaling to window size