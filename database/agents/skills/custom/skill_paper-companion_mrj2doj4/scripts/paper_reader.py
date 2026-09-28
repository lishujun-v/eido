#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
paper_reader.py — read_paper action 实现。

D2 阶段:从骨架升级为多层级摘要生成(调 LLM)。
    - 接入 llm_client.get_default_client()
    - 设计多层级摘要 prompt
    - JSON 容错解析(parse_llm_json)
    - 章节识别保留 D1 实现
    - 异常兜底:LLM 失败时返回带 warning 的部分结果,不崩溃

D7 阶段会扩展:
    - 异常输入识别
    - LLM 调用重试(llm_client 已有基础重试)
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from pdf_parser import extract_text, paper_id_from_path
from llm_client import get_default_client, parse_llm_json

log = logging.getLogger(__name__)


# ============== Prompt 模板 ==============

PAPER_SUMMARY_SYSTEM = """你是学术论文精读助手。任务:基于用户提供的论文全文,生成结构化多层级摘要。
要求:
1. 严格按 JSON schema 输出,不要夹杂任何 JSON 之外的文字。
2. 全文摘要控制在 200-500 字,说清问题/方法/核心贡献。
3. 章节识别按论文实际结构(标题 + 起始页)。
4. 关键句 3-8 条,标注所在页码(如 "p.3")。
5. 贡献列 3-5 条,每条一句话。
6. 方法论详述模型/算法/实验设置。
7. 引用页码要可追溯(从论文原文找)。"""

PAPER_SUMMARY_USER_TEMPLATE = """请基于以下论文全文,生成多层级摘要。

【论文全文】
{full_text}

【输出要求】(严格 JSON 格式,不要夹杂其他文字)
{{
  "summary": "全文摘要(200-500字)",
  "chapters": [{{ "title": "章节标题", "page": N, "preview": "章节预览" }}],
  "key_sentences": ["关键句(标注页码)", ...],
  "contributions": ["贡献1", "贡献2", "贡献3"],
  "methodology": "方法论详述",
  "experiments": "实验设置与结果",
  "page_refs": {{ "summary": "p.X", "methodology": "p.X-Y" }}
}}"""


# ============== 章节识别(沿用 D1) ==============

def _identify_chapters(text: str) -> list[dict[str, Any]]:
    """从 PDF 文本识别章节标题(粗略版)。"""
    chapters: list[dict[str, Any]] = []
    current_page = 1
    for line in text.split("\n"):
        line = line.strip()
        if line.startswith("[Page "):
            try:
                current_page = int(line[6:].rstrip("]"))
            except ValueError:
                pass
            continue
        if not line or len(line) > 100:
            continue
        m = re.match(r"^(\d+(?:\.\d+)*)\s+([A-Z][^\n]{2,80})$", line)
        is_single_word_title = (
            line.isupper()
            and 2 <= len(line.split()) <= 6
            and all(w.isalpha() for w in line.split())
        )
        if m or is_single_word_title:
            chapters.append({"title": line, "page": current_page, "preview": ""})
    return chapters


# ============== 主入口 ==============

def read_paper_basic(
    pdf_path: str | Path | None = None,
    url: str | None = None,
    max_pages: int = 30,
    *,
    llm_client=None,
) -> dict[str, Any]:
    """
    read_paper action 主入口(D2 升级版)。

    Args:
        pdf_path: 本地 PDF 路径(与 url 互斥)
        url: arxiv / 网页 URL(暂未实装抓取,占位返回)
        max_pages: 最大解析页数
        llm_client: 自定义 LLM 客户端(测试用),默认用 get_default_client()

    Returns:
        dict 含 paper_id / summary / chapters / key_sentences / contributions /
             methodology / experiments / page_refs / _meta / _warnings

    Raises:
        FileNotFoundError: PDF 不存在
        ValueError: pdf_path 和 url 都为空
        RuntimeError: LLM 不可用且非 mock 模式
    """
    if not pdf_path and not url:
        raise ValueError("必须提供 pdf_path 或 url")

    client = llm_client or get_default_client()
    log.info("read_paper: 使用 LLM 客户端 %s", client.name)

    if pdf_path:
        pdf_path = Path(pdf_path)
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF 不存在: {pdf_path}")
        text = extract_text(pdf_path, max_pages=max_pages)
        paper_id = paper_id_from_path(pdf_path)
    else:
        text = ""
        paper_id = paper_id_from_path(url)

    chapters = _identify_chapters(text)
    warnings: list[str] = []

    # 调 LLM 生成多层级摘要
    summary_data: dict[str, Any] = {}
    if text:
        user_prompt = PAPER_SUMMARY_USER_TEMPLATE.format(full_text=text[:8000])
        # 截断到 8000 字符防止超长;后续 D7 阶段会做 chunked summary
        try:
            raw = client.chat(
                system=PAPER_SUMMARY_SYSTEM,
                user=user_prompt,
                temperature=0.3,
                max_tokens=2048,
            )
            summary_data = parse_llm_json(raw)
            log.info(
                "read_paper: LLM 返回 keys=%s", list(summary_data.keys()),
            )
        except Exception as e:
            log.warning("read_paper: LLM 摘要失败(%s),使用启发式 fallback", e)
            warnings.append(f"LLM 摘要失败: {e}")
            summary_data = _heuristic_summary(text, chapters)
    else:
        # URL 模式:暂未实装抓取
        warnings.append("URL 模式暂未实装抓取,返回占位结果")
        summary_data = {
            "summary": f"[URL 占位] {url}",
            "chapters": [],
            "key_sentences": [],
            "contributions": [],
            "methodology": "",
            "experiments": "",
            "page_refs": {},
        }

    # 合并章节:LLM 章节优先,本地识别作为补充
    final_chapters = summary_data.get("chapters") or chapters

    result: dict[str, Any] = {
        "paper_id": paper_id,
        "summary": summary_data.get("summary", ""),
        "chapters": final_chapters,
        "key_sentences": summary_data.get("key_sentences", []),
        "contributions": summary_data.get("contributions", []),
        "methodology": summary_data.get("methodology", ""),
        "experiments": summary_data.get("experiments", ""),
        "page_refs": summary_data.get("page_refs", {}),
        "_meta": {
            "version": "0.2.0-D2",
            "text_length": len(text),
            "chapter_count": len(final_chapters),
            "llm_client": client.name,
        },
        "_warnings": warnings,
    }

    return result


# ============== 启发式 fallback ==============

def _heuristic_summary(text: str, chapters: list[dict[str, Any]]) -> dict[str, Any]:
    """LLM 不可用时,从 PDF 文本里粗略抽取结构化字段。

    兼容三种文本结构:
        1. 标准 PDF 抽取(text 含 "[Page N]" 标记 + \\n\\n 段落分隔)
        2. 单换行分隔(纯文本)
        3. 单行内容(取前 N 字符作为 summary)
    """
    # 去掉 [Page N] 标记
    cleaned = re.sub(r"\[Page \d+\]", "", text).strip()

    # 优先按段落(双换行)切
    paragraphs = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
    # 兜底:按单换行切
    if len(paragraphs) < 2:
        paragraphs = [p.strip() for p in cleaned.split("\n") if p.strip()]
    # 过滤掉太短的(可能是页眉/页脚/章节标题)
    paragraphs = [p for p in paragraphs if len(p) > 30][:5]

    if not paragraphs:
        # 最后兜底:取前 500 字符
        summary = cleaned[:500]
        return {
            "summary": summary,
            "chapters": chapters,
            "key_sentences": [summary[:200]] if summary else [],
            "contributions": [],
            "methodology": "",
            "experiments": "",
            "page_refs": {},
        }

    summary = paragraphs[0][:500]
    key_sentences = [p[:200] for p in paragraphs[:5]]

    return {
        "summary": summary,
        "chapters": chapters,
        "key_sentences": key_sentences,
        "contributions": [p[:150] for p in paragraphs[:3]],
        "methodology": paragraphs[1][:500] if len(paragraphs) > 1 else "",
        "experiments": paragraphs[2][:500] if len(paragraphs) > 2 else "",
        "page_refs": {},
    }