"""Delegate one bounded task from SiinX to an equipped expert."""

from __future__ import annotations

import json
from typing import Any

from .base import Tool
from .context import ToolContext, is_siinx_agent


class DelegateTaskTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context
        self._calls_made = 0

    @property
    def name(self) -> str:
        return "delegate_task"

    @property
    def description(self) -> str:
        experts = [
            expert
            for expert in self.context.runtime.store.list_agents(
                owner_user_id=self.context.profile.owner_user_id
            )
            if expert.agent_type == "expert" and expert.interaction_mode == "task_only"
        ]
        catalog = "\n".join(
            f"- {expert.id}: {expert.name}. {expert.capabilities or expert.bio}"
            for expert in experts
        ) or "- No experts are currently available."
        return (
            "Delegate a clear, self-contained subtask to one of the owner's experts. "
            "Pass only the minimum relevant context. Use an expert when it is materially "
            "better suited than answering directly. Available experts:\n" + catalog
        )

    @property
    def parameters(self) -> dict[str, Any]:
        expert_ids = [
            expert.id
            for expert in self.context.runtime.store.list_agents(
                owner_user_id=self.context.profile.owner_user_id
            )
            if expert.agent_type == "expert" and expert.interaction_mode == "task_only"
        ]
        agent_id: dict[str, Any] = {"type": "string"}
        if expert_ids:
            agent_id["enum"] = expert_ids
        return {
            "type": "object",
            "properties": {
                "agent_id": agent_id,
                "task": {"type": "string"},
                "context": {"type": "string"},
                "expected_output": {"type": "string"},
            },
            "required": ["agent_id", "task", "expected_output"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        if not is_siinx_agent(self.context.profile):
            return "委派失败：只有 SiinX 主 Agent 可以调用专家。"
        if self.context.session is None:
            return "委派失败：当前调用缺少父会话上下文。"
        if self._calls_made >= 2:
            return "委派失败：当前回复已达到 2 次 Worker Agent 调用上限，请先整合已有结果。"
        self._calls_made += 1
        result = await self.context.runtime.delegate_task(
            caller_agent_id=self.context.profile.id,
            target_agent_id=str(kwargs.get("agent_id") or "").strip(),
            parent_session_id=self.context.session.id,
            task=str(kwargs.get("task") or "").strip(),
            context=str(kwargs.get("context") or "").strip(),
            expected_output=str(kwargs.get("expected_output") or "").strip(),
            event_callback=self.context.event_callback,
        )
        return json.dumps(result, ensure_ascii=False, indent=2)
