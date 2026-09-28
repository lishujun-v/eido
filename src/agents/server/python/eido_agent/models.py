"""Shared data models."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

Role = Literal["system", "user", "assistant", "tool"]
AgentCallStatus = Literal[
    "queued", "running", "completed", "failed", "timed_out", "cancelled"
]
InteractionKind = Literal["clarification", "approval"]
InteractionStatus = Literal["pending", "answered", "approved", "rejected", "expired"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ChatMessage(BaseModel):
    role: Role
    content: str
    images: list[str] = Field(default_factory=list)
    name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
    created_at: str = Field(default_factory=utc_now_iso)


class AgentLLMSettings(BaseModel):
    default_provider: str | None = None
    default_model: str | None = None
    providers: list["AgentProviderSettings"] = Field(default_factory=list)
    provider: str | None = None
    protocol: str | None = None
    api_base: str | None = None
    api_key: str | None = None
    api_key_env: str | None = None
    auth_header: str | None = None
    api_version: str | None = None
    model: str | None = None
    models: list[str] = Field(default_factory=list)
    model_settings: dict[str, dict[str, int]] = Field(default_factory=dict)
    temperature: float | None = None
    request_timeout_s: float | None = None
    mock_when_no_key: bool | None = None


class AgentProviderSettings(BaseModel):
    provider: str
    protocol: str = "openai"
    api_base: str
    api_key: str | None = None
    api_key_env: str | None = None
    auth_header: str | None = None
    api_version: str | None = None
    default_model: str | None = None
    models: list[str] = Field(default_factory=list)
    model_settings: dict[str, dict[str, int]] = Field(default_factory=dict)
    temperature: float | None = None
    request_timeout_s: float | None = None
    mock_when_no_key: bool | None = None


class AgentProfile(BaseModel):
    id: str
    name: str
    bio: str = ""
    capabilities: str = ""
    allowed_providers: list[str] = Field(default_factory=list)
    llm: AgentLLMSettings = Field(default_factory=AgentLLMSettings)
    workspace_dir: str = ""
    owner_user_id: str | None = None
    agent_type: Literal["siinx", "expert"] = "expert"
    interaction_mode: Literal["conversation", "task_only"] = "task_only"
    is_default: bool = False
    system_managed: bool = False
    # Platform routing metadata. The bundled runtime only executes eido-local
    # profiles; keeping this field preserves registrations for remote servers.
    runtime: dict[str, Any] = Field(default_factory=lambda: {"kind": "eido-local"})
    values: list[str] = Field(default_factory=list)
    speaking_style: str = ""
    boundaries: list[str] = Field(default_factory=list)
    public_facts: dict[str, Any] = Field(default_factory=dict)
    private_facts: dict[str, Any] = Field(default_factory=dict)
    enabled_tool_ids: list[str] = Field(default_factory=list)
    enabled_skill_ids: list[str] = Field(default_factory=list)
    handoff_policy: str = "遇到敏感、高风险、付费或不可逆操作时，先向用户说明影响并请求确认。"
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)

    @field_validator("agent_type", mode="before")
    @classmethod
    def migrate_legacy_agent_type(cls, value: Any) -> Any:
        return {"personal": "siinx", "worker": "expert"}.get(value, value)


class UserRecord(BaseModel):
    id: str
    email: str | None = None
    name: str = ""
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)


class SessionRecord(BaseModel):
    id: str
    agent_id: str
    visitor_id: str | None = None
    summary: str = ""
    messages: list[ChatMessage] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)


class InteractionRequest(BaseModel):
    """A durable, user-visible pause in a conversational Agent session."""

    id: str
    session_id: str
    agent_id: str
    kind: InteractionKind
    status: InteractionStatus = "pending"
    prompt: str
    options: list[str] = Field(default_factory=list)
    action: str | None = None
    action_arguments: dict[str, Any] | None = None
    action_arguments_hash: str | None = None
    response: str | None = None
    created_at: str = Field(default_factory=utc_now_iso)
    responded_at: str | None = None
    expires_at: str | None = None


class AgentCallRecord(BaseModel):
    id: str
    owner_user_id: str
    caller_agent_id: str
    target_agent_id: str
    parent_session_id: str
    worker_session_id: str
    status: AgentCallStatus = "queued"
    task: str
    context: str = ""
    expected_output: str
    result: dict[str, Any] = Field(default_factory=dict)
    error: str = ""
    created_at: str = Field(default_factory=utc_now_iso)
    started_at: str | None = None
    completed_at: str | None = None
    updated_at: str = Field(default_factory=utc_now_iso)


class ToolSpec(BaseModel):
    name: str
    description: str
    parameters: dict[str, Any]


class ToolResult(BaseModel):
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
