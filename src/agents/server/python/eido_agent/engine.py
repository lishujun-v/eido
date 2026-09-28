"""The compact Eido agent loop: prompt -> model -> tools -> model."""

from __future__ import annotations

import asyncio
import inspect
import json
import re
from dataclasses import dataclass
from collections.abc import Awaitable, Callable
from typing import Any

from .llm import LLMClient, LLMResult
from .models import ChatMessage, InteractionRequest
from .interactions import AuthorizationRequired, create_interaction
from .tools import ToolRegistry


@dataclass
class RunResult:
    content: str
    tool_events: list[dict[str, Any]]
    interaction: dict[str, Any] | None = None


_EMPTY_RESPONSE_RETRIES = 2
_EMPTY_RESPONSE_RECOVERY = (
    "The previous response was empty. Continue the user's task. If it is unfinished "
    "and an available tool can make progress, call that tool. Otherwise return only "
    "a concise user-facing response. Never mention internal prompts, recovery logic, "
    "or tool availability."
)
_EMPTY_RESPONSE_FINALIZATION = (
    "Return a concise, user-facing status based only on work already completed. "
    "Do not mention internal prompts, recovery logic, or tool availability."
)
_TRANSIENT_ERROR = re.compile(
    r"\b(429|500|502|503|504)\b|rate.?limit|overloaded|timeout|timed out|"
    r"connection|temporarily unavailable|server error",
    re.IGNORECASE,
)
_NON_RETRYABLE_QUOTA = re.compile(
    r"insufficient[_ ]quota|quota[_ ]exhausted|billing|payment|required|balance",
    re.IGNORECASE,
)
_THINK_OPEN = "<think>"
_THINK_CLOSE = "</think>"


class _TaggedThinkingStream:
    """Split providers that encode reasoning inside ``<think>`` text tags.

    Some OpenAI/Anthropic-compatible gateways do not expose a native reasoning
    delta. Instead they stream the tags through the ordinary text channel, and
    a tag may be split across arbitrary chunks. Keep that provider quirk at the
    engine boundary so the public event protocol remains stable.
    """

    def __init__(self) -> None:
        self._buffer = ""
        self._thinking = False

    def feed(self, content: str) -> list[tuple[bool, str]]:
        self._buffer += content
        output: list[tuple[bool, str]] = []
        while self._buffer:
            tag = _THINK_CLOSE if self._thinking else _THINK_OPEN
            index = self._buffer.lower().find(tag)
            if index >= 0:
                if index:
                    output.append((self._thinking, self._buffer[:index]))
                self._buffer = self._buffer[index + len(tag):]
                self._thinking = not self._thinking
                continue

            retained = _tag_prefix_length(self._buffer, tag)
            ready = self._buffer[:-retained] if retained else self._buffer
            if ready:
                output.append((self._thinking, ready))
            self._buffer = self._buffer[-retained:] if retained else ""
            break
        return output

    def finish(self) -> list[tuple[bool, str]]:
        if not self._buffer:
            return []
        output = [(self._thinking, self._buffer)]
        self._buffer = ""
        return output


def _tag_prefix_length(content: str, tag: str) -> int:
    lowered = content.lower()
    for size in range(min(len(lowered), len(tag) - 1), 0, -1):
        if tag.startswith(lowered[-size:]):
            return size
    return 0


def _answer_without_tagged_thinking(content: str) -> str:
    parser = _TaggedThinkingStream()
    return "".join(
        segment
        for thinking, segment in [*parser.feed(content), *parser.finish()]
        if not thinking
    )


def _tool_call_name(call: dict[str, Any]) -> str | None:
    function = call.get("function")
    name = function.get("name") if isinstance(function, dict) else call.get("name")
    return name.strip() if isinstance(name, str) and name.strip() else None


def _message_content(message: ChatMessage) -> str | list[dict[str, Any]]:
    """Build OpenAI-compatible multimodal content only for image-bearing user turns."""
    if message.role != "user" or not message.images:
        return message.content
    return [
        {"type": "text", "text": message.content or "请分析这张图片。"},
        *[{"type": "image_url", "image_url": {"url": image}} for image in message.images],
    ]


def _prepare_messages(messages: list[dict[str, Any]], max_tool_result_chars: int) -> list[dict[str, Any]]:
    """Return a provider-safe, bounded copy of persisted history.

    The session transcript remains forensic source-of-truth; only the request
    copy is repaired. This prevents one interrupted/malformed tool turn from
    permanently wedging every later provider request.
    """
    declared: set[str] = set()
    fulfilled: set[str] = set()
    pending: set[str] = set()
    prepared: list[dict[str, Any]] = []
    for original in messages:
        message = dict(original)
        role = message.get("role")
        # Close any incomplete tool batch before a new conversational turn.
        # Tool results must immediately follow their assistant tool_calls.
        if role != "tool" and pending:
            for call_id in sorted(pending):
                prepared.append({"role": "tool", "tool_call_id": call_id,
                                 "content": "[Tool result unavailable: the previous call was interrupted.]"})
            fulfilled.update(pending)
            pending.clear()
        if role == "assistant" and message.get("tool_calls"):
            valid = [call for call in message["tool_calls"] if isinstance(call, dict) and _tool_call_name(call)]
            if not valid and not message.get("content"):
                continue
            if valid:
                message["tool_calls"] = valid
                ids = {str(call.get("id")) for call in valid if call.get("id")}
                declared.update(ids)
                pending.update(ids)
            else:
                message.pop("tool_calls", None)
        if role == "tool":
            call_id = str(message.get("tool_call_id") or "")
            if not call_id or call_id not in declared or call_id in fulfilled:
                continue
            fulfilled.add(call_id)
            pending.discard(call_id)
            content = str(message.get("content") or "[Tool returned no content]")
            if len(content) > max_tool_result_chars:
                content = content[:max_tool_result_chars] + "\n\n[Tool result truncated; retry with a narrower query, path, range, or limit.]"
            message["content"] = content
        prepared.append(message)

    # Providers require every declared call to have a result. A crash between
    # persisting the assistant tool call and its result is therefore recoverable.
    for call_id in pending:
        prepared.append({"role": "tool", "tool_call_id": call_id,
                         "content": "[Tool result unavailable: the previous call was interrupted.]"})
    return prepared


def _is_transient_error(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None)
    if status_code in {408, 409, 425, 429, 500, 502, 503, 504}:
        return not _NON_RETRYABLE_QUOTA.search(str(exc))
    if getattr(exc, "kind", None) in {"timeout", "connection"}:
        return True
    text = str(exc)
    return bool(_TRANSIENT_ERROR.search(text)) and not _NON_RETRYABLE_QUOTA.search(text)


def _retry_delay(exc: Exception, retry_index: int) -> float:
    """Prefer the provider's rate-limit advice; otherwise use bounded backoff."""
    retry_after = getattr(exc, "retry_after_s", None)
    if isinstance(retry_after, (int, float)) and retry_after >= 0:
        # Small buffer avoids retrying precisely at a provider's boundary.
        return min(float(retry_after) + 1.0, 60.0)
    return float(min(2 ** retry_index, 8))


def _is_stream_timeout(exc: Exception) -> bool:
    return getattr(exc, "kind", None) == "timeout" or "timeout" in type(exc).__name__.lower()


def _stream_continuation_messages(messages: list[dict[str, Any]], prefix: str) -> list[dict[str, Any]]:
    """Make a timeout retry continue visible text instead of replaying it."""
    return [
        *messages,
        {"role": "assistant", "content": prefix},
        {"role": "user", "content": (
            "The previous assistant response was interrupted while streaming. "
            "Continue from exactly where it stopped. Do not repeat, summarize, or "
            "contradict the text already shown; you may still call tools if needed."
        )},
    ]


async def run_agent(
    *,
    client: LLMClient,
    system_prompt: str,
    history: list[ChatMessage],
    tools: ToolRegistry,
    max_iterations: int,
    event_callback: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    message_callback: Callable[[ChatMessage], Awaitable[None]] | None = None,
    checkpoint_callback: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    interaction_wait_callback: Callable[[InteractionRequest], Awaitable[InteractionRequest]] | None = None,
    injection_callback: Callable[[], Awaitable[list[str]]] | None = None,
    initial_required_tool: str | None = None,
) -> RunResult:
    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for item in history:
        if item.role == "assistant" and item.tool_calls:
            messages.append({"role": "assistant", "content": item.content or None, "tool_calls": item.tool_calls})
        elif item.role == "tool" and item.tool_call_id:
            messages.append({"role": "tool", "tool_call_id": item.tool_call_id, "content": item.content})
        elif item.role in {"user", "assistant"}:
            messages.append({"role": item.role, "content": _message_content(item)})
    events: list[dict[str, Any]] = []
    client_config = getattr(client, "config", None)
    max_injection_cycles = int(getattr(client_config, "max_injection_cycles", 8))
    injection_cycles = 0

    async def inject_pending(*, before: ChatMessage | None = None) -> bool:
        """Append real queued user follow-ups only at a protocol-safe boundary."""
        nonlocal injection_cycles
        injected = await injection_callback() if injection_callback and injection_cycles < max_injection_cycles else []
        injected = [str(item).strip() for item in injected if str(item).strip()]
        if injected:
            injection_cycles += 1
        if not injected:
            return False
        if before is not None:
            messages.append({"role": "assistant", "content": before.content})
            if message_callback:
                await message_callback(before)
        for content in injected:
            message = ChatMessage(role="user", content=content)
            messages.append({"role": "user", "content": content})
            if message_callback:
                await message_callback(message)
        if event_callback:
            await event_callback({"type": "injection.received", "count": len(injected)})
        return True

    async def complete_with_retry(
        request_messages: list[dict[str, Any]], available_tools: list[dict[str, Any]],
        required_tool: str | None = None,
    ) -> LLMResult:
        """Retry only safe model requests and preserve an already visible stream."""
        max_retries = int(getattr(client_config, "llm_max_retries", 3))
        retries = 0
        emitted_prefix = ""
        current_messages = request_messages

        async def on_thinking(content: str) -> None:
            if event_callback and content:
                await event_callback({"type": "thinking.delta", "content": content})

        while True:
            tagged_stream = _TaggedThinkingStream()
            saw_text_callback = False

            async def emit_tagged_segments(segments: list[tuple[bool, str]]) -> None:
                nonlocal emitted_prefix
                for thinking, segment in segments:
                    if not segment:
                        continue
                    if thinking:
                        await on_thinking(segment)
                    else:
                        emitted_prefix += segment
                        await publish_text(segment)

            async def on_text(content: str) -> None:
                nonlocal saw_text_callback
                saw_text_callback = True
                await emit_tagged_segments(tagged_stream.feed(content))

            try:
                complete_kwargs: dict[str, Any] = {}
                # Third-party / test clients that implement the former compact
                # adapter signature remain valid while bundled clients can emit
                # provider reasoning as a separate stream.
                parameters = inspect.signature(client.complete).parameters
                if "thinking_callback" in parameters or any(
                    parameter.kind == inspect.Parameter.VAR_KEYWORD
                    for parameter in parameters.values()
                ):
                    complete_kwargs["thinking_callback"] = on_thinking if event_callback else None
                if required_tool:
                    complete_kwargs["required_tool"] = required_tool
                    result = await client.complete(
                        current_messages,
                        available_tools,
                        on_text if event_callback else None,
                        **complete_kwargs,
                    )
                else:
                    result = await client.complete(
                        current_messages, available_tools, on_text if event_callback else None,
                        **complete_kwargs,
                    )
                await emit_tagged_segments(tagged_stream.finish())
                if saw_text_callback:
                    result.content = emitted_prefix
                else:
                    result.content = _answer_without_tagged_thinking(result.content)
                # During recovery the provider only returned the continuation;
                # retain the already delivered prefix for session persistence.
                if emitted_prefix and result.content and current_messages is not request_messages:
                    result.content = emitted_prefix
                elif emitted_prefix and not result.tool_calls:
                    result.content = emitted_prefix
                return result
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                await emit_tagged_segments(tagged_stream.finish())
                if not _is_transient_error(exc) or retries >= max_retries:
                    raise
                streamed = bool(emitted_prefix)
                # Retrying a non-timeout after a delta risks producing a second,
                # divergent answer. A timeout is recoverable through an explicit
                # continuation turn, and only before any tool has executed.
                if streamed and not _is_stream_timeout(exc):
                    raise
                delay = _retry_delay(exc, retries)
                retries += 1
                if streamed:
                    current_messages = _stream_continuation_messages(request_messages, emitted_prefix)
                    if event_callback:
                        await event_callback({
                            "type": "stream.recover", "attempt": retries,
                            "reason": "timeout", "continuation": True,
                        })
                if event_callback:
                    await event_callback({
                        "type": "llm.retry", "attempt": retries, "delay_s": delay,
                        "error": str(exc)[:500], "streaming": streamed,
                    })
                await asyncio.sleep(delay)

    for iteration in range(max_iterations):
        published_text = False

        async def publish_text(content: str) -> None:
            nonlocal published_text
            published_text = True
            if event_callback:
                await event_callback({"type": "delta", "content": content})

        # Build a repaired copy for each request. The original ``messages`` is
        # deliberately retained for persistence and diagnostics.
        max_tool_result_chars = int(getattr(client_config, "max_tool_result_chars", 12_000))
        request_messages = _prepare_messages(messages, max_tool_result_chars)
        required_tool = (
            initial_required_tool
            if iteration == 0 and initial_required_tool in tools.tool_names
            else None
        )
        result = await complete_with_retry(request_messages, tools.schemas(), required_tool)

        # Do not persist or execute degenerate calls. A one-time no-tools
        # fallback turns a malformed provider response into a useful answer
        # instead of repeatedly replaying invalid JSON/function names.
        valid_calls = [call for call in result.tool_calls if call.id and isinstance(call.name, str) and call.name.strip()]
        if result.tool_calls and not valid_calls:
            fallback = await complete_with_retry(
                request_messages + [{"role": "user", "content": "The previous tool request was malformed. Do not call tools; provide the best final answer in text."}],
                [],
            )
            # A provider should honour ``tools=[]``; defensively ignore a
            # non-compliant second malformed tool request as well.
            fallback.tool_calls = []
            result = fallback
        else:
            result.tool_calls = valid_calls
        if not result.tool_calls:
            # An empty reply is usually a transient provider failure. Keep the
            # tools available while recovering: an execution task may still need
            # to write or verify its artifact. Hiding the tools here previously
            # caused the model to repeat the internal "do not call tools" prompt
            # to the user instead of finishing its work.
            empty_retries = 0
            while not (result.content or "").strip() and empty_retries < _EMPTY_RESPONSE_RETRIES:
                empty_retries += 1
                result = await complete_with_retry(
                    request_messages + [{"role": "user", "content": _EMPTY_RESPONSE_RECOVERY}],
                    tools.schemas(),
                )
                valid_calls = [
                    call for call in result.tool_calls
                    if call.id and isinstance(call.name, str) and call.name.strip()
                ]
                result.tool_calls = valid_calls
                if result.tool_calls:
                    break
            if not (result.content or "").strip():
                result = await complete_with_retry(
                    request_messages + [{"role": "user", "content": _EMPTY_RESPONSE_FINALIZATION}],
                    [],
                )
                result.tool_calls = []
            # A recovered tool call must be executed by the normal path below.
            if result.tool_calls:
                pass
            else:
                content = result.content or "我收到了，但没有生成可显示的回复。"
                # A final answer is a safe boundary: persist it before accepting a
                # mid-turn follow-up, then resume the same loop with that follow-up.
                assistant = ChatMessage(role="assistant", content=content)
                if await inject_pending(before=assistant):
                    continue
                if checkpoint_callback:
                    await checkpoint_callback({
                        "phase": "final_response",
                        "iteration": len(events),
                        "assistant_message": {"role": "assistant", "content": content},
                        "completed_tool_results": [],
                        "pending_tool_calls": [],
                    })
                if event_callback and not published_text:
                    await publish_text(content)
                return RunResult(content, events)

        interaction_calls = [call for call in result.tool_calls if call.name == "request_user_interaction"]
        # A declared interaction suspends this exact loop. Sibling calls are
        # intentionally ignored because none may start before the owner answers.
        executable_calls = interaction_calls if interaction_calls else result.tool_calls
        if interaction_calls and len(interaction_calls) != 1:
            raise ValueError("Only one request_user_interaction call is allowed per model turn")
        calls = [{"id": call.id, "type": "function", "function": {"name": call.name, "arguments": json.dumps(call.arguments, ensure_ascii=False)}} for call in executable_calls]
        messages.append({"role": "assistant", "content": result.content or None, "tool_calls": calls})
        assistant_message = ChatMessage(role="assistant", content=result.content, tool_calls=calls)
        completed_tool_results: list[ChatMessage] = []
        if checkpoint_callback:
            await checkpoint_callback({
                "phase": "awaiting_tools",
                "iteration": len(events),
                "assistant_message": assistant_message.model_dump(exclude_none=True),
                "completed_tool_results": [],
                "pending_tool_calls": calls,
            })
        if message_callback:
            await message_callback(assistant_message)

        async def wait_for_interaction(interaction: InteractionRequest) -> InteractionRequest:
            if interaction_wait_callback is None:
                raise RuntimeError("This run has no live interaction controller")
            if checkpoint_callback:
                await checkpoint_callback({
                    "phase": "waiting_for_user",
                    "iteration": len(events),
                    "assistant_message": assistant_message.model_dump(exclude_none=True),
                    "completed_tool_results": [message.model_dump(exclude_none=True) for message in completed_tool_results],
                    "pending_tool_calls": calls[len(completed_tool_results):],
                    "interaction_id": interaction.id,
                })
            required_event = {"type": "interaction.required", "interaction": interaction.model_dump()}
            events.append(required_event)
            if event_callback:
                await event_callback(required_event)
            resolved = await interaction_wait_callback(interaction)
            resolved_event = {"type": "interaction.resolved", "interaction": resolved.model_dump()}
            events.append(resolved_event)
            if event_callback:
                await event_callback(resolved_event)
            return resolved

        async def persist_tool_result(
            call: Any, output: str, error: Exception | None, call_index: int,
        ) -> None:
            messages.append({"role": "tool", "tool_call_id": call.id, "content": output})
            tool_message = ChatMessage(role="tool", content=output, name=call.name, tool_call_id=call.id)
            completed_tool_results.append(tool_message)
            if checkpoint_callback:
                await checkpoint_callback({
                    "phase": "tools_completed" if call_index == len(executable_calls) - 1 else "awaiting_tools",
                    "iteration": len(events),
                    "assistant_message": assistant_message.model_dump(exclude_none=True),
                    "completed_tool_results": [message.model_dump(exclude_none=True) for message in completed_tool_results],
                    "pending_tool_calls": calls[call_index + 1:],
                })
            if message_callback:
                await message_callback(tool_message)
            event = (
                {"type": "tool.failed", "tool": call.name, "error": str(error), "result": output}
                if error is not None
                else {"type": "tool.completed", "tool": call.name, "result": output}
            )
            events.append(event)
            if event_callback:
                await event_callback(event)

        if interaction_calls:
            call = interaction_calls[0]
            started = {"type": "tool.started", "tool": call.name, "arguments": call.arguments}
            events.append(started)
            if event_callback:
                await event_callback(started)
            try:
                raw_output = await tools.execute(call.name, call.arguments)
                interaction_result = json.loads(raw_output)
            except json.JSONDecodeError as exc:
                raise ValueError("Interaction tool returned invalid JSON") from exc
            if interaction_result.get("status") != "waiting_for_user":
                raise ValueError("Interaction tool did not enter waiting state")
            interaction = InteractionRequest.model_validate(interaction_result.get("interaction"))
            resolved = await wait_for_interaction(interaction)
            interaction_output = json.dumps({
                "status": resolved.status,
                "response": resolved.response,
                "interaction": resolved.model_dump(),
            }, ensure_ascii=False)
            await persist_tool_result(call, interaction_output, None, 0)
            if await inject_pending():
                continue
            continue

        max_concurrent_tools = max(1, int(getattr(client_config, "max_concurrent_tools", 4)))
        semaphore = asyncio.Semaphore(max_concurrent_tools)

        async def request_authorization(required: AuthorizationRequired) -> bool:
            context = required.context
            if context.session is None:
                raise required
            interaction = create_interaction(
                runtime=context.runtime,
                session=context.session,
                agent_id=context.profile.id,
                kind="approval",
                prompt=f"需要授权执行 {required.tool_name}：{required.reason}",
                action=required.tool_name,
                action_arguments=required.arguments,
            )
            resolved = await wait_for_interaction(interaction)
            return resolved.status == "approved"

        # Authorization is a two-phase operation. Preflight every call before
        # starting any of them so a parallel sibling cannot cross the gate.
        rejected_calls: set[str] = set()
        preflight_errors: dict[str, Exception] = {}
        for call in executable_calls:
            try:
                await tools.preflight(call.name, call.arguments)
            except AuthorizationRequired as required:
                if not await request_authorization(required):
                    rejected_calls.add(call.id)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                preflight_errors[call.id] = exc

        async def execute_call(call: Any) -> tuple[str, Exception | None]:
            if call.id in rejected_calls:
                error = PermissionError("用户拒绝授权，工具未执行")
                return f"Tool {call.name} was not executed: {error}", error
            if call.id in preflight_errors:
                error = preflight_errors[call.id]
                text = str(error).strip() or error.__class__.__name__
                return f"Tool {call.name} failed preflight: {text}", error
            async with semaphore:
                try:
                    output = await tools.execute(call.name, call.arguments)
                    return str(output or "[Tool returned no content]"), None
                except AuthorizationRequired as required:
                    # Covers a policy changing between preflight and execution,
                    # such as DNS rebinding. Retry the exact call once only.
                    if await request_authorization(required):
                        try:
                            output = await tools.execute(call.name, call.arguments)
                            return str(output or "[Tool returned no content]"), None
                        except AuthorizationRequired as repeated:
                            return f"Tool {call.name} failed after approval: {repeated}", repeated
                    error = PermissionError("用户拒绝授权，工具未执行")
                    return f"Tool {call.name} was not executed: {error}", error
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    text = str(exc).strip() or exc.__class__.__name__
                    return f"Tool {call.name} failed: {text}", exc

        for call in executable_calls:
            if call.id in rejected_calls or call.id in preflight_errors:
                continue
            started = {"type": "tool.started", "tool": call.name, "arguments": call.arguments}
            events.append(started)
            if event_callback:
                await event_callback(started)
        outputs = await asyncio.gather(*(execute_call(call) for call in executable_calls))
        for call_index, (call, (output, error)) in enumerate(zip(executable_calls, outputs, strict=True)):
            await persist_tool_result(call, output, error, call_index)
        if await inject_pending():
            continue

    content = "工具调用次数已达到上限，请缩小任务范围后重试。"
    if checkpoint_callback:
        await checkpoint_callback({
            "phase": "final_response",
            "iteration": max_iterations,
            "assistant_message": {"role": "assistant", "content": content},
            "completed_tool_results": [],
            "pending_tool_calls": [],
        })
    if event_callback:
        await event_callback({"type": "delta", "content": content})
    return RunResult(content, events)
