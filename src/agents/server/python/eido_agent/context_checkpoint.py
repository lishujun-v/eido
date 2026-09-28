"""Crash-safe checkpoints for an in-flight agent turn."""

from __future__ import annotations

from typing import Any

from .models import ChatMessage, SessionRecord


RUNTIME_CHECKPOINT_KEY = "runtime_checkpoint"
_INTERRUPTED_TOOL_RESULT = "Error: Task interrupted before this tool finished."


def message_payload(message: ChatMessage) -> dict[str, Any]:
    """Serialize only the conversation fields needed to reconstruct history."""
    return message.model_dump(
        include={"role", "content", "images", "name", "tool_call_id", "tool_calls"},
        exclude_none=True,
    )


def message_key(message: ChatMessage) -> tuple[Any, ...]:
    """Identity used to avoid re-appending already persisted checkpoint data."""
    return (message.role, message.content, tuple(message.images), message.name, message.tool_call_id, repr(message.tool_calls))


def restore_runtime_checkpoint(session: SessionRecord) -> bool:
    """Materialize a partial turn, including synthetic results for unfinished tools.

    A tool call without its matching result makes many providers reject the
    entire transcript.  Restoring it as an explicit interruption means the
    next turn can safely continue, while never replaying a possibly side-effect
    producing tool call.
    """
    raw = session.metadata.get(RUNTIME_CHECKPOINT_KEY)
    if not isinstance(raw, dict):
        return False

    restored: list[ChatMessage] = []
    assistant_raw = raw.get("assistant_message")
    if isinstance(assistant_raw, dict):
        try:
            assistant = ChatMessage.model_validate(assistant_raw)
        except Exception:
            assistant = None
        if assistant is not None and assistant.role == "assistant":
            restored.append(assistant)

    completed_ids: set[str] = set()
    for item in raw.get("completed_tool_results") or []:
        if not isinstance(item, dict):
            continue
        try:
            tool_result = ChatMessage.model_validate(item)
        except Exception:
            continue
        if tool_result.role == "tool" and tool_result.tool_call_id:
            restored.append(tool_result)
            completed_ids.add(tool_result.tool_call_id)

    assistant_calls = assistant_raw.get("tool_calls") if isinstance(assistant_raw, dict) else []
    declared_ids = {
        str(call.get("id"))
        for call in (assistant_calls or [])
        if isinstance(call, dict) and call.get("id")
    }
    for call in raw.get("pending_tool_calls") or []:
        if not isinstance(call, dict):
            continue
        call_id = str(call.get("id") or "")
        function = call.get("function")
        name = function.get("name") if isinstance(function, dict) else None
        if not call_id or call_id not in declared_ids or call_id in completed_ids:
            continue
        restored.append(ChatMessage(
            role="tool", tool_call_id=call_id,
            name=name if isinstance(name, str) else "tool",
            content=_INTERRUPTED_TOOL_RESULT,
        ))

    overlap = 0
    max_overlap = min(len(session.messages), len(restored))
    for size in range(max_overlap, 0, -1):
        if all(
            message_key(left) == message_key(right)
            for left, right in zip(session.messages[-size:], restored[:size])
        ):
            overlap = size
            break
    session.messages.extend(restored[overlap:])
    session.metadata.pop(RUNTIME_CHECKPOINT_KEY, None)
    return True


def clear_runtime_checkpoint(session: SessionRecord) -> bool:
    if RUNTIME_CHECKPOINT_KEY not in session.metadata:
        return False
    session.metadata.pop(RUNTIME_CHECKPOINT_KEY, None)
    return True
