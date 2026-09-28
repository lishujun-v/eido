#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_paper_reader.py — D2 验收测试。

验收标准:
    1. MockLLMClient 输出符合 JSON 格式
    2. parse_llm_json 能处理 ```json ... ``` 包裹
    3. read_paper_basic 调 LLM 后输出含 summary/chapters/methodology 等字段
    4. LLM 异常时 read_paper_basic 走启发式 fallback,不崩溃
    5. URL 模式(无 PDF)返回占位结果,带 warning
    6. 同时传 pdf_path 和 url 抛 ValueError
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from llm_client import (  # noqa: E402
    MockLLMClient, XingchenClient, get_default_client, parse_llm_json,
)
from paper_reader import read_paper_basic  # noqa: E402


# ============== MockLLMClient 测试 ==============

def test_mock_llm_paper_summary_returns_json():
    """MockLLMClient 对论文 prompt 返回结构化 JSON。"""
    mock = MockLLMClient()
    user = """请基于以下论文全文,生成多层级摘要。

【论文全文】
We propose a novel attention mechanism. This paper addresses long-range dependency.
Our method achieves state-of-the-art on WMT14.

【输出要求】(严格 JSON 格式)"""
    raw = mock.chat(system="你是助手", user=user)
    data = parse_llm_json(raw)
    assert "summary" in data
    assert "chapters" in data
    assert "key_sentences" in data
    assert "contributions" in data
    assert "methodology" in data
    assert "experiments" in data
    assert "page_refs" in data
    assert isinstance(data["chapters"], list)
    assert isinstance(data["key_sentences"], list)


def test_mock_llm_graph_returns_json():
    """MockLLMClient 对图谱 prompt 返回 nodes/edges。"""
    mock = MockLLMClient()
    raw = mock.chat(system="...", user="请抽取实体关系图...")
    data = parse_llm_json(raw)
    assert "nodes" in data
    assert "edges" in data
    assert "centrality" in data


def test_parse_llm_json_with_code_fence():
    """parse_llm_json 能去掉 ```json ... ``` 包裹。"""
    raw = '```json\n{"summary": "test", "chapters": []}\n```'
    data = parse_llm_json(raw)
    assert data["summary"] == "test"
    assert data["chapters"] == []


def test_parse_llm_json_with_surrounding_text():
    """parse_llm_json 能处理前后带废话的 JSON。"""
    raw = '好的,以下是结果:\n{"summary": "test"}\n希望对你有帮助'
    data = parse_llm_json(raw)
    assert data["summary"] == "test"


def test_parse_llm_json_raises_on_garbage():
    """无法解析时抛 ValueError。"""
    with pytest.raises(ValueError):
        parse_llm_json("not json at all")


# ============== get_default_client 工厂测试 ==============

def test_get_default_client_prefer_mock():
    """prefer='mock' 直接返回 MockLLMClient。"""
    client = get_default_client(prefer="mock")
    assert isinstance(client, MockLLMClient)


def test_get_default_client_xingchen_fallback():
    """未配置 API key 时,prefer='xingchen' 也会回退到 Mock。"""
    import os
    saved_key = os.environ.pop("XINGCHEN_API_KEY", None)
    saved_ep = os.environ.pop("XINGCHEN_CHAT_ENDPOINT", None)
    try:
        client = get_default_client(prefer="xingchen")
        # 无 key → 应该回退到 Mock
        assert isinstance(client, MockLLMClient)
    finally:
        if saved_key:
            os.environ["XINGCHEN_API_KEY"] = saved_key
        if saved_ep:
            os.environ["XINGCHEN_CHAT_ENDPOINT"] = saved_ep


def test_xingchen_client_raises_without_credentials():
    """未配置凭证时 XingchenClient 主动抛 RuntimeError。"""
    import os
    saved_key = os.environ.pop("XINGCHEN_API_KEY", None)
    saved_ep = os.environ.pop("XINGCHEN_CHAT_ENDPOINT", None)
    try:
        with pytest.raises(RuntimeError, match="XINGCHEN_API_KEY"):
            XingchenClient()
    finally:
        if saved_key:
            os.environ["XINGCHEN_API_KEY"] = saved_key
        if saved_ep:
            os.environ["XINGCHEN_CHAT_ENDPOINT"] = saved_ep


# ============== read_paper_basic 集成测试 ==============

def _make_sample_pdf(tmp_path: Path, content: str = "Abstract\nThis is a test paper.") -> Path:
    """用 PyMuPDF 创建一个最小测试 PDF。"""
    import fitz
    pdf_path = tmp_path / "sample.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), content)
    doc.save(str(pdf_path))
    doc.close()
    return pdf_path


def test_read_paper_basic_with_mock_llm(tmp_path):
    """read_paper_basic 用 MockLLMClient 输出结构化结果。"""
    pdf = _make_sample_pdf(tmp_path, "Abstract\nWe propose a novel method.")
    result = read_paper_basic(pdf_path=str(pdf), llm_client=MockLLMClient())
    assert result["paper_id"].startswith("p-")
    assert isinstance(result["summary"], str)
    assert isinstance(result["chapters"], list)
    assert isinstance(result["key_sentences"], list)
    assert result["_meta"]["version"] == "0.2.0-D2"
    assert result["_meta"]["llm_client"] == "mock-llm"


def test_read_paper_basic_llm_failure_falls_back_to_heuristic(tmp_path):
    """LLM 抛异常时 read_paper_basic 走启发式 fallback,不崩溃。"""
    class FailingClient:
        name = "failing"
        def chat(self, *args, **kwargs):
            raise RuntimeError("LLM 服务不可用")

    pdf = _make_sample_pdf(tmp_path, "We propose a novel method for testing.\n" * 5)
    result = read_paper_basic(pdf_path=str(pdf), llm_client=FailingClient())
    # 应有 warning,且 summary 不为空(启发式填了)
    assert any("LLM" in w for w in result["_warnings"])
    assert result["summary"] != ""
    assert result["_meta"]["llm_client"] == "failing"


def test_read_paper_basic_url_placeholder(tmp_path):
    """URL 模式(无 PDF)返回占位结果,带 warning。"""
    result = read_paper_basic(url="https://arxiv.org/abs/2301.12345", llm_client=MockLLMClient())
    assert "占位" in result["summary"] or "URL" in result["summary"]
    assert any("URL" in w or "占位" in w for w in result["_warnings"])


def test_read_paper_basic_requires_input():
    """既不传 pdf_path 也不传 url 应抛 ValueError。"""
    with pytest.raises(ValueError, match="必须提供"):
        read_paper_basic()


def test_read_paper_basic_missing_file(tmp_path):
    """PDF 不存在抛 FileNotFoundError。"""
    with pytest.raises(FileNotFoundError):
        read_paper_basic(pdf_path=str(tmp_path / "missing.pdf"))


def test_read_paper_basic_chapter_identification(tmp_path):
    """章节识别能从测试 PDF 抽出章节标题。"""
    content = (
        "Abstract\n"
        "We propose a novel method.\n"
        "\n"
        "1 Introduction\n"
        "This is the introduction.\n"
        "\n"
        "2 Methodology\n"
        "We use attention mechanism.\n"
        "\n"
        "3 Experiments\n"
        "We test on multiple datasets.\n"
    )
    pdf = _make_sample_pdf(tmp_path, content)
    result = read_paper_basic(pdf_path=str(pdf), llm_client=MockLLMClient())
    # 至少识别到 Introduction 或 Methodology
    titles = [c.get("title", "") for c in result["chapters"]]
    assert any("Introduction" in t or "Methodology" in t for t in titles), \
        f"未识别到章节: {titles}"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))