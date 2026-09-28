"""Configuration for the Eido agent runtime."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, fields
from pathlib import Path
from typing import Any

from .models import AgentProfile


DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.json"
PROJECT_ROOT = Path(__file__).resolve().parents[5]


@dataclass(slots=True)
class AgentConfig:
    """Runtime knobs for a single agent process."""

    data_dir: Path = Path("database")
    skills_dir: Path = Path("database/agents/skills")
    workspace_dir: Path | None = None
    graphs_dir: Path | None = None
    provider: str = "openai"
    protocol: str = "openai"
    api_base: str = "https://api.openai.com/v1"
    api_key: str | None = None
    auth_header: str | None = None
    api_version: str | None = None
    platform_url: str = "http://127.0.0.1:3000"
    model: str = "gpt-4.1-mini"
    temperature: float = 0.7
    max_output_tokens: int = 8192
    max_iterations: int = 200
    max_recent_messages: int = 24
    max_context_chars: int = 24_000
    context_window: int | None = None
    max_agents_per_user: int = 999
    compact_after_messages: int = 40
    compact_keep_messages: int = 10
    request_timeout_s: float = 120.0
    llm_max_retries: int = 3
    max_tool_result_chars: int = 12_000
    max_concurrent_tools: int = 4
    max_injection_cycles: int = 8
    mock_when_no_key: bool = True

    @classmethod
    def from_env(cls) -> "AgentConfig":
        root_dir = cls._root_dir()
        config_path = cls._resolve_path(
            Path(os.getenv("EIDO_AGENT_CONFIG", DEFAULT_CONFIG_PATH)), root_dir
        )
        config = cls.from_file(config_path) if config_path.exists() else cls()
        return config.with_overrides(cls._env_overrides()).resolve_storage_paths(root_dir)

    @staticmethod
    def _root_dir() -> Path:
        configured = Path(os.getenv("EIDO_ROOT_DIR", PROJECT_ROOT)).expanduser()
        return configured.resolve() if configured.is_absolute() else (Path.cwd() / configured).resolve()

    @staticmethod
    def _resolve_path(value: Path, root_dir: Path) -> Path:
        expanded = value.expanduser()
        return expanded.resolve() if expanded.is_absolute() else (root_dir / expanded).resolve()

    def resolve_storage_paths(self, root_dir: Path) -> "AgentConfig":
        """Anchor repository storage paths independently of the process cwd."""
        values: dict[str, Path] = {
            "data_dir": self._resolve_path(self.data_dir, root_dir),
            "skills_dir": self._resolve_path(self.skills_dir, root_dir),
        }
        if self.workspace_dir is not None:
            values["workspace_dir"] = self._resolve_path(self.workspace_dir, root_dir)
        if self.graphs_dir is not None:
            values["graphs_dir"] = self._resolve_path(self.graphs_dir, root_dir)
        return self.with_overrides(values)

    @classmethod
    def _env_overrides(cls) -> dict[str, str]:
        overrides = {
            "data_dir": os.getenv("EIDO_AGENT_DATA_DIR"),
            "skills_dir": os.getenv("EIDO_AGENT_SKILLS_DIR") or os.getenv("EIDO_SKILLS_DIR"),
            "workspace_dir": os.getenv("EIDO_WORKSPACE_DIR"),
            "graphs_dir": os.getenv("EIDO_GRAPHS_DIR"),
            "provider": os.getenv("EIDO_LLM_PROVIDER"),
            "protocol": os.getenv("EIDO_LLM_PROTOCOL"),
            "api_base": os.getenv("OPENAI_BASE_URL") or os.getenv("EIDO_OPENAI_BASE_URL"),
            "api_key": os.getenv("OPENAI_API_KEY") or os.getenv("EIDO_OPENAI_API_KEY"),
            "auth_header": os.getenv("EIDO_LLM_AUTH_HEADER"),
            "api_version": os.getenv("EIDO_LLM_API_VERSION"),
            "platform_url": os.getenv("EIDO_PLATFORM_URL"),
            "model": os.getenv("EIDO_AGENT_MODEL"),
            "temperature": os.getenv("EIDO_AGENT_TEMPERATURE"),
            "max_output_tokens": os.getenv("EIDO_AGENT_MAX_OUTPUT_TOKENS"),
            "max_iterations": os.getenv("EIDO_AGENT_MAX_ITERATIONS"),
            "max_recent_messages": os.getenv("EIDO_AGENT_MAX_RECENT_MESSAGES"),
            "max_context_chars": os.getenv("EIDO_AGENT_MAX_CONTEXT_CHARS"),
            "context_window": os.getenv("EIDO_AGENT_CONTEXT_WINDOW"),
            "max_agents_per_user": os.getenv("EIDO_MAX_AGENTS_PER_USER"),
            "compact_after_messages": os.getenv("EIDO_AGENT_COMPACT_AFTER_MESSAGES"),
            "compact_keep_messages": os.getenv("EIDO_AGENT_COMPACT_KEEP_MESSAGES"),
            "request_timeout_s": os.getenv("EIDO_AGENT_REQUEST_TIMEOUT_S"),
            "llm_max_retries": os.getenv("EIDO_AGENT_LLM_MAX_RETRIES"),
            "max_tool_result_chars": os.getenv("EIDO_AGENT_MAX_TOOL_RESULT_CHARS"),
            "max_concurrent_tools": os.getenv("EIDO_AGENT_MAX_CONCURRENT_TOOLS"),
            "max_injection_cycles": os.getenv("EIDO_AGENT_MAX_INJECTION_CYCLES"),
            "mock_when_no_key": os.getenv("EIDO_AGENT_MOCK_WHEN_NO_KEY"),
        }
        return {key: value for key, value in overrides.items() if value is not None}

    @classmethod
    def from_file(cls, path: Path) -> "AgentConfig":
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError(f"Agent config must be a JSON object: {path}")

        api_key = data.get("api_key")
        api_key_env = data.get("api_key_env")
        if api_key is None and isinstance(api_key_env, str):
            api_key = cls._resolve_api_key_env(api_key_env)

        known_fields = {field.name for field in fields(cls)}
        values = {key: value for key, value in data.items() if key in known_fields}
        if api_key is not None:
            values["api_key"] = api_key
        return cls().with_overrides(values)

    def with_overrides(self, values: dict[str, Any]) -> "AgentConfig":
        data = {field.name: getattr(self, field.name) for field in fields(self)}
        for key, value in values.items():
            if value is None:
                continue
            if key in {"data_dir", "skills_dir", "workspace_dir", "graphs_dir"}:
                data[key] = Path(value)
            elif key in {
                "temperature",
                "request_timeout_s",
            }:
                data[key] = float(value)
            elif key in {
                "max_iterations",
                "max_output_tokens",
                "max_recent_messages",
                "max_context_chars",
                "context_window",
                "max_agents_per_user",
                "compact_after_messages",
                "compact_keep_messages",
                "llm_max_retries",
                "max_tool_result_chars",
                "max_concurrent_tools",
                "max_injection_cycles",
            }:
                data[key] = int(value)
            elif key == "mock_when_no_key":
                data[key] = self._as_bool(value)
            elif key in data:
                data[key] = value
        return AgentConfig(**data)

    @property
    def runtime_dir(self) -> Path:
        """Return the runtime root next to the configured database directory."""
        configured = os.getenv("EIDO_RUNTIME_DIR")
        if configured:
            candidate = Path(configured).expanduser()
            return (
                candidate.resolve()
                if candidate.is_absolute()
                else (self.data_dir.resolve().parent / candidate).resolve()
            )
        return self.data_dir.resolve().parent / "runtime"

    @property
    def resolved_workspace_dir(self) -> Path:
        return self._resolve_runtime_path(self.workspace_dir, "workspace")

    @property
    def resolved_graphs_dir(self) -> Path:
        return self._resolve_runtime_path(self.graphs_dir, "graphs")

    def _resolve_runtime_path(self, configured: Path | None, name: str) -> Path:
        if configured is None:
            return self.runtime_dir / name
        expanded = configured.expanduser()
        return (
            expanded.resolve()
            if expanded.is_absolute()
            else (self.data_dir.resolve().parent / expanded).resolve()
        )

    def for_agent(self, profile: AgentProfile, model: str | None = None) -> "AgentConfig":
        overrides = self._agent_llm_overrides(profile, model)
        return self.with_overrides(overrides).with_overrides(self._env_overrides())

    def _agent_llm_overrides(
        self, profile: AgentProfile, selected_model: str | None = None,
    ) -> dict[str, Any]:
        llm = profile.llm
        if llm.providers:
            provider = self._select_provider(profile)
            overrides = provider.model_dump(exclude_none=True)
            models = overrides.pop("models", [])
            provider_default_model = overrides.pop("default_model", None)
            overrides["provider"] = provider.provider
            overrides["model"] = selected_model or llm.default_model or provider_default_model or (models[0] if models else None)
            model_settings = overrides.pop("model_settings", {})
            selected_settings = model_settings.get(overrides["model"], {}) if isinstance(model_settings, dict) else {}
            if isinstance(selected_settings, dict) and selected_settings.get("context_window") is not None:
                overrides["context_window"] = selected_settings["context_window"]
        else:
            overrides = llm.model_dump(exclude_none=True)
            overrides.pop("providers", None)
            overrides.pop("models", None)
            if overrides.get("default_provider") and not overrides.get("provider"):
                overrides["provider"] = overrides["default_provider"]
            if overrides.get("default_model") and not overrides.get("model"):
                overrides["model"] = overrides["default_model"]
            overrides.pop("default_provider", None)
            overrides.pop("default_model", None)

        api_key_env = overrides.pop("api_key_env", None)
        if overrides.get("api_key") is None and api_key_env:
            overrides["api_key"] = self._resolve_api_key_env(str(api_key_env))
        if not overrides.get("provider") and len(profile.allowed_providers) == 1:
            overrides["provider"] = profile.allowed_providers[0]
        return overrides

    def _select_provider(self, profile: AgentProfile):
        llm = profile.llm
        if llm.default_provider:
            for provider in llm.providers:
                if provider.provider == llm.default_provider:
                    return provider
        return llm.providers[0]

    @staticmethod
    def _as_bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() not in {"0", "false", "no", "off"}

    @staticmethod
    def _resolve_api_key_env(value: str) -> str | None:
        """Resolve an env var name, while tolerating a raw key pasted into the UI."""
        key_or_env = value.strip()
        if not key_or_env:
            return None

        api_key = os.getenv(key_or_env)
        if api_key:
            return api_key

        # The UI historically stored a pasted API key in ``api_key_env``. Many
        # provider keys (including Lenovo's) are plain alphanumeric strings, so
        # treating every such value as an environment-variable name incorrectly
        # turns a configured provider into mock mode. Environment-variable names
        # conventionally contain an underscore; preserve that behaviour while
        # accepting likely pasted keys from existing configurations.
        if (
            not key_or_env.replace("_", "").isalnum()
            or key_or_env[0].isdigit()
            or "_" not in key_or_env
        ):
            return key_or_env

        return None
