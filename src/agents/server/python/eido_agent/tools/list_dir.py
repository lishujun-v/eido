from __future__ import annotations
from typing import Any
from .base import Tool
from .authorization import require_approval_for_paths, resolve_action_path
from .context import ToolContext


class ListDirTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self):
        return "list_dir"

    @property
    def description(self):
        return "List files and directories. External or sensitive directories require approval."

    @property
    def parameters(self):
        return {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any):
        path = resolve_action_path(self.context, kwargs.get("path", "."))
        require_approval_for_paths(self.context, self.name, kwargs, [path], operation="read")
        entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        return (
            "\n".join(
                f"{'DIR ' if p.is_dir() else 'FILE'} {p.name}" for p in entries[:1000]
            )
            or "(empty)"
        )

    async def preflight(self, **kwargs: Any) -> None:
        path = resolve_action_path(self.context, kwargs.get("path", "."))
        require_approval_for_paths(self.context, self.name, kwargs, [path], operation="read")
