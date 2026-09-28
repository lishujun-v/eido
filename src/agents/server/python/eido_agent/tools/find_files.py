"""Workspace file discovery tool."""

from __future__ import annotations

from fnmatch import fnmatch
from typing import Any

from .base import Tool
from .authorization import display_path, require_approval_for_paths, resolve_action_path
from .context import ToolContext


class FindFilesTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self) -> str:
        return "find_files"

    @property
    def description(self) -> str:
        return "Find files by path fragment or glob. External or sensitive directories require approval. Skips common dependency and build directories."

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "query": {"type": "string"},
                "glob": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 1000},
            },
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        root = resolve_action_path(self.context, kwargs.get("path", "."))
        require_approval_for_paths(self.context, self.name, kwargs, [root], operation="read")
        query = str(kwargs.get("query") or "").lower()
        pattern = str(kwargs.get("glob") or "")
        limit = int(kwargs.get("limit", 200))
        ignored = {".git", "node_modules", "__pycache__", ".venv", "dist", "build"}
        matches: list[str] = []
        candidates = [root] if root.is_file() else root.rglob("*")
        for candidate in candidates:
            if not candidate.is_file() or any(
                part in ignored for part in candidate.parts
            ):
                continue
            relative = display_path(self.context, candidate).as_posix()
            if query and query not in relative.lower():
                continue
            if (
                pattern
                and not fnmatch(relative, pattern)
                and not fnmatch(candidate.name, pattern)
            ):
                continue
            matches.append(relative)
            if len(matches) >= limit:
                break
        return "\n".join(sorted(matches)) or "No files found"

    async def preflight(self, **kwargs: Any) -> None:
        root = resolve_action_path(self.context, kwargs.get("path", "."))
        require_approval_for_paths(self.context, self.name, kwargs, [root], operation="read")
