from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from eido_agent.config import AgentConfig
from eido_agent.interactions import create_interaction, respond_to_interaction
from eido_agent.models import AgentProfile, SessionRecord
from eido_agent.runtime import AgentRuntime
from eido_agent.tools.context import ToolContext
from eido_agent.tools.exec import ExecTool
from eido_agent.tools.knowledge_search import KnowledgeSearchTool
from eido_agent.tools.read_file import ReadFileTool
from eido_agent.tools.write_file import WriteFileTool


class InteractionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.runtime = AgentRuntime(AgentConfig(data_dir=Path(self.directory.name) / "data"))
        self.profile = AgentProfile(
            id="siinx", name="SiinX", owner_user_id="owner",
            agent_type="siinx", interaction_mode="conversation",
            is_default=True, system_managed=True,
        )
        self.runtime.create_agent(self.profile)
        self.session = self.runtime.store.get_or_create_session("session", self.profile.id, visitor_id="owner")
        self.workspace = self.runtime._prepare_workspace(self.profile)

    def tearDown(self) -> None:
        self.directory.cleanup()

    async def test_workspace_write_does_not_need_approval(self) -> None:
        tool = WriteFileTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
        arguments = {"path": "note.txt", "content": "approved"}
        self.assertIn("Wrote", await tool.execute(**arguments))
        self.assertEqual((self.workspace / "note.txt").read_text(), "approved")

    async def test_external_write_requires_exact_approved_arguments_and_consumes_approval(self) -> None:
        tool = WriteFileTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
        target = Path(self.directory.name) / "outside.txt"
        arguments = {"path": str(target), "content": "approved"}
        with self.assertRaises(PermissionError):
            await tool.execute(**arguments)

        interaction = create_interaction(
            runtime=self.runtime, session=self.session, agent_id=self.profile.id,
            kind="approval", prompt="写入 note.txt？", action="write_file",
            action_arguments=arguments,
        )
        respond_to_interaction(
            runtime=self.runtime, session=self.session, interaction_id=interaction.id,
            response="确认", responder_id="owner",
        )
        self.assertIn("Wrote", await tool.execute(**arguments))
        self.assertEqual(target.read_text(), "approved")
        with self.assertRaises(PermissionError):
            await tool.execute(**arguments)

    async def test_sensitive_workspace_write_requires_approval(self) -> None:
        tool = WriteFileTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
        arguments = {"path": ".env", "content": "TOKEN=updated"}
        with self.assertRaises(PermissionError):
            await tool.execute(**arguments)

    async def test_external_read_requires_approval_and_then_runs(self) -> None:
        target = Path(self.directory.name) / "outside.txt"
        target.write_text("private context", encoding="utf-8")
        self.session.metadata["permission_mode"] = "manual"
        self.runtime.store.save_session(self.session)
        tool = ReadFileTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
        arguments = {"path": str(target)}
        with self.assertRaises(PermissionError):
            await tool.execute(**arguments)
        interaction = create_interaction(
            runtime=self.runtime, session=self.session, agent_id=self.profile.id,
            kind="approval", prompt="读取外部文件？", action="read_file",
            action_arguments=arguments,
        )
        respond_to_interaction(
            runtime=self.runtime, session=self.session, interaction_id=interaction.id,
            response="确认", responder_id="owner",
        )
        self.assertEqual(await tool.execute(**arguments), "private context")

    async def test_smart_mode_allows_external_reads_but_gates_writes(self) -> None:
        target = Path(self.directory.name) / "outside.txt"
        target.write_text("readable", encoding="utf-8")
        reader = ReadFileTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
        writer = WriteFileTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
        self.assertEqual(await reader.execute(path=str(target)), "readable")
        with self.assertRaises(PermissionError):
            await writer.execute(path=str(target), content="changed")

    async def test_auto_mode_skips_approval_but_never_allows_dangerous_commands(self) -> None:
        self.session.metadata["permission_mode"] = "auto"
        self.runtime.store.save_session(self.session)
        target = Path(self.directory.name) / "outside.txt"
        writer = WriteFileTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
        self.assertIn("Wrote", await writer.execute(path=str(target), content="allowed"))
        command = ExecTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
        with self.assertRaisesRegex(ValueError, "safety policy"):
            await command.execute(command="rm -rf /")
        with self.assertRaisesRegex(ValueError, "safety policy"):
            await command.execute(command="dd if=/dev/zero of=/dev/sda bs=1M")

    async def test_safe_workspace_command_does_not_need_approval_but_sensitive_command_does(self) -> None:
        tool = ExecTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))
        self.assertIn("exit_code=0", await tool.execute(command="pwd"))
        identity = await tool.execute(command="python -c 'import os; print(os.environ.get(\"EIDO_USER_ID\"))'")
        self.assertIn("owner", identity)
        arguments = {"command": "git commit -m test"}
        with self.assertRaises(PermissionError):
            await tool.execute(**arguments)

    async def test_knowledge_search_description_lists_only_bound_spaces(self) -> None:
        spaces = {
            "ai": {
                "id": "ai", "ownerUserId": "owner", "name": "AI 知识",
                "domain": "人工智能", "agentIds": ["siinx"], "nodes": [{"id": "llm"}],
            },
            "pets": {
                "id": "pets", "ownerUserId": "owner", "name": "宠物知识",
                "domain": "宠物", "agentIds": [], "nodes": [{"id": "cat"}],
            },
            "other-owner": {
                "id": "other-owner", "ownerUserId": "another-owner", "name": "其他空间",
                "domain": "其他", "agentIds": ["siinx"], "nodes": [],
            },
        }
        (self.runtime.config.data_dir / "knowledge_spaces.json").write_text(
            json.dumps(spaces, ensure_ascii=False), encoding="utf-8"
        )
        tool = KnowledgeSearchTool(ToolContext(self.runtime, self.profile, self.workspace, self.session))

        self.assertIn("AI 知识（领域：人工智能，1 个节点）", tool.description)
        self.assertNotIn("宠物知识", tool.description)
        self.assertNotIn("其他空间", tool.description)

    async def test_clarification_is_persisted_and_can_be_answered_once(self) -> None:
        interaction = create_interaction(
            runtime=self.runtime, session=self.session, agent_id=self.profile.id,
            kind="clarification", prompt="请选择格式", options=["Markdown", "PDF"],
        )
        self.assertEqual(self.runtime.store.find_pending_interaction(self.session.id).id, interaction.id)
        handled = respond_to_interaction(
            runtime=self.runtime, session=self.session, interaction_id=interaction.id,
            response="Markdown", responder_id="owner",
        )
        self.assertEqual(handled.status, "answered")
        self.assertEqual(handled.response, "Markdown")
        self.assertIsNone(self.runtime.store.find_pending_interaction(self.session.id))
        with self.assertRaises(ValueError):
            respond_to_interaction(
                runtime=self.runtime, session=self.session, interaction_id=interaction.id,
                response="PDF", responder_id="owner",
            )

    async def test_runtime_response_wakes_the_existing_interaction_waiter(self) -> None:
        interaction = create_interaction(
            runtime=self.runtime, session=self.session, agent_id=self.profile.id,
            kind="approval", prompt="执行外部操作？", action="exec",
            action_arguments={"command": "curl https://example.com"},
        )
        waiting = asyncio.create_task(self.runtime.interactions.wait(interaction))
        await asyncio.sleep(0)
        self.assertFalse(waiting.done())

        response = self.runtime.respond_to_interaction(
            session_id=self.session.id,
            interaction_id=interaction.id,
            response="允许",
            responder_id="owner",
        )
        resolved = await asyncio.wait_for(waiting, timeout=1)

        self.assertEqual(response["interaction"]["status"], "approved")
        self.assertEqual(resolved.status, "approved")


if __name__ == "__main__":
    unittest.main()
