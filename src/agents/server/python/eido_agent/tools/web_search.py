"""Baidu AI Search tool used by the bundled Eido agent."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from .authorization import require_approval_for_network_action, requires_network_approval
from .base import Tool
from .context import ToolContext


_WEB_SEARCH_ENDPOINT = "https://qianfan.baidubce.com/v2/ai_search/web_search"
_LEGACY_SKILL_CONFIG = Path.home() / ".jarvis/skills/baidu-search/scripts/config.json"


class WebSearchTool(Tool):
    """Search the web through Baidu AI Search."""

    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self) -> str:
        # Keep the existing name so saved Agent equipment continues to work.
        return "web_search"

    @property
    def description(self) -> str:
        return (
            "Search current public information with Baidu AI Search. Supports "
            "web, image, video, and Aladdin results, plus optional site and recency filters."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "minLength": 1, "description": "Search query (up to 72 characters)."},
                "max_results": {"type": "integer", "minimum": 1, "maximum": 50, "default": 5},
                "resource_type": {"type": "string", "enum": ["web", "image", "video", "aladdin"], "default": "web"},
                "sites": {"type": "array", "items": {"type": "string"}, "maxItems": 100},
                "recency": {"type": "string", "enum": ["week", "month", "semiyear", "year"]},
                "safe_search": {"type": "boolean", "default": False},
            },
            "required": ["query"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any) -> str:
        reason = requires_network_approval(self.context, "qianfan.baidubce.com")
        if reason:
            require_approval_for_network_action(self.context, self.name, kwargs, reason=reason)

        api_key = _baidu_api_key()
        if not api_key:
            return "Baidu AI Search is not configured. Set BAIDU_SEARCH_API_KEY for the Eido Agent server, then retry."

        query = str(kwargs["query"]).strip()
        if not query:
            raise ValueError("query must not be empty")
        max_results = min(max(int(kwargs.get("max_results", 5)), 1), 50)
        resource_type = str(kwargs.get("resource_type", "web"))
        payload: dict[str, Any] = {
            "messages": [{"role": "user", "content": query[:72]}],
            "search_source": "baidu_search_v2",
            "resource_type_filter": [{"type": resource_type, "top_k": max_results}],
            "safe_search": bool(kwargs.get("safe_search", False)),
        }
        if sites := kwargs.get("sites"):
            payload["search_filter"] = {"match": {"site": [str(site) for site in sites][:100]}}
        if recency := kwargs.get("recency"):
            payload["search_recency_filter"] = str(recency)

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                _WEB_SEARCH_ENDPOINT,
                headers={"X-Appbuilder-Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
        try:
            data = response.json()
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Baidu AI Search returned invalid JSON ({response.status_code})") from exc
        if response.is_error or data.get("code"):
            detail = data.get("message") or response.text[:300] or "unknown API error"
            raise RuntimeError(f"Baidu AI Search failed ({response.status_code}): {detail}")

        results = data.get("references", [])[:max_results]
        if not results:
            return f"No Baidu search results found for: {query}"
        rows = [f"Baidu AI Search results for: {query} ({datetime.now().date().isoformat()})"]
        for index, reference in enumerate(results, 1):
            title = str(reference.get("title") or "Untitled").strip()
            url = str(reference.get("url") or "").strip()
            snippet = str(reference.get("content") or "").strip()
            website = str(reference.get("website") or "").strip()
            date = str(reference.get("date") or "").strip()
            rows.append(f"{index}. {title}\n   URL: {url}")
            if snippet:
                rows.append(f"   Summary: {snippet[:1000]}")
            if website or date:
                rows.append(f"   Source: {website}{f' | {date}' if date else ''}")
        return "\n".join(rows)

    async def preflight(self, **kwargs: Any) -> None:
        reason = requires_network_approval(self.context, "qianfan.baidubce.com")
        if reason:
            require_approval_for_network_action(self.context, self.name, kwargs, reason=reason)


def _baidu_api_key() -> str | None:
    """Get the search credential without exposing it in logs or tool output."""
    for env_name in ("BAIDU_SEARCH_API_KEY", "EIDO_BAIDU_SEARCH_API_KEY"):
        if value := os.getenv(env_name):
            return value.strip()
    try:
        raw = json.loads(_LEGACY_SKILL_CONFIG.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None
    value = raw.get("api_key") if isinstance(raw, dict) else None
    return value.strip() if isinstance(value, str) and value.strip() else None
