"""Discover equipped Eido skills and render their instructions for the prompt."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any


class SkillCatalog:
    def __init__(self, root: Path):
        self.root = root

    def list(self) -> list[dict[str, Any]]:
        entries = []
        for path in sorted(self.root.glob("*/SKILL.md")):
            text = path.read_text(encoding="utf-8")
            match = re.search(r"^description:\s*[\"']?(.*?)[\"']?\s*$", text, re.MULTILINE)
            entries.append({
                "name": path.parent.name,
                "description": match.group(1) if match else path.parent.name,
                "path": str(path),
                "source": "eido",
                "available": True,
            })
        return entries

    def summary(self) -> str:
        sections = []
        for item in self.list():
            text = Path(item["path"]).read_text(encoding="utf-8")
            body = re.sub(r"\A---\s*\r?\n[\s\S]*?\r?\n---\s*", "", text, count=1).strip()
            sections.append(
                f"## Skill: {item['name']}\n\n"
                f"Description: {item['description']}\n\n{body}"
            )
        return "\n\n---\n\n".join(sections)
