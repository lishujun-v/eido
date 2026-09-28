from __future__ import annotations

import tempfile
import unittest
from contextlib import chdir
from unittest.mock import patch
from pathlib import Path

from eido_agent.config import AgentConfig
from eido_agent.models import AgentProfile
from eido_agent.runtime import AgentRuntime


class RuntimePathTests(unittest.TestCase):
    def test_environment_paths_are_anchored_to_platform_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as cwd:
            root = Path(directory).resolve()
            with patch.dict("os.environ", {"EIDO_ROOT_DIR": str(root)}, clear=False), chdir(cwd):
                config = AgentConfig.from_env()

            self.assertEqual(config.data_dir, root / "database")
            self.assertEqual(config.skills_dir, root / "database" / "agents" / "skills")

    def test_runtime_defaults_are_grouped_next_to_database(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = AgentConfig(data_dir=root / "database")

            self.assertEqual(config.runtime_dir, (root / "runtime").resolve())
            self.assertEqual(config.resolved_workspace_dir, (root / "runtime" / "workspace").resolve())
            self.assertEqual(config.resolved_graphs_dir, (root / "runtime" / "graphs").resolve())

    def test_legacy_workspace_values_resolve_to_new_runtime_location(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = AgentRuntime(AgentConfig(data_dir=root / "database"))

            logical = AgentProfile(id="logical", name="Logical", workspace_dir="workspace")
            absolute = AgentProfile(
                id="absolute",
                name="Absolute",
                workspace_dir=str(root / "workspace" / "nested"),
            )

            self.assertEqual(runtime._workspace_path(logical), (root / "runtime" / "workspace").resolve())
            self.assertEqual(
                runtime._workspace_path(absolute),
                (root / "runtime" / "workspace" / "nested").resolve(),
            )


if __name__ == "__main__":
    unittest.main()
