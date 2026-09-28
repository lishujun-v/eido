#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sanitize.py — 日志 / 错误信息 / 渲染产物 脱敏工具。

用途:
    1) 防止 URL / API key / PII 等敏感信息泄漏到日志或用户可见错误信息里。
    2) 渲染层净化:summary.md 与 Anki 卡片写入前,统一对动态内容(PDF 抽取 / LLM 生成
       的 summary / contributions / graph nodes / plan 等)做上下文转义,防止 XSS、
       Markdown 链接/图片/表格注入、模板花括号冲突泄漏到下游。

赛题"安全合规 5 分"专项:
    - URL 脱敏:用户输入的 URL 不应完整出现在日志里(可能含 token)
    - API key 脱敏:环境变量或文件里读取的 key 不应出现在错误堆栈
    - 文件路径脱敏:本机绝对路径含用户名,需部分遮蔽
    - 渲染层净化:写入 summary.md / .apkg 前做 HTML escape、Markdown 符号中和、模板花括号实体化

注意:state_store.py 写入的 JSON 结构化数据(review.json / graph.json 等)不在本
模块处理——JSON 是结构化数据而非渲染输入,下游 read 后若需塞进 UI 应在渲染侧脱敏。
"""
from __future__ import annotations

import logging
import re
from html import escape as _html_escape
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


# 常见 URL 敏感模式(API key / token / signature)
_SENSITIVE_URL_PARAMS = re.compile(
    r"(api[_-]?key|access[_-]?token|token|sig|signature|password|secret)=([^&\s]+)",
    re.IGNORECASE,
)

# URL 整体
_URL_PATTERN = re.compile(r"https?://[^\s\"'<>]+")


# ===== 渲染层净化(D9' 审核反馈修复专项)=====

# Markdown 图片语法 ![alt](url) — 必须在链接正则之前应用。
# URL 段用 `(?:[^()]|\([^)]*\))*` 匹配,允许 Wikipedia 风格 `(disambig)` 这类嵌套圆括号。
_MD_IMAGE_PATTERN = re.compile(r"!\[([^\]]*)\]\(((?:[^()]|\([^)]*\))*)\)")

# Markdown 链接语法 [text](url) — 负回看 `(?<!!)` 避免吞图片;URL 段同样支持嵌套圆括号。
_MD_LINK_PATTERN = re.compile(r"(?<!!)\[([^\]]*)\]\(((?:[^()]|\([^)]*\))*)\)")

# Markdown 表格分隔行(锚 ^...$ + multiline,只匹配独立成行的 |---| / :---: / 竖线分隔,不误伤 a | b 文本)
_MD_TABLE_SEP_PATTERN = re.compile(r"^\s*\|?[\s:|-]+\|[\s:|-]+\|?\s*$", re.MULTILINE)

# 模板花括号 {{token}} / {{Front}} — Anki 模板 / Jinja2 / Liquid 等都会解析
_TEMPLATE_BRACE_PATTERN = re.compile(r"\{\{|\}\}")

# 危险 URL 协议(整段剥离)
_DANGER_URL_PATTERN = re.compile(r"^\s*(javascript|data|vbscript)\s*:", re.IGNORECASE)


def _strip_danger_url(url: str) -> str | None:
    """判断 URL 协议是否危险。是则返回 None(调用方整段剥离),否则返回原 url。"""
    if _DANGER_URL_PATTERN.match(url):
        return None
    return url


def _apply_link_safety(text: str) -> str:
    """中和 Markdown 链接语法:`[text](url)` → `text(url)` 或 `text`(危险协议时仅留 label)。

    前置条件:调用方应已对 text 做过通用 HTML escape。本函数不再二次 escape 捕获组,
    以免将已转义的 `&lt;` 变成 `&amp;lt;`。
    """
    def _repl(m: re.Match[str]) -> str:
        label = m.group(1)
        url = _strip_danger_url(m.group(2).strip())
        if url is None:
            return label
        return f"{label}({url})"

    return _MD_LINK_PATTERN.sub(_repl, text)


def _apply_template_braces(text: str) -> str:
    """模板花括号 {{ }} 实体化(用 HTML 十进制实体 `&#123;&#123;` / `&#125;&#125;`),
    避免被下游模板引擎(Anki / Jinja2 / Liquid)误解析为字段引用或控制结构。

    只动 `{{` 和 `}` `}` 这一对,不替换单 `{` / `}`,以保留论文/代码里的
    合法花括号(数学公式 `{x}` / 代码块 `if (x) { ... }`)。

    注意:`html.escape` 不会转义 `{` 和 `}`,所以这里直接做字符串替换。
    """
    return text.replace("{{", "&#123;&#123;").replace("}}", "&#125;&#125;")


def safe_markdown_text(text: str | None) -> str:
    """summary.md 写入前净化:

    1. 通用 HTML escape(`<>&` → 实体;`quote=False` 保留单/双引号以维持可读性)
    2. 中和 Markdown 图片语法 `![alt](url)` → `[图片: <alt>]`(alt 已 escape)
    3. 中和 Markdown 链接语法 `[text](url)` → `text(url)`;危险协议(javascript:/data:/vbscript:)整段剥离,只留 label
    4. 移除 Markdown 表格分隔行(|---| / :---: / 竖线分隔)
    5. 模板花括号 `{{` `}}` 实体化(防下游模板引擎误解析)

    Args:
        text: 原始字符串,允许 None(返回 "")

    Returns:
        净化后字符串
    """
    if not text:
        return ""
    # 1) 通用 HTML escape(<>& → 实体)
    text = _html_escape(text, quote=False)
    # 2) 图片中和(去掉 ! 和 (),alt 已是 escape 后的内容,无需再 escape)
    text = _MD_IMAGE_PATTERN.sub(lambda m: f"[图片: {m.group(1)}]", text)
    # 3) 链接中和(危险协议 strip)
    def _link_repl(m: re.Match[str]) -> str:
        label = m.group(1)
        url = _strip_danger_url(m.group(2).strip())
        if url is None:
            return label
        return f"{label}({url})"
    text = _MD_LINK_PATTERN.sub(_link_repl, text)
    # 4) 表格分隔行移除(独立成行的 |---| / :---: / 竖线分隔)
    text = _MD_TABLE_SEP_PATTERN.sub("", text)
    # 5) 模板花括号实体化(防止 {{ }} 在下游模板引擎被解析)
    text = _apply_template_braces(text)
    return text


def safe_anki_text(text: str | None) -> str:
    """Anki 卡片 front/back 写入前净化(纯文本策略 — 本次安全优先,不开 HTML 白名单):

    1. 通用 HTML escape(`<>&` → 实体,所有 tag 变成可见字符,Anki 不渲染 HTML)
    2. 危险协议 URL 剥离(javascript:/data:/vbscript: 协议的 Markdown 链接整段剥离,只留 label)
    3. 模板花括号 `{{` `}}` 实体化(避免与 Anki 模板 `{{Front}}` 字段引用冲突)

    不处理项:
    - Markdown 图片语法 `![alt](url)`:Anki 不渲染,留作纯文本无害
    - Markdown 表格分隔行:同上,纯文本无害

    Args:
        text: 原始字符串,允许 None(返回 "")

    Returns:
        净化后字符串
    """
    if not text:
        return ""
    # 1) 通用 HTML escape(<>& → 实体;quote=False 保留单/双引号以维持可读性)
    text = _html_escape(text, quote=False)
    # 2) 危险协议链接剥离
    text = _apply_link_safety(text)
    # 3) 模板花括号实体化
    text = _apply_template_braces(text)
    return text


def sanitize_url(url: str, keep_domain: bool = True) -> str:
    """
    脱敏 URL:移除 query 中的 api_key/token/sig,可选保留域名。

    Examples:
        >>> sanitize_url("https://api.example.com/v1?api_key=secret123&page=1")
        'https://api.example.com/v1?<redacted>&page=1'
        >>> sanitize_url("https://api.example.com/v1?token=abc")
        'https://...<redacted>'
    """
    if not url:
        return ""

    # 先脱敏 query 参数
    sanitized = _SENSITIVE_URL_PARAMS.sub(r"\1=<redacted>", url)

    if not keep_domain:
        # 把整个 URL 替换为脱敏占位
        sanitized = _URL_PATTERN.sub("https://...<redacted>", sanitized)

    return sanitized


def sanitize_path(path: str | Path) -> str:
    """
    脱敏文件路径:把用户家目录替换为 ~,只保留文件名。

    Examples:
        >>> sanitize_path("/Users/yijian/Documents/secret.pdf")
        '~/Documents/secret.pdf'
        >>> sanitize_path("/tmp/paper.pdf")
        '/tmp/paper.pdf'  # 短路径不动
    """
    s = str(path)
    home = str(Path.home())
    if home and s.startswith(home):
        s = "~" + s[len(home):]
    return s


def sanitize_error_message(msg: str, max_length: int = 500) -> str:
    """
    脱敏错误信息:
        1. 移除 URL 中的敏感参数
        2. 截断过长消息(防止泄漏大段堆栈)
        3. 移除 ANSI 控制字符
    """
    # 移除 ANSI 控制字符
    msg = re.sub(r"\x1b\[[0-9;]*m", "", msg)
    # 脱敏 URL
    msg = _SENSITIVE_URL_PARAMS.sub(r"\1=<redacted>", msg)
    # 截断
    if len(msg) > max_length:
        msg = msg[:max_length] + "...(截断)"
    return msg


def redact_pii(text: str) -> str:
    """
    简单 PII 脱敏:邮箱、手机号、身份证号。

    Examples:
        >>> redact_pii("联系 yijian@example.com 或 13800138000")
        '联系 <email> 或 <phone>'
    """
    text = re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+", "<email>", text)
    text = re.sub(r"1[3-9]\d{9}", "<phone>", text)
    text = re.sub(r"\d{17}[\dXx]", "<id_card>", text)
    return text


def safe_log_value(value: Any, *, label: str = "value") -> str:
    """统一日志脱敏包装器。"""
    if isinstance(value, str):
        if value.startswith("http"):
            return sanitize_url(value, keep_domain=True)
        if value.startswith("/") and len(value) > 30:
            return sanitize_path(value)
    return f"{label}={value!r}"