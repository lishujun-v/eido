#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
llm_client.py — LLM 客户端抽象层(D7 升级版)。

D7 新增:
    - 统一重试 + 指数退避(retries 参数,默认 3)
    - 输入大小限制(max_input_chars,默认 16K)
    - 错误信息脱敏(URL / API key 不进日志)
    - 超时控制(timeout,默认 30s)

调用方用法:
    from llm_client import get_default_client
    client = get_default_client()
    text = client.chat(system="...", user="...", max_input_chars=16000)
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any, Protocol

import requests

from sanitize import sanitize_error_message, sanitize_url

log = logging.getLogger(__name__)


# ============== 默认限制 ==============

DEFAULT_MAX_INPUT_CHARS = 16000  # 16K 字符,适配多数 LLM 上下文
DEFAULT_MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30.0


# ============== 异常类型 ==============

class LLMError(Exception):
    """LLM 调用失败的基类。"""
    def __init__(self, message: str, *, retried: int = 0, cause: Exception | None = None):
        super().__init__(message)
        self.retried = retried
        self.cause = cause


class LLMRateLimitError(LLMError):
    """429 / 限流。"""


class LLMAuthError(LLMError):
    """401 / 403 / 认证失败。"""


class LLMTimeoutError(LLMError):
    """超时。"""


class LLMInputTooLargeError(LLMError):
    """输入超长。"""


# ============== 抽象接口 ==============

class LLMClient(Protocol):
    name: str

    def chat(
        self,
        system: str,
        user: str,
        *,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        max_input_chars: int = DEFAULT_MAX_INPUT_CHARS,
        timeout: float = DEFAULT_TIMEOUT,
        retries: int = DEFAULT_MAX_RETRIES,
    ) -> str: ...


# ============== 输入大小校验 ==============

def _check_input_size(system: str, user: str, max_chars: int) -> None:
    total = len(system) + len(user)
    if total > max_chars:
        raise LLMInputTooLargeError(
            f"输入过大: {total} > {max_chars} 字符 "
            f"(system={len(system)}, user={len(user)})",
        )


# ============== 讯飞星辰 MaaS 客户端 ==============

class XingchenClient:
    """
    调讯飞星辰 MaaS 聊天接口。

    环境变量:
        XINGCHEN_API_KEY      API key(必需)
        XINGCHEN_CHAT_ENDPOINT 聊天 endpoint(必需)
        XINGCHEN_MODEL         模型名,默认 "generalv3.5"
    """
    name = "xingchen-maas-chat"

    def __init__(
        self,
        api_key: str | None = None,
        endpoint: str | None = None,
        model: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        self.api_key = api_key or os.environ.get("XINGCHEN_API_KEY", "")
        self.endpoint = endpoint or os.environ.get("XINGCHEN_CHAT_ENDPOINT", "")
        self.model = model or os.environ.get("XINGCHEN_MODEL", "generalv3.5")
        self.timeout = timeout

        if not self.api_key or not self.endpoint:
            raise RuntimeError(
                "XingchenClient 需要 XINGCHEN_API_KEY 与 XINGCHEN_CHAT_ENDPOINT;"
                "未配置将无法使用,请改用 MockLLMClient 或 get_default_client()"
            )

    def chat(
        self,
        system: str,
        user: str,
        *,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        max_input_chars: int = DEFAULT_MAX_INPUT_CHARS,
        timeout: float = DEFAULT_TIMEOUT,
        retries: int = DEFAULT_MAX_RETRIES,
    ) -> str:
        """调星辰聊天接口,返回纯文本。D7 重试 + 大小限制 + 脱敏。"""
        _check_input_size(system, user, max_input_chars)

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        last_err: Exception | None = None
        for attempt in range(1, retries + 1):
            try:
                resp = requests.post(
                    self.endpoint, json=payload, headers=headers, timeout=timeout,
                )
                # 区分错误类型
                if resp.status_code in (401, 403):
                    raise LLMAuthError(
                        f"认证失败: HTTP {resp.status_code}", cause=Exception(resp.text[:200]),
                    )
                if resp.status_code == 429:
                    raise LLMRateLimitError(
                        f"被限流: HTTP 429", cause=Exception(resp.text[:200]),
                    )
                resp.raise_for_status()
                data = resp.json()
                choices = data.get("choices") or data.get("data") or []
                if choices:
                    msg = choices[0].get("message") or choices[0]
                    content = msg.get("content") if isinstance(msg, dict) else msg
                    if isinstance(content, str):
                        return content.strip()
                return json.dumps(data, ensure_ascii=False)
            except requests.Timeout as e:
                last_err = LLMTimeoutError(f"超时: {e}", cause=e, retried=attempt)
            except LLMAuthError:
                raise  # 认证错误不重试
            except LLMRateLimitError as e:
                last_err = e
            except (requests.RequestException, KeyError, ValueError) as e:
                last_err = LLMError(f"网络/解析错误: {e}", cause=e, retried=attempt)

            if attempt < retries:
                wait = 2 ** (attempt - 1)  # 1s, 2s, 4s
                log.warning(
                    "XingchenClient attempt %d/%d failed: %s; retry in %ds",
                    attempt, retries, sanitize_error_message(str(last_err)), wait,
                )
                time.sleep(wait)

        raise last_err or LLMError("XingchenClient chat 失败(未知错误)")


# ============== Mock 客户端 ==============

class MockLLMClient:
    """本地启发式 LLM。无外部依赖,基于规则抽取。"""
    name = "mock-llm"

    def chat(
        self,
        system: str,
        user: str,
        *,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        max_input_chars: int = DEFAULT_MAX_INPUT_CHARS,
        timeout: float = DEFAULT_TIMEOUT,
        retries: int = DEFAULT_MAX_RETRIES,
    ) -> str:
        """基于 system+user 启发式返回。"""
        # mock 不实际校验大小(永远通过),但保留接口一致
        if "请基于以下论文全文" in user or "论文全文" in user:
            return self._mock_paper_summary(user)
        if "抽取实体关系" in user or "实体关系图" in user:
            return self._mock_graph(user)
        # make_plan prompt:user 里同时含"学习目标"+周/天
        if "学习目标" in user and "周" in user and ("小时" in user or "hours" in user):
            return self._mock_plan(user)
        return f"[mock response] system={system[:50]}... | user={user[:80]}..."

    def _mock_plan(self, user: str) -> str:
        """生成更真实的 mock 学习路径(根据 goal / weeks 抽取)。"""
        # 尝试从 user 里抽取 goal 和 weeks
        import re
        m_goal = re.search(r"学习目标[::]\s*(.+)", user)
        goal = m_goal.group(1).split("\n")[0].strip() if m_goal else "该主题"
        m_weeks = re.search(r"可用周数[::]\s*(\d+)", user)
        weeks = int(m_weeks.group(1)) if m_weeks else 4

        phases = []
        for w in range(1, weeks + 1):
            phases.append({
                "week": w,
                "theme": f"第 {w} 周:深入理解 {goal} 的核心概念与算法",
                "objectives": [f"掌握方面 {w}", f"完成练习 {w}"],
                "tasks": [f"精读论文第 {w} 部分", f"做笔记 {w}"],
            })
        daily_tasks = []
        for w in range(1, weeks + 1):
            for d in range(1, 6):  # 工作日 5 天
                daily_tasks.append({
                    "week": w, "day": d,
                    "task": f"学习 '{goal}' 的子主题 {w}.{d}",
                    "hours": 1.5,
                    "paper_ref": None,
                })
        result = {
            "phases": phases,
            "daily_tasks": daily_tasks,
            "resources": [
                {"type": "paper", "title": "主论文(用户输入)", "ref": "user_provided"},
                {"type": "tutorial", "title": f"《{goal}》经典教程", "url": "https://example.com/tutorial"},
            ],
        }
        return json.dumps(result, ensure_ascii=False)

    def _extract_text(self, user: str) -> str:
        m = re.search(r"【论文全文】\s*(.+?)(?:【输出要求】|$)", user, re.DOTALL)
        return m.group(1).strip() if m else user

    def _extract_first_n_sentences(self, text: str, n: int = 3) -> list[str]:
        sentences = re.split(r"(?<=[.!?。！？])\s+", text)
        sentences = [s.strip() for s in sentences if s.strip()]
        return sentences[:n]

    def _find_chapter_titles(self, text: str) -> list[dict[str, Any]]:
        titles: list[dict[str, Any]] = []
        for line in text.split("\n"):
            line = line.strip()
            if not line or len(line) > 80:
                continue
            if re.match(r"^(\d+(\.\d+)*)\s+([A-Z][^\n]{2,80})$", line):
                titles.append({"title": line, "page": 1, "preview": ""})
        return titles[:10]

    def _mock_paper_summary(self, user: str) -> str:
        text = self._extract_text(user)
        sentences = self._extract_first_n_sentences(text, n=5)
        chapters = self._find_chapter_titles(text)
        summary = " ".join(sentences[:2]) if sentences else "(mock: 未能抽取摘要)"
        if len(summary) > 600:
            summary = summary[:600] + "..."
        result = {
            "summary": summary,
            "chapters": chapters,
            "key_sentences": sentences,
            "contributions": [f"[mock] {s}" for s in sentences[:2]] if sentences else ["[mock] 未抽取到贡献"],
            "methodology": sentences[2] if len(sentences) > 2 else "[mock] 未抽取到方法论",
            "experiments": sentences[3] if len(sentences) > 3 else "[mock] 未抽取到实验",
            "page_refs": {"summary": "[mock] 未标注页码"},
        }
        return json.dumps(result, ensure_ascii=False)

    def _mock_graph(self, user: str) -> str:
        result = {
            "nodes": [
                {"id": "n1", "type": "concept", "label": "[mock] 核心概念"},
                {"id": "n2", "type": "method", "label": "[mock] 方法"},
            ],
            "edges": [{"source": "n1", "target": "n2", "relation": "used_by"}],
            "centrality": {"n1": 0.6, "n2": 0.4},
        }
        return json.dumps(result, ensure_ascii=False)

    def _mock_plan(self, user: str) -> str:
        """根据 user prompt 抽取 goal / weeks,生成更真实的 mock 学习路径。"""
        m_goal = re.search(r"学习目标[::]\s*(.+)", user)
        goal = m_goal.group(1).split("\n")[0].strip() if m_goal else "该主题"
        m_weeks = re.search(r"可用周数[::]\s*(\d+)", user)
        weeks = int(m_weeks.group(1)) if m_weeks else 4
        phases = [{
            "week": w,
            "theme": f"第 {w} 周:深入理解 {goal} 的核心概念与算法",
            "objectives": [f"掌握方面 {w}", f"完成练习 {w}"],
            "tasks": [f"精读论文第 {w} 部分", f"做笔记 {w}"],
        } for w in range(1, weeks + 1)]
        daily_tasks = [{
            "week": w, "day": d,
            "task": f"学习 '{goal}' 的子主题 {w}.{d}",
            "hours": 1.5, "paper_ref": None,
        } for w in range(1, weeks + 1) for d in range(1, 6)]
        result = {
            "phases": phases,
            "daily_tasks": daily_tasks,
            "resources": [
                {"type": "paper", "title": "主论文(用户输入)", "ref": "user_provided"},
                {"type": "tutorial", "title": f"《{goal}》经典教程", "url": "https://example.com/tutorial"},
            ],
        }
        return json.dumps(result, ensure_ascii=False)


# ============== 工厂函数 ==============

def get_default_client(prefer: str = "xingchen") -> LLMClient:
    """获取默认 LLM 客户端。优先讯飞星辰,失败回退到 Mock。"""
    if prefer == "mock":
        log.info("get_default_client: 使用 MockLLMClient(显式指定)")
        return MockLLMClient()

    try:
        client = XingchenClient()
        log.info("get_default_client: 使用 XingchenClient")
        return client
    except RuntimeError as e:
        log.warning(
            "get_default_client: 讯飞星辰不可用(%s),回退到 MockLLMClient",
            sanitize_error_message(str(e)),
        )
        return MockLLMClient()


# ============== JSON 解析容错 ==============

def parse_llm_json(raw: str) -> dict[str, Any]:
    """容错解析 LLM 输出的 JSON(```json 包裹 + 前后废话)。"""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    raise ValueError(f"无法解析 LLM 输出为 JSON: {raw[:200]}...")