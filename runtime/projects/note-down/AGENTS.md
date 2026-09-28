# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

# Editor UX Decisions

- Code blocks are edited in place: while a code block is focused (`.vditor-ir__node--expand`), its duplicate rendered preview (`.vditor-ir__preview`) is hidden so the user types directly in the block; the rendered preview returns when focus leaves.
- Vditor 工具栏按钮的 hover 提示显示在按钮下方（用 `.vditor-host .vditor-toolbar__item .vditor-tooltipped__n/__ne/__nw::after/before` 覆盖 vditor 默认的上方位置）。覆盖时须设 `left:auto`，否则按钮自带的 `left:50%` 会同 `right:50%` 同时生效，把提示宽度压成 0 导致内容不可见。若提示显示在按钮上方，会超出编辑器内容区顶部，被 `.content` 的 `overflow:hidden` 裁掉并藏到应用顶栏（`.toolbar`，z-index 5）后面，因此仅调 z-index 无法解决。
- ` ```md ` and ` ```markdown ` fences render their inner content as Markdown (via `customRenders`), giving users a "rich text block" inside fences; all other fence languages keep standard literal code rendering.
- Themes are local to note-down (not inherited from Eido): top-navigation choices are 专注灰、晨雾绿、海盐蓝、暖纸黄、樱花粉. They only tint the chrome/background, while the writing canvas remains white. Regular fenced code is always a dark monospace panel; `md`/`markdown` fences (and unlabeled fences that clearly contain Markdown) become labelled rich-text cards.
- Rich-text fence cards prioritize legibility: use a white card with explicit dark body text, near-black emphasis/headings, underlined theme-color links, and a lightly tinted but still dark-text quotation panel. Do not inherit the low-contrast muted color used elsewhere for metadata.
- Only the rendered preview of literal fenced blocks receives the dark palette; do not couple this to note-down's navigation themes or buttons. `text/plain` uses charcoal, terminal languages use near-black navy, JSON/YAML-style data uses deep blue, web languages use deep plum, Python/Ruby/Go/Rust use deep green, and other code uses deep indigo. `md`/`markdown` remains a rich-text card.
- Vditor's duplicated rendered text layer is the nested `code.hljs`, which ships with its own white background image. Literal fenced-block styling must explicitly clear both `background` and `background-image` on that inner layer so the dark preview container is actually visible.
- Note-down uses a single editor toolbar: view mode, theme, open, and export actions live at the right end of Vditor's formatting toolbar. Do not reintroduce a separate application toolbar above it.
- The notebook sidebar collapses to a narrow 54px rail that keeps only the re-open control visible. The search row contains only search; do not add a non-functional filter affordance.
- Note Down is surfaced in Eido as the dedicated left-navigation feature “知识空间”. It opens directly from that entry and is excluded from the generic “工作平台” project gallery; keep the `note-down` project id and storage keys unchanged so existing notes remain available.
