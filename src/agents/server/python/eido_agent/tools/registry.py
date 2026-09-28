"""Tool registration and safe execution."""

from __future__ import annotations

from typing import Any

from .base import Tool
from ..interactions import AuthorizationRequired


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def unregister(self, name: str) -> None:
        self._tools.pop(name, None)

    @property
    def tool_names(self) -> list[str]:
        return list(self._tools)

    def schemas(self) -> list[dict[str, Any]]:
        return [tool.schema() for tool in self._tools.values()]

    async def preflight(self, name: str, arguments: dict[str, Any]) -> None:
        tool = self._tools.get(name)
        if tool is None:
            raise LookupError(f"Unknown tool: {name}")
        await tool.preflight(**arguments)

    async def execute(self, name: str, arguments: dict[str, Any]) -> str:
        tool = self._tools.get(name)
        if tool is None:
            raise LookupError(f"Unknown tool: {name}")
        # Let the agent loop classify an execution error.  Converting it to a
        # normal result here loses the distinction between a successful tool
        # response and a failed tool invocation in the streaming UI.
        try:
            result = await tool.execute(**arguments)
        except AuthorizationRequired:
            raise
        except PermissionError as exc:
            # Built-ins and context-aware extensions may use a plain
            # PermissionError. Normalize it here so the agent loop can always
            # render the same approval card instead of exposing a dead-end
            # tool failure to the owner.
            context = getattr(tool, "context", None)
            if context is not None and getattr(context, "session", None) is not None:
                raise AuthorizationRequired(
                    context=context,
                    tool_name=name,
                    arguments=arguments,
                    reason=str(exc).strip() or "工具请求了额外权限",
                ) from exc
            raise
        return str(result)
