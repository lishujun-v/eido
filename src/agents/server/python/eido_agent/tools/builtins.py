"""Registration policy for Eido and retained nanobot-compatible tools."""
from __future__ import annotations
from pathlib import Path
from typing import Any
from ..models import SessionRecord
from .context import ToolContext, ToolRuntime, is_siinx_agent
from .delegate_task import DelegateTaskTool
from .edit_file import EditFileTool
from .exec import ExecTool
from .find_files import FindFilesTool
from .grep import GrepTool
from .list_dir import ListDirTool
from .apply_patch import ApplyPatchTool
from .read_file import ReadFileTool
from .remember_owner_fact import RememberOwnerFactTool
from .request_user_interaction import RequestUserInteractionTool
from .sustained_goal import SustainedGoalTool
from .web_fetch import WebFetchTool
from .web_search import WebSearchTool
from .write_file import WriteFileTool
from .knowledge_search import KnowledgeSearchTool
from .browser import BrowserTool


def install_builtin_tools(
    registry: Any,
    runtime: ToolRuntime,
    profile: Any,
    workspace: Path,
    session: SessionRecord | None = None,
    event_callback: Any = None,
    enabled_tool_ids: set[str] | None = None,
) -> list[str]:
    context = ToolContext(runtime, profile, workspace, session, event_callback)
    tools: list[tuple[str, Any]] = []
    if is_siinx_agent(profile):
        tools.extend(
            (
                ("remember_owner_fact", RememberOwnerFactTool(context)),
                ("delegate_task", DelegateTaskTool(context)),
                ("update_sustained_goal", SustainedGoalTool(context)),
                ("request_user_interaction", RequestUserInteractionTool(context)),
            )
        )
    tools.extend(
        (
            ("read_file", ReadFileTool(context)),
            ("write_file", WriteFileTool(context)),
            ("edit_file", EditFileTool(context)),
            ("apply_patch", ApplyPatchTool(context)),
            ("list_dir", ListDirTool(context)),
            ("find_files", FindFilesTool(context)),
            ("grep", GrepTool(context)),
            ("exec_command", ExecTool(context)),
            ("web_search", WebSearchTool(context)),
            ("web_fetch", WebFetchTool(context)),
            ("knowledge_search", KnowledgeSearchTool(context)),
            ("browser", BrowserTool(context)),
        )
    )
    installed = []
    for tool_id, tool in tools:
        # User interaction is a runtime safety primitive, not an optional
        # capability: a SiinX agent must always be able to request approval.
        if enabled_tool_ids is not None and tool_id not in enabled_tool_ids and tool_id != "request_user_interaction" and not (tool_id == "browser" and is_siinx_agent(profile)):
            continue
        registry.register(tool)
        installed.append(tool.name)
    return installed
