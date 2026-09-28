#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
learning_plan.py — make_plan action 实现。

D4 任务:基于学习目标 + 论文清单生成周/天粒度学习路径。

输入: goal, papers (read_paper 结果列表), weeks, hours_per_day
输出: { "phases": [...], "daily_tasks": [...], "resources": [...] }

phase: 一周一个主题
daily_task: 一天一个具体任务(读章节/跑代码/复习卡片)
resources: 推荐资源(论文/教程/博客)
"""
from __future__ import annotations

import logging
from typing import Any

from llm_client import get_default_client, parse_llm_json

log = logging.getLogger(__name__)


PLAN_SYSTEM = """你是学习路径规划助手。基于用户给的学习目标和可用论文,生成分阶段(周/天)学习路径。
要求:
1. 按主题相关性分周:每周一个核心主题。
2. 每天 1-2 个具体任务,每个任务标注预计时长(小时)。
3. 资源推荐分两类:主论文(用户已有)和扩展资源(可推荐经典论文/教程/博客)。
4. 输出 JSON,不要夹杂其他文字。"""

PLAN_USER_TEMPLATE = """学习目标:{goal}
可用周数:{weeks} 周
每天学习时长:{hours_per_day} 小时
已读/可用论文:{paper_count} 篇

【论文主题摘要】
{paper_themes}

【输出 JSON 格式】
{{
  "phases": [
    {{"week": 1, "theme": "...", "objectives": ["..."], "tasks": ["..."]}}
  ],
  "daily_tasks": [
    {{"week": 1, "day": 1, "task": "...", "hours": 1.5, "paper_ref": "paper_id 或 null"}}
  ],
  "resources": [
    {{"type": "paper", "title": "...", "ref": "paper_id"}},
    {{"type": "tutorial", "title": "...", "url": "..."}}
  ]
}}"""


def make_plan(
    goal: str,
    papers: list[dict[str, Any]] | None = None,
    weeks: int = 4,
    hours_per_day: float = 1.5,
    *,
    llm_client=None,
) -> dict[str, Any]:
    """
    生成学习路径。

    Args:
        goal: 学习目标(尽量具体,如 "掌握 Transformer 注意力机制")
        papers: 已读/可用论文的 read_paper 输出列表
        weeks: 计划总周数,默认 4
        hours_per_day: 每天学习时长,默认 1.5 小时
        llm_client: 自定义 LLM 客户端

    Returns:
        dict 含 phases / daily_tasks / resources / _meta
    """
    papers = papers or []
    client = llm_client or get_default_client()
    log.info(
        "make_plan: goal=%r papers=%d weeks=%d hours=%.1f",
        goal, len(papers), weeks, hours_per_day,
    )

    paper_themes = "\n".join([
        f"- [{p.get('paper_id', '?')}] {p.get('summary', '')[:200]}"
        for p in papers[:10]
    ]) or "(无可用论文)"

    user_prompt = PLAN_USER_TEMPLATE.format(
        goal=goal,
        weeks=weeks,
        hours_per_day=hours_per_day,
        paper_count=len(papers),
        paper_themes=paper_themes,
    )

    warnings: list[str] = []
    try:
        raw = client.chat(
            system=PLAN_SYSTEM,
            user=user_prompt,
            temperature=0.4,
            max_tokens=3000,
        )
        data = parse_llm_json(raw)
    except Exception as e:
        log.warning("make_plan: LLM 生成失败(%s),返回启发式 fallback", e)
        warnings.append(f"LLM 生成失败: {e}")
        data = _heuristic_plan(goal, papers, weeks, hours_per_day)

    return {
        "goal": goal,
        "phases": data.get("phases", []),
        "daily_tasks": data.get("daily_tasks", []),
        "resources": data.get("resources", []),
        "_meta": {
            "version": "0.4.0-D4",
            "weeks": weeks,
            "hours_per_day": hours_per_day,
            "paper_count": len(papers),
            "llm_client": client.name,
        },
        "_warnings": warnings,
    }


def _heuristic_plan(
    goal: str,
    papers: list[dict[str, Any]],
    weeks: int,
    hours_per_day: float,
) -> dict[str, Any]:
    """LLM 失败时的兜底:按周均分任务,每天读一段。"""
    phases = []
    daily_tasks = []
    for w in range(1, weeks + 1):
        theme = f"第 {w} 周:深入 {goal} 的第 {w} 个核心方面"
        phases.append({
            "week": w,
            "theme": theme,
            "objectives": [f"理解方面 {w}", f"完成相关练习 {w}"],
            "tasks": [f"读论文 {w}", f"做笔记 {w}"],
        })
        for d in range(1, 8):  # 每周 7 天
            daily_tasks.append({
                "week": w,
                "day": d,
                "task": f"[启发式] 第 {w} 周第 {d} 天:学习 '{theme}' 的子主题",
                "hours": hours_per_day,
                "paper_ref": papers[w % max(len(papers), 1)]["paper_id"] if papers else None,
            })
    return {
        "phases": phases,
        "daily_tasks": daily_tasks,
        "resources": [],
    }