"""Session-scoped execution plans for planning mode."""

from __future__ import annotations

import json
from typing import Any

from ..models import utc_now_iso
from .base import Tool
from .context import ToolContext


PLAN_METADATA_KEY = "execution_plan"
_STEP_STATUSES = {"pending", "in_progress", "completed", "blocked", "skipped"}


def active_plan(session: Any) -> dict[str, Any] | None:
    value = getattr(session, "metadata", {}).get(PLAN_METADATA_KEY)
    return value if isinstance(value, dict) else None


class PlanTool(Tool):
    """Create and maintain the visible plan for one conversation session."""

    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self) -> str:
        return "plan"

    @property
    def description(self) -> str:
        return (
            "Create, update, or inspect the execution plan for this session. "
            "In planning mode, use it before substantive work for research, multi-step analysis, implementation, troubleshooting, or long-form deliverables; "
            "update it when progress or new information changes the plan."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        step = {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Stable unique step identifier."},
                "title": {"type": "string", "description": "Short user-visible step title."},
                "status": {"type": "string", "enum": sorted(_STEP_STATUSES)},
                "detail": {"type": "string", "description": "Optional concise execution detail."},
            },
            "required": ["id", "title", "status"],
            "additionalProperties": False,
        }
        return {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "update", "status"]},
                "goal": {"type": "string", "description": "The desired outcome. Required when creating a plan."},
                "steps": {"type": "array", "items": step, "description": "Complete current step list. Required for create and update."},
                "reason": {"type": "string", "description": "Why the plan changed; use for update when the plan is adjusted."},
            },
            "required": ["action"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        session = self.context.session
        if session is None:
            return "计划工具只能在一个会话中使用。"
        action = str(kwargs.get("action") or "").strip()
        current = active_plan(session)
        if action == "status":
            return json.dumps(current or {"status": "inactive"}, ensure_ascii=False)
        if action not in {"create", "update"}:
            return "操作失败：action 必须为 create、update 或 status。"
        if action == "update" and current is None:
            return "更新失败：当前会话没有计划，请先使用 action=create。"

        goal = str(kwargs.get("goal") or (current or {}).get("goal") or "").strip()
        steps, error = self._validate_steps(kwargs.get("steps"))
        if not goal or len(goal) > 1000:
            return "操作失败：goal 必须是 1 至 1000 个字符。"
        if error:
            return error

        now = utc_now_iso()
        plan = {
            "goal": goal,
            "steps": steps,
            "status": "active",
            "created_at": (current or {}).get("created_at", now) if action == "update" else now,
            "updated_at": now,
        }
        reason = str(kwargs.get("reason") or "").strip()
        if reason:
            plan["reason"] = reason[:1000]
        session.metadata[PLAN_METADATA_KEY] = plan
        self.context.runtime.store.save_session(session)
        return json.dumps(plan, ensure_ascii=False)

    @staticmethod
    def _validate_steps(value: Any) -> tuple[list[dict[str, str]], str | None]:
        if not isinstance(value, list) or not value:
            return [], "操作失败：steps 必须是至少包含一个步骤的完整列表。"
        if len(value) > 30:
            return [], "操作失败：步骤数量不能超过 30 个。"
        steps: list[dict[str, str]] = []
        ids: set[str] = set()
        for item in value:
            if not isinstance(item, dict):
                return [], "操作失败：每个步骤必须是对象。"
            step_id = str(item.get("id") or "").strip()
            title = str(item.get("title") or "").strip()
            status = str(item.get("status") or "").strip()
            detail = str(item.get("detail") or "").strip()
            if not step_id or len(step_id) > 100 or step_id in ids:
                return [], "操作失败：步骤 id 必须唯一且不超过 100 个字符。"
            if not title or len(title) > 500 or status not in _STEP_STATUSES:
                return [], "操作失败：步骤必须包含有效的 title 和 status。"
            ids.add(step_id)
            step = {"id": step_id, "title": title, "status": status}
            if detail:
                step["detail"] = detail[:1000]
            steps.append(step)
        return steps, None
