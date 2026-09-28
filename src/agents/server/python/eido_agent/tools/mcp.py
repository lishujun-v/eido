"""Remote tools exposed by MCP Streamable HTTP servers."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .base import Tool
from .registry import ToolRegistry


class McpTool(Tool):
    def __init__(self, server: dict[str, Any], spec: dict[str, Any]):
        self.server = server
        self.spec = spec

    @property
    def name(self) -> str:
        server_name = _safe_name(str(self.server.get("name") or "mcp"))
        tool_name = _safe_name(str(self.spec.get("name") or "tool"))
        return f"{server_name}__{tool_name}"[:64]

    @property
    def description(self) -> str:
        server_name = str(self.server.get("name") or "MCP")
        detail = str(self.spec.get("description") or "Remote MCP tool.")
        return f"[{server_name}] {detail}"

    @property
    def parameters(self) -> dict[str, Any]:
        schema = self.spec.get("inputSchema")
        return schema if isinstance(schema, dict) else {"type": "object", "properties": {}}

    async def execute(self, **kwargs: Any) -> str:
        endpoint = str(self.server["endpoint"])
        headers = {
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
        }
        configured = self.server.get("headers")
        if isinstance(configured, dict):
            headers.update(
                {
                    str(key): str(value)
                    for key, value in configured.items()
                    if str(key).strip() and str(value).strip()
                }
            )
        authorization = str(self.server.get("authorization") or "").strip()
        if authorization and not any(key.lower() == "authorization" for key in headers):
            headers["authorization"] = authorization

        async with httpx.AsyncClient(timeout=30.0) as client:
            initialized = await client.post(
                endpoint,
                headers=headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "Eido", "version": "0.1.0"},
                    },
                },
            )
            initialized.raise_for_status()
            session_id = initialized.headers.get("mcp-session-id")
            if session_id:
                headers["mcp-session-id"] = session_id

            ready = await client.post(
                endpoint,
                headers=headers,
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            )
            ready.raise_for_status()
            response = await client.post(
                endpoint,
                headers=headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {"name": str(self.spec["name"]), "arguments": kwargs},
                },
            )
            response.raise_for_status()
            payload = _response_json(response)

        if isinstance(payload.get("error"), dict):
            raise RuntimeError(str(payload["error"].get("message") or "MCP tool call failed"))
        result = payload.get("result")
        if not isinstance(result, dict):
            return json.dumps(result, ensure_ascii=False)
        content = result.get("content")
        if isinstance(content, list):
            texts = [
                str(item.get("text"))
                for item in content
                if isinstance(item, dict) and item.get("type") == "text" and item.get("text") is not None
            ]
            if texts:
                return "\n".join(texts)
        return json.dumps(result, ensure_ascii=False, indent=2)


def install_mcp_tools(
    registry: ToolRegistry,
    servers: list[dict[str, Any]],
    enabled_tool_ids: set[str],
) -> None:
    for server in servers:
        server_id = str(server.get("id") or "")
        tools = server.get("tools")
        if not server_id or not isinstance(tools, list):
            continue
        for spec in tools:
            if not isinstance(spec, dict) or not spec.get("name"):
                continue
            tool_id = f"mcp:{server_id}:{spec['name']}"
            if tool_id in enabled_tool_ids:
                registry.register(McpTool(server, spec))


def _response_json(response: httpx.Response) -> dict[str, Any]:
    if "text/event-stream" in response.headers.get("content-type", ""):
        for line in response.text.splitlines():
            if line.startswith("data:"):
                value = json.loads(line[5:].strip())
                if isinstance(value, dict):
                    return value
        raise RuntimeError("MCP server returned an empty event stream")
    value = response.json()
    if not isinstance(value, dict):
        raise RuntimeError("MCP server returned an invalid response")
    return value


def _safe_name(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_]", "_", value).strip("_")
    if not normalized:
        return "mcp"
    return f"mcp_{normalized}" if normalized[0].isdigit() else normalized
