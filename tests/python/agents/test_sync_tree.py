from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from eido_agent.runtime import _sync_tree


class SyncTreeTests(unittest.TestCase):
    def test_identical_files_are_not_rewritten(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "src"
            destination = Path(tmp) / "dst"
            (source / "scripts").mkdir(parents=True)
            (source / "scripts" / "tool.py").write_text("print('hi')\n", encoding="utf-8")
            (source / "SKILL.md").write_text("# Skill\n", encoding="utf-8")

            _sync_tree(source, destination)

            dest_script = destination / "scripts" / "tool.py"
            dest_skill = destination / "SKILL.md"
            self.assertTrue(dest_script.is_file())
            self.assertTrue(dest_skill.is_file())

            before = {
                dest_script: dest_script.stat().st_ctime_ns,
                dest_skill: dest_skill.stat().st_ctime_ns,
            }
            _sync_tree(source, destination)
            # No write should have happened: ctime is unchanged even though
            # copy2-style syncs preserve mtime.
            self.assertEqual(dest_script.stat().st_ctime_ns, before[dest_script])
            self.assertEqual(dest_skill.stat().st_ctime_ns, before[dest_skill])

    def test_changed_and_new_files_are_synced(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "src"
            destination = Path(tmp) / "dst"
            (source / "scripts").mkdir(parents=True)
            (source / "scripts" / "tool.py").write_text("print('hi')\n", encoding="utf-8")
            (source / "extra.txt").write_text("extra\n", encoding="utf-8")

            _sync_tree(source, destination)
            dest_script = destination / "scripts" / "tool.py"
            dest_script.write_text("print('changed')\n", encoding="utf-8")

            _sync_tree(source, destination)

            self.assertEqual(dest_script.read_text(encoding="utf-8"), "print('hi')\n")
            self.assertEqual(
                (destination / "extra.txt").read_text(encoding="utf-8"), "extra\n"
            )
