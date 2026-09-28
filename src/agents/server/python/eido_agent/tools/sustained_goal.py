"""Durable, explicitly controlled goals for a SiinX session."""

from __future__ import annotations

import json
from typing import Any

from .base import Tool
from .context import ToolContext, is_siinx_agent
from ..models import utc_now_iso

GOAL_METADATA_KEY = "sustained_goal"


def active_goal(session: Any) -> dict[str, Any] | None:
    value = getattr(session, "metadata", {}).get(GOAL_METADATA_KEY)
    return value if isinstance(value, dict) and value.get("status") == "active" else None


class SustainedGoalTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self) -> str:
        return "update_sustained_goal"

    @property
    def description(self) -> str:
        return "Create, inspect, complete, or cancel the durable objective for this session. Create it before extended work; only complete it after verification."

    @property
    def parameters(self) -> dict[str, Any]:
        return {"type": "object", "properties": {"action": {"type": "string", "enum": ["create", "status", "complete", "cancel"]}, "objective": {"type": "string"}}, "required": ["action"], "additionalProperties": False}

    async def execute(self, **kwargs: Any) -> str:
        if not is_siinx_agent(self.context.profile) or self.context.session is None:
            return "持续目标仅可在当前用户的默认 Eido 会话中使用。"
        session = self.context.session
        action = str(kwargs.get("action") or "").strip()
        current = active_goal(session)
        if action == "status":
            return json.dumps(current or {"status": "inactive"}, ensure_ascii=False)
        if action == "create":
            objective = str(kwargs.get("objective") or "").strip()
            if not objective or len(objective) > 4000:
                return "创建失败：objective 必须是 1 至 4000 个字符的、自包含的完成目标。"
            goal = {"status": "active", "objective": objective, "started_at": utc_now_iso(), "updated_at": utc_now_iso()}
            session.metadata[GOAL_METADATA_KEY] = goal
            self.context.runtime.store.save_session(session)
            return json.dumps(goal, ensure_ascii=False)
        if action in {"complete", "cancel"}:
            if not current:
                return json.dumps({"status": "inactive"}, ensure_ascii=False)
            current["status"] = "completed" if action == "complete" else "cancelled"
            current["updated_at"] = utc_now_iso()
            session.metadata[GOAL_METADATA_KEY] = current
            self.context.runtime.store.save_session(session)
            return json.dumps(current, ensure_ascii=False)
        return "操作失败：action 必须为 create、status、complete 或 cancel。"
