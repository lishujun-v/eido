# Eido Agent Python Server

This is the canonical Python implementation for the Agent domain. The public
package name remains `eido_agent`; only its repository location changed.

The backend is intentionally split into a small set of inspectable layers:

- `server.py` — FastAPI routes and transport formatting.
- `runtime.py` — users, agents, sessions, workspaces and orchestration.
- `engine.py` — the bounded LLM/tool execution loop.
- `llm.py` — OpenAI-compatible and Anthropic provider adapters.
- `prompts/` — prompt composition and scene-specific prompt text.
- `tools/` — one file per tool, plus the provider-neutral contract, registry,
  registration policy, user-configured HTTP adapter, and shared tool context.
- `skills/` — workspace skill discovery and prompt summaries.
- `plugins/` — optional runtime extension interface.
- `storage.py` / `models.py` / `config.py` — persistence, schemas and configuration.

## Extension rules

Add behavior text under `prompts/scenes.py`, a tool under `tools/`, a workspace
instruction under an Agent's `skills/` directory, and cross-cutting optional
features through `PluginManager`. Keep HTTP concerns in `server.py` and do not
import provider SDKs outside `llm.py`.
