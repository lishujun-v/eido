#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
anki_exporter.py — export_anki action 实现。

D6 任务:把知识卡片导出为 Anki .apkg 文件。

依赖: genanki
输出: .apkg 文件(可在 Anki Desktop / AnkiDroid 打开)
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Any

from sanitize import safe_anki_text  # noqa: E402  D9' 双层保护

log = logging.getLogger(__name__)


# 稳定的 model_id(避免每次导出生成不同 model)
_MODEL_ID = 1607392319


def _stable_deck_id(deck_name: str) -> int:
    """根据 deck_name 生成稳定的 deck_id(避免重复导入时冲突)。"""
    h = hashlib.sha1(deck_name.encode("utf-8")).hexdigest()
    # 转成 int,限制在 genanki 接受的范围(2^31 - 1)
    return int(h[:8], 16) % (2**31 - 1)


def export_anki(
    deck_name: str,
    cards: list[dict[str, Any]],
    out_path: str | Path,
    *,
    media_files: list[str] | None = None,
) -> dict[str, Any]:
    """
    导出 Anki .apkg 文件。

    Args:
        deck_name: 牌组名(如 "Transformer 论文精读")
        cards: 知识卡片列表,每个 dict 含 front / back(也支持可选 card_id)
        out_path: 输出的 .apkg 文件路径
        media_files: 媒体文件路径列表(图片/音频),可选

    Returns:
        dict 含 apkg_path / card_count / deck_id

    Raises:
        RuntimeError: genanki 未安装
        ValueError: cards 为空
    """
    try:
        import genanki
    except ImportError as e:
        raise RuntimeError(
            "需要 genanki: pip install genanki"
        ) from e

    if not cards:
        raise ValueError("cards 不能为空")

    out_path = Path(out_path)
    if not out_path.suffix == ".apkg":
        out_path = out_path.with_suffix(".apkg")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    deck_id = _stable_deck_id(deck_name)

    deck = genanki.Deck(deck_id, deck_name)
    model = genanki.Model(
        _MODEL_ID,
        "PaperCompanion Basic",
        fields=[
            {"name": "Front"},
            {"name": "Back"},
        ],
        templates=[
            {
                "name": "Card 1",
                "qfmt": "{{Front}}",
                "afmt": '{{FrontSide}}<hr id="answer">{{Back}}',
            }
        ],
        css=".card { font-family: arial; font-size: 20px; text-align: left; color: black; background: white; }",
    )

    for i, c in enumerate(cards):
        # D9' 双层保护:即便 main.py 漏掉净化,export_anki 入口也兜底。
        front = safe_anki_text(c.get("front", ""))
        back = safe_anki_text(c.get("back", ""))
        if not front or not back:
            log.warning("跳过空卡片 index=%d card_id=%s", i, c.get("card_id", ""))
            continue
        note = genanki.Note(
            model=model,
            fields=[front, back],
        )
        deck.add_note(note)

    package = genanki.Package(deck)
    if media_files:
        package.media_files = media_files

    package.write_to_file(str(out_path))
    log.info("export_anki: deck=%s cards=%d → %s", deck_name, len(cards), out_path)

    return {
        "apkg_path": str(out_path),
        "card_count": len(cards),
        "deck_id": deck_id,
        "_meta": {
            "version": "0.6.0-D6",
            "model_id": _MODEL_ID,
        },
    }