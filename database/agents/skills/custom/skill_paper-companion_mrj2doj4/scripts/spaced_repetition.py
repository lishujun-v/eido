#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
spaced_repetition.py — schedule_review action 实现。

D5 任务:基于 SM-2 算法对知识卡片做间隔重复排序。

SM-2 算法参考:
    - 每张卡有 ease_factor(默认 2.5), interval(天), repetitions
    - 用户评分 q ∈ [0,5]:
        q < 3:  重置 repetitions=0, interval=1
        q >= 3: interval 更新规则(1, 6, 然后 round(prev * ease))
    - ease 更新:EF = max(1.3, EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02)))
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

log = logging.getLogger(__name__)


@dataclass
class Card:
    """一张知识卡片。"""
    card_id: str
    front: str
    back: str
    ease_factor: float = 2.5
    interval: int = 0
    repetitions: int = 0
    next_review: str = ""  # ISO 日期
    last_reviewed: str | None = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Card":
        return cls(
            card_id=d.get("card_id", ""),
            front=d.get("front", ""),
            back=d.get("back", ""),
            ease_factor=float(d.get("ease_factor", 2.5)),
            interval=int(d.get("interval", 0)),
            repetitions=int(d.get("repetitions", 0)),
            next_review=d.get("next_review", ""),
            last_reviewed=d.get("last_reviewed"),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def sm2_update(card: Card, q: int, now: datetime | None = None) -> Card:
    """
    根据用户评分 q 更新卡片的 ease/interval/repetitions。

    Args:
        card: 知识卡片
        q: 评分,0-5(0=完全不会,5=完美)
        now: 当前时间(测试用)

    Returns:
        更新后的 card(就地修改,返回引用)
    """
    if not 0 <= q <= 5:
        raise ValueError(f"q 必须在 [0,5],得到 {q}")

    now = now or datetime.now()

    # SM-2 顺序:先更新 ease factor,再用新 EF 算 interval
    # 更新 ease factor(下限 1.3)
    card.ease_factor = max(
        1.3,
        card.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
    )

    if q < 3:
        # 失败:重置
        card.repetitions = 0
        card.interval = 1
    else:
        # 成功:按 SM-2 规则更新 interval
        if card.repetitions == 0:
            card.interval = 1
        elif card.repetitions == 1:
            card.interval = 6
        else:
            card.interval = round(card.interval * card.ease_factor)
        card.repetitions += 1

    card.next_review = (now + timedelta(days=card.interval)).date().isoformat()
    card.last_reviewed = now.isoformat()
    return card


def schedule_review(
    cards: list[dict[str, Any]] | list[Card],
    now: datetime | None = None,
) -> dict[str, Any]:
    """
    排序复习队列,生成复习统计。

    Args:
        cards: 知识卡片列表(dict 或 Card)
        now: 当前时间(测试用)

    Returns:
        dict 含 review_queue / stats
    """
    now = now or datetime.now()
    today = now.date().isoformat()

    # 标准化为 Card
    card_objs: list[Card] = []
    for c in cards:
        if isinstance(c, Card):
            card_objs.append(c)
        else:
            card_objs.append(Card.from_dict(c))

    # 过滤出今日待复习(next_review <= today)
    queue = [c for c in card_objs if not c.next_review or c.next_review <= today]
    queue.sort(key=lambda c: (c.next_review or ""))

    stats = _calc_stats(card_objs, queue, now)

    return {
        "review_queue": [c.to_dict() for c in queue],
        "stats": stats,
        "_meta": {
            "version": "0.5.0-D5",
            "now": now.isoformat(),
        },
    }


def _calc_stats(all_cards: list[Card], queue: list[Card], now: datetime) -> dict[str, Any]:
    """计算复习统计。"""
    total = len(all_cards)
    due = len(queue)
    avg_ease = sum(c.ease_factor for c in all_cards) / total if total else 0.0

    # 按掌握度分组
    mastered = sum(1 for c in all_cards if c.repetitions >= 3 and c.ease_factor >= 2.5)
    learning = sum(1 for c in all_cards if 0 < c.repetitions < 3)
    new_cards = sum(1 for c in all_cards if c.repetitions == 0)

    return {
        "total_cards": total,
        "due_today": due,
        "avg_ease_factor": round(avg_ease, 3),
        "mastered": mastered,
        "learning": learning,
        "new": new_cards,
        "now": now.isoformat(),
    }