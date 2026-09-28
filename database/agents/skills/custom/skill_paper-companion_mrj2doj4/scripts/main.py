#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
main.py — paper-companion CLI 入口。

支持子命令:
    pipeline       一键跑通 read_paper → build_graph → make_plan → schedule_review → export_anki
    read_paper     只跑精读
    build_graph    只跑知识图谱
    make_plan      只跑学习路径
    schedule_review 只跑复习排序
    export_anki    只跑 Anki 导出
    health         健康检查(验证 Skill 骨架可运行)

每个 action 执行前按 interface.yaml + action_preflight.schema.json 走 preflight 校验。
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

# 把 scripts/ 加入路径,允许 module 互相 import
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from preflight import check_action, load_interface, PreflightAbort  # noqa: E402
from llm_client import get_default_client  # noqa: E402
from knowledge_graph import build_graph  # noqa: E402
from learning_plan import make_plan  # noqa: E402
from spaced_repetition import schedule_review  # noqa: E402
from anki_exporter import export_anki  # noqa: E402
from sanitize import safe_markdown_text, safe_anki_text  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("paper-companion")


# ============== 子命令实现 ==============

def cmd_health(args: argparse.Namespace) -> int:
    """健康检查:验证 Skill 骨架可运行、interface.yaml 可解析、所有 action 都注册。"""
    interface = load_interface(SCRIPT_DIR.parent / "interface.yaml")
    log.info("✓ interface.yaml 解析成功")
    log.info("  skill_id = %s", interface["skill_id"])
    log.info("  version  = %s", interface["version"])
    log.info("  actions  = %s", [a["name"] for a in interface["actions"]])
    log.info("✓ preflight 校验框架已加载")
    print(json.dumps({
        "status": "ok",
        "skill_id": interface["skill_id"],
        "version": interface["version"],
        "actions": [a["name"] for a in interface["actions"]],
    }, ensure_ascii=False, indent=2))
    return 0


def cmd_read_paper(args: argparse.Namespace) -> int:
    """只跑 read_paper action。D1 阶段用基础版实现(只解 PDF,不调 LLM)。"""
    from pdf_parser import extract_text, paper_id_from_path
    from paper_reader import read_paper_basic

    inputs = {"pdf_path": args.pdf, "url": args.url, "max_pages": args.max_pages}
    decision = check_action("read_paper", inputs, skip=args.skip_preflight)
    if decision["continuation_decision"]["decision"] == "abort":
        raise PreflightAbort(decision["continuation_decision"]["rationale"])

    if args.pdf:
        result = read_paper_basic(pdf_path=args.pdf, max_pages=args.max_pages)
    elif args.url:
        # D1 阶段 URL 走简化路径,后续 D2 完善
        result = {
            "paper_id": paper_id_from_path(args.url),
            "summary": f"[URL 占位] {args.url} (D2 阶段实装抓取与摘要)",
            "chapters": [],
            "key_sentences": [],
            "contributions": [],
            "methodology": "",
            "experiments": "",
            "page_refs": {},
        }
    else:
        log.error("必须提供 --pdf 或 --url")
        return 2

    _dump_output(result, args.out)
    return 0


def cmd_pipeline(args: argparse.Namespace) -> int:
    """一键跑通 5 个 action:read_paper → build_graph → make_plan → schedule_review → export_anki。

    输入: PDF 或 URL + goal
    输出: out_dir/<paper_id>/ 下生成所有文件
    """
    log.info("pipeline 启动: pdf=%s url=%s goal=%s", args.pdf, args.url, args.goal)

    # Step 1: read_paper
    paper_result = cmd_read_paper_and_return(argparse.Namespace(
        pdf=args.pdf, url=args.url, max_pages=args.max_pages,
        out=None, skip_preflight=args.skip_preflight,
    ))
    if paper_result is None:
        return 1
    paper_id = paper_result["paper_id"]
    log.info("pipeline: ✓ read_paper done, paper_id=%s", paper_id)

    # 准备输出目录
    out_dir = Path(args.out) if args.out else Path("paper_output") / paper_id
    out_dir.mkdir(parents=True, exist_ok=True)

    # Step 2: build_graph
    graph = build_graph(paper_result, llm_client=get_default_client())
    (out_dir / "graph.json").write_text(
        json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    log.info("pipeline: ✓ build_graph done, nodes=%d edges=%d",
             len(graph["nodes"]), len(graph["edges"]))

    # Step 3: make_plan
    plan = make_plan(
        goal=args.goal,
        papers=[paper_result],
        weeks=args.weeks,
        hours_per_day=args.hours_per_day,
        llm_client=get_default_client(),
    )
    (out_dir / "plan.json").write_text(
        json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    log.info("pipeline: ✓ make_plan done, phases=%d daily_tasks=%d",
             len(plan["phases"]), len(plan["daily_tasks"]))

    # Step 4 + 5: 构造卡片 → schedule_review → export_anki
    if not args.no_anki:
        cards = _build_cards_from_paper(paper_result, graph, plan)
        review = schedule_review(cards)
        (out_dir / "review.json").write_text(
            json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8",
        )
        log.info("pipeline: ✓ schedule_review done, due_today=%d",
                 review["stats"]["due_today"])

        apkg_path = out_dir / "cards.apkg"
        apkg_result = export_anki(
            deck_name=f"paper-companion:{paper_id}",
            cards=cards,
            out_path=apkg_path,
        )
        log.info("pipeline: ✓ export_anki done, %d cards → %s",
                 apkg_result["card_count"], apkg_result["apkg_path"])

    # 写 summary.md
    _write_summary_md(out_dir / "summary.md", paper_result, graph, plan)
    # 写 run.log
    _write_run_log(out_dir / "run.log", paper_result, graph, plan)

    log.info("pipeline 完成,所有产物在 %s", out_dir)
    print(json.dumps({
        "status": "ok",
        "paper_id": paper_id,
        "out_dir": str(out_dir),
        "artifacts": sorted(p.name for p in out_dir.iterdir()),
    }, ensure_ascii=False, indent=2))
    return 0


def cmd_read_paper_and_return(args: argparse.Namespace) -> dict | None:
    """cmd_read_paper 的内部版本,返回 dict 而不打 JSON 到 stdout。"""
    from paper_reader import read_paper_basic

    inputs = {"pdf_path": args.pdf, "url": args.url, "max_pages": args.max_pages}
    decision = check_action("read_paper", inputs, skip=args.skip_preflight)
    if decision["continuation_decision"]["decision"] == "abort":
        log.error("preflight 拒绝: %s", decision["continuation_decision"]["rationale"])
        return None

    if args.pdf:
        return read_paper_basic(pdf_path=args.pdf, max_pages=args.max_pages)
    elif args.url:
        return read_paper_basic(url=args.url, llm_client=get_default_client())
    else:
        log.error("必须提供 --pdf 或 --url")
        return None


def cmd_build_graph(args: argparse.Namespace) -> int:
    """从 read_paper 输出构造知识图谱。"""
    from paper_reader import read_paper_basic
    from knowledge_graph import build_graph

    if args.summary_json:
        summary = json.loads(Path(args.summary_json).read_text(encoding="utf-8"))
    else:
        log.error("目前需要 --summary-json(指向 read_paper 输出文件)。也可走 pipeline。")
        return 2

    decision = check_action("build_graph", {"summary": summary}, skip=args.skip_preflight)
    if decision["continuation_decision"]["decision"] == "abort":
        log.error("preflight 拒绝: %s", decision["continuation_decision"]["rationale"])
        return 3

    graph = build_graph(summary, llm_client=get_default_client())
    print(json.dumps(graph, ensure_ascii=False, indent=2))
    return 0


def cmd_make_plan(args: argparse.Namespace) -> int:
    """生成学习路径。"""
    from learning_plan import make_plan

    papers: list[dict] = []
    if args.papers:
        papers_path = Path(args.papers)
        if papers_path.is_dir():
            for f in sorted(papers_path.glob("*.json")):
                papers.append(json.loads(f.read_text(encoding="utf-8")))
        else:
            papers.append(json.loads(papers_path.read_text(encoding="utf-8")))

    decision = check_action(
        "make_plan",
        {"goal": args.goal, "papers": papers, "weeks": args.weeks},
        skip=args.skip_preflight,
    )
    if decision["continuation_decision"]["decision"] == "abort":
        log.error("preflight 拒绝: %s", decision["continuation_decision"]["rationale"])
        return 3

    plan = make_plan(
        goal=args.goal,
        papers=papers,
        weeks=args.weeks,
        hours_per_day=args.hours_per_day,
        llm_client=get_default_client(),
    )
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    return 0


def cmd_schedule_review(args: argparse.Namespace) -> int:
    """对卡片做 SM-2 排序。"""
    from spaced_repetition import schedule_review

    cards_path = Path(args.cards)
    cards_data = json.loads(cards_path.read_text(encoding="utf-8"))
    cards = cards_data if isinstance(cards_data, list) else cards_data.get("cards", [])

    decision = check_action(
        "schedule_review", {"cards": cards}, skip=args.skip_preflight,
    )
    if decision["continuation_decision"]["decision"] == "abort":
        log.error("preflight 拒绝: %s", decision["continuation_decision"]["rationale"])
        return 3

    review = schedule_review(cards)
    print(json.dumps(review, ensure_ascii=False, indent=2))
    return 0


def cmd_export_anki(args: argparse.Namespace) -> int:
    """导出 Anki .apkg。"""
    from anki_exporter import export_anki

    cards_path = Path(args.cards)
    cards_data = json.loads(cards_path.read_text(encoding="utf-8"))
    cards = cards_data if isinstance(cards_data, list) else cards_data.get("cards", [])

    decision = check_action(
        "export_anki",
        {"deck_name": args.deck_name, "cards": cards, "out_path": args.out},
        skip=args.skip_preflight,
    )
    if decision["continuation_decision"]["decision"] == "abort":
        log.error("preflight 拒绝: %s", decision["continuation_decision"]["rationale"])
        return 3

    result = export_anki(deck_name=args.deck_name, cards=cards, out_path=args.out)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def _dump_output(result: dict[str, Any], out_dir: str | None) -> None:
    """把 action 输出写到指定目录,默认 stdout。"""
    if out_dir:
        out_path = Path(out_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        paper_id = result.get("paper_id", "unknown")
        file = out_path / f"{paper_id}_summary.json"
        file.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        log.info("✓ 写入 %s", file)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def _build_cards_from_paper(paper_result: dict, graph: dict, plan: dict) -> list[dict]:
    """从论文摘要 + 图谱 + 计划构造 Anki 卡片。"""
    cards: list[dict] = []
    paper_id = paper_result.get("paper_id", "?")

    # 从 contributions 派生卡片(全部经 safe_anki_text 净化,防 XSS / 模板花括号注入)
    for i, contrib in enumerate(paper_result.get("contributions", [])[:5]):
        sanitized = safe_anki_text(contrib)
        if not sanitized:
            continue
        cards.append({
            "card_id": f"{paper_id}-c{i}",
            "front": safe_anki_text(f"这篇论文({paper_id})的核心贡献 {i+1} 是什么?"),
            "back": sanitized,
        })

    # 从关键句派生卡片
    for i, sent in enumerate(paper_result.get("key_sentences", [])[:5]):
        sanitized = safe_anki_text(sent)
        if not sanitized:
            continue
        cards.append({
            "card_id": f"{paper_id}-k{i}",
            "front": safe_anki_text(f"论文关键句 {i+1}(请回想内容)"),
            "back": sanitized,
        })

    # 从图谱核心节点派生卡片
    centrality = graph.get("centrality", {})
    top_nodes = sorted(graph.get("nodes", []),
                        key=lambda n: centrality.get(n["id"], 0),
                        reverse=True)[:3]
    for i, node in enumerate(top_nodes):
        label = node.get("label", "")
        if not label:
            continue
        cards.append({
            "card_id": f"{paper_id}-n{i}",
            "front": safe_anki_text(f"论文核心概念/方法 {i+1} 是什么?"),
            "back": safe_anki_text(f"{label}(类型: {node.get('type', '?')})"),
        })

    # 从计划任务派生卡片
    for i, task in enumerate(plan.get("daily_tasks", [])[:3]):
        cards.append({
            "card_id": f"{paper_id}-p{i}",
            "front": safe_anki_text(f"第 {task.get('week', '?')} 周第 {task.get('day', '?')} 天的学习任务?"),
            "back": safe_anki_text(task.get("task", "")),
        })

    if not cards:
        # 兜底:至少给一张 summary 卡片
        cards.append({
            "card_id": f"{paper_id}-summary",
            "front": safe_anki_text(f"请用一句话总结论文({paper_id})"),
            "back": safe_anki_text(paper_result.get("summary", "(无摘要)")),
        })

    return cards


def _write_summary_md(path: Path, paper: dict, graph: dict, plan: dict) -> None:
    """写人类可读的 Markdown 摘要(D9' 修复:所有动态字段经 safe_markdown_text 净化)。"""
    md = []
    md.append(f"# 论文摘要: {safe_markdown_text(paper.get('paper_id', '?'))}\n")
    md.append("## 全文摘要\n")
    md.append(safe_markdown_text(paper.get("summary", "(无)")) + "\n")
    if paper.get("methodology"):
        md.append("## 方法论\n")
        md.append(safe_markdown_text(paper["methodology"]) + "\n")
    if paper.get("contributions"):
        md.append("## 核心贡献\n")
        for c in paper["contributions"]:
            md.append(f"- {safe_markdown_text(c)}\n")
        md.append("\n")
    if graph.get("nodes"):
        md.append(f"## 知识图谱(节点 {len(graph['nodes'])}, 边 {len(graph['edges'])})\n")
        for n in graph["nodes"][:10]:
            label = safe_markdown_text(str(n.get('label', '')))
            node_type = safe_markdown_text(str(n.get('type', '')))
            md.append(f"- **{label}** ({node_type})\n")
    if plan.get("phases"):
        md.append("\n## 学习路径\n")
        for p in plan["phases"]:
            week = safe_markdown_text(str(p.get('week', '?')))
            theme = safe_markdown_text(str(p.get('theme', '')))
            md.append(f"- **第 {week} 周**: {theme}\n")
    path.write_text("".join(md), encoding="utf-8")


def _write_run_log(path: Path, paper: dict, graph: dict, plan: dict) -> None:
    """写运行日志(含 preflight 决策 + 各 step 耗时)。"""
    log_data = {
        "paper_id": paper.get("paper_id"),
        "timestamp": _now_iso(),
        "steps": [
            {"action": "read_paper", "status": "ok",
             "warnings": paper.get("_warnings", [])},
            {"action": "build_graph", "status": "ok",
             "node_count": len(graph.get("nodes", [])),
             "edge_count": len(graph.get("edges", []))},
            {"action": "make_plan", "status": "ok",
             "phases": len(plan.get("phases", [])),
             "daily_tasks": len(plan.get("daily_tasks", []))},
        ],
    }
    path.write_text(json.dumps(log_data, ensure_ascii=False, indent=2), encoding="utf-8")


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ============== argparse 入口 ==============

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="paper-companion",
        description="AI 学术研究伴学 Skill — 论文 → 多层级摘要 → 知识图谱 → 学习路径 → 复习 → Anki",
    )
    parser.add_argument("--skip-preflight", action="store_true",
                        help="跳过 preflight 校验(已知输入安全时使用)")

    sub = parser.add_subparsers(dest="cmd", required=True)

    # health
    sub.add_parser("health", help="健康检查")

    # pipeline
    p_pipe = sub.add_parser("pipeline", help="一键跑通完整 pipeline")
    p_pipe.add_argument("--pdf", help="本地 PDF 路径")
    p_pipe.add_argument("--url", help="arxiv / 网页 URL")
    p_pipe.add_argument("--goal", default="理解这篇论文的核心内容",
                        help="学习目标(驱动 make_plan)")
    p_pipe.add_argument("--weeks", type=int, default=4,
                        help="学习计划总周数")
    p_pipe.add_argument("--hours-per-day", type=float, default=1.5,
                        help="每天学习时长(小时)")
    p_pipe.add_argument("--max-pages", type=int, default=30)
    p_pipe.add_argument("--out", help="输出目录")
    p_pipe.add_argument("--no-anki", action="store_true",
                        help="跳过 Anki 导出")

    # read_paper
    p_rp = sub.add_parser("read_paper", help="只跑精读")
    p_rp.add_argument("--pdf", help="本地 PDF 路径")
    p_rp.add_argument("--url", help="arxiv / 网页 URL")
    p_rp.add_argument("--max-pages", type=int, default=30)
    p_rp.add_argument("--out", help="输出目录")

    # build_graph
    p_bg = sub.add_parser("build_graph", help="只跑知识图谱(D3)")
    p_bg.add_argument("--summary-json", help="read_paper 输出 JSON")

    # make_plan
    p_mp = sub.add_parser("make_plan", help="只跑学习路径(D4)")
    p_mp.add_argument("--goal", required=True, help="学习目标")
    p_mp.add_argument("--papers", help="多篇 read_paper 输出的 JSON 列表(文件或目录)")
    p_mp.add_argument("--weeks", type=int, default=4, help="学习计划总周数")
    p_mp.add_argument("--hours-per-day", type=float, default=1.5, help="每天学习时长")

    # schedule_review
    p_sr = sub.add_parser("schedule_review", help="只跑复习排序(D5)")
    p_sr.add_argument("--cards", help="知识卡片 JSON")

    # export_anki
    p_ea = sub.add_parser("export_anki", help="只跑 Anki 导出(D6)")
    p_ea.add_argument("--deck-name", required=True)
    p_ea.add_argument("--cards", required=True)
    p_ea.add_argument("--out", required=True)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    handlers = {
        "health": cmd_health,
        "pipeline": cmd_pipeline,
        "read_paper": cmd_read_paper,
        "build_graph": cmd_build_graph,
        "make_plan": cmd_make_plan,
        "schedule_review": cmd_schedule_review,
        "export_anki": cmd_export_anki,
    }
    try:
        return handlers[args.cmd](args)
    except PreflightAbort as e:
        log.error("preflight 拒绝执行: %s", e)
        return 3
    except Exception as e:
        log.exception("执行失败: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())