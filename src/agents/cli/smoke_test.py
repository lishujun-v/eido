"""Local smoke test for the Eido agent runtime."""

from __future__ import annotations

import asyncio
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server" / "python"))

from eido_agent.config import AgentConfig
from eido_agent.llm import _to_anthropic_messages
from eido_agent.tools.context import ToolContext
from eido_agent.tools.remember_owner_fact import execute_remember_owner_fact
from eido_agent.models import AgentLLMSettings, AgentProfile, AgentProviderSettings
from eido_agent.runtime import AgentRuntime


async def main() -> None:
    _test_protocol_message_conversion()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        runtime = AgentRuntime(
            AgentConfig(
                data_dir=root / "data",
                skills_dir=Path("database/agents/skills"),
            )
        )
        runtime.create_agent(
            AgentProfile(
                id="smoke",
                name="Smoke",
                bio="Test agent",
                owner_user_id="smoke-user",
                agent_type="siinx",
                interaction_mode="conversation",
                is_default=True,
                system_managed=True,
                enabled_tool_ids=[
                    "remember_owner_fact", "delegate_task", "update_sustained_goal",
                    "request_user_interaction",
                    "read_file", "write_file", "edit_file", "apply_patch", "list_dir",
                    "find_files", "grep", "exec_command", "web_search", "web_fetch",
                ],
                llm=AgentLLMSettings(
                    default_provider="test-provider",
                    default_model="agent-specific-model",
                    providers=[
                        AgentProviderSettings(
                            provider="test-provider",
                            protocol="openai",
                            api_base="https://example.test/v1",
                            default_model="agent-specific-model",
                        ),
                    ],
                ),
            )
        )
        result = await runtime.chat(
            agent_id="smoke", session_id="smoke-session", message="hello"
        )
        assert result["session_id"] == "smoke-session"
        assert result["model"] == "agent-specific-model"
        assert result["message"]["content"]
        assert runtime.get_session("smoke-session") is not None

        siinX_agent = runtime.get_agent("smoke")
        assert siinX_agent is not None
        tools = runtime._build_tools(siinX_agent)
        assert set(tools.tool_names) == {
            "remember_owner_fact",
            "delegate_task",
            "update_sustained_goal",
            "request_user_interaction",
            "read_file",
            "write_file",
            "edit_file",
            "apply_patch",
            "list_dir",
            "find_files",
            "grep",
            "exec",
            "web_search",
            "web_fetch",
            "browser",
        }
        # Ordinary workspace writes proceed without a confirmation.
        wrote = await tools.execute("write_file", {"path": "notes/test.txt", "content": "hello Eido"})
        assert "Wrote" in wrote
        external = root / "outside.txt"
        external.write_text("readable", encoding="utf-8")
        assert await tools.execute("read_file", {"path": str(external)}) == "readable"
        tool_context = ToolContext(
            runtime=runtime,
            profile=siinX_agent,
            workspace=runtime._prepare_workspace(siinX_agent),
        )
        remembered = json.loads(
            execute_remember_owner_fact(
                tool_context,
                {
                    "action": "set",
                    "key": "name",
                    "value": "李李",
                },
            )
        )
        assert remembered["status"] == "saved"
        assert '- name: "李李"' in runtime.store.read_memory("smoke")
        assert runtime.get_agent("smoke").private_facts == {}
        removed = json.loads(
            execute_remember_owner_fact(
                tool_context,
                {
                    "action": "remove",
                    "key": "name",
                },
            )
        )
        assert removed == {"status": "removed", "key": "name", "existed": True}
        assert "- name:" not in runtime.store.read_memory("smoke")
        expert = AgentProfile(
            id="researcher",
            name="Researcher",
            owner_user_id="smoke-user",
            agent_type="expert",
            interaction_mode="task_only",
            llm=siinX_agent.llm.model_copy(deep=True),
            enabled_tool_ids=["web_search"],
        )
        runtime.create_agent(expert)
        assert runtime._build_tools(expert).tool_names == ["web_search"]
        delegated = await runtime.delegate_task(
            caller_agent_id="smoke",
            target_agent_id=expert.id,
            parent_session_id="smoke-session",
            task="Research the smoke-test topic.",
            context="This is a local runtime test.",
            expected_output="A concise brief.",
        )
        assert delegated["status"] == "completed"
        assert delegated["agent"]["id"] == expert.id
        call = runtime.store.load_agent_call(delegated["agent_call_id"])
        assert call is not None
        assert call.status == "completed"
        assert call.parent_session_id == "smoke-session"
        assert runtime.get_session(call.worker_session_id).agent_id == expert.id
        print("agent smoke test passed")


def _test_protocol_message_conversion() -> None:
    internal = [
        {"role": "system", "content": "system"},
        {"role": "user", "content": "where"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "exec", "arguments": '{"command":"pwd"}'},
                },
                {
                    "id": "call_2",
                    "type": "function",
                    "function": {"name": "list_dir", "arguments": "{}"},
                },
            ],
        },
        {"role": "tool", "tool_call_id": "call_1", "content": "/workspace"},
        {"role": "tool", "tool_call_id": "call_2", "content": "FILE note.md"},
    ]
    converted = _to_anthropic_messages(internal)
    assert [message["role"] for message in converted] == ["user", "assistant", "user"]
    assert converted[1]["content"] == [
        {
            "type": "tool_use",
            "id": "call_1",
            "name": "exec",
            "input": {"command": "pwd"},
        },
        {
            "type": "tool_use",
            "id": "call_2",
            "name": "list_dir",
            "input": {},
        },
    ]
    assert converted[2]["content"] == [
        {"type": "tool_result", "tool_use_id": "call_1", "content": "/workspace"},
        {"type": "tool_result", "tool_use_id": "call_2", "content": "FILE note.md"},
    ]
    # The OpenAI path receives the original list; conversion must not mutate it.
    assert internal[2]["tool_calls"][0]["function"]["arguments"] == '{"command":"pwd"}'


if __name__ == "__main__":
    asyncio.run(main())
