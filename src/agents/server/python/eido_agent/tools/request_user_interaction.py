"""Model-facing declaration of a clarification or approval pause."""

from __future__ import annotations

import json
from typing import Any

from ..interactions import create_interaction
from .base import Tool
from .context import ToolContext


class RequestUserInteractionTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self) -> str:
        return "request_user_interaction"

    @property
    def description(self) -> str:
        return "Pause to ask the owner a concise clarification or obtain explicit approval before an action."

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["clarification", "approval"]},
                "prompt": {"type": "string"},
                "options": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                "action": {"type": "string", "description": "Required for approval: exact target tool name."},
                "action_arguments": {"type": "object", "description": "Required for approval: exact target tool arguments."},
            },
            "required": ["kind", "prompt"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        if self.context.session is None:
            raise ValueError("User interaction requires a conversation session")
        interaction = create_interaction(
            runtime=self.context.runtime, session=self.context.session,
            agent_id=self.context.profile.id, kind=str(kwargs["kind"]),
            prompt=str(kwargs["prompt"]), options=kwargs.get("options"),
            action=kwargs.get("action"), action_arguments=kwargs.get("action_arguments"),
        )
        return json.dumps({
            "status": "waiting_for_user",
            "interaction": interaction.model_dump(),
        }, ensure_ascii=False)
