"""JSON-table persistence for agents, sessions, memory, and history."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from .models import (
    AgentCallRecord,
    AgentProfile,
    ChatMessage,
    InteractionRequest,
    SessionRecord,
    UserRecord,
    utc_now_iso,
)


_OWNER_FACTS_START = "<!-- eido:owner-facts:start -->"
_OWNER_FACTS_END = "<!-- eido:owner-facts:end -->"


class JsonStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._ensure_tables()

    def load_agent(self, agent_id: str) -> AgentProfile | None:
        row = self._read_object_table("agents").get(agent_id)
        if row is None:
            return None
        return AgentProfile.model_validate(row)

    def load_user(self, user_id: str) -> UserRecord | None:
        row = self._read_object_table("users").get(user_id)
        if row is None:
            return None
        return UserRecord.model_validate(row)

    def save_user(self, user: UserRecord) -> UserRecord:
        user.updated_at = utc_now_iso()
        with self._lock:
            users = self._read_object_table("users")
            users[user.id] = user.model_dump()
            self._write_json(self._table_path("users"), users)
        return user

    def save_agent(self, profile: AgentProfile) -> AgentProfile:
        profile.updated_at = utc_now_iso()
        with self._lock:
            agents = self._read_object_table("agents")
            agents[profile.id] = profile.model_dump()
            self._write_json(self._table_path("agents"), agents)

            if profile.workspace_dir:
                workspaces = self._read_object_table("workspaces")
                workspaces[profile.id] = {
                    "id": Path(profile.workspace_dir).name,
                    "agent_id": profile.id,
                    "owner_user_id": profile.owner_user_id,
                    "name": Path(profile.workspace_dir).name,
                    "path": profile.workspace_dir,
                    "updated_at": profile.updated_at,
                }
                self._write_json(self._table_path("workspaces"), workspaces)

            memories = self._read_object_table("agent_memories")
            memories.setdefault(profile.id, "")
            self._write_json(self._table_path("agent_memories"), memories)
        return profile

    def list_agents(self, owner_user_id: str | None = None) -> list[AgentProfile]:
        agents: list[AgentProfile] = []
        for row in self._read_object_table("agents").values():
            try:
                agent = AgentProfile.model_validate(row)
            except Exception:
                continue
            if owner_user_id is not None and agent.owner_user_id != owner_user_id:
                continue
            agents.append(agent)
        return sorted(agents, key=lambda agent: agent.name)

    def load_agent_for_user(self, owner_user_id: str) -> AgentProfile | None:
        agents = self.list_agents(owner_user_id=owner_user_id)
        return next(
            (
                agent
                for agent in agents
                if agent.agent_type == "siinx"
                and agent.interaction_mode == "conversation"
                and agent.is_default
            ),
            None,
        )

    def save_pending_agent_creation(self, token: str, payload: dict[str, Any]) -> None:
        with self._lock:
            rows = self._read_object_table("pending_agent_creations")
            rows[token] = payload
            self._write_json(self._table_path("pending_agent_creations"), rows)

    def consume_pending_agent_creation(
        self, token: str, owner_user_id: str
    ) -> dict[str, Any] | None:
        """Atomically consume one pending creation owned by the current user."""
        with self._lock:
            rows = self._read_object_table("pending_agent_creations")
            row = rows.get(token)
            if not isinstance(row, dict) or row.get("owner_user_id") != owner_user_id:
                return None
            del rows[token]
            self._write_json(self._table_path("pending_agent_creations"), rows)
            return row

    def read_memory(self, agent_id: str) -> str:
        value = self._read_object_table("agent_memories").get(agent_id, "")
        return str(value)

    def write_memory(self, agent_id: str, content: str) -> None:
        with self._lock:
            memories = self._read_object_table("agent_memories")
            memories[agent_id] = content
            self._write_json(self._table_path("agent_memories"), memories)

    def write_owner_facts(self, agent_id: str, facts: dict[str, Any]) -> None:
        """Persist structured owner facts inside the agent's long-term memory."""
        current = self.read_memory(agent_id)
        before, after = current, ""
        if _OWNER_FACTS_START in current and _OWNER_FACTS_END in current:
            before, rest = current.split(_OWNER_FACTS_START, 1)
            _old, after = rest.split(_OWNER_FACTS_END, 1)

        lines = ["## Owner facts"]
        lines.extend(
            f"- {key}: {json.dumps(value, ensure_ascii=False)}"
            for key, value in sorted(facts.items())
        )
        block = f"{_OWNER_FACTS_START}\n" + "\n".join(lines) + f"\n{_OWNER_FACTS_END}"
        content = "\n\n".join(part.strip() for part in (before, block, after) if part.strip())
        self.write_memory(agent_id, content + ("\n" if content else ""))

    def read_owner_facts(self, agent_id: str) -> dict[str, Any]:
        current = self.read_memory(agent_id)
        if _OWNER_FACTS_START not in current or _OWNER_FACTS_END not in current:
            return {}
        block = current.split(_OWNER_FACTS_START, 1)[1].split(_OWNER_FACTS_END, 1)[0]
        facts: dict[str, Any] = {}
        for line in block.splitlines():
            if not line.startswith("- ") or ":" not in line:
                continue
            key, raw_value = line[2:].split(":", 1)
            try:
                facts[key.strip()] = json.loads(raw_value.strip())
            except json.JSONDecodeError:
                facts[key.strip()] = raw_value.strip()
        return facts

    def append_history(self, agent_id: str, content: str, session_id: str | None = None) -> int:
        with self._lock:
            rows = self._read_list_table("agent_history")
            cursor = self._next_history_cursor(rows, agent_id)
            record: dict[str, Any] = {
                "id": f"{agent_id}:{cursor}",
                "agent_id": agent_id,
                "cursor": cursor,
                "timestamp": utc_now_iso(),
                "content": content.strip(),
            }
            if session_id:
                record["session_id"] = session_id
            rows.append(record)
            self._write_json(self._table_path("agent_history"), rows)
            return cursor

    def read_recent_history(self, agent_id: str, limit: int = 30) -> list[dict[str, Any]]:
        rows = [
            row
            for row in self._read_list_table("agent_history")
            if row.get("agent_id") == agent_id
        ]
        return rows[-limit:]

    def load_session(self, session_id: str) -> SessionRecord | None:
        row = self._read_object_table("sessions").get(session_id)
        if row is None:
            return None
        return SessionRecord.model_validate(row)

    def get_or_create_session(self, session_id: str, agent_id: str, visitor_id: str | None = None) -> SessionRecord:
        session = self.load_session(session_id)
        if session:
            return session
        session = SessionRecord(id=session_id, agent_id=agent_id, visitor_id=visitor_id)
        self.save_session(session)
        return session

    def save_session(self, session: SessionRecord) -> SessionRecord:
        session.updated_at = utc_now_iso()
        with self._lock:
            sessions = self._read_object_table("sessions")
            sessions[session.id] = session.model_dump()
            self._write_json(self._table_path("sessions"), sessions)
        return session

    def append_message(self, session: SessionRecord, message: ChatMessage) -> SessionRecord:
        session.messages.append(message)
        return self.save_session(session)

    def save_agent_call(self, call: AgentCallRecord) -> AgentCallRecord:
        call.updated_at = utc_now_iso()
        with self._lock:
            calls = self._read_object_table("agent_calls")
            calls[call.id] = call.model_dump()
            self._write_json(self._table_path("agent_calls"), calls)
        return call

    def save_interaction(self, interaction: InteractionRequest) -> InteractionRequest:
        with self._lock:
            rows = self._read_object_table("interactions")
            rows[interaction.id] = interaction.model_dump()
            self._write_json(self._table_path("interactions"), rows)
        return interaction

    def load_interaction(self, interaction_id: str) -> InteractionRequest | None:
        row = self._read_object_table("interactions").get(interaction_id)
        return InteractionRequest.model_validate(row) if isinstance(row, dict) else None

    def find_pending_interaction(self, session_id: str) -> InteractionRequest | None:
        pending: list[InteractionRequest] = []
        for row in self._read_object_table("interactions").values():
            if not isinstance(row, dict):
                continue
            try:
                interaction = InteractionRequest.model_validate(row)
            except Exception:
                continue
            if interaction.session_id == session_id and interaction.status == "pending":
                pending.append(interaction)
        return max(pending, key=lambda item: item.created_at, default=None)

    def list_interactions(self, session_id: str | None = None) -> list[InteractionRequest]:
        interactions: list[InteractionRequest] = []
        for row in self._read_object_table("interactions").values():
            if not isinstance(row, dict):
                continue
            try:
                interaction = InteractionRequest.model_validate(row)
            except Exception:
                continue
            if session_id is None or interaction.session_id == session_id:
                interactions.append(interaction)
        return sorted(interactions, key=lambda item: item.created_at)

    def load_agent_call(self, call_id: str) -> AgentCallRecord | None:
        row = self._read_object_table("agent_calls").get(call_id)
        return AgentCallRecord.model_validate(row) if isinstance(row, dict) else None

    def list_agent_calls(
        self, *, owner_user_id: str | None = None, parent_session_id: str | None = None
    ) -> list[AgentCallRecord]:
        calls = []
        for row in self._read_object_table("agent_calls").values():
            if not isinstance(row, dict):
                continue
            try:
                call = AgentCallRecord.model_validate(row)
            except Exception:
                continue
            if owner_user_id is not None and call.owner_user_id != owner_user_id:
                continue
            if parent_session_id is not None and call.parent_session_id != parent_session_id:
                continue
            calls.append(call)
        return sorted(calls, key=lambda item: item.created_at)

    def _ensure_tables(self) -> None:
        defaults: dict[str, Any] = {
            "agents": {},
            "users": {},
            "agent_memories": {},
            "agent_history": [],
            "sessions": {},
            "workspaces": {},
            "pending_agent_creations": {},
            "agent_calls": {},
            "interactions": {},
        }
        for name, default in defaults.items():
            path = self._table_path(name)
            if not path.exists():
                self._write_json(path, default)

    def _table_path(self, name: str) -> Path:
        return self.root / f"{name}.json"

    def _read_object_table(self, name: str) -> dict[str, Any]:
        data = self._read_json(self._table_path(name), default={})
        return data if isinstance(data, dict) else {}

    def _read_list_table(self, name: str) -> list[dict[str, Any]]:
        data = self._read_json(self._table_path(name), default=[])
        return data if isinstance(data, list) else []

    def _read_json(self, path: Path, default: Any) -> Any:
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return default

    def _write_json(self, path: Path, payload: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

    def _next_history_cursor(self, rows: list[dict[str, Any]], agent_id: str) -> int:
        cursors = [
            int(row.get("cursor", 0))
            for row in rows
            if row.get("agent_id") == agent_id and isinstance(row.get("cursor"), int)
        ]
        return (max(cursors) if cursors else 0) + 1
