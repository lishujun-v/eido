from __future__ import annotations
from typing import Any
from .base import Tool
from .authorization import require_approval_for_paths, resolve_action_path
from .context import ToolContext, is_within_workspace


class WriteFileTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self):
        return "write_file"

    @property
    def description(self):
        return "Create or overwrite a UTF-8 file. Workspace files are allowed; external or sensitive targets require approval."

    @property
    def parameters(self):
        return {
            "type": "object",
            "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
            "required": ["path", "content"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any):
        path = resolve_action_path(self.context, kwargs["path"])
        require_approval_for_paths(self.context, self.name, kwargs, [path], operation="write")
        path.parent.mkdir(parents=True, exist_ok=True)
        content = str(kwargs["content"])
        path.write_text(content, encoding="utf-8")
        display = path.relative_to(self.context.workspace.resolve()) if is_within_workspace(self.context, path) else path
        return f"Wrote {len(content)} characters to {display}"

    async def preflight(self, **kwargs: Any) -> None:
        path = resolve_action_path(self.context, kwargs["path"])
        require_approval_for_paths(self.context, self.name, kwargs, [path], operation="write")
