"""Atomic structured multi-file editing tool."""

from __future__ import annotations

from typing import Any

from .base import Tool
from .authorization import require_approval_for_paths, resolve_action_path
from .context import ToolContext, is_within_workspace


class ApplyPatchTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self) -> str:
        return "apply_patch"

    @property
    def description(self) -> str:
        return "Atomically add or exactly replace text in multiple files. Workspace files are allowed; external or sensitive targets require approval. Supports dry-run validation."

    @property
    def parameters(self) -> dict[str, Any]:
        edit = {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "action": {"type": "string", "enum": ["add", "replace"]},
                "old_text": {"type": "string"},
                "new_text": {"type": "string"},
            },
            "required": ["path", "action", "new_text"],
            "additionalProperties": False,
        }
        return {
            "type": "object",
            "properties": {
                "edits": {
                    "type": "array",
                    "items": edit,
                    "minItems": 1,
                    "maxItems": 20,
                },
                "dry_run": {"type": "boolean"},
            },
            "required": ["edits"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        edits = kwargs.get("edits") or []
        resolved_edits = [(edit, resolve_action_path(self.context, edit["path"])) for edit in edits]
        require_approval_for_paths(
            self.context, self.name, kwargs, [path for _, path in resolved_edits], operation="write",
        )
        writes: dict[Any, str] = {}
        summaries: list[str] = []
        for edit, path in resolved_edits:
            current = writes.get(path)
            if current is None:
                current = path.read_text(encoding="utf-8") if path.exists() else ""
            if edit["action"] == "add":
                updated = (
                    current
                    + ("" if not current or current.endswith("\n") else "\n")
                    + edit["new_text"]
                )
            else:
                old = edit.get("old_text") or ""
                count = current.count(old) if old else 0
                if count != 1:
                    raise ValueError(
                        f"old_text for {edit['path']} must occur exactly once; found {count}"
                    )
                updated = current.replace(old, edit["new_text"], 1)
            writes[path] = updated
            display = path.relative_to(self.context.workspace.resolve()) if is_within_workspace(self.context, path) else path
            summaries.append(f"{edit['action']}: {display}")
        if kwargs.get("dry_run"):
            return "Patch dry-run succeeded:\n" + "\n".join(summaries)
        backups = {
            path: path.read_bytes() if path.exists() else None for path in writes
        }
        try:
            for path, content in writes.items():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
        except Exception:
            for path, content in backups.items():
                if content is None:
                    path.unlink(missing_ok=True)
                else:
                    path.write_bytes(content)
            raise
        return "Patch applied:\n" + "\n".join(summaries)

    async def preflight(self, **kwargs: Any) -> None:
        paths = [
            resolve_action_path(self.context, edit["path"])
            for edit in (kwargs.get("edits") or [])
        ]
        require_approval_for_paths(self.context, self.name, kwargs, paths, operation="write")
