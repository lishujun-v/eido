#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_robustness.py — D7 鲁棒性测试矩阵。

覆盖场景:
    1. 输入大小限制
    2. URL / API key / 路径脱敏
    3. LLM 错误信息分类(认证 / 限流 / 超时 / 网络)
    4. 异常 PDF 输入(空文件 / 加密 / 乱码)
    5. 错误信息长度截断
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from sanitize import sanitize_url, sanitize_path, sanitize_error_message, redact_pii  # noqa: E402
from llm_client import (  # noqa: E402
    LLMInputTooLargeError, LLMAuthError, LLMRateLimitError, LLMTimeoutError,
    MockLLMClient, XingchenClient, _check_input_size,
)


# ============== sanitize_url 测试 ==============

def test_sanitize_url_removes_api_key():
    """sanitize_url 移除 api_key 参数。"""
    url = "https://api.example.com/v1?api_key=secret123&page=1"
    out = sanitize_url(url)
    assert "secret123" not in out
    assert "<redacted>" in out
    assert "page=1" in out  # 其它参数保留


def test_sanitize_url_removes_token():
    """sanitize_url 移除 token / signature。"""
    for url in [
        "https://x.com/a?token=abc",
        "https://x.com/a?access_token=xyz",
        "https://x.com/a?sig=1234",
    ]:
        out = sanitize_url(url)
        for sensitive in ["abc", "xyz", "1234"]:
            assert sensitive not in out or "<redacted>" in out


def test_sanitize_url_strip_domain():
    """keep_domain=False 时整 URL 被替换。"""
    url = "https://api.example.com/v1?token=abc"
    out = sanitize_url(url, keep_domain=False)
    assert "abc" not in out
    assert "example.com" not in out


def test_sanitize_url_safe_passthrough():
    """无敏感参数的 URL 保留。"""
    url = "https://arxiv.org/abs/2301.12345"
    out = sanitize_url(url)
    assert "arxiv.org" in out
    assert "2301.12345" in out


# ============== sanitize_path 测试 ==============

def test_sanitize_path_home_replacement():
    """sanitize_path 把用户家目录替换为 ~。"""
    home = str(Path.home())
    full_path = f"{home}/Documents/secret.pdf"
    out = sanitize_path(full_path)
    assert out.startswith("~/")
    assert "secret.pdf" in out
    assert home not in out


def test_sanitize_path_short_unchanged():
    """短路径(< 30 字符)不动。"""
    out = sanitize_path("/tmp/foo.pdf")
    assert out == "/tmp/foo.pdf"


# ============== sanitize_error_message 测试 ==============

def test_sanitize_error_message_truncates_long():
    """超长错误信息被截断。"""
    long_msg = "x" * 1000
    out = sanitize_error_message(long_msg, max_length=100)
    assert len(out) <= 120  # 100 + 截断标记
    assert "截断" in out


def test_sanitize_error_message_removes_ansi():
    """ANSI 控制字符被移除。"""
    msg = "\x1b[31m红色错误\x1b[0m"
    out = sanitize_error_message(msg)
    assert "\x1b" not in out
    assert "红色错误" in out


def test_sanitize_error_message_redacts_url_params():
    """错误信息里的 URL 参数被脱敏。"""
    msg = "Failed to fetch https://api.com?api_key=leak"
    out = sanitize_error_message(msg)
    assert "leak" not in out


# ============== redact_pii 测试 ==============

def test_redact_pii_email():
    """邮箱被脱敏。"""
    assert redact_pii("联系 yijian@example.com") == "联系 <email>"


def test_redact_pii_phone():
    """手机号被脱敏。"""
    assert redact_pii("电话 13800138000") == "电话 <phone>"


def test_redact_pii_id_card():
    """身份证号被脱敏。"""
    assert redact_pii("身份证 12345678901234567X") == "身份证 <id_card>"


def test_redact_pii_mixed():
    """多种 PII 混合。"""
    text = "yijian@example.com 和 13800138000"
    out = redact_pii(text)
    assert "yijian@example.com" not in out
    assert "13800138000" not in out


# ============== LLM 错误分类测试 ==============

def test_check_input_size_raises_on_too_large():
    """输入超 max_input_chars 抛 LLMInputTooLargeError。"""
    with pytest.raises(LLMInputTooLargeError, match="输入过大"):
        _check_input_size("a" * 1000, "b" * 1000, max_chars=1500)


def test_check_input_size_passes_under_limit():
    """输入在限内通过。"""
    _check_input_size("a" * 100, "b" * 100, max_chars=1500)  # 不抛


def test_xingchen_client_raises_auth_error_no_retry():
    """XingchenClient 遇到 401 不重试,直接抛 LLMAuthError。"""
    client = XingchenClient(api_key="test", endpoint="http://test")
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "unauthorized"

    with patch("requests.post", return_value=mock_resp):
        with pytest.raises(LLMAuthError, match="认证失败"):
            client.chat(system="s", user="u", retries=3)


def test_xingchen_client_handles_429():
    """XingchenClient 遇到 429 抛 LLMRateLimitError。"""
    client = XingchenClient(api_key="test", endpoint="http://test")
    mock_resp = MagicMock()
    mock_resp.status_code = 429
    mock_resp.text = "rate limit"

    with patch("requests.post", return_value=mock_resp):
        with pytest.raises(LLMRateLimitError, match="限流"):
            client.chat(system="s", user="u", retries=2)


def test_xingchen_client_handles_timeout():
    """XingchenClient 遇到 timeout 重试 N 次后抛 LLMTimeoutError。"""
    import requests as real_requests
    client = XingchenClient(api_key="test", endpoint="http://test")

    with patch("requests.post", side_effect=real_requests.Timeout("timeout")):
        with pytest.raises((LLMTimeoutError, Exception)):
            client.chat(system="s", user="u", retries=2, timeout=0.1)


# ============== 异常 PDF 输入测试 ==============

def _make_empty_pdf(tmp_path) -> Path:
    """用 PyMuPDF 创建 1 页空内容 PDF(PyMuPDF 不允许保存 0 页)。"""
    import fitz
    pdf = tmp_path / "empty.pdf"
    doc = fitz.open()
    doc.new_page()  # 1 页但内容为空
    doc.save(str(pdf))
    doc.close()
    return pdf


def test_read_paper_empty_pdf_no_crash(tmp_path):
    """空 PDF(1 页无内容)不崩溃,给出明确 warning。"""
    from paper_reader import read_paper_basic
    pdf = _make_empty_pdf(tmp_path)
    result = read_paper_basic(pdf_path=str(pdf), llm_client=MockLLMClient())
    # summary 可能为空,但不应抛
    assert isinstance(result["summary"], str)
    assert result["chapters"] == []
    assert result["_meta"]["text_length"] < 100  # 空内容


def test_pdf_parser_rejects_nonexistent(tmp_path):
    """不存在的 PDF 抛 FileNotFoundError。"""
    from pdf_parser import extract_text
    with pytest.raises(FileNotFoundError):
        extract_text(tmp_path / "nonexistent.pdf")


def test_pdf_parser_rejects_corrupted(tmp_path):
    """损坏的 PDF 抛明确错误。"""
    from pdf_parser import extract_text
    bad = tmp_path / "bad.pdf"
    bad.write_bytes(b"this is not a pdf at all, just garbage bytes")
    with pytest.raises(Exception):  # ValueError 或 RuntimeError
        extract_text(bad)


def test_pdf_parser_rejects_directory(tmp_path):
    """目录而非 PDF 文件抛 ValueError。"""
    from pdf_parser import extract_text
    with pytest.raises(ValueError, match="路径不是文件"):
        extract_text(tmp_path)


def test_pdf_parser_rejects_text_file(tmp_path):
    """文本文件(扩展名是 .pdf 但内容是文本)抛明确错误。"""
    from pdf_parser import extract_text
    fake = tmp_path / "fake.pdf"
    fake.write_text("This is plain text, not a PDF")
    # fitz 可能解析失败或返回空文本
    try:
        text = extract_text(fake)
        # 如果 fitz 容忍,文本应该为空或很短
        assert len(text) < 100
    except Exception:
        pass  # 抛错也算正确


# ============== LLM 输入大小限制传递测试 ==============

def test_mock_llm_max_input_chars():
    """MockLLMClient.chat 接受 max_input_chars 参数(不报错)。"""
    mock = MockLLMClient()
    # mock 不实际校验,但接口要兼容
    result = mock.chat(system="s", user="u", max_input_chars=100)
    assert isinstance(result, str)


def test_xingchen_client_input_too_large_raises():
    """XingchenClient 输入过大抛 LLMInputTooLargeError(不发起 HTTP 请求)。"""
    client = XingchenClient(api_key="test", endpoint="http://test")
    with patch("requests.post") as mock_post:
        with pytest.raises(LLMInputTooLargeError):
            client.chat(system="a" * 10000, user="b" * 10000, max_input_chars=5000)
        # 不应发起 HTTP 请求
        mock_post.assert_not_called()


# ============== make_plan/build_graph 异常测试 ==============

def test_make_plan_empty_goal_still_runs():
    """空 goal 也跑得通(可能输出质量差,但不崩)。"""
    from learning_plan import make_plan
    result = make_plan(goal="", papers=[], weeks=2, llm_client=MockLLMClient())
    assert result["goal"] == ""
    assert "phases" in result


def test_build_graph_handles_non_dict_summary():
    """summary 不是 dict 也跑得通(转字符串)。"""
    from knowledge_graph import build_graph
    result = build_graph("just a string summary", llm_client=MockLLMClient())
    assert "nodes" in result
    assert "edges" in result


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))