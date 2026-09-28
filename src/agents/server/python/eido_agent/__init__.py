"""Eido digital twin agent runtime."""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .runtime import AgentRuntime

__all__ = ["AgentRuntime"]


def __getattr__(name: str) -> Any:
    """Keep lightweight submodules importable without loading runtime providers."""
    if name == "AgentRuntime":
        from .runtime import AgentRuntime

        return AgentRuntime
    raise AttributeError(name)
