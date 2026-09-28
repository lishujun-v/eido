#!/usr/bin/env python3.11
"""Deterministically manage Factory business-line Graph packages."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import errno
from difflib import SequenceMatcher
import json
import os
from pathlib import Path
import re
import shutil
import time
from typing import Any, Callable
from uuid import uuid4

NODE_TYPES = {"input", "output", "work", "condition", "interaction"}
FIELD_TYPES = {"string", "number", "integer", "boolean", "object", "array", "any"}


def find_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "graphs").is_dir() and (candidate / "agent").is_dir():
            return candidate
    raise RuntimeError("Cannot locate the Eido project root")


ROOT = find_root()
GRAPHS = Path(os.environ.get("EIDO_GRAPHS_DIR", ROOT / "graphs")).resolve()


def retry(operation: Callable[[], Any], attempts: int = 5) -> Any:
    for attempt in range(attempts):
        try:
            return operation()
        except OSError as error:
            if error.errno != errno.EINTR or attempt == attempts - 1:
                raise
            time.sleep(0.02 * (attempt + 1))


def ident(value: Any, fallback: str) -> str:
    result = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(value or fallback).strip()).strip("-")
    if not result:
        raise ValueError(f"Invalid identifier: {value!r}")
    return result


def load_graphs() -> list[tuple[Path, dict[str, Any]]]:
    items = []
    for path in sorted(GRAPHS.glob("*/graph.json")):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(value, dict):
                items.append((path.parent, value))
        except (OSError, json.JSONDecodeError):
            continue
    return items


NOISE = (
    "factory", "工厂", "graphlines", "graphline", "graph", "执行图", "流程图", "任务图",
    "生产线", "业务线", "流水线", "工作流", "pipeline", "pipline", "那个", "这个",
    "那条", "这条", "一条", "找出来", "列出来",
    "一下", "帮我", "给我", "把", "删除", "删掉", "移除", "修改", "更新", "创建",
    "新建", "查找", "找到", "定位", "的", "吧", "啊", "呀", "生成器",
)
ALIASES = (
    ("markdown", "md"), ("专利", "patent"), ("文件", "file"),
    ("输入", "input"), ("打印", "print"), ("转为", "to"), ("转换", "to"), ("转", "to"),
)


def search_text(value: Any) -> str:
    text = str(value or "").casefold().replace("_", "").replace("-", "")
    text = re.sub(r"[\s\W]+", "", text)
    for source, target in ALIASES:
        text = text.replace(source, target)
    for word in NOISE:
        text = text.replace(word, "")
    return text


def similarity(query: str, graph: dict[str, Any]) -> tuple[float, list[str]]:
    normalized_query = search_text(query)
    if not normalized_query:
        return 0.0, []
    fields = {
        "id": search_text(graph.get("id")),
        "name": search_text(graph.get("name")),
        "description": search_text(graph.get("description")),
        "business_goal": search_text(graph.get("business_goal")),
    }
    reasons = []
    best = 0.0
    for field, value in fields.items():
        if not value:
            continue
        if normalized_query == value:
            score = 1.0
        elif normalized_query in value or value in normalized_query:
            score = 0.92 * min(len(normalized_query), len(value)) / max(len(normalized_query), len(value)) + 0.08
        else:
            score = SequenceMatcher(None, normalized_query, value).ratio()
        if score > best:
            best = score
        if score >= 0.55:
            reasons.append(field)
    return best, reasons


def locate_graph(query: str) -> dict[str, Any]:
    ranked = []
    for path, graph in load_graphs():
        score, reasons = similarity(query, graph)
        ranked.append({
            "id": graph.get("id"), "name": graph.get("name"), "path": str(path),
            "score": round(score, 4), "matched_fields": reasons,
        })
    ranked.sort(key=lambda item: item["score"], reverse=True)
    candidates = [item for item in ranked if item["score"] >= 0.42]
    if not candidates:
        return {"status": "not_found", "query": query, "normalized_query": search_text(query), "candidates": ranked[:3]}
    first = candidates[0]
    second_score = candidates[1]["score"] if len(candidates) > 1 else 0.0
    if first["score"] >= 0.72 and first["score"] - second_score >= 0.12:
        return {"status": "resolved", "query": query, "normalized_query": search_text(query), "graph": first, "alternatives": candidates[1:3]}
    return {"status": "ambiguous", "query": query, "normalized_query": search_text(query), "candidates": candidates[:5]}


def resolve_graph(graph_id: str | None, name: str | None) -> tuple[Path, dict[str, Any]]:
    items = load_graphs()
    matches = [item for item in items if graph_id and item[1].get("id") == graph_id]
    if not matches and name:
        exact = [item for item in items if str(item[1].get("name", "")).casefold() == name.casefold()]
        matches = exact or [item for item in items if name.casefold() in str(item[1].get("name", "")).casefold()]
    if not matches:
        raise ValueError(f"Graph not found: {graph_id or name}")
    if len(matches) > 1:
        choices = ", ".join(f"{item[1].get('id')} ({item[1].get('name')})" for item in matches)
        raise ValueError(f"Graph selection is ambiguous: {choices}")
    return matches[0]


def node_schema(node: dict[str, Any], key: str) -> dict[str, str]:
    value = node["config"].get(key)
    if not isinstance(value, dict) or not value:
        raise ValueError(f"Node '{node['id']}' must declare {key}")
    result = {str(field): str(kind) for field, kind in value.items()}
    invalid = next((kind for kind in result.values() if kind not in FIELD_TYPES), None)
    if invalid:
        raise ValueError(f"Node '{node['id']}' has unsupported field type '{invalid}'")
    return result


def normalize(raw: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    name = str(raw.get("name") or "").strip()
    goal = str(raw.get("business_goal") or "").strip()
    raw_nodes = raw.get("nodes")
    if not name or not goal or not isinstance(raw_nodes, list) or len(raw_nodes) < 2:
        raise ValueError("name, business_goal, input node, and output node are required")
    nodes = []
    for item in raw_nodes:
        if not isinstance(item, dict) or str(item.get("type", "")).lower() not in NODE_TYPES:
            raise ValueError("Every node must have a supported type")
        node = {
            "id": ident(item.get("id"), "node"), "type": str(item["type"]).lower(),
            "title": str(item.get("title") or "").strip(), "description": str(item.get("description") or ""),
            "config": item.get("config") if isinstance(item.get("config"), dict) else {}, "status": "idle",
        }
        if not node["title"]:
            raise ValueError(f"Node '{node['id']}' title cannot be empty")
        nodes.append(node)
    if nodes[0]["type"] != "input" or nodes[-1]["type"] != "output":
        raise ValueError("The first node must be input and the last node must be output")
    ids = [node["id"] for node in nodes]
    if len(ids) != len(set(ids)):
        raise ValueError("Node IDs must be unique")
    inputs, outputs = {}, {}
    for node in nodes:
        if node["type"] != "input": inputs[node["id"]] = node_schema(node, "input_schema")
        if node["type"] != "output": outputs[node["id"]] = node_schema(node, "output_schema")
    adjacency = {node_id: [] for node_id in ids}
    incoming: dict[str, list[str]] = {node_id: [] for node_id in ids}
    labels: dict[str, set[str]] = {}
    edges = []
    for item in raw.get("edges") or []:
        source, target = ident(item.get("source"), "source"), ident(item.get("target"), "target")
        if source not in adjacency or target not in adjacency or source == target:
            raise ValueError(f"Invalid edge {source} -> {target}")
        label = str(item.get("label") or "").strip()
        if nodes[ids.index(source)]["type"] == "condition":
            if not label or label in labels.setdefault(source, set()):
                raise ValueError(f"Condition '{source}' requires distinct non-empty labels")
            labels[source].add(label)
        adjacency[source].append(target)
        incoming[target].append(source)
        edges.append({"source": source, "target": target, "label": label, "id": ident(item.get("id"), f"{source}-{target}")})
    visiting, visited = set(), set()
    def visit(node_id: str) -> None:
        if node_id in visiting: raise ValueError("Graph must be acyclic")
        if node_id in visited: return
        visiting.add(node_id)
        for target in adjacency[node_id]: visit(target)
        visiting.remove(node_id); visited.add(node_id)
    for node_id in ids: visit(node_id)
    available: dict[str, dict[str, str]] = {}
    def fields_after(node_id: str) -> dict[str, str]:
        if node_id in available: return available[node_id]
        node = nodes[ids.index(node_id)]
        strategy = str(node["config"].get("merge_strategy") or "all").lower()
        if strategy not in {"all", "any"}:
            raise ValueError(f"Node '{node_id}' config.merge_strategy must be 'all' or 'any'")
        parent_fields = [fields_after(source) for source in incoming[node_id]]
        if strategy == "any" and parent_fields:
            common = set.intersection(*(set(value) for value in parent_fields))
            before = {field: parent_fields[0][field] for field in common}
        else:
            before = {}
            for value in parent_fields: before.update(value)
        if node_id in inputs:
            missing = sorted(set(inputs[node_id]) - set(before))
            mismatched = sorted(
                field for field in set(inputs[node_id]) & set(before)
                if inputs[node_id][field] != "any" and before[field] != "any"
                and inputs[node_id][field] != before[field]
            )
            if missing or mismatched:
                raise ValueError(
                    f"Context available to '{node_id}' is incompatible: "
                    f"missing {missing}, incompatible {mismatched}"
                )
        available[node_id] = {**before, **outputs.get(node_id, {})}
        return available[node_id]
    for node_id in ids: fields_after(node_id)
    return {
        "id": ident(existing.get("id") if existing else raw.get("id"), f"graph-{uuid4().hex[:10]}"),
        "name": name, "business_goal": goal, "description": str(raw.get("description") or ""),
        "status": str(raw.get("status") or (existing or {}).get("status") or "draft"),
        "nodes": nodes, "edges": edges,
        "created_at": str((existing or {}).get("created_at") or raw.get("created_at") or now), "updated_at": now,
    }


def write_package(graph: dict[str, Any], logic: str, replace: bool) -> Path:
    compile(logic, "logic.py", "exec")
    package = GRAPHS / graph["id"]
    temporary = GRAPHS / f".{graph['id']}-{uuid4().hex[:8]}.tmp"
    backup = GRAPHS / f".{graph['id']}-{uuid4().hex[:8]}.bak"
    if package.exists() and not replace: raise ValueError(f"Graph already exists: {graph['id']}")
    try:
        retry(lambda: temporary.mkdir(parents=True))
        retry(lambda: (temporary / "graph.json").write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"))
        retry(lambda: (temporary / "logic.py").write_text(logic.rstrip() + "\n", encoding="utf-8"))
        if package.exists(): retry(lambda: os.replace(package, backup))
        retry(lambda: os.replace(temporary, package))
        if backup.exists(): shutil.rmtree(backup)
    except Exception:
        if backup.exists() and not package.exists(): retry(lambda: os.replace(backup, package))
        raise
    finally:
        if temporary.exists(): shutil.rmtree(temporary, ignore_errors=True)
    return package


def output(payload: dict[str, Any], code: int = 0) -> int:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return code


async def test_graph(graph_id: str, input_text: str) -> dict[str, Any]:
    """Execute a Graph without persisting a run or silently calling a model."""
    import sys

    agent_root = str(ROOT / "agent")
    if agent_root not in sys.path:
        sys.path.insert(0, agent_root)
    from eido_agent.graph_runtime import GraphExecutor, load_graph_logic
    from eido_agent.graphlines import Graph

    package, raw = resolve_graph(graph_id, None)
    graph = Graph.from_dict(raw)

    async def reject_ai(*_args: Any, **_kwargs: Any) -> str:
        raise RuntimeError(
            "Self-test reached an AI call. Test Python logic deterministically, then run "
            "AI-backed nodes from the Factory UI when AI use was explicitly requested."
        )

    executor = GraphExecutor(reject_ai, reject_ai, load_graph_logic(package / "logic.py"))
    run = await executor.start(graph, "factory-manage-self-test", input_text)
    failed_nodes = [
        {"id": node_id, "error": state.get("error") or run.error}
        for node_id, state in run.node_states.items()
        if state.get("status") == "failed"
    ]
    result = {
        "status": "passed" if run.status in {"completed", "waiting"} else "failed",
        "graph_id": graph.id,
        "graph_name": graph.name,
        "run_status": run.status,
        "input": run.input,
        "output": run.output,
        "waiting_node_id": run.waiting_node_id,
        "failed_nodes": failed_nodes,
        "error": run.error,
        "node_states": run.node_states,
    }
    if run.status == "waiting":
        result["note"] = "Execution reached an interaction node; resume behavior requires a UI test."
    return result


def diagnose_graph(graph_id: str) -> dict[str, Any]:
    package, graph = resolve_graph(graph_id, None)
    run_files = sorted(
        (package / "runs").glob("run-*.json"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    failures = []
    for run_file in run_files[:10]:
        try:
            run = json.loads(run_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if run.get("status") != "failed":
            continue
        failed_nodes = [
            {
                "id": node_id,
                "error": state.get("error"),
                "input": state.get("input"),
            }
            for node_id, state in (run.get("node_states") or {}).items()
            if isinstance(state, dict) and state.get("status") == "failed"
        ]
        failures.append({
            "run_id": run.get("id"),
            "created_at": run.get("created_at"),
            "input": run.get("input"),
            "error": run.get("error"),
            "failed_nodes": failed_nodes,
        })
        if len(failures) >= 3:
            break
    return {
        "status": "diagnosed",
        "graph": {
            "id": graph.get("id"),
            "name": graph.get("name"),
            "updated_at": graph.get("updated_at"),
        },
        "recent_failures": failures,
        "next_step": (
            "Fix the earliest failed node and its incoming contracts, then run update and test."
            if failures else
            "No persisted failed run was found; reproduce with test or the Factory UI."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("list")
    locate = sub.add_parser("locate"); locate.add_argument("--query", required=True)
    diagnose = sub.add_parser("diagnose"); diagnose.add_argument("--id", required=True)
    for action in ("update", "delete"):
        command = sub.add_parser(action); selector = command.add_mutually_exclusive_group(required=True)
        selector.add_argument("--id"); selector.add_argument("--name")
        if action == "update":
            command.add_argument("--spec", required=True, type=Path); command.add_argument("--logic", type=Path)
    create = sub.add_parser("create"); create.add_argument("--spec", required=True, type=Path); create.add_argument("--logic", required=True, type=Path)
    test = sub.add_parser("test"); test.add_argument("--id", required=True); test.add_argument("--input", required=True, dest="input_text")
    args = parser.parse_args()
    try:
        retry(lambda: GRAPHS.mkdir(parents=True, exist_ok=True))
        if args.action == "list":
            graphs = [{"id": item.get("id"), "name": item.get("name"), "status": item.get("status"), "path": str(path)} for path, item in load_graphs()]
            return output({"status": "ok", "graphs": graphs})
        if args.action == "locate":
            result = locate_graph(args.query)
            return output(result, 0 if result["status"] != "not_found" else 1)
        if args.action == "diagnose":
            return output(diagnose_graph(args.id))
        if args.action == "test":
            result = asyncio.run(test_graph(args.id, args.input_text))
            return output(result, 0 if result["status"] == "passed" else 1)
        if args.action == "delete":
            package, graph = resolve_graph(args.id, args.name)
            trash = GRAPHS / ".trash"; retry(lambda: trash.mkdir(exist_ok=True))
            target = trash / f"{graph['id']}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
            retry(lambda: os.replace(package, target))
            return output({"status": "deleted", "id": graph["id"], "name": graph.get("name"), "trash_path": str(target)})
        raw = json.loads(args.spec.read_text(encoding="utf-8"))
        if args.action == "create":
            graph = normalize(raw); logic = args.logic.read_text(encoding="utf-8")
            path = write_package(graph, logic, False)
            return output({"status": "created", "graph": graph, "path": str(path)})
        package, current = resolve_graph(args.id, args.name)
        graph = normalize(raw, current)
        logic = args.logic.read_text(encoding="utf-8") if args.logic else (package / "logic.py").read_text(encoding="utf-8")
        path = write_package(graph, logic, True)
        return output({"status": "updated", "graph": graph, "path": str(path)})
    except Exception as error:
        return output({"status": "failed", "error": str(error)}, 1)


if __name__ == "__main__":
    raise SystemExit(main())
