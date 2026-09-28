"""Private owner-memory tool for SiinX."""

from __future__ import annotations

import json
import re
from typing import Any

from .base import Tool
from .context import ToolContext, is_siinx_agent


class RememberOwnerFactTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self) -> str:
        return "remember_owner_fact"

    @property
    def description(self) -> str:
        return "Save or forget durable facts explicitly provided by the owner. Never store secrets or inferred sensitive facts."

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["set", "remove"]},
                "key": {"type": "string"},
                "value": {},
            },
            "required": ["action", "key"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        return execute_remember_owner_fact(self.context, kwargs)


def execute_remember_owner_fact(context: ToolContext, arguments: dict[str, Any]) -> str:
    profile = context.runtime.store.load_agent(context.profile.id)
    if profile is None or not is_siinx_agent(profile):
        return "保存失败：该能力只对当前用户的默认数字分身开放。"
    action = str(arguments.get("action") or "").strip()
    key = re.sub(r"[^a-z0-9_]+", "_", str(arguments.get("key") or "").lower()).strip(
        "_"
    )
    if not key or len(key) > 64:
        return "保存失败：记忆键必须是长度不超过 64 的 snake_case 名称。"
    if any(
        x in key
        for x in (
            "password",
            "secret",
            "token",
            "api_key",
            "credential",
            "payment",
            "card",
        )
    ):
        return "保存失败：不能保存密码、令牌、密钥或支付信息。"
    facts = context.runtime.store.read_owner_facts(profile.id)
    facts.update(profile.private_facts)
    if action == "remove":
        existed = key in facts
        facts.pop(key, None)
        context.runtime.store.write_owner_facts(profile.id, facts)
        profile.private_facts = {}
        context.runtime.store.save_agent(profile)
        return json.dumps(
            {"status": "removed", "key": key, "existed": existed}, ensure_ascii=False
        )
    value = arguments.get("value")
    if action != "set" or "value" not in arguments:
        return "保存失败：action=set 时必须提供 value。"
    if not isinstance(value, (str, int, float, bool)) or len(str(value)) > 500:
        return "保存失败：记忆值必须是长度不超过 500 的简单文本或数值。"
    facts[key] = value
    context.runtime.store.write_owner_facts(profile.id, facts)
    profile.private_facts = {}
    context.runtime.store.save_agent(profile)
    return json.dumps(
        {"status": "saved", "key": key, "value": value}, ensure_ascii=False
    )
