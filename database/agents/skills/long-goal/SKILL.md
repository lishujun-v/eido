---
name: long-goal
description: Manage sustained multi-turn objectives with idempotent goals, bounded scope, explicit completion criteria, and resumable execution.
---

# Sustained Goals

Use for one clear objective that requires multiple turns or substantial execution, not for one-shot questions.

When a goal-management tool exists, register the objective promptly. Write it as desired end state rather than fragile narration. It must be:

1. self-contained, including relevant paths and constraints;
2. safe to resume or repeat using check-before-act behavior;
3. bounded, with explicit in-scope and out-of-scope work;
4. measurable, with tests or acceptance criteria;
5. honest about cancellation, replacement, blocking, and partial completion.

For project work, prefer conventional modules and verify after meaningful increments. Research unstable API or ecosystem facts before committing to architecture. Never claim a goal was registered or completed unless the corresponding runtime tool succeeded.
