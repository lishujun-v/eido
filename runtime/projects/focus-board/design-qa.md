# Design QA

## Evidence

- Source visual truth: `design-source.jpg`
- Implementation screenshot: `design-preview.jpg`
- Production implementation screenshot: `implementation-preview.jpg` (1100 × 800 desktop viewport)
- Combined comparison: `design-comparison.jpg`
- Viewport: 1280 × 720 CSS px for source; 771 px wide in-app project viewport for implementation
- Source pixels: 1280 × 720
- Implementation pixels: 771 × 901
- Density: 1×; no density normalization required
- State: 2026-07-25 今日主视图，默认任务数据

## Full-view comparison

The implementation intentionally extends the sparse source screen rather than cloning its empty runtime state. It preserves the source's main visual truth: light gray-purple canvas, `#6558d9` accent, dark navy typography, white surfaces, subtle gray borders, rounded cards, low elevation, and a centered desktop content frame.

The added date navigation, summary strip, inheritance notice, and compact six-column task table create a stronger daily-work hierarchy without changing the product's visual identity. The table is the dominant content region and keeps all task dimensions aligned for rapid scanning.

## Focused-region comparison

No additional crop was needed. At 1280 px, the combined comparison keeps the header typography, accent treatment, surface borders, radii, column structure, task metadata, and progress notes readable enough to judge.

## Required fidelity surfaces

- **Fonts and typography:** Preserves Inter with PingFang SC fallback, bold compact heading, small uppercase eyebrow, and muted supporting text. Added UI labels use the same optical hierarchy and do not introduce a conflicting display face.
- **Spacing and layout rhythm:** Keeps the original centered composition, generous top spacing, 18 px main-surface radius, and compact table-row rhythm. The table remains fully visible at the actual 771 px project viewport and only folds into cards below 650 px.
- **Colors and visual tokens:** Source background, accent, text, border, and green completion colors are preserved. Red and orange priority colors are soft semantic additions and always include text labels.
- **Image quality and asset fidelity:** Neither source nor implementation uses raster imagery, logos, illustrations, or decorative image assets. No source asset is missing or replaced.
- **Copy and content:** Copy is rewritten around the requested daily workflow. Labels clearly distinguish today, historical snapshots, and future inheritance.

## Findings

No actionable P0, P1, or P2 visual mismatch remains. The increased information density and page height are necessary consequences of the requested task metadata and daily progress, not unintentional drift.

## Primary interactions tested

- Previous/next date navigation updates the date and view status.
- Tomorrow shows inherited unfinished tasks.
- New-task modal opens and exposes all required fields.
- A new task can be saved and appears in the selected column.
- Completion controls render and update summary counts.
- Status filtering reduces the table to the matching task rows and restores all rows correctly.
- Refresh restores the saved task from project/local storage.
- A completed task is excluded from the next day's inherited view.
- Daily progress is reset on inheritance and remains attached to its original date.
- Task deletion removes the task and persists after the confirmation step.
- The delete action is persistently visible inside editable task cells, requires confirmation, and is absent from historical read-only dates.
- All six cells support inline editing; text fields, multiline progress, priority, and status were each exercised.
- Requirement appears before task, followed by priority, owner, daily progress, and status.
- Individual column controls hide and restore selected columns without adding an extra operations column.
- Empty state, desktop six-column table, and narrow responsive layout were checked after the simplification pass.
- IME composition events are guarded so Enter does not commit while text composition is active.
- The six-option column menu remains fully visible with a single task row and closes after an outside click or Escape.
- Page-owned scripts produced no errors during the primary flow.

## Comparison history

- First comparison: no P0/P1/P2 issues found; no visual correction loop required.
- Production pass: direct project entry, empty state, storage persistence, inheritance, completion, and deletion were verified in the in-app browser. No P0/P1/P2 issue found.
- Simplified-table pass: removed all non-table overview surfaces; verified six inline editors, column visibility controls, direct row creation, and in-cell deletion. No page-owned console errors.
- Bug-fix pass: verified all six column options with one row, measured the complete menu inside the table width, confirmed outside-click dismissal, and retained normal Enter-to-save behavior outside IME composition.

## Follow-up polish

- P3: During implementation, consider truncation plus an expandable row if real task titles or progress notes are frequently longer than three lines.
- P3: Validate touch swipe thresholds on an actual phone or trackpad before release.

## Implementation checklist

- Build task and daily-snapshot persistence as separate records.
- Preserve the current visual tokens from the prototype.
- Keep historical dates read-only.
- Render cached data before waiting for host storage.
- Validate responsive layouts at 850 px and 560 px.

final result: passed
