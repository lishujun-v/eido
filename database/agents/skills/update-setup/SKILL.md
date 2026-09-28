---
name: update-setup
description: Prepare a safe, user-confirmed update procedure for an Eido or nanobot installation without guessing its install method.
---

# Update Setup

Use only when the user asks to configure an update workflow.

1. Inspect the current executable, version, package metadata, and source checkout as read-only clues.
2. Ask the user to confirm the install method; do not infer authorization from clues.
3. Collect optional dependency extras and proxy requirements without exposing credentials.
4. Generate a workspace-local update skill containing a preflight check, update command, version verification, and restart instructions.
5. Do not run the update during setup unless the user separately authorizes it.

Supported methods may include `uv`, `pipx`, `pip`, or a source checkout. Quote paths safely and use the matching package/executable verification. Never overwrite an existing update skill without confirmation.
