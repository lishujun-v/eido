# Design QA

- Source visual truth: `design-assets/note-down-ui-reference.png`
- Source pixels: 1487 × 1058, RGB PNG
- Intended implementation viewport: 1487 × 1058 CSS px, device scale factor 1
- Implementation URL: `http://127.0.0.1:4173/`
- Implementation screenshot: unavailable — the in-app browser rejected local navigation due to browser security policy
- State: default editor state with the “项目灵感记录” note selected and its image selected
- Density normalization: source intended to be compared at 1:1 pixel/CSS size; implementation capture was blocked before normalization could be completed

**Findings**

- [P1] Browser-rendered evidence is unavailable
  Location: full application viewport.
  Evidence: the source image opens successfully, but the designated in-app browser refused to navigate to the local preview URL. No implementation screenshot could be captured.
  Impact: typography, spacing, colors, image placement, copy, console state, and interaction behavior cannot be certified from rendered evidence.
  Fix: repeat the capture in an environment where the in-app browser is permitted to open the local Vite preview, then compare both images at 1487 × 1058.

**Required Fidelity Surfaces**

- Fonts and typography: implemented with Inter, Noto Sans SC, and system fallbacks; rendered comparison blocked.
- Spacing and layout rhythm: implemented as a fixed 268 px sidebar with split editor/preview workspace and draggable divider; rendered comparison blocked.
- Colors and visual tokens: white/light-gray surfaces with `#2d68f4` as the primary accent; rendered comparison blocked.
- Image quality and asset fidelity: generated project-local alpine landscape is used in the preview; rendered crop and sharpness comparison blocked.
- Copy and content: source note content, note list, toolbar labels, status text, and Markdown preview are represented; rendered comparison blocked.

**Full-view Comparison Evidence**

- Source image was opened and inspected at 1487 × 1058.
- No browser-rendered implementation screenshot is available, so a combined side-by-side comparison could not be produced.

**Focused Region Comparison Evidence**

- Not performed because the prerequisite implementation capture is unavailable.

**Primary Interaction Coverage**

- Build-time implementation covers new note, note switching, search, Markdown editing/rendering, formatting insertion, link insertion, image paste/upload, image width persistence in Markdown, file open, save/download, keyboard shortcuts, dirty-state warnings, and panel resizing.
- Browser interaction testing and console inspection were blocked by the same local-navigation restriction.

**Comparison History**

- Pass 1: blocked before first implementation capture; no P0/P1/P2 visual-fix iteration could be run.

**Implementation Checklist**

- Capture the default screen at 1487 × 1058 in an allowed browser surface.
- Check console errors and exercise editor input, link insertion, image resizing, new-note flow, and save.
- Combine the source and implementation screenshots for full-view and focused-region review.
- Fix any P0/P1/P2 differences and repeat until clear.

**Follow-up Polish**

- Decide whether the browser prototype should evolve into a desktop shell (for example, Tauri) for unrestricted fixed-directory writes and attachment-folder management.

final result: blocked
