"""Architecture checks for the canonical Agent Python package."""

from __future__ import annotations

import unittest
from pathlib import Path

import eido_agent.server


class AgentPackageLayoutTests(unittest.TestCase):
    def test_test_bootstrap_loads_canonical_server(self) -> None:
        project_root = Path(__file__).resolve().parents[3]
        canonical_root = (
            project_root / "src" / "agents" / "server" / "python" / "eido_agent"
        ).resolve()
        loaded_server = Path(eido_agent.server.__file__).resolve()

        self.assertTrue(loaded_server.is_relative_to(canonical_root))
        self.assertEqual(loaded_server, canonical_root / "server.py")

    def test_legacy_root_package_is_removed(self) -> None:
        project_root = Path(__file__).resolve().parents[3]
        self.assertFalse((project_root / "agents").exists())


if __name__ == "__main__":
    unittest.main()
