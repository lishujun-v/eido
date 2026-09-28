#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_main.py — D1 骨架验收测试。

验收标准:
    1. cmd_health 返回 OK + 5 个 action 列表
    2. interface.yaml 可被 preflight 解析
    3. check_action 对合法 input 返回 proceed,对非法 input 返回 abort
    4. read_paper 在 PDF 不存在时给出明确错误
    5. make_paper_id 稳定可复现
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from preflight import check_action, load_interface, get_action_decl, make_paper_id  # noqa: E402
from paper_reader import read_paper_basic  # noqa: E402


def _capture_stdout(func, *args, **kwargs) -> tuple[int, str]:
    """捕获 stdout,执行 func,返回 (returncode, stdout_text)。"""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = func(*args, **kwargs)
    return rc, buf.getvalue()


def test_health_ok():
    """cmd_health 返回 OK + 5 个 action 列表。直接调函数避免 CLI 的 stdout/logging 互相污染。"""
    from main import cmd_health
    rc, out = _capture_stdout(cmd_health, argparse.Namespace())
    assert rc == 0
    payload = json.loads(out)
    assert payload["status"] == "ok"
    assert payload["skill_id"] == "paper-companion"
    expected = {"read_paper", "build_graph", "make_plan", "schedule_review", "export_anki"}
    assert set(payload["actions"]) == expected


def test_interface_yaml_loadable():
    """interface.yaml 能被解析,含 5 个 action。"""
    interface = load_interface(SCRIPTS.parent / "interface.yaml")
    assert interface["skill_id"] == "paper-companion"
    assert len(interface["actions"]) == 5


def test_get_action_decl():
    """get_action_decl 能找到每个 action。"""
    interface = load_interface(SCRIPTS.parent / "interface.yaml")
    for name in ("read_paper", "build_graph", "make_plan", "schedule_review", "export_anki"):
        decl = get_action_decl(interface, name)
        assert decl["name"] == name
        assert "reversibility" in decl
        assert "preflight" in decl


def test_preflight_abort_on_missing_pdf():
    """PDF 不存在时 preflight 拒绝。"""
    result = check_action("read_paper", {"pdf_path": "/tmp/nonexistent-xxx.pdf"})
    assert result["continuation_decision"]["decision"] == "abort"
    assert "不存在" in result["continuation_decision"]["rationale"]


def test_preflight_abort_on_both_pdf_and_url():
    """read_paper 不允许同时传 --pdf 和 --url。"""
    result = check_action("read_paper", {
        "pdf_path": "/tmp/a.pdf",
        "url": "https://arxiv.org/abs/1234",
    })
    assert result["continuation_decision"]["decision"] == "abort"
    rat = result["continuation_decision"]["rationale"]
    assert "互斥" in rat or "同时" in rat


def test_preflight_required_for_writes():
    """write 系 action 的 policy=required。"""
    interface = load_interface(SCRIPTS.parent / "interface.yaml")
    for name in ("make_plan", "schedule_review", "export_anki"):
        decl = get_action_decl(interface, name)
        assert decl["preflight"]["policy"] == "required"


def test_preflight_off_for_reads():
    """read 系 action 的 policy='off'(字符串,不是 boolean)。"""
    interface = load_interface(SCRIPTS.parent / "interface.yaml")
    for name in ("read_paper", "build_graph"):
        decl = get_action_decl(interface, name)
        assert decl["preflight"]["policy"] == "off"
        assert isinstance(decl["preflight"]["policy"], str)


def test_read_paper_basic_on_missing_file():
    """PDF 不存在时给出明确错误。"""
    with pytest.raises(FileNotFoundError):
        read_paper_basic(pdf_path="/tmp/definitely-does-not-exist-xxx.pdf")


def test_make_paper_id_stable():
    """make_paper_id 对同一输入产生稳定 ID。"""
    a = make_paper_id("/tmp/foo.pdf")
    b = make_paper_id("/tmp/foo.pdf")
    assert a == b
    assert a.startswith("p-")
    assert len(a) == 14  # "p-" + 12 hex


def test_read_paper_basic_returns_d1_skeleton():
    """read_paper_basic 在有合法路径时返回基础结构(D2 后调 LLM 填摘要)。"""
    # 构造一个最小 PDF:用 PyMuPDF 写一个 1 页 PDF
    import fitz
    tmp_pdf = Path("/tmp/paper_companion_test.pdf")
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Abstract\nThis is a test paper.")
    doc.save(str(tmp_pdf))
    doc.close()

    try:
        result = read_paper_basic(pdf_path=str(tmp_pdf))
        assert result["paper_id"].startswith("p-")
        # D2 后 summary 由 LLM 填,可能是启发式或 mock,只要是字符串即可
        assert isinstance(result["summary"], str)
        assert isinstance(result["chapters"], list)
        # _meta.version 是 D2(因为 paper_reader.py 升级了)
        assert result["_meta"]["version"].startswith("0.2.0")
        assert result["_meta"]["text_length"] > 0
    finally:
        tmp_pdf.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))