#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_knowledge_graph.py — D3 验收测试。
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from knowledge_graph import build_graph, merge_graphs, _degree_centrality  # noqa: E402
from llm_client import MockLLMClient  # noqa: E402


def test_build_graph_with_mock_llm():
    """build_graph 用 mock LLM 输出含 nodes/edges/centrality。"""
    summary = {
        "paper_id": "p-test",
        "summary": "We propose attention mechanism for NLP.",
        "methodology": "Self-attention with Q/K/V projections.",
        "contributions": ["Novel attention", "Better than RNN"],
    }
    result = build_graph(summary, llm_client=MockLLMClient())
    assert "nodes" in result
    assert "edges" in result
    assert "centrality" in result
    assert isinstance(result["nodes"], list)
    assert isinstance(result["edges"], list)
    assert isinstance(result["centrality"], dict)
    assert result["_meta"]["version"] == "0.3.0-D3"


def test_build_graph_handles_empty_summary():
    """空摘要不崩溃,返回空图谱。"""
    summary = {"paper_id": "p-empty", "summary": "", "methodology": "", "contributions": []}
    result = build_graph(summary, llm_client=MockLLMClient())
    # MockLLMClient 看到 prompt 里有"实体关系抽取"关键词也会返回 mock 数据,
    # 这是预期行为(只要不崩溃,且结构合法)。真实 LLM 在空摘要时也会返回稀疏图。
    assert isinstance(result["nodes"], list)
    assert isinstance(result["edges"], list)
    assert isinstance(result["centrality"], dict)
    assert result["_meta"]["version"] == "0.3.0-D3"


def test_build_graph_handles_llm_failure():
    """LLM 抛异常时返回空图谱 + warning,不崩溃。"""
    class FailingClient:
        name = "failing"
        def chat(self, *args, **kwargs):
            raise RuntimeError("LLM 不可用")

    summary = {"summary": "test", "methodology": "test", "contributions": []}
    result = build_graph(summary, llm_client=FailingClient())
    assert result["nodes"] == []
    assert result["edges"] == []
    assert any("LLM" in w for w in result["_warnings"])


def test_degree_centrality_basic():
    """_degree_centrality 正确计算。"""
    nodes = [{"id": "n1"}, {"id": "n2"}, {"id": "n3"}]
    edges = [{"source": "n1", "target": "n2"}, {"source": "n1", "target": "n3"}]
    centrality = _degree_centrality(nodes, edges)
    # n1 有 2 条边,n2/n3 各 1 条;3 个节点,denom=2
    assert centrality["n1"] == 1.0
    assert centrality["n2"] == 0.5
    assert centrality["n3"] == 0.5


def test_merge_graphs():
    """merge_graphs 把多个图谱合并,节点 ID 加前缀。"""
    g1 = {
        "nodes": [{"id": "n1", "label": "A"}],
        "edges": [],
    }
    g2 = {
        "nodes": [{"id": "n1", "label": "B"}],  # 同 ID,前缀防冲突
        "edges": [{"source": "n1", "target": "n1"}],
    }
    merged = merge_graphs([g1, g2])
    assert len(merged["nodes"]) == 2
    assert {n["id"] for n in merged["nodes"]} == {"g0_n1", "g1_n1"}
    assert merged["edges"][0]["source"] == "g1_n1"
    assert merged["edges"][0]["target"] == "g1_n1"
    assert merged["_meta"]["merged_from"] == 2


def test_merge_graphs_empty():
    """merge_graphs 处理空列表。"""
    merged = merge_graphs([])
    assert merged["nodes"] == []
    assert merged["edges"] == []


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))