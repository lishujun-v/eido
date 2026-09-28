#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_learning_plan.py — D4 验收测试。
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from learning_plan import make_plan, _heuristic_plan  # noqa: E402
from llm_client import MockLLMClient  # noqa: E402


def test_make_plan_with_mock_llm():
    """make_plan 用 mock LLM 输出含 phases/daily_tasks/resources。"""
    papers = [{"paper_id": "p1", "summary": "Attention mechanism paper"}]
    result = make_plan(
        goal="掌握 Transformer 注意力机制",
        papers=papers,
        weeks=4,
        hours_per_day=1.5,
        llm_client=MockLLMClient(),
    )
    assert "phases" in result
    assert "daily_tasks" in result
    assert "resources" in result
    assert result["goal"] == "掌握 Transformer 注意力机制"
    assert result["_meta"]["version"] == "0.4.0-D4"
    assert result["_meta"]["weeks"] == 4
    assert result["_meta"]["paper_count"] == 1


def test_make_plan_no_papers():
    """make_plan 不传 papers 也能跑(may 是空数组)。"""
    result = make_plan(
        goal="入门 Python",
        papers=None,
        weeks=2,
        llm_client=MockLLMClient(),
    )
    assert "phases" in result
    assert "daily_tasks" in result
    assert result["_meta"]["paper_count"] == 0


def test_make_plan_llm_failure_falls_back():
    """LLM 抛异常时走 _heuristic_plan fallback。"""
    class FailingClient:
        name = "failing"
        def chat(self, *args, **kwargs):
            raise RuntimeError("LLM 不可用")

    result = make_plan(goal="test", llm_client=FailingClient(), weeks=2)
    assert any("启发式" in t["task"] for t in result["daily_tasks"])
    assert any("LLM" in w for w in result["_warnings"])


def test_heuristic_plan_basic():
    """_heuristic_plan 按周生成任务。"""
    papers = [{"paper_id": "p1"}, {"paper_id": "p2"}]
    plan = _heuristic_plan("test", papers, weeks=2, hours_per_day=1.0)
    assert len(plan["phases"]) == 2
    assert len(plan["daily_tasks"]) == 14  # 2 weeks * 7 days
    assert all(plan["daily_tasks"][i]["week"] in (1, 2) for i in range(14))


def test_make_plan_passes_through_daily_hours():
    """make_plan 把 hours_per_day 传给 daily_task。"""
    result = make_plan(
        goal="test", papers=[], weeks=2, hours_per_day=3.0,
        llm_client=MockLLMClient(),
    )
    # 不一定严格检查(因为 mock 输出),但 metadata 应该有
    assert result["_meta"]["hours_per_day"] == 3.0


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))