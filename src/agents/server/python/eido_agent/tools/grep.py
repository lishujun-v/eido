"""Bounded workspace content search tool."""

from __future__ import annotations

import re
from fnmatch import fnmatch
from typing import Any

from .base import Tool
from .authorization import display_path, require_approval_for_paths, resolve_action_path
from .context import ToolContext


class GrepTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self) -> str:
        return "grep"

    @property
    def description(self) -> str:
        return "Search UTF-8 files with a regex or fixed string. External or sensitive directories require approval."

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "pattern": {"type": "string"},
                "path": {"type": "string"},
                "glob": {"type": "string"},
                "case_insensitive": {"type": "boolean"},
                "fixed_strings": {"type": "boolean"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 1000},
            },
            "required": ["pattern"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        root = resolve_action_path(self.context, kwargs.get("path", "."))
        require_approval_for_paths(self.context, self.name, kwargs, [root], operation="read")
        pattern = str(kwargs["pattern"])
        if kwargs.get("fixed_strings"):
            pattern = re.escape(pattern)
        flags = re.IGNORECASE if kwargs.get("case_insensitive") else 0
        expression = re.compile(pattern, flags)
        glob = str(kwargs.get("glob") or "")
        limit = int(kwargs.get("limit", 200))
        results: list[str] = []
        candidates = [root] if root.is_file() else root.rglob("*")
        for path in candidates:
            if not path.is_file() or path.stat().st_size > 2_000_000:
                continue
            relative = display_path(self.context, path).as_posix()
            if glob and not fnmatch(relative, glob) and not fnmatch(path.name, glob):
                continue
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except (OSError, UnicodeDecodeError):
                continue
            for number, line in enumerate(lines, 1):
                if expression.search(line):
                    results.append(f"{relative}:{number}:{line[:500]}")
                    if len(results) >= limit:
                        return "\n".join(results)
        return "\n".join(results) or "No matches found"

    async def preflight(self, **kwargs: Any) -> None:
        root = resolve_action_path(self.context, kwargs.get("path", "."))
        require_approval_for_paths(self.context, self.name, kwargs, [root], operation="read")
