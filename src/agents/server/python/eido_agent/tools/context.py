"""Shared runtime context for Eido's built-in tools."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from ..models import AgentProfile, SessionRecord
from ..storage import JsonStore


class ToolRuntime(Protocol):
    store: JsonStore
    config: Any

    async def delegate_task(self, **kwargs: Any) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class ToolContext:
    runtime: ToolRuntime
    profile: AgentProfile
    workspace: Path
    session: SessionRecord | None = None
    event_callback: Callable[[dict[str, Any]], Awaitable[None]] | None = None


def resolve_workspace_path(context: ToolContext, value: str, *, allow_outside: bool = False) -> Path:
    """Resolve a tool path, optionally allowing an explicitly approved external target."""
    workspace = context.workspace.resolve()
    candidate = Path(value).expanduser()
    resolved = (
        candidate if candidate.is_absolute() else workspace / candidate
    ).resolve()
    if not allow_outside and not is_within_workspace(context, resolved):
        raise ValueError("Path is outside the Agent workspace")
    return resolved


def is_within_workspace(context: ToolContext, path: Path) -> bool:
    workspace = context.workspace.resolve()
    resolved = path.resolve()
    return resolved == workspace or workspace in resolved.parents


def is_siinx_agent(profile: AgentProfile) -> bool:
    return (
        profile.agent_type == "siinx"
        and profile.interaction_mode == "conversation"
        and profile.is_default
        and profile.system_managed
        and bool(profile.owner_user_id)
    )
