"""Minimal extension point for optional Eido runtime plugins."""

from __future__ import annotations

from typing import Protocol

from ..tools import ToolRegistry


class Plugin(Protocol):
    name: str

    def install(self, tools: ToolRegistry) -> None: ...


class PluginManager:
    def __init__(self) -> None:
        self._plugins: list[Plugin] = []

    def register(self, plugin: Plugin) -> None:
        self._plugins.append(plugin)

    def install(self, tools: ToolRegistry) -> None:
        for plugin in self._plugins:
            plugin.install(tools)
