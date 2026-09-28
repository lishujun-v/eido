"""Read-only knowledge retrieval for the currently executing Agent."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from .base import Tool
from .context import ToolContext


class KnowledgeSearchTool(Tool):
    """Call the platform API with identity supplied by the runtime profile.

    The model controls only its query and result limits.  It cannot choose a
    user, agent, or arbitrary knowledge space, so the API can enforce the
    normal owner and Agent-to-space binding checks.
    """

    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self) -> str:
        return "knowledge_search"

    @property
    def description(self) -> str:
        spaces = self._bound_spaces()
        if not spaces:
            return (
                "检索当前 Agent 已绑定的知识空间，返回相关知识及最多一跳的关系路径。"
                "当前没有已授权的知识空间；不要声称已从知识库检索到内容。"
            )
        scope = "；".join(
            f"{item['name']}（领域：{item['domain']}，{item['node_count']} 个节点）"
            for item in spaces
        )
        return (
            "检索当前 Agent 已绑定的知识空间，返回相关知识及最多一跳的关系路径。"
            f"当前仅可检索：{scope}。不得将此工具用于未列出的知识空间。"
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "要检索的问题或关键词。"},
                "top_k": {"type": "integer", "minimum": 1, "maximum": 12, "description": "返回条数，默认 6。"},
                "max_hops": {"type": "integer", "minimum": 0, "maximum": 1, "description": "关系扩展跳数，默认 1。"},
            },
            "required": ["query"],
            "additionalProperties": False,
        }

    async def execute(self, query: str, top_k: int = 6, max_hops: int = 1, **_: Any) -> str:
        text = str(query or "").strip()
        if not text:
            raise ValueError("query 不能为空")
        if len(text) > 1000:
            raise ValueError("query 不能超过 1000 个字符")
        if not isinstance(top_k, int) or isinstance(top_k, bool) or not 1 <= top_k <= 12:
            raise ValueError("top_k 必须是 1 到 12 的整数")
        if not isinstance(max_hops, int) or isinstance(max_hops, bool) or max_hops not in {0, 1}:
            raise ValueError("max_hops 只能是 0 或 1")
        owner_user_id = str(self.context.profile.owner_user_id or "").strip()
        if not owner_user_id:
            raise PermissionError("当前 Agent 没有可用的知识库身份")

        base_url = str(getattr(self.context.runtime.config, "platform_url", "http://127.0.0.1:3000")).rstrip("/")
        payload = {
            "query": text,
            "agentId": self.context.profile.id,
            "mode": "graph",
            "topK": top_k,
            "maxHops": max_hops,
            "includeContent": True,
            "explain": True,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{base_url}/api/knowledge/search",
                headers={"x-eido-user-id": owner_user_id, "accept": "application/json"},
                json=payload,
            )
        try:
            body = response.json()
        except ValueError:
            body = None
        if not response.is_success:
            message = body.get("error") if isinstance(body, dict) else "知识库检索服务不可用"
            raise RuntimeError(str(message))
        return json.dumps(body, ensure_ascii=False, indent=2)

    def _bound_spaces(self) -> list[dict[str, Any]]:
        """Return a compact, identity-filtered view for the model's tool schema.

        The service remains the authorization boundary during execution.  This
        local read only gives the model an accurate, current description of
        that same scope before it decides whether to call the tool.
        """
        owner_user_id = str(self.context.profile.owner_user_id or "").strip()
        agent_id = str(self.context.profile.id or "").strip()
        if not owner_user_id or not agent_id:
            return []
        try:
            path = Path(self.context.runtime.config.data_dir) / "knowledge_spaces.json"
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return []
        if not isinstance(raw, dict):
            return []

        spaces: list[dict[str, Any]] = []
        for value in raw.values():
            if not isinstance(value, dict):
                continue
            agent_ids = value.get("agentIds")
            if (
                value.get("ownerUserId") != owner_user_id
                or not isinstance(agent_ids, list)
                or agent_id not in agent_ids
            ):
                continue
            name = str(value.get("name") or "未命名知识空间").strip()
            domain = str(value.get("domain") or "未分类").strip()
            nodes = value.get("nodes")
            spaces.append({
                "name": name or "未命名知识空间",
                "domain": domain or "未分类",
                "node_count": len(nodes) if isinstance(nodes, list) else 0,
            })
        return sorted(spaces, key=lambda item: (item["name"], item["domain"]))
