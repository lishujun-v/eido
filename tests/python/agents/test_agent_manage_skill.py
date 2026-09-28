from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from eido_agent.config import AgentConfig
from eido_agent.models import AgentProfile
from eido_agent.runtime import AgentRuntime


class AgentManageSkillTests(unittest.TestCase):
    def test_skill_is_copied_to_the_siinx_isolated_cache(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = AgentRuntime(
                AgentConfig(data_dir=root / "data", skills_dir=Path("database/agents/skills"))
            )
            siin_x = AgentProfile(
                id="siinx-1", name="SiinX", owner_user_id="user-1",
                agent_type="siinx", interaction_mode="conversation", is_default=True,
                system_managed=True, workspace_dir=str(root / "workspace"),
                enabled_skill_ids=["agent-manage"],
            )

            skills = runtime._skills_for(siin_x).list()

            self.assertEqual([skill["name"] for skill in skills], ["agent-manage"])
            self.assertTrue(
                (root / "runtime" / "workspace" / ".eido" / "agent-skills" / "siinx-1" / "skills" / "agent-manage" / "scripts" / "agent.py").is_file()
            )


if __name__ == "__main__":
    unittest.main()
