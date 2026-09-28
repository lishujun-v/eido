import json
import unittest
from pathlib import Path
from types import SimpleNamespace

from eido_agent.models import AgentProfile, SessionRecord
from eido_agent.tools.context import ToolContext
from eido_agent.tools.plan_tool import PLAN_METADATA_KEY, PlanTool
from eido_agent.tools.registry import ToolRegistry
from eido_agent.tools.builtins import install_builtin_tools


class Store:
    def __init__(self) -> None:
        self.saved = []

    def save_session(self, session: SessionRecord) -> None:
        self.saved.append(session)


class PlanToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_plan_tool_creates_and_updates_session_plan(self) -> None:
        session = SessionRecord(id="s1", agent_id="a1")
        store = Store()
        tool = PlanTool(ToolContext(SimpleNamespace(store=store), AgentProfile(id="a1", name="Agent"), Path("/tmp"), session))

        created = json.loads(await tool.execute(
            action="create", goal="完成测试", steps=[{"id": "inspect", "title": "检查", "status": "in_progress"}]
        ))
        self.assertEqual(created["goal"], "完成测试")
        self.assertEqual(session.metadata[PLAN_METADATA_KEY]["steps"][0]["status"], "in_progress")

        updated = json.loads(await tool.execute(
            action="update", steps=[{"id": "inspect", "title": "检查", "status": "completed"}], reason="检查完成"
        ))
        self.assertEqual(updated["steps"][0]["status"], "completed")
        self.assertEqual(updated["reason"], "检查完成")
        self.assertEqual(len(store.saved), 2)

    def test_plan_tool_is_not_registered(self) -> None:
        profile = AgentProfile(id="a1", name="Agent")
        runtime = SimpleNamespace(store=Store())
        normal = ToolRegistry()
        planning = ToolRegistry()
        install_builtin_tools(normal, runtime, profile, Path("/tmp"))
        install_builtin_tools(planning, runtime, profile, Path("/tmp"))

        self.assertNotIn("plan", normal.tool_names)
        self.assertNotIn("plan", planning.tool_names)
