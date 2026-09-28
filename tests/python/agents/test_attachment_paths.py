import tempfile
import unittest
from pathlib import Path

from eido_agent.runtime import _message_with_attachments, _valid_attachment_paths


class AttachmentPathTests(unittest.TestCase):
    def test_accepts_existing_workspace_file_and_adds_path_to_message(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory).resolve()
            attachment = workspace / "report.pdf"
            attachment.write_bytes(b"%PDF")

            paths = _valid_attachment_paths([str(attachment)], workspace)

            self.assertEqual(paths, [attachment])
            self.assertIn(str(attachment), _message_with_attachments("请分析", paths))

    def test_rejects_file_outside_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as directory, tempfile.NamedTemporaryFile() as external:
            with self.assertRaisesRegex(ValueError, "当前工作目录"):
                _valid_attachment_paths([external.name], Path(directory).resolve())
