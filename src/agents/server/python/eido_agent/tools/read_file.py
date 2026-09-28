from __future__ import annotations
from typing import Any
from .base import Tool
from .authorization import require_approval_for_paths, resolve_action_path
from .context import ToolContext


class ReadFileTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self):
        return "read_file"

    @property
    def description(self):
        return "Read a UTF-8 text file. External or sensitive files require approval."

    @property
    def parameters(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "offset": {"type": "integer", "minimum": 0},
                "limit": {"type": "integer", "minimum": 1, "maximum": 2000},
            },
            "required": ["path"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any):
        path = resolve_action_path(self.context, kwargs["path"])
        require_approval_for_paths(self.context, self.name, kwargs, [path], operation="read")
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        offset = int(kwargs.get("offset", 0))
        limit = int(kwargs.get("limit", 500))
        return "\n".join(lines[offset : offset + limit])

    async def preflight(self, **kwargs: Any) -> None:
        path = resolve_action_path(self.context, kwargs["path"])
        require_approval_for_paths(self.context, self.name, kwargs, [path], operation="read")
