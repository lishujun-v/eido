#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_payload_injection.py — D9' 审核反馈修复专项回归测试。

覆盖官方列出的 5 种 payload:
    1. <script>...</script>(XSS)
    2. ![x](http://...)(Markdown 图片注入)
    3. [x](javascript:...)(危险协议链接)
    4. {{token}}(模板花括号注入,Anki / Jinja2 / Liquid 都会被解析)
    5. Markdown 表格分隔符 |---| / :---: / 竖线分隔

测试结构:
    A. safe_markdown_text 单测(5 + 2)
    B. safe_anki_text 单测(3)
    C. 端到端 _write_summary_md(1)
    D. 端到端 _build_cards_from_paper + export_anki(1)
    E. .apkg zipfile + sqlite3 解包校验(1)

总计 ~13 用例。
"""
from __future__ import annotations

import os
import re
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from sanitize import safe_markdown_text, safe_anki_text  # noqa: E402
from main import _write_summary_md, _build_cards_from_paper  # noqa: E402
from anki_exporter import export_anki  # noqa: E402


# =================================================================
# A. safe_markdown_text 单测
# =================================================================

class TestSafeMarkdownText:
    """summary.md 净化函数测试。"""

    def test_html_escape_script_tag(self):
        """XSS: <script> → &lt;script&gt;。"""
        result = safe_markdown_text("<script>alert(1)</script>")
        assert "<script" not in result
        assert "&lt;script&gt;" in result
        assert "alert(1)" in result  # 文本内容保留

    def test_html_escape_special_chars(self):
        """HTML 特殊字符全转实体:& < >。"""
        result = safe_markdown_text("a & b < c > d")
        assert "&amp;" in result
        assert "&lt;" in result
        assert "&gt;" in result

    def test_image_neutralized(self):
        """![alt](url) → [图片: <alt>](去掉 ! 和 () 语法)。"""
        result = safe_markdown_text("![x](http://evil.com/img.png)")
        assert "![" not in result
        assert "[图片: x]" in result
        assert "evil.com" not in result  # URL 整段剥离(图片中和只留 alt)

    def test_javascript_link_stripped(self):
        """[click](javascript:alert(1)) → click(危险协议 URL 整段剥离,只留 label)。"""
        result = safe_markdown_text("[click](javascript:alert(1))")
        assert "javascript:" not in result
        assert "alert(1)" not in result
        assert "click" in result

    def test_data_url_stripped(self):
        """[x](data:text/html,...) → x(同样危险)。"""
        result = safe_markdown_text("[x](data:text/html,<script>alert(1)</script>)")
        assert "data:" not in result
        assert "<script" not in result

    def test_table_separator_removed(self):
        """独立成行的 |---| / :---: 表格分隔被剥离。"""
        text = "| a | b |\n|---|---|\nfoo"
        result = safe_markdown_text(text)
        assert "|---|" not in result
        assert ":---:" not in result
        # 普通竖线分隔文本保留(不被误伤)
        assert "foo" in result

    def test_template_braces_escaped(self):
        """{{token}} → 实体化(防止下游 Jinja2/Liquid/Anki 模板引擎误解析)。"""
        result = safe_markdown_text("hello {{token}} world")
        assert "{{" not in result
        assert "}}" not in result
        assert "&#123;&#123;token&#125;&#125;" in result

    def test_anfront_field_reference_escaped(self):
        """Anki 字段引用 {{Front}} 也要 escape。"""
        result = safe_markdown_text("{{Front}}")
        assert "{{" not in result
        assert "&#123;&#123;Front&#125;&#125;" in result

    def test_plain_text_passes_through(self):
        """普通文本(无 payload)几乎原样通过(只 escape <>&,不破坏内容)。"""
        text = "Hello world,这是中文,包含逗号。"
        result = safe_markdown_text(text)
        # 中文 / 字母 / 标点都保留(没有 HTML 特殊字符会被转义)
        assert "Hello world" in result
        assert "这是中文" in result
        assert "包含逗号" in result

    def test_none_and_empty(self):
        """None / 空字符串都返回 "",不抛异常。"""
        assert safe_markdown_text(None) == ""
        assert safe_markdown_text("") == ""


# =================================================================
# B. safe_anki_text 单测
# =================================================================

class TestSafeAnkiText:
    """Anki 卡片 front/back 净化函数测试。"""

    def test_html_escape(self):
        """<b>bold</b> → &lt;b&gt;bold&lt;/b&gt;(Anki 不渲染,显示为字面文本)。"""
        result = safe_anki_text("<b>bold</b>")
        assert "<b>" not in result
        assert "&lt;b&gt;" in result

    def test_javascript_link_stripped(self):
        """[x](javascript:bad) → x(URL 剥离)。"""
        result = safe_anki_text("[x](javascript:bad)")
        assert "javascript:" not in result
        assert "x" in result

    def test_anfront_template_escaped(self):
        """{{Front}} 模板字段引用实体化,避免 Anki 误解析。"""
        result = safe_anki_text("Answer: {{Front}}")
        assert "{{" not in result
        assert "&#123;&#123;Front&#125;&#125;" in result

    def test_none_and_empty(self):
        """None / 空字符串都返回 ""。"""
        assert safe_anki_text(None) == ""
        assert safe_anki_text("") == ""


# =================================================================
# C. 端到端 _write_summary_md
# =================================================================

class TestSummaryMdE2E:
    """_write_summary_md 接受含 payload 的 paper 后,生成文件无残留。"""

    def _fake_paper(self) -> dict:
        return {
            "paper_id": "<script>alert('paper_id_xss')</script>",
            "summary": (
                "## Section\n"
                "| col1 | col2 |\n"
                "|---|---|\n"
                "![x](http://evil.com/x.png)\n"
                "[x](javascript:alert(1))\n"
                "{{token}}\n"
                "<script>alert('summary_xss')</script>"
            ),
            "methodology": "<script>alert('methodology_xss')</script>",
            "contributions": [
                "![c1](http://evil.com/c1.png)",
                "[c2](javascript:alert(2))",
                "<b>c3 bold</b>",
            ],
            "key_sentences": ["{{leak}}"],
        }

    def _fake_graph(self) -> dict:
        return {
            "nodes": [
                {"id": "1", "label": "<script>alert('graph_xss')</script>", "type": "concept"},
                {"id": "2", "label": "{{graph_leak}}", "type": "method"},
            ],
            "edges": [],
            "centrality": {"1": 1.0, "2": 0.5},
        }

    def _fake_plan(self) -> dict:
        return {
            "phases": [
                {"week": 1, "theme": "<script>alert('plan_xss')</script>"},
                {"week": 2, "theme": "{{plan_leak}}"},
            ],
            "daily_tasks": [
                {"week": 1, "day": 1, "task": "[x](javascript:plan_bad)"},
            ],
        }

    def test_summary_md_no_xss_residue(self, tmp_path: Path):
        """生成 summary.md,断言不含 5 种 payload 的危险语法(文本内容不在检查范围)。"""
        out = tmp_path / "summary.md"
        _write_summary_md(out, self._fake_paper(), self._fake_graph(), self._fake_plan())
        content = out.read_text(encoding="utf-8")

        # XSS:未转义的 <script 标签不能出现(< 已被 HTML escape)
        assert "<script" not in content
        assert "</script>" not in content
        # Markdown 图片语法 ![]() 整段中和
        assert "![" not in content
        # 危险 URL 协议
        assert "javascript:" not in content
        assert "evil.com" not in content  # 图片中和时 URL 整段剥离
        # 模板花括号(防下游模板引擎误解析)
        assert "{{" not in content
        assert "}}" not in content
        # 表格分隔行
        assert not re.search(r"\|\s*[\-:]+\s*\|", content), f"table sep leaked: {content}"
        # 但合法内容(中文字符、Markdown 标题、列表)保留
        assert "## 全文摘要" in content
        assert "## 核心贡献" in content


# =================================================================
# D. 端到端 _build_cards_from_paper + export_anki
# =================================================================

class TestAnkiCardsE2E:
    """_build_cards_from_paper 生成的卡片 front/back 不含 payload。"""

    def test_cards_front_back_sanitized(self):
        """构造含 5 种 payload 的 paper,所有卡片字段经断言干净。"""
        paper = {
            "paper_id": "<script>alert(1)</script>",
            "summary": "<script>summary_xss</script>",
            "contributions": [
                "<script>c0</script>",
                "![c1](http://evil)",
                "[c2](javascript:bad)",
                "{{c3}}",
                "|c4|sep|",
            ],
            "key_sentences": [
                "<script>k0</script>",
                "{{k1}}",
                "[k2](javascript:bad)",
            ],
        }
        graph = {
            "nodes": [
                {"id": "1", "label": "<script>n0</script>", "type": "concept"},
                {"id": "2", "label": "{{n1}}", "type": "method"},
            ],
            "edges": [],
            "centrality": {"1": 1.0, "2": 0.5},
        }
        plan = {
            "phases": [{"week": 1, "theme": "{{phase_theme}}"}],
            "daily_tasks": [
                {"week": 1, "day": 1, "task": "<script>p0</script>"},
                {"week": 1, "day": 2, "task": "[x](javascript:bad)"},
            ],
        }

        cards = _build_cards_from_paper(paper, graph, plan)

        # 至少应有贡献卡 + 关键句卡 + 节点卡 + 任务卡 + 兜底(如果 contributions 等有空)
        assert len(cards) > 0

        for c in cards:
            front = c["front"]
            back = c["back"]
            for field_name, field in [("front", front), ("back", back)]:
                # Anki 渲染 HTML,所以 <script 必须 escape
                assert "<script" not in field, f"{field_name}={field!r} 含 <script"
                # 危险 URL 协议(Anki 渲染 <a href=...> 时会被点击触发)
                assert "javascript:" not in field, f"{field_name}={field!r} 含 javascript:"
                # 模板花括号(Anki 字段引用语法)
                assert "{{" not in field, f"{field_name}={field!r} 含 {{{{"
                assert "}}" not in field, f"{field_name}={field!r} 含 }}}}"
                # 注:Anki 不渲染 Markdown 图片 / 表格语法,所以 ![ 和 |---| 留作纯文本无害


# =================================================================
# E. .apkg zipfile + sqlite3 解包校验
# =================================================================

class TestApkgZipfileInspection:
    """export_anki 生成的 .apkg 文件,用 zipfile + sqlite3 解包,断言 notes 表中无 payload。"""

    def test_apkg_notes_table_clean(self, tmp_path: Path):
        """生成 .apkg,解包读 SQLite notes 表 flds,断言无 payload。"""
        # 用含 payload 的 cards 直接喂 export_anki
        cards = [
            {"card_id": "test-1", "front": "Q1", "back": "<script>alert('in_apkg')</script>"},
            {"card_id": "test-2", "front": "Q2", "back": "[x](javascript:alert(2))"},
            {"card_id": "test-3", "front": "Q3", "back": "{{token}}"},
            {"card_id": "test-4", "front": "Q4", "back": "![x](http://evil.com/x.png)"},
        ]
        out_apkg = tmp_path / "test.apkg"
        export_anki(deck_name="payload_smoke", cards=cards, out_path=out_apkg)

        assert out_apkg.exists()

        # 1) zipfile 列出条目
        with zipfile.ZipFile(out_apkg) as zf:
            names = zf.namelist()
            assert "collection.anki2" in names, f".apkg 缺 collection.anki2: {names}"

            # 2) 读 collection.anki2 到临时文件(SQLite 文件含二进制 null 字节,
            #    executescript 不接受;写到文件后用 sqlite3.connect 打开)
            with zf.open("collection.anki2") as f:
                db_bytes = f.read()

        tmp_db = tempfile.NamedTemporaryFile(suffix=".anki2", delete=False)
        try:
            tmp_db.write(db_bytes)
            tmp_db.close()
            conn = sqlite3.connect(tmp_db.name)
            try:
                rows = conn.execute("SELECT flds FROM notes").fetchall()
                assert len(rows) >= 1, ".apkg notes 表为空"
                for (flds,) in rows:
                    # flds 字段以 \x1f 分隔,直接检查整段
                    assert "<script" not in flds, f".apkg notes.flds 含 <script: {flds!r}"
                    assert "javascript:" not in flds, f".apkg notes.flds 含 javascript:: {flds!r}"
                    assert "{{" not in flds, f".apkg notes.flds 含 {{{{ : {flds!r}"
                    assert "}}" not in flds, f".apkg notes.flds 含 }}}}: {flds!r}"
                    # 注:Anki 不渲染 Markdown 图片语法,![ 作为纯文本无害
            finally:
                conn.close()
        finally:
            os.unlink(tmp_db.name)