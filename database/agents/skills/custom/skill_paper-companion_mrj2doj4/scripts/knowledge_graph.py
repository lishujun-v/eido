#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
knowledge_graph.py — build_graph action 实现。

D3 任务:从论文摘要抽取实体关系图 + 计算 centrality + 支持多论文合并。

输入: read_paper 输出的 summary dict(含 summary / methodology / contributions)
输出: { "nodes": [...], "edges": [...], "centrality": {...} }

实体类型: concept | method | author | citation
关系类型: used_by | cites | extends | compares | part_of

D7 阶段会扩展:实体归一化(同义词合并)、跨论文实体对齐。
"""
from __future__ import annotations

import logging
from typing import Any

from llm_client import get_default_client, parse_llm_json

log = logging.getLogger(__name__)


GRAPH_SYSTEM = """你是学术实体关系抽取助手。任务:从论文摘要里抽取实体(概念/方法/作者/引文)和它们之间的关系。
要求:
1. 严格 JSON 输出,不要夹杂任何 JSON 之外的文字。
2. 实体类型仅限: concept(概念/术语) | method(方法/模型/算法) | author(作者) | citation(引文/论文)
3. 关系类型仅限: used_by(被...使用) | cites(引用) | extends(扩展了) | compares(与...对比) | part_of(属于)
4. 节点 ID 用 n1, n2, n3... 顺序编号。
5. 边引用节点 ID 即可。"""

GRAPH_USER_TEMPLATE = """从以下论文摘要抽取实体关系图:

【摘要】
{summary}

【方法论】
{methodology}

【贡献】
{contributions}

【输出 JSON 格式】
{{
  "nodes": [
    {{"id": "n1", "type": "concept", "label": "..."}},
    {{"id": "n2", "type": "method", "label": "..."}}
  ],
  "edges": [
    {{"source": "n1", "target": "n2", "relation": "used_by"}}
  ]
}}"""


def build_graph(summary: dict[str, Any], *, llm_client=None) -> dict[str, Any]:
    """
    从 read_paper 输出构造知识图谱。

    Args:
        summary: read_paper 输出 dict,需含 summary / methodology / contributions
        llm_client: 自定义 LLM 客户端(测试用),默认 get_default_client()

    Returns:
        dict 含 nodes / edges / centrality / _meta
    """
    client = llm_client or get_default_client()
    log.info("build_graph: 使用 LLM 客户端 %s", client.name)

    text_summary = summary.get("summary", "") if isinstance(summary, dict) else str(summary)
    text_method = summary.get("methodology", "") if isinstance(summary, dict) else ""
    contribs = summary.get("contributions", []) if isinstance(summary, dict) else []

    user_prompt = GRAPH_USER_TEMPLATE.format(
        summary=text_summary[:3000],
        methodology=text_method[:2000],
        contributions="\n".join(f"- {c}" for c in contribs[:5]) if contribs else "(无)",
    )

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    warnings: list[str] = []

    try:
        raw = client.chat(
            system=GRAPH_SYSTEM,
            user=user_prompt,
            temperature=0.2,
            max_tokens=1500,
        )
        data = parse_llm_json(raw)
        nodes = data.get("nodes", [])
        edges = data.get("edges", [])
    except Exception as e:
        log.warning("build_graph: LLM 抽取失败(%s),返回空图谱", e)
        warnings.append(f"LLM 抽取失败: {e}")

    centrality = _degree_centrality(nodes, edges)

    return {
        "nodes": nodes,
        "edges": edges,
        "centrality": centrality,
        "_meta": {
            "version": "0.3.0-D3",
            "node_count": len(nodes),
            "edge_count": len(edges),
            "llm_client": client.name,
        },
        "_warnings": warnings,
    }


def merge_graphs(graphs: list[dict[str, Any]]) -> dict[str, Any]:
    """
    合并多个图谱(用于跨论文综述)。

    每个原图谱的节点 ID 加 g{i}_ 前缀避免冲突。
    """
    all_nodes: list[dict[str, Any]] = []
    all_edges: list[dict[str, Any]] = []
    for i, g in enumerate(graphs):
        prefix = f"g{i}_"
        for n in g.get("nodes", []):
            all_nodes.append({**n, "id": prefix + n["id"]})
        for e in g.get("edges", []):
            all_edges.append({
                **e,
                "source": prefix + e["source"],
                "target": prefix + e["target"],
            })
    centrality = _degree_centrality(all_nodes, all_edges)
    return {
        "nodes": all_nodes,
        "edges": all_edges,
        "centrality": centrality,
        "_meta": {
            "version": "0.3.0-D3",
            "merged_from": len(graphs),
            "node_count": len(all_nodes),
            "edge_count": len(all_edges),
        },
    }


def _degree_centrality(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> dict[str, float]:
    """
    度数中心性:deg(v) / (N-1)。
    简单实现,用于识别核心节点。
    """
    deg: dict[str, int] = {n["id"]: 0 for n in nodes}
    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src in deg:
            deg[src] += 1
        if tgt in deg:
            deg[tgt] += 1
    n = len(deg)
    if n <= 1:
        return {k: 0.0 for k in deg}
    return {k: round(v / (n - 1), 3) for k, v in deg.items()}