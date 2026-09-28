#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pdf_parser.py — PDF 文本提取(基于 PyMuPDF / fitz)。

D1 阶段:基础版,只解文本,不调 LLM。
D2 阶段会扩展:表格/公式容错、扫描版 OCR 兜底、章节识别。
"""
from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger(__name__)


def extract_text(pdf_path: str | Path, max_pages: int | None = None) -> str:
    """
    提取 PDF 全文文本。

    Args:
        pdf_path: PDF 文件路径
        max_pages: 最大页数(防止超长文档),None = 全部

    Returns:
        拼接的全文文本(每页用 "\n\n---\n\n" 分隔)

    Raises:
        FileNotFoundError: PDF 不存在
        RuntimeError: PyMuPDF 未安装或解析失败
        ValueError: PDF 加密或损坏
    """
    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        raise RuntimeError(
            "需要 PyMuPDF: pip install pymupdf"
        ) from e

    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF 不存在: {pdf_path}")
    if not pdf_path.is_file():
        raise ValueError(f"路径不是文件: {pdf_path}")

    try:
        doc = fitz.open(str(pdf_path))
    except Exception as e:
        raise ValueError(f"无法打开 PDF(可能加密或损坏): {pdf_path}") from e

    try:
        if doc.is_encrypted:
            raise ValueError(f"PDF 已加密,暂不支持: {pdf_path}")

        pages_to_read = len(doc) if max_pages is None else min(max_pages, len(doc))
        chunks: list[str] = []
        for i in range(pages_to_read):
            page = doc.load_page(i)
            text = page.get_text("text")
            if text.strip():
                chunks.append(f"[Page {i+1}]\n{text}")
        full_text = "\n\n---\n\n".join(chunks)
        log.info(
            "extract_text: %s,共读 %d/%d 页,文本长度 %d",
            pdf_path.name, pages_to_read, len(doc), len(full_text),
        )
        return full_text
    finally:
        doc.close()


def paper_id_from_path(pdf_path: str | Path) -> str:
    """从 PDF 路径生成稳定 paper_id。"""
    from preflight import make_paper_id
    return make_paper_id(str(Path(pdf_path).resolve()))


def page_count(pdf_path: str | Path) -> int:
    """返回 PDF 页数。"""
    try:
        import fitz
    except ImportError as e:
        raise RuntimeError("需要 PyMuPDF: pip install pymupdf") from e

    doc = fitz.open(str(pdf_path))
    try:
        return len(doc)
    finally:
        doc.close()


# ============== D1 验收测试入口 ==============

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("用法: python3 pdf_parser.py <pdf_path> [max_pages]")
        sys.exit(1)
    pdf = sys.argv[1]
    max_p = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    try:
        text = extract_text(pdf, max_pages=max_p)
        print(f"=== PDF: {pdf} ===")
        print(f"=== 总页数: {page_count(pdf)} ===")
        print(f"=== 读取前 {max_p} 页 ===")
        print(text[:2000])
        if len(text) > 2000:
            print(f"\n... (省略 {len(text)-2000} 字符)")
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(2)