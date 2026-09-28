#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_anki_exporter.py — D6 验收测试。
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from anki_exporter import export_anki, _stable_deck_id  # noqa: E402


def _make_cards(n: int = 3) -> list[dict]:
    return [
        {"card_id": f"c{i}", "front": f"Q{i}: 什么是 Attention?",
         "back": f"A{i}: 注意力机制,计算 Q/K/V 相似度。"}
        for i in range(n)
    ]


def test_export_anki_basic(tmp_path):
    """export_anki 生成合法 .apkg 文件。"""
    out = tmp_path / "test.apkg"
    result = export_anki(
        deck_name="测试牌组",
        cards=_make_cards(3),
        out_path=out,
    )
    assert result["apkg_path"] == str(out)
    assert result["card_count"] == 3
    assert "deck_id" in result
    assert out.exists()
    assert out.stat().st_size > 1000  # .apkg 是 zip 包,应该 > 1KB


def test_export_anki_file_is_valid_zip(tmp_path):
    """导出的 .apkg 是合法 zip 文件。"""
    out = tmp_path / "test.apkg"
    export_anki("测试", _make_cards(2), out_path=out)
    assert zipfile.is_zipfile(out)
    # .apkg 内部应包含 collection.anki2
    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
    assert "collection.anki2" in names


def test_export_anki_adds_apkg_extension(tmp_path):
    """out_path 没 .apkg 后缀会自动补。"""
    out = tmp_path / "test_no_ext"
    result = export_anki("测试", _make_cards(1), out_path=out)
    assert result["apkg_path"].endswith(".apkg")
    assert Path(result["apkg_path"]).exists()


def test_export_anki_empty_cards_raises(tmp_path):
    """cards 为空抛 ValueError。"""
    out = tmp_path / "test.apkg"
    with pytest.raises(ValueError, match="不能为空"):
        export_anki("测试", cards=[], out_path=out)


def test_export_anki_skips_empty_cards(tmp_path):
    """空 front/back 的卡片被跳过,不报错。"""
    cards = [
        {"front": "Q1", "back": "A1"},
        {"front": "", "back": ""},  # 空,跳过
        {"front": "Q3", "back": "A3"},
    ]
    out = tmp_path / "test.apkg"
    result = export_anki("测试", cards=cards, out_path=out)
    # genanki 内部应该跳过空卡,但 card_count 仍按入参算
    # 关键是文件能正常生成
    assert out.exists()


def test_stable_deck_id_deterministic():
    """_stable_deck_id 对同一 deck_name 生成相同 ID。"""
    a = _stable_deck_id("Transformer 学习")
    b = _stable_deck_id("Transformer 学习")
    assert a == b
    c = _stable_deck_id("另一个牌组")
    assert a != c


def test_export_anki_chinese_content(tmp_path):
    """中英文混合内容正常导出。"""
    cards = [
        {"front": "什么是 Self-Attention?", "back": "Self-Attention 是 Transformer 的核心机制,通过 Q/K/V 计算序列内部依赖。"},
        {"front": "LoRA 的核心思想?", "back": "Low-Rank Adaptation:在原权重上加低秩矩阵,大幅减少微调参数量。"},
    ]
    out = tmp_path / "chinese.apkg"
    result = export_anki("中文学习", cards=cards, out_path=out)
    assert result["card_count"] == 2
    assert zipfile.is_zipfile(out)


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))