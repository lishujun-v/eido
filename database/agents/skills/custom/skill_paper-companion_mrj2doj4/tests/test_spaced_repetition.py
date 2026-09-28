#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_spaced_repetition.py — D5 验收测试。

重点测 SM-2 算法的正确性(这是核心数学)。
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from spaced_repetition import Card, sm2_update, schedule_review  # noqa: E402


# ============== SM-2 算法正确性 ==============

def test_sm2_q5_first_review():
    """第一次复习 q=5:interval=1, repetitions=1, ease 不变(略增)。"""
    card = Card(card_id="c1", front="F", back="B")
    sm2_update(card, q=5)
    assert card.repetitions == 1
    assert card.interval == 1
    assert card.ease_factor == 2.6  # 2.5 + 0.1
    assert card.next_review != ""


def test_sm2_q5_second_review():
    """第二次复习 q=5:interval=6, repetitions=2。"""
    card = Card(card_id="c1", front="F", back="B")
    sm2_update(card, q=5)
    sm2_update(card, q=5)
    assert card.repetitions == 2
    assert card.interval == 6


def test_sm2_q5_third_review_uses_ease():
    """第三次复习 q=5:interval=round(6 * ease)。"""
    card = Card(card_id="c1", front="F", back="B")
    sm2_update(card, q=5)  # interval=1
    sm2_update(card, q=5)  # interval=6
    sm2_update(card, q=5)  # interval=round(6 * 2.6)=16
    assert card.repetitions == 3
    assert card.interval == round(6 * card.ease_factor)


def test_sm2_q_below_3_resets():
    """q<3 时 repetitions 重置为 0, interval=1。"""
    card = Card(card_id="c1", front="F", back="B")
    sm2_update(card, q=5)  # repetitions=1
    sm2_update(card, q=5)  # repetitions=2
    sm2_update(card, q=2)  # 重置
    assert card.repetitions == 0
    assert card.interval == 1


def test_sm2_ease_factor_floor():
    """ease factor 不低于 1.3。"""
    card = Card(card_id="c1", front="F", back="B", ease_factor=1.3)
    # 给一个非常低的评分,理论上会降低 ease
    sm2_update(card, q=0)
    assert card.ease_factor >= 1.3


def test_sm2_invalid_q_raises():
    """q 超出 [0,5] 抛 ValueError。"""
    card = Card(card_id="c1", front="F", back="B")
    with pytest.raises(ValueError):
        sm2_update(card, q=6)
    with pytest.raises(ValueError):
        sm2_update(card, q=-1)


def test_sm2_next_review_iso_date():
    """next_review 是 ISO 格式日期。"""
    card = Card(card_id="c1", front="F", back="B")
    now = datetime(2026, 7, 11, 12, 0, 0)
    sm2_update(card, q=5, now=now)
    expected = (now + timedelta(days=1)).date().isoformat()
    assert card.next_review == expected


# ============== schedule_review ==============

def _make_card(cid: str, due_date: str) -> dict:
    return {
        "card_id": cid,
        "front": f"Q: {cid}",
        "back": f"A: {cid}",
        "ease_factor": 2.5,
        "interval": 1,
        "repetitions": 0,
        "next_review": due_date,
    }


def test_schedule_review_filters_due_today():
    """只挑出 next_review <= today 的卡。"""
    today = datetime(2026, 7, 11)
    cards = [
        _make_card("due1", "2026-07-10"),  # 昨天到期
        _make_card("due2", "2026-07-11"),  # 今天到期
        _make_card("future", "2026-07-15"),  # 未来
    ]
    result = schedule_review(cards, now=today)
    assert result["stats"]["total_cards"] == 3
    assert result["stats"]["due_today"] == 2
    assert {c["card_id"] for c in result["review_queue"]} == {"due1", "due2"}


def test_schedule_review_no_next_review_is_due():
    """没有 next_review 字段的卡片默认到期(新卡)。"""
    today = datetime(2026, 7, 11)
    cards = [
        {"card_id": "new", "front": "F", "back": "B"},
    ]
    result = schedule_review(cards, now=today)
    assert result["stats"]["due_today"] == 1


def test_schedule_review_stats_groups():
    """stats 把卡片按掌握度分组。"""
    today = datetime(2026, 7, 11)
    cards = [
        {"card_id": "new", "front": "F", "back": "B", "repetitions": 0, "ease_factor": 2.5},
        {"card_id": "learning", "front": "F", "back": "B", "repetitions": 1, "ease_factor": 2.5},
        {"card_id": "mastered", "front": "F", "back": "B", "repetitions": 5, "ease_factor": 2.7, "next_review": "2026-08-01"},
    ]
    result = schedule_review(cards, now=today)
    stats = result["stats"]
    assert stats["new"] == 1
    assert stats["learning"] == 1
    assert stats["mastered"] == 1


def test_schedule_review_empty():
    """空列表返回空队列 + 0 统计。"""
    result = schedule_review([], now=datetime(2026, 7, 11))
    assert result["review_queue"] == []
    assert result["stats"]["total_cards"] == 0
    assert result["stats"]["due_today"] == 0


def test_card_roundtrip():
    """Card → dict → Card 保持一致。"""
    c = Card(card_id="c1", front="F", back="B", ease_factor=2.6, interval=16, repetitions=3)
    d = c.to_dict()
    c2 = Card.from_dict(d)
    assert c2.card_id == c.card_id
    assert c2.ease_factor == c.ease_factor
    assert c2.interval == c.interval
    assert c2.repetitions == c.repetitions


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))