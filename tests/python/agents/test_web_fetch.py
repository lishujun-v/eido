from __future__ import annotations

import asyncio
import unittest
from pathlib import Path
import tempfile
from unittest.mock import AsyncMock, patch

from eido_agent.config import AgentConfig
from eido_agent.interactions import create_interaction, respond_to_interaction
from eido_agent.models import AgentProfile
from eido_agent.runtime import AgentRuntime
from eido_agent.tools.context import ToolContext
from eido_agent.tools.web_fetch import WebFetchTool


class WebFetchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.runtime = AgentRuntime(AgentConfig(data_dir=Path(self.directory.name) / "data"))
        self.profile = AgentProfile(id="siinx", name="SiinX", owner_user_id="owner")
        self.runtime.create_agent(self.profile)
        self.session = self.runtime.store.get_or_create_session("session", self.profile.id, visitor_id="owner")
        self.workspace = self.runtime._prepare_workspace(self.profile)

    def tearDown(self) -> None:
        self.directory.cleanup()

    def test_blocks_private_network_addresses(self) -> None:
        async def scenario():
            tool = WebFetchTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
            for url in (
                "http://127.0.0.1:8000/admin",
                "http://10.0.0.1/secret",
                "http://192.168.1.1/",
                "http://169.254.169.254/latest/meta-data",
            ):
                with self.assertRaises(PermissionError, msg=url):
                    await tool.execute(url=url)

        asyncio.run(scenario())

    async def test_approved_private_network_url_can_run_once(self) -> None:
        arguments = {"url": "http://127.0.0.1:8000/status"}
        tool = WebFetchTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
        interaction = create_interaction(
            runtime=self.runtime, session=self.session, agent_id=self.profile.id,
            kind="approval", prompt="访问本机服务？", action="web_fetch", action_arguments=arguments,
        )
        respond_to_interaction(
            runtime=self.runtime, session=self.session, interaction_id=interaction.id,
            response="允许", responder_id="owner",
        )
        with patch.object(tool, "_fetch_text", new=AsyncMock(return_value="ok")):
            self.assertEqual(await tool.execute(**arguments), "ok")
        with self.assertRaises(PermissionError):
            await tool.execute(**arguments)

    def test_rejects_non_http_schemes(self) -> None:
        async def scenario():
            tool = WebFetchTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
            with self.assertRaises(ValueError):
                await tool.execute(url="file:///etc/passwd")

        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
