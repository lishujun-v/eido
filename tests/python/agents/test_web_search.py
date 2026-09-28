from __future__ import annotations

import os
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from eido_agent.config import AgentConfig
from eido_agent.models import AgentProfile
from eido_agent.runtime import AgentRuntime
from eido_agent.tools.context import ToolContext
from eido_agent.tools.web_search import WebSearchTool


class WebSearchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.runtime = AgentRuntime(AgentConfig(data_dir=Path(self.directory.name) / "data"))
        self.profile = AgentProfile(id="agent", name="Agent", owner_user_id="owner")
        self.runtime.create_agent(self.profile)
        session = self.runtime.store.get_or_create_session("session", self.profile.id, visitor_id="owner")
        self.tool = WebSearchTool(ToolContext(self.runtime, self.profile, self.runtime._prepare_workspace(self.profile), session))

    def tearDown(self) -> None:
        self.directory.cleanup()

    async def test_returns_baidu_references_and_builds_filters(self) -> None:
        request = httpx.Request("POST", "https://qianfan.baidubce.com/v2/ai_search/web_search")
        response = httpx.Response(200, json={"references": [{
            "title": "Eido", "url": "https://example.com", "content": "Search result", "website": "Example",
        }]}, request=request)
        received: list[httpx.Request] = []

        def handler(incoming: httpx.Request) -> httpx.Response:
            received.append(incoming)
            return response

        transport = httpx.MockTransport(handler)

        with patch.dict(os.environ, {"BAIDU_SEARCH_API_KEY": "test-key"}, clear=False), patch(
            "eido_agent.tools.web_search.httpx.AsyncClient",
            return_value=httpx.AsyncClient(transport=transport),
        ):
            result = await self.tool.execute(query="Eido", max_results=3, sites=["example.com"], recency="week")

        self.assertIn("Eido", result)
        self.assertIn("https://example.com", result)
        self.assertEqual(received[0].headers["X-Appbuilder-Authorization"], "Bearer test-key")
        payload = json.loads(received[0].content)
        self.assertEqual(payload["search_filter"], {"match": {"site": ["example.com"]}})
        self.assertEqual(payload["search_recency_filter"], "week")

    async def test_explains_when_no_credential_is_configured(self) -> None:
        with patch.dict(os.environ, {}, clear=True), patch(
            "eido_agent.tools.web_search._LEGACY_SKILL_CONFIG", Path("/not-found"),
        ):
            result = await self.tool.execute(query="Eido")
        self.assertIn("BAIDU_SEARCH_API_KEY", result)
