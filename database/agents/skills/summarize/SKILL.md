---
name: summarize
description: Summarize or extract text and transcripts from URLs, local files, podcasts, and video links.
---

# Summarize

Choose the cheapest reliable path:

1. URLs: fetch the page with `web_fetch`, then summarize the retrieved content.
2. Local files: use the available file/PDF/document tools; narrow large inputs before loading everything.
3. YouTube or podcasts: if the `summarize` CLI exists, use `summarize <url> --youtube auto`; for transcript extraction add `--extract-only`.
4. If extraction is blocked, explain what input or dependency is missing.

Preserve important dates, names, decisions, caveats, and source distinctions. Do not invent content hidden behind authentication or unavailable media. For very long transcripts, give a compact overview and identify useful sections or timestamps when available.
