"""Durable user-interaction state and non-bypassable approval checks."""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from .models import InteractionRequest, SessionRecord, utc_now_iso


class AuthorizationRequired(PermissionError):
    """A recoverable policy denial that the runtime can turn into an approval card."""

    def __init__(self, *, context: Any, tool_name: str, arguments: dict[str, Any], reason: str) -> None:
        super().__init__(reason)
        self.context = context
        self.tool_name = tool_name
        self.arguments = arguments
        self.reason = reason


class InteractionController:
    """Suspend and resume live agent runs without turning a decision into chat text."""

    def __init__(self, runtime: Any) -> None:
        self.runtime = runtime
        self._waiters: dict[str, asyncio.Future[InteractionRequest]] = {}

    async def wait(self, interaction: InteractionRequest) -> InteractionRequest:
        """Wait for one durable interaction while leaving the event loop available."""
        latest = self.runtime.store.load_interaction(interaction.id)
        if latest is not None and latest.status != "pending":
            return latest

        loop = asyncio.get_running_loop()
        waiter: asyncio.Future[InteractionRequest] = loop.create_future()
        if interaction.id in self._waiters:
            raise RuntimeError(f"Interaction {interaction.id} already has a live waiter")
        self._waiters[interaction.id] = waiter
        try:
            # Re-read after registering so a response racing with waiter setup
            # cannot be lost between the first read and Future creation.
            latest = self.runtime.store.load_interaction(interaction.id)
            if latest is not None and latest.status != "pending":
                return latest
            timeout = _seconds_until_expiry(interaction)
            if timeout is None:
                return await waiter
            try:
                return await asyncio.wait_for(waiter, timeout=max(timeout, 0.001))
            except asyncio.TimeoutError:
                latest = self.runtime.store.load_interaction(interaction.id) or interaction
                if latest.status == "pending":
                    latest.status = "expired"
                    self.runtime.store.save_interaction(latest)
                    session = self.runtime.store.load_session(latest.session_id)
                    if session and session.metadata.get("pending_interaction_id") == latest.id:
                        session.metadata.pop("pending_interaction_id", None)
                        self.runtime.store.save_session(session)
                return latest
        finally:
            if self._waiters.get(interaction.id) is waiter:
                self._waiters.pop(interaction.id, None)

    def respond(
        self, *, session: SessionRecord, interaction_id: str, response: str,
        responder_id: str | None = None,
    ) -> InteractionRequest:
        interaction = respond_to_interaction(
            runtime=self.runtime,
            session=session,
            interaction_id=interaction_id,
            response=response,
            responder_id=responder_id,
        )
        waiter = self._waiters.get(interaction.id)
        if waiter is not None and not waiter.done():
            waiter.set_result(interaction)
        return interaction


def _seconds_until_expiry(interaction: InteractionRequest) -> float | None:
    if not interaction.expires_at:
        return None
    expires_at = datetime.fromisoformat(interaction.expires_at)
    return (expires_at - datetime.now(timezone.utc)).total_seconds()


def action_arguments_hash(arguments: dict[str, Any]) -> str:
    canonical = json.dumps(arguments, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def create_interaction(
    *, runtime: Any, session: SessionRecord, agent_id: str, kind: str, prompt: str,
    options: list[str] | None = None, action: str | None = None,
    action_arguments: dict[str, Any] | None = None,
) -> InteractionRequest:
    if kind not in {"clarification", "approval"}:
        raise ValueError("kind must be clarification or approval")
    prompt = str(prompt).strip()
    if not prompt or len(prompt) > 2000:
        raise ValueError("prompt must contain 1-2000 characters")
    cleaned_options = [str(item).strip() for item in (options or []) if str(item).strip()][:6]
    if kind == "clarification" and len(cleaned_options) > 3:
        raise ValueError("clarification supports at most three options")
    if kind == "approval":
        if not action or not isinstance(action_arguments, dict):
            raise ValueError("approval requires action and action_arguments")
    else:
        action, action_arguments = None, None
    expires = datetime.now(timezone.utc) + timedelta(minutes=30)
    interaction = InteractionRequest(
        id=f"interaction_{uuid4().hex[:16]}", session_id=session.id, agent_id=agent_id,
        kind=kind, prompt=prompt, options=cleaned_options, action=action,
        action_arguments=action_arguments,
        action_arguments_hash=action_arguments_hash(action_arguments) if action_arguments is not None else None,
        expires_at=expires.isoformat(),
    )
    runtime.store.save_interaction(interaction)
    session.metadata["pending_interaction_id"] = interaction.id
    runtime.store.save_session(session)
    return interaction


def respond_to_interaction(
    *, runtime: Any, session: SessionRecord, interaction_id: str, response: str,
    responder_id: str | None = None,
) -> InteractionRequest:
    interaction = runtime.store.load_interaction(interaction_id)
    if interaction is None or interaction.session_id != session.id:
        raise KeyError("Interaction not found")
    if session.visitor_id and responder_id != session.visitor_id:
        raise PermissionError("The responder does not own this session")
    if interaction.status != "pending":
        raise ValueError("Interaction has already been handled")
    if interaction.expires_at and datetime.fromisoformat(interaction.expires_at) <= datetime.now(timezone.utc):
        interaction.status = "expired"
    else:
        answer = str(response).strip()
        if not answer:
            raise ValueError("A response is required")
        interaction.response = answer[:4000]
        interaction.responded_at = utc_now_iso()
        if interaction.kind == "approval":
            interaction.status = "approved" if _is_approval(answer) else "rejected"
        else:
            interaction.status = "answered"
    runtime.store.save_interaction(interaction)
    if session.metadata.get("pending_interaction_id") == interaction.id:
        session.metadata.pop("pending_interaction_id", None)
        runtime.store.save_session(session)
    return interaction


def require_approved_action(
    context: Any, tool_name: str, arguments: dict[str, Any], *, reason: str | None = None,
) -> None:
    """Consume a matching approval before a side-effecting tool can run."""
    if context.session is None:
        raise PermissionError("This action requires an interactive session approval")
    expected_hash = action_arguments_hash(arguments)
    for interaction in context.runtime.store.list_interactions(context.session.id):
        if (
            interaction.session_id == context.session.id
            and interaction.kind == "approval"
            and interaction.status == "approved"
            and interaction.action == tool_name
            and interaction.action_arguments_hash == expected_hash
        ):
            # Approval is single-use: subsequent destructive actions need their
            # own explicit request, even if the arguments happen to match.
            interaction.status = "answered"
            context.runtime.store.save_interaction(interaction)
            return
    raise AuthorizationRequired(
        context=context,
        tool_name=tool_name,
        arguments=arguments,
        reason=reason or "此操作需要用户明确授权后才能执行。",
    )


def _is_approval(value: str) -> bool:
    return value.strip().lower() in {"确认", "确认执行", "同意", "批准", "允许", "yes", "y", "approve", "approved"}
