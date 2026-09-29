"""Small LLM adapter supporting OpenAI-compatible and Anthropic APIs."""

from __future__ import annotations

import json
import asyncio
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from collections.abc import Awaitable, Callable
from typing import Any

from .config import AgentConfig


class LLMProviderError(RuntimeError):
    """Provider failure with the small amount of retry metadata we can trust."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        retry_after_s: float | None = None,
        kind: str | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after_s = retry_after_s
        self.kind = kind


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResult:
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)


class LLMClient:
    def __init__(self, config: AgentConfig):
        self.config = config

    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        text_callback: Callable[[str], Awaitable[None]] | None = None,
        thinking_callback: Callable[[str], Awaitable[None]] | None = None,
        required_tool: str | None = None,
    ) -> LLMResult:
        try:
            protocol = str(self.config.protocol or "openai").strip().lower()
            if protocol == "anthropic":
                return await self._anthropic(messages, tools, text_callback, thinking_callback, required_tool)
            if protocol == "openai":
                return await self._openai(messages, tools, text_callback, thinking_callback, required_tool)
            raise ValueError(
                f"Unsupported LLM protocol: {self.config.protocol!r}; "
                "expected 'openai' or 'anthropic'"
            )
        except asyncio.CancelledError:
            # Cancellation is a control-flow signal, never a provider failure.
            raise
        except LLMProviderError:
            raise
        except Exception as exc:
            raise _as_provider_error(exc) from exc

    async def _openai(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        text_callback: Callable[[str], Awaitable[None]] | None,
        thinking_callback: Callable[[str], Awaitable[None]] | None,
        required_tool: str | None,
    ) -> LLMResult:
        from openai import AsyncOpenAI

        # AsyncOpenAI already supplies ``Authorization: Bearer <api_key>``.
        # Passing that header again through ``default_headers`` makes httpx
        # coalesce the duplicate values into ``Bearer <key>, Bearer <key>``.
        # DeepSeek's OpenResty gateway rejects that malformed credential with
        # an HTML 400 before the request reaches the API application.
        headers = _openai_headers(self.config)
        client = AsyncOpenAI(
            api_key=self.config.api_key or "",
            base_url=self.config.api_base or None,
            default_headers=headers or None,
            timeout=self.config.request_timeout_s,
        )
        request = dict(
            model=self.config.model,
            messages=messages,
            tools=tools or None,
            temperature=self.config.temperature,
            max_tokens=self.config.max_output_tokens,
            stream=bool(text_callback or thinking_callback),
        )
        if required_tool:
            request["tool_choice"] = {
                "type": "function",
                "function": {"name": required_tool},
            }
        response = await client.chat.completions.create(**request)
        if text_callback:
            content_parts: list[str] = []
            pending_calls: dict[int, dict[str, str]] = {}
            async for chunk in response:
                delta = chunk.choices[0].delta
                thinking = _openai_thinking_delta(delta)
                if thinking and thinking_callback:
                    await thinking_callback(thinking)
                if delta.content:
                    content_parts.append(delta.content)
                    await text_callback(delta.content)
                for call in delta.tool_calls or []:
                    pending = pending_calls.setdefault(
                        call.index, {"id": "", "name": "", "arguments": ""}
                    )
                    if call.id:
                        pending["id"] = call.id
                    if call.function:
                        pending["name"] += call.function.name or ""
                        pending["arguments"] += call.function.arguments or ""
            calls = []
            for pending in pending_calls.values():
                try:
                    arguments = json.loads(pending["arguments"] or "{}")
                except json.JSONDecodeError:
                    arguments = {}
                calls.append(ToolCall(pending["id"], pending["name"], arguments))
            return LLMResult("".join(content_parts), calls)

        message = response.choices[0].message
        calls = []
        for call in message.tool_calls or []:
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}
            calls.append(
                ToolCall(
                    call.id,
                    call.function.name,
                    arguments if isinstance(arguments, dict) else {},
                )
            )
        return LLMResult(message.content or "", calls)

    async def _anthropic(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        text_callback: Callable[[str], Awaitable[None]] | None,
        thinking_callback: Callable[[str], Awaitable[None]] | None,
        required_tool: str | None,
    ) -> LLMResult:
        from anthropic import AsyncAnthropic

        system = "\n\n".join(
            str(m["content"]) for m in messages if m["role"] == "system"
        )
        conversation = _to_anthropic_messages(messages)
        anthropic_tools = [
            {
                "name": t["function"]["name"],
                "description": t["function"]["description"],
                "input_schema": t["function"]["parameters"],
            }
            for t in tools
        ]
        client = AsyncAnthropic(
            api_key=self.config.api_key or "",
            base_url=self.config.api_base or None,
            default_headers=_headers(self.config) or None,
            timeout=self.config.request_timeout_s,
        )
        request = dict(
            model=self.config.model, system=system, messages=conversation,
            tools=anthropic_tools or None, temperature=self.config.temperature,
            max_tokens=self.config.max_output_tokens,
        )
        if required_tool:
            request["tool_choice"] = {"type": "tool", "name": required_tool}
        if text_callback or thinking_callback:
            async with client.messages.stream(**request) as stream:
                async for event in stream:
                    if event.type != "content_block_delta":
                        continue
                    delta = event.delta
                    if getattr(delta, "type", "") == "text_delta" and text_callback:
                        await text_callback(str(getattr(delta, "text", "")))
                    elif getattr(delta, "type", "") == "thinking_delta" and thinking_callback:
                        await thinking_callback(str(getattr(delta, "thinking", "")))
                response = await stream.get_final_message()
        else:
            response = await client.messages.create(**request)
        text = "".join(block.text for block in response.content if block.type == "text")
        calls = [
            ToolCall(
                block.id,
                block.name,
                block.input if isinstance(block.input, dict) else {},
            )
            for block in response.content
            if block.type == "tool_use"
        ]
        return LLMResult(text, calls)


def _openai_thinking_delta(delta: Any) -> str:
    """Read reasoning fields used by OpenAI-compatible providers.

    Different compatible APIs expose this as ``reasoning_content``,
    ``reasoning`` or a nested content object. Keep the wire protocol stable
    while accepting those common variants.
    """
    for field in ("reasoning_content", "reasoning", "thinking"):
        value = getattr(delta, field, None)
        if isinstance(value, str) and value:
            return value
        if isinstance(value, dict):
            content = value.get("content") or value.get("text")
            if isinstance(content, str) and content:
                return content
        content = getattr(value, "content", None) or getattr(value, "text", None)
        if isinstance(content, str) and content:
            return content
    return ""


def _to_anthropic_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert the engine's OpenAI-style messages to Anthropic content blocks.

    The engine deliberately uses one provider-neutral internal representation.
    Conversion happens only at the provider boundary so OpenAI-compatible Agents
    continue receiving their native ``tool_calls`` / ``role=tool`` messages.
    """
    converted: list[dict[str, Any]] = []

    for message in messages:
        role = message.get("role")
        if role == "system":
            continue

        if role == "tool":
            target_role = "user"
            blocks = [
                {
                    "type": "tool_result",
                    "tool_use_id": str(message.get("tool_call_id") or ""),
                    "content": _anthropic_text(message.get("content")),
                }
            ]
        elif role == "assistant":
            target_role = "assistant"
            blocks = []
            content = message.get("content")
            if content not in (None, ""):
                blocks.append({"type": "text", "text": _anthropic_text(content)})
            for call in message.get("tool_calls") or []:
                function = call.get("function") or {}
                arguments = function.get("arguments") or "{}"
                if isinstance(arguments, str):
                    try:
                        arguments = json.loads(arguments)
                    except json.JSONDecodeError:
                        arguments = {}
                blocks.append(
                    {
                        "type": "tool_use",
                        "id": str(call.get("id") or ""),
                        "name": str(function.get("name") or ""),
                        "input": arguments if isinstance(arguments, dict) else {},
                    }
                )
            if not blocks:
                blocks.append({"type": "text", "text": " "})
        else:
            target_role = "user"
            blocks = _anthropic_user_blocks(message.get("content"))

        # Anthropic requires user/assistant turns. In particular, parallel tool
        # results produced by the engine are consecutive role=tool messages and
        # must become one user turn containing multiple tool_result blocks.
        if converted and converted[-1]["role"] == target_role:
            converted[-1]["content"].extend(blocks)
        else:
            converted.append({"role": target_role, "content": blocks})

    return converted


def _anthropic_user_blocks(content: Any) -> list[dict[str, Any]]:
    if not isinstance(content, list):
        return [{"type": "text", "text": _anthropic_text(content)}]
    blocks: list[dict[str, Any]] = []
    for part in content:
        if not isinstance(part, dict):
            continue
        if part.get("type") == "text":
            blocks.append({"type": "text", "text": _anthropic_text(part.get("text"))})
        elif part.get("type") == "image_url":
            image_url = part.get("image_url")
            url = image_url.get("url") if isinstance(image_url, dict) else ""
            if isinstance(url, str) and url.startswith("data:image/") and ";base64," in url:
                media_type, data = url[5:].split(";base64,", 1)
                blocks.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}})
    return blocks or [{"type": "text", "text": "请分析这张图片。"}]


def _anthropic_text(content: Any) -> str:
    if content is None:
        return " "
    if isinstance(content, str):
        return content or " "
    return json.dumps(content, ensure_ascii=False)


def _headers(config: AgentConfig) -> dict[str, str]:
    headers = {}
    if config.auth_header == "x-api-key" and config.api_key:
        headers["x-api-key"] = config.api_key
    if config.auth_header == "authorization_bearer" and config.api_key:
        headers["authorization"] = f"Bearer {config.api_key}"
    if config.api_version:
        headers["anthropic-version"] = config.api_version
    return headers


def _openai_headers(config: AgentConfig) -> dict[str, str]:
    """Return extra headers for OpenAI-compatible clients.

    The OpenAI SDK owns bearer authentication from ``api_key``. Keep custom
    headers such as ``x-api-key`` but never duplicate its Authorization header.
    Anthropic still uses :func:`_headers` directly because its SDK does not
    provide the same OpenAI-compatible authentication behavior.
    """
    headers = _headers(config)
    headers.pop("authorization", None)
    return headers


def _as_provider_error(exc: Exception) -> LLMProviderError:
    """Normalize SDK-specific failures without making SDK classes a dependency."""
    response = getattr(exc, "response", None)
    status_code = getattr(exc, "status_code", None) or getattr(response, "status_code", None)
    try:
        status_code = int(status_code) if status_code is not None else None
    except (TypeError, ValueError):
        status_code = None
    headers = getattr(response, "headers", None) or getattr(exc, "headers", None)
    text = str(exc)
    class_name = type(exc).__name__.lower()
    kind = "timeout" if isinstance(exc, asyncio.TimeoutError) or "timeout" in class_name else None
    if kind is None and ("connection" in class_name or "connect" in class_name):
        kind = "connection"
    return LLMProviderError(
        text or type(exc).__name__, status_code=status_code,
        retry_after_s=_retry_after_seconds(headers, text), kind=kind,
    )


def _retry_after_seconds(headers: Any, text: str) -> float | None:
    """Read common provider rate-limit hints, accepting header and body variants."""
    def header(name: str) -> Any:
        if headers is None:
            return None
        try:
            return headers.get(name) or headers.get(name.title())
        except AttributeError:
            return None

    raw_ms = header("retry-after-ms")
    if raw_ms is not None:
        try:
            return max(0.0, float(raw_ms) / 1000)
        except (TypeError, ValueError):
            pass
    raw = header("retry-after")
    if raw is not None:
        value = str(raw).strip()
        try:
            return max(0.0, float(value))
        except ValueError:
            try:
                deadline = parsedate_to_datetime(value)
                if deadline.tzinfo is None:
                    deadline = deadline.replace(tzinfo=timezone.utc)
                return max(0.0, (deadline - datetime.now(deadline.tzinfo)).total_seconds())
            except (TypeError, ValueError, IndexError, OverflowError):
                pass
    match = re.search(
        r"(?:retry after|try again in)\s+(\d+(?:\.\d+)?)\s*"
        r"(ms|milliseconds|s|sec|secs|seconds|m|min|minutes)?",
        text, re.IGNORECASE,
    )
    if not match:
        return None
    value = float(match.group(1))
    unit = (match.group(2) or "s").lower()
    if unit.startswith("m") and unit not in {"ms", "milliseconds"}:
        value *= 60
    elif unit in {"ms", "milliseconds"}:
        value /= 1000
    return max(0.0, value)
