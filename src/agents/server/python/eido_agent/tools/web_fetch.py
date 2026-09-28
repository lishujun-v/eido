from __future__ import annotations
import asyncio
import ipaddress
import socket
from typing import Any
from urllib.parse import urlparse
import httpx
from .base import Tool
from .authorization import require_approval_for_network_action, requires_network_approval
from .context import ToolContext


class WebFetchTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self):
        return "web_fetch"

    @property
    def description(self):
        return "Fetch text from an HTTP(S) URL. Requests resolving to private or reserved networks require explicit approval."

    @property
    def parameters(self):
        return {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any):
        url = str(kwargs["url"])
        await self._authorize_url(url, kwargs)
        return await self._fetch_text(url)

    async def preflight(self, **kwargs: Any) -> None:
        await self._authorize_url(str(kwargs["url"]), kwargs)

    async def _authorize_url(self, url: str, arguments: dict[str, Any]) -> None:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("Only public HTTP(S) URLs are allowed")
        # Async DNS with a hard timeout: a synchronous getaddrinfo here would
        # block the whole asyncio event loop (and with it every running Graph
        # node and SSE stream) when the resolver is slow or unreachable.
        try:
            loop = asyncio.get_running_loop()
            infos = await asyncio.wait_for(
                loop.getaddrinfo(
                    parsed.hostname,
                    parsed.port or (443 if parsed.scheme == "https" else 80),
                    type=socket.SOCK_STREAM,
                ),
                timeout=5,
            )
        except asyncio.TimeoutError:
            raise ValueError(f"DNS resolution timed out for {parsed.hostname}") from None
        resolved_addresses = [ipaddress.ip_address(item[4][0]) for item in infos]
        reasons = [reason for reason in [requires_network_approval(self.context, parsed.hostname)] if reason]
        private_addresses = [address for address in resolved_addresses if not address.is_global]
        if private_addresses:
            reasons.append(
                "该 URL 解析到了私有或保留网络地址"
                f"（{', '.join(str(address) for address in private_addresses)}）；访问可能触及内网服务：{url}"
            )
        if reasons:
            require_approval_for_network_action(
                self.context, self.name, arguments, reason="；".join(reasons),
            )

    async def _fetch_text(self, url: str) -> str:
        # Redirects are deliberately not followed: every redirect target would
        # otherwise need a fresh DNS/private-network validation (SSRF).
        async with httpx.AsyncClient(follow_redirects=False, timeout=20) as client:
            response = await client.get(url, headers={"User-Agent": "EidoAgent/1.0"})
            response.raise_for_status()
            return response.text[:50000]
