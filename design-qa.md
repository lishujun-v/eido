# Design QA — 模型、技能、工具、会话页面

## Evidence

- Source visual truth: `/Users/sjl/myspace/eido/public/qa/source-capability-reference.png`
- Rendered implementation: authenticated browser captures of Models, Skills, Tools (Local and MCP), and Conversations at `http://127.0.0.1:3000/`.
- Source pixels: 1672 × 941.
- Primary implementation viewport: 1512 × 861 CSS pixels at device scale factor 1.
- Responsive verification viewport: 1280 × 720 CSS pixels at device scale factor 1.
- State: authenticated workspace with real Skills, Tools and Conversations data; Models empty/provider-creation state; MCP empty/connection state.

The source reference and browser-rendered pages were visually compared as a shared design-system target rather than a literal content clone. The four pages intentionally reuse the reference's left navigation, open icy-blue workspace, navy hierarchy, cobalt actions, glass surfaces, soft borders, generous radii, and restrained uppercase microcopy.

Focused review covered each page title/header, search and tab controls, primary form, card grids, empty states, status counts, destructive actions, long-copy truncation, internal scrolling, and narrow desktop behavior.

## Required fidelity surfaces

- Fonts and typography: passed. The existing Avenir Next / PingFang stack is retained with stronger title hierarchy, compact UI labels, and readable 11–14 px supporting copy.
- Spacing and layout rhythm: passed. All pages share the same max-width, hero spacing, 18–22 px glass radii, card gaps, and toolbar proportions. Models and Tools use balanced two-column desktop layouts; Conversations uses two-column task cards for a single directory.
- Colors and visual tokens: passed. Icy blue, translucent white, navy, cobalt, and muted blue-gray are scoped consistently across all four pages.
- Image quality and asset fidelity: passed. The existing shared raster workspace background is reused at cover size with no stretched or placeholder imagery. No additional logo or illustration assets were introduced, per the request.
- Copy and content: passed. Existing provider fields, skill descriptions, tool schemas, MCP controls, conversation titles, metadata, and functional labels remain intact.

## Primary interactions tested

- Sidebar navigation across 模型、技能、工具、会话.
- Skill search filtering and clearing.
- Tool Local / MCP tab switching.
- Models provider form rendering and model-entry controls.
- Conversation data loading, grouping, selection controls, search field, and two-column card layout.
- Responsive layout at 1280 × 720.
- Browser console warnings/errors: none.

## Comparison history

1. Initial Tools pass placed the create form above the library at the default viewport because the split layout only activated at the 1536 px breakpoint. Classified P1 because it pushed the core tool library below the fold.
2. Fix: moved the split-layout breakpoint to 1280 px, producing a compact left creation rail and a visible three-column tool library.
3. Initial Conversations pass left a single directory occupying half the content width. Classified P2 because it created a large unused region and reduced task scanability.
4. Fix: a sole directory now spans the content width and its tasks render in two columns; multiple directories retain the grouped two-column layout.
5. Post-fix browser evidence at the primary and responsive viewports shows no remaining actionable P0/P1/P2 mismatch.

## Findings

- No actionable P0, P1, or P2 mismatch remains.

## Follow-up polish

- [P3] Very long English skill descriptions still truncate after three lines by design; a future detail drawer could expose full documentation without increasing card height.
- [P3] Empty Models and MCP states intentionally leave more atmospheric background visible than data-heavy states.

## Verification

- Production build: passed.
- Browser interaction and responsive checks: passed.
- Console error check: passed.
- `git diff --check`: passed.

final result: passed
