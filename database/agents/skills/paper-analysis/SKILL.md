---
name: paper-analysis
description: Concisely analyze an academic paper when the user asks to analyze, interpret, review, summarize, or explain the current paper or a PDF. Focus on the problem solved, innovations, and core method, with short verifiable page-and-quote citations.
---

# Paper Analysis

Use the current Project paper context and its exact PDF path. Do not search for the file when a path is provided.

## Workflow

1. Read enough of the abstract, introduction, method, and conclusion to identify the paper's central claim. Inspect experiments only when needed to verify an innovation or method choice.
2. Separate statements supported by the paper from your own inference. Do not invent details that are absent from the available text.
3. Return only these three sections, in the user's language:

   - `## 解决了什么问题`
   - `## 创新点在哪`
   - `## 核心方法是怎样的`

4. Keep each section to 1–3 bullets. Keep each bullet to 1–2 short sentences. Target 250–450 Chinese characters total, or 180–300 English words. Do not add background, exhaustive section summaries, experiment tables, limitations, or future work unless the user explicitly asks.
5. Put one precise evidence anchor after every important bullet using `【第N页：原文短句】`. Copy a short, distinctive phrase verbatim from that page so the reader can map it to the PDF text. Use PDF page numbers, not printed manuscript page labels.
6. If the available content is insufficient, state the missing point briefly instead of padding the answer.

## Style

Lead with the conclusion. Prefer concrete nouns and verbs. Explain technical terms only when essential. Avoid repeated claims, generic praise, long quotations, and chain-of-thought narration.

If the user requests a deeper analysis, preserve the three-section opening and add only the specifically requested detail afterward.
