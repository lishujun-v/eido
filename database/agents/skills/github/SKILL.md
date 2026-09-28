---
name: github
description: Interact with GitHub through the gh CLI for issues, pull requests, Actions runs, and API queries.
---

# GitHub

Use `exec` with the `gh` CLI. Outside a Git checkout, always pass `--repo owner/repo`.

- PR checks: `gh pr checks <number> --repo owner/repo`
- Recent runs: `gh run list --repo owner/repo --limit 10`
- Failed logs: `gh run view <run-id> --repo owner/repo --log-failed`
- Structured data: prefer `--json` and `--jq`.
- Advanced queries: `gh api repos/owner/repo/...`.

Before writes such as merge, close, comment, release, or workflow dispatch, follow the agent's confirmation and authorization policy. If `gh` is unavailable or unauthenticated, report the exact prerequisite.
