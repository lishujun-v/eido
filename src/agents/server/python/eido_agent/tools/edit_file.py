from __future__ import annotations
from typing import Any
from .base import Tool
from .authorization import require_approval_for_paths, resolve_action_path
from .context import ToolContext, is_within_workspace


class EditFileTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self):
        return "edit_file"

    @property
    def description(self):
        return "Replace one exact text occurrence in a file. Workspace files are allowed; external or sensitive targets require approval."

    @property
    def parameters(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "old_text": {"type": "string"},
                "new_text": {"type": "string"},
            },
            "required": ["path", "old_text", "new_text"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any):
        path = resolve_action_path(self.context, kwargs["path"])
        require_approval_for_paths(self.context, self.name, kwargs, [path], operation="write")
        text = path.read_text(encoding="utf-8")
        old = str(kwargs["old_text"])
        count = text.count(old)
        if count != 1:
            raise ValueError(f"old_text must occur exactly once; found {count}")
        path.write_text(text.replace(old, str(kwargs["new_text"]), 1), encoding="utf-8")
        display = path.relative_to(self.context.workspace.resolve()) if is_within_workspace(self.context, path) else path
        return f"Edited {display}"

    async def preflight(self, **kwargs: Any) -> None:
        path = resolve_action_path(self.context, kwargs["path"])
        require_approval_for_paths(self.context, self.name, kwargs, [path], operation="write")
