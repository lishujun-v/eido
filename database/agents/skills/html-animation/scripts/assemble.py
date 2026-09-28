#!/usr/bin/env python3
"""Assemble HTML-animation scene fragments into the bundled player template."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


PLACEHOLDER = "SCENES_DATA_PLACEHOLDER"
SCENES_ASSIGNMENT = f"window.SCENES_DATA = {PLACEHOLDER};"
REQUIRED_FIELDS = ("id", "narration", "audio", "duration", "transition")


def _load_scenes(path: Path) -> list[dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid scenes JSON: {exc}") from exc
    if not isinstance(value, list) or not value:
        raise ValueError("scenes.json must contain a non-empty JSON array")

    scenes: list[dict[str, Any]] = []
    for index, raw in enumerate(value):
        if not isinstance(raw, dict):
            raise ValueError(f"Scene {index} must be an object")
        missing = [field for field in REQUIRED_FIELDS if not raw.get(field)]
        if missing:
            raise ValueError(f"Scene {index} is missing: {', '.join(missing)}")
        content_file = raw.get("content_file")
        if not isinstance(content_file, str) or not content_file:
            raise ValueError(f"Scene {index} must specify content_file")
        fragment = (path.parent / content_file).resolve()
        try:
            fragment.relative_to(path.parent.resolve())
        except ValueError as exc:
            raise ValueError(f"Scene {index} content_file must stay beside scenes.json") from exc
        if not fragment.is_file():
            raise ValueError(f"Scene {index} fragment does not exist: {content_file}")
        scene = {key: value for key, value in raw.items() if key != "content_file"}
        scene["content"] = fragment.read_text(encoding="utf-8")
        scenes.append(scene)
    return scenes


def assemble(template: Path, scenes_file: Path, output: Path, verify: bool) -> None:
    source = template.read_text(encoding="utf-8")
    # The bundled template documents the marker in a nearby comment, so replace
    # the executable assignment rather than every textual mention of its name.
    if source.count(SCENES_ASSIGNMENT) != 1:
        raise ValueError(f"Template must contain exactly one {SCENES_ASSIGNMENT}")
    scenes = _load_scenes(scenes_file)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        source.replace(SCENES_ASSIGNMENT, f"window.SCENES_DATA = {json.dumps(scenes, ensure_ascii=False)};"),
        encoding="utf-8",
    )
    if not verify:
        return
    rendered = output.read_text(encoding="utf-8")
    if SCENES_ASSIGNMENT in rendered:
        raise ValueError("Output still contains the scene placeholder")
    for scene in scenes:
        audio = output.parent / str(scene["audio"])
        if not audio.is_file():
            raise ValueError(f"Missing audio for scene {scene['id']}: {scene['audio']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--scenes", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    assemble(args.template.resolve(), args.scenes.resolve(), args.output.resolve(), args.verify)
    print(f"Assembled {args.output}")


if __name__ == "__main__":
    main()
