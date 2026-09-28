from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[3] / "database/agents/skills/html-animation/scripts/assemble.py"
SPEC = importlib.util.spec_from_file_location("html_animation_assemble", SCRIPT)
assert SPEC and SPEC.loader
ASSEMBLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ASSEMBLER)


class HtmlAnimationAssemblyTests(unittest.TestCase):
    def test_assembles_fragments_and_validates_audio(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            template = root / "template.html"
            template.write_text("<script>window.SCENES_DATA = SCENES_DATA_PLACEHOLDER;</script>", encoding="utf-8")
            scenes = root / "scenes"
            scenes.mkdir()
            (scenes / "intro.html").write_text("<div data-scene='intro'>Hi</div>", encoding="utf-8")
            audio = root / "audio"
            audio.mkdir()
            (audio / "scene-0.wav").write_bytes(b"RIFF")
            scenes_json = root / "scenes.json"
            scenes_json.write_text(json.dumps([{
                "id": "intro", "narration": "Hi", "audio": "audio/scene-0.wav",
                "duration": 1000, "transition": "fade", "content_file": "scenes/intro.html",
            }]), encoding="utf-8")
            output = root / "index.html"

            ASSEMBLER.assemble(template, scenes_json, output, verify=True)

            rendered = output.read_text(encoding="utf-8")
            self.assertNotIn(ASSEMBLER.SCENES_ASSIGNMENT, rendered)
            self.assertIn("data-scene='intro'", rendered)

    def test_rejects_missing_audio_when_verifying(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            template = root / "template.html"
            template.write_text("window.SCENES_DATA = SCENES_DATA_PLACEHOLDER;", encoding="utf-8")
            (root / "intro.html").write_text("<div>Hi</div>", encoding="utf-8")
            scenes_json = root / "scenes.json"
            scenes_json.write_text(json.dumps([{
                "id": "intro", "narration": "Hi", "audio": "audio/missing.wav",
                "duration": 1000, "transition": "fade", "content_file": "intro.html",
            }]), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "Missing audio"):
                ASSEMBLER.assemble(template, scenes_json, root / "index.html", verify=True)
