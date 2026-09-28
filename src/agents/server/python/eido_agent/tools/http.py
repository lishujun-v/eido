"""User-configured HTTP tools."""

from __future__ import annotations

import json
from typing import Any

import httpx

from .base import Tool


class HttpTool(Tool):
    def __init__(self, config: dict[str, Any]):
        self.config = config

    @property
    def name(self) -> str:
        return str(self.config["name"])

    @property
    def description(self) -> str:
        return str(self.config["description"])

    @property
    def parameters(self) -> dict[str, Any]:
        return self.config["parameters"]

    async def execute(self, **kwargs: Any) -> str:
        endpoint = str(self.config["endpoint"])
        method = str(self.config.get("method", "POST")).upper()
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await (
                client.get(endpoint, params=kwargs)
                if method == "GET"
                else client.post(endpoint, json=kwargs)
            )
            response.raise_for_status()
            if "application/json" in response.headers.get("content-type", ""):
                return json.dumps(response.json(), ensure_ascii=False, indent=2)
            return response.text[:12000]


def build_http_tool(config: dict[str, Any]) -> HttpTool | None:
    required = ("name", "description", "endpoint", "parameters")
    if not all(config.get(key) for key in required) or not isinstance(
        config.get("parameters"), dict
    ):
        return None
    return HttpTool(config)
