from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.modules.setdefault("httpx", types.ModuleType("httpx"))

from eido_agent.engine import _prepare_messages, run_agent
from eido_agent.context_governance import compact_session, split_compactable_prefix
from eido_agent.context_checkpoint import RUNTIME_CHECKPOINT_KEY, restore_runtime_checkpoint
from eido_agent.config import AgentConfig
from eido_agent.llm import LLMProviderError, LLMResult, ToolCall, _retry_after_seconds
from eido_agent.models import AgentProfile, ChatMessage, SessionRecord
from eido_agent.interactions import require_approved_action, respond_to_interaction
from eido_agent.runtime import AgentRuntime
from eido_agent.tools.base import Tool
from eido_agent.tools.context import ToolContext
from eido_agent.tools.registry import ToolRegistry


class EchoTool(Tool):
    name = "echo"
    description = "echo"
    parameters = {"type": "object", "properties": {"value": {"type": "string"}}}

    async def execute(self, **kwargs):
        return f"echo:{kwargs['value']}"


class PlanToolStub(Tool):
    name = "plan"
    description = "plan"
    parameters = {"type": "object", "properties": {"action": {"type": "string"}}}

    async def execute(self, **kwargs):
        return "plan-created"


class InteractionToolStub(Tool):
    name = "request_user_interaction"
    description = "interaction"
    parameters = {"type": "object", "properties": {}}

    async def execute(self, **kwargs):
        return json.dumps({
            "status": "waiting_for_user",
            "interaction": {
                "id": "interaction-1", "session_id": "session", "agent_id": "siinx",
                "kind": "clarification", "prompt": "确认继续吗？", "options": ["确认", "取消"],
            },
        })


class FakeClient:
    def __init__(self):
        self.requests = []

    async def complete(self, messages, tools, text_callback=None):
        self.requests.append(messages)
        if len(self.requests) == 1:
            return LLMResult(tool_calls=[ToolCall("call-1", "echo", {"value": "ok"})])
        return LLMResult(content="done")


class EngineHistoryTests(unittest.IsolatedAsyncioTestCase):
    def test_legacy_sustained_goal_continuations_are_removed_without_losing_user_input(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = AgentRuntime(AgentConfig(data_dir=Path(directory) / "database"))
            legacy = (
                "You have an active sustained goal:\nmake an animation\n\n"
                "Continue working toward it using tools, or call update_sustained_goal "
                "with action=complete only after it is actually verified."
            )
            session = SessionRecord(id="s", agent_id="a", messages=[
                ChatMessage(role="user", content="make an animation"),
                ChatMessage(role="user", content=legacy),
                ChatMessage(role="assistant", content="working"),
            ])
            runtime._remove_legacy_goal_continuations(session)
            self.assertEqual(
                [(message.role, message.content) for message in session.messages],
                [("user", "make an animation"), ("assistant", "working")],
            )

    def test_output_token_budget_is_configurable(self):
        config = AgentConfig().with_overrides({"max_output_tokens": "12000"})
        self.assertEqual(config.max_output_tokens, 12000)

    async def test_authorization_suspends_and_resumes_the_same_agent_loop(self):
        class GuardedTool(Tool):
            name = "guarded"
            description = "guarded"
            parameters = {"type": "object", "properties": {"target": {"type": "string"}}}

            def __init__(self, context):
                self.context = context
                self.calls = 0

            async def execute(self, **kwargs):
                require_approved_action(
                    self.context, self.name, kwargs, reason="目标位于工作目录外",
                )
                self.calls += 1
                return "guarded:ok"

            async def preflight(self, **kwargs):
                require_approved_action(
                    self.context, self.name, kwargs, reason="目标位于工作目录外",
                )

        class GuardedClient:
            calls = 0

            async def complete(self, messages, tools, text_callback=None):
                self.calls += 1
                if self.calls == 1:
                    return LLMResult(tool_calls=[ToolCall("guarded-1", "guarded", {"target": "/tmp/report"})])
                return LLMResult(content="done")

        with tempfile.TemporaryDirectory() as directory:
            runtime = AgentRuntime(AgentConfig(data_dir=Path(directory) / "data"))
            profile = AgentProfile(id="siinx", name="SiinX", owner_user_id="owner")
            runtime.create_agent(profile)
            session = runtime.store.get_or_create_session("session", profile.id, visitor_id="owner")
            registry = ToolRegistry()
            guarded = GuardedTool(ToolContext(runtime, profile, runtime._prepare_workspace(profile), session))
            registry.register(guarded)
            events = []

            async def publish(event):
                events.append(event)

            async def approve(interaction):
                return respond_to_interaction(
                    runtime=runtime, session=session, interaction_id=interaction.id,
                    response="确认", responder_id="owner",
                )

            client = GuardedClient()
            result = await run_agent(
                client=client, system_prompt="s", history=[ChatMessage(role="user", content="run")],
                tools=registry, max_iterations=3, event_callback=publish,
                interaction_wait_callback=approve,
            )

        self.assertEqual(client.calls, 2)
        self.assertEqual(result.content, "done")
        self.assertEqual(guarded.calls, 1)
        self.assertTrue(any(event["type"] == "interaction.required" for event in events))
        self.assertTrue(any(event["type"] == "interaction.resolved" for event in events))

    async def test_interaction_pauses_before_other_calls_in_the_same_batch(self):
        class CounterTool(Tool):
            name = "write_file"
            description = "write"
            parameters = {"type": "object", "properties": {}}
            calls = 0

            async def execute(self, **kwargs):
                self.calls += 1
                return "wrote"

        class InteractionClient:
            def __init__(self): self.calls = 0
            async def complete(self, messages, tools, text_callback=None):
                self.calls += 1
                if self.calls > 1:
                    return LLMResult(content="done")
                return LLMResult(tool_calls=[
                    ToolCall("ask", "request_user_interaction", {"kind": "approval"}),
                    ToolCall("write", "write_file", {"path": "secret.txt"}),
                ])

        registry = ToolRegistry()
        registry.register(InteractionToolStub())
        write = CounterTool()
        registry.register(write)

        async def answer(interaction):
            interaction.status = "answered"
            interaction.response = "确认"
            return interaction

        result = await run_agent(
            client=InteractionClient(), system_prompt="s", history=[ChatMessage(role="user", content="run")],
            tools=registry, max_iterations=2, interaction_wait_callback=answer,
        )
        self.assertEqual(result.content, "done")
        self.assertEqual(write.calls, 0)

    async def test_batch_preflight_waits_before_starting_safe_sibling(self):
        class BatchClient:
            def __init__(self): self.calls = 0
            async def complete(self, messages, tools, text_callback=None):
                self.calls += 1
                if self.calls == 1:
                    return LLMResult(tool_calls=[
                        ToolCall("guarded", "guarded", {"target": "/tmp/report"}),
                        ToolCall("safe", "safe", {}),
                    ])
                return LLMResult(content="done")

        class SafeTool(Tool):
            name, description, parameters = "safe", "safe", {"type": "object"}
            def __init__(self): self.calls = 0
            async def execute(self, **kwargs):
                self.calls += 1
                return "safe:ok"

        class GuardedTool(Tool):
            name, description, parameters = "guarded", "guarded", {"type": "object"}
            def __init__(self, context): self.context = context
            async def preflight(self, **kwargs):
                require_approved_action(self.context, self.name, kwargs, reason="external")
            async def execute(self, **kwargs):
                require_approved_action(self.context, self.name, kwargs, reason="external")
                return "guarded:ok"

        with tempfile.TemporaryDirectory() as directory:
            runtime = AgentRuntime(AgentConfig(data_dir=Path(directory) / "data"))
            profile = AgentProfile(id="siinx", name="SiinX", owner_user_id="owner")
            runtime.create_agent(profile)
            session = runtime.store.get_or_create_session("session", profile.id, visitor_id="owner")
            context = ToolContext(runtime, profile, runtime._prepare_workspace(profile), session)
            safe = SafeTool()
            registry = ToolRegistry()
            registry.register(GuardedTool(context))
            registry.register(safe)

            async def approve(interaction):
                self.assertEqual(safe.calls, 0)
                return respond_to_interaction(
                    runtime=runtime, session=session, interaction_id=interaction.id,
                    response="允许", responder_id="owner",
                )

            result = await run_agent(
                client=BatchClient(), system_prompt="s",
                history=[ChatMessage(role="user", content="run")],
                tools=registry, max_iterations=2,
                interaction_wait_callback=approve,
            )

        self.assertEqual(result.content, "done")
        self.assertEqual(safe.calls, 1)

    def test_reads_retry_after_from_headers_and_body(self):
        self.assertEqual(_retry_after_seconds({"retry-after-ms": "250"}, ""), 0.25)
        self.assertEqual(_retry_after_seconds({}, "rate limited; retry after 2 minutes"), 120.0)

    def test_context_split_keeps_tool_batch_together(self):
        messages = [
            ChatMessage(role="user", content="old"),
            ChatMessage(role="assistant", content="", tool_calls=[{"id": "call-1", "function": {"name": "echo"}}]),
            ChatMessage(role="tool", content="result", tool_call_id="call-1"),
            ChatMessage(role="user", content="recent"),
        ]
        archived, retained = split_compactable_prefix(messages, 2)
        self.assertEqual([message.role for message in archived], ["user"])
        self.assertEqual([message.role for message in retained], ["assistant", "tool", "user"])

    async def test_context_compaction_replaces_old_history_only_after_summary(self):
        class SummaryClient:
            async def complete(self, messages, tools, text_callback=None):
                self.request = messages
                return LLMResult(content="已完成旧任务；待确认发布。")

        session_messages = [ChatMessage(role="user", content=f"message {index}") for index in range(5)]
        from eido_agent.models import SessionRecord
        session = SessionRecord(id="s", agent_id="a", summary="Earlier fact.", messages=session_messages)
        client = SummaryClient()
        changed = await compact_session(
            session, client=client, compact_after_messages=4,
            compact_keep_messages=2, max_context_chars=2000,
        )
        self.assertTrue(changed)
        self.assertEqual(session.summary, "已完成旧任务；待确认发布。")
        self.assertEqual([message.content for message in session.messages], ["message 3", "message 4"])
        self.assertIn("Earlier fact.", client.request[1]["content"])

    async def test_context_compaction_leaves_history_untouched_on_empty_summary(self):
        class EmptySummaryClient:
            async def complete(self, messages, tools, text_callback=None):
                return LLMResult(content="")

        from eido_agent.models import SessionRecord
        original = [ChatMessage(role="user", content=str(index)) for index in range(5)]
        session = SessionRecord(id="s", agent_id="a", messages=list(original))
        changed = await compact_session(
            session, client=EmptySummaryClient(), compact_after_messages=4,
            compact_keep_messages=2, max_context_chars=2000,
        )
        self.assertFalse(changed)
        self.assertEqual(session.messages, original)

    def test_repairs_interrupted_and_malformed_history_without_mutation(self):
        raw = [
            {"role": "assistant", "content": None, "tool_calls": [
                {"id": "bad", "function": {"name": ""}},
                {"id": "ok", "function": {"name": "echo", "arguments": "{}"}},
            ]},
            {"role": "user", "content": "continue"},
            {"role": "tool", "tool_call_id": "orphan", "content": "ignore"},
        ]
        prepared = _prepare_messages(raw, 20)
        self.assertEqual(prepared[0]["tool_calls"][0]["id"], "ok")
        self.assertEqual(prepared[1]["tool_call_id"], "ok")
        self.assertEqual(prepared[2]["role"], "user")
        self.assertEqual(len(raw[0]["tool_calls"]), 2)

    def test_truncates_large_tool_results_only_in_request_copy(self):
        raw = [
            {"role": "assistant", "content": None, "tool_calls": [
                {"id": "ok", "function": {"name": "echo", "arguments": "{}"}},
            ]},
            {"role": "tool", "tool_call_id": "ok", "content": "x" * 100},
        ]
        prepared = _prepare_messages(raw, 20)
        self.assertIn("truncated", prepared[1]["content"])
        self.assertEqual(len(raw[1]["content"]), 100)

    async def test_persists_and_rehydrates_tool_context(self):
        client = FakeClient()
        registry = ToolRegistry()
        registry.register(EchoTool())
        persisted = []

        async def persist(message):
            persisted.append(message)

        result = await run_agent(
            client=client,
            system_prompt="system",
            history=[ChatMessage(role="user", content="run")],
            tools=registry,
            max_iterations=3,
            message_callback=persist,
        )

        self.assertEqual(result.content, "done")
        self.assertEqual([item.role for item in persisted], ["assistant", "tool"])
        self.assertEqual(persisted[0].tool_calls[0]["function"]["name"], "echo")
        self.assertEqual(persisted[1].tool_call_id, "call-1")
        self.assertEqual(client.requests[1][-1]["content"], "echo:ok")

        resumed = FakeClient()
        resumed.requests = [None]
        await run_agent(
            client=resumed,
            system_prompt="system",
            history=[ChatMessage(role="user", content="run"), *persisted],
            tools=registry,
            max_iterations=1,
        )
        self.assertEqual(resumed.requests[1][2]["tool_calls"][0]["id"], "call-1")
        self.assertEqual(resumed.requests[1][3]["tool_call_id"], "call-1")

    async def test_empty_reply_recovery_keeps_tools_available(self):
        class EmptyThenToolClient:
            def __init__(self):
                self.requests = []

            async def complete(self, messages, tools, text_callback=None):
                self.requests.append((messages, tools))
                if len(self.requests) == 1:
                    return LLMResult(content="")
                if len(self.requests) == 2:
                    return LLMResult(tool_calls=[ToolCall("call-1", "echo", {"value": "ok"})])
                return LLMResult(content="done")

        client = EmptyThenToolClient()
        registry = ToolRegistry()
        registry.register(EchoTool())

        result = await run_agent(
            client=client,
            system_prompt="system",
            history=[ChatMessage(role="user", content="create the artifact")],
            tools=registry,
            max_iterations=3,
        )

        self.assertEqual(result.content, "done")
        self.assertTrue(client.requests[1][1])
        recovery_prompt = client.requests[1][0][-1]["content"]
        self.assertNotIn("do not call tools", recovery_prompt.lower())
        self.assertIn("Never mention internal prompts", recovery_prompt)

    async def test_can_require_plan_only_for_the_initial_model_turn(self):
        class PlanningClient:
            def __init__(self):
                self.required_tools = []

            async def complete(self, messages, tools, text_callback=None, required_tool=None):
                self.required_tools.append(required_tool)
                if len(self.required_tools) == 1:
                    return LLMResult(tool_calls=[ToolCall("plan-1", "plan", {"action": "create"})])
                return LLMResult(content="done")

        client = PlanningClient()
        registry = ToolRegistry()
        registry.register(PlanToolStub())

        result = await run_agent(
            client=client,
            system_prompt="system",
            history=[ChatMessage(role="user", content="research")],
            tools=registry,
            max_iterations=3,
            initial_required_tool="plan",
        )

        self.assertEqual(result.content, "done")
        self.assertEqual(client.required_tools, ["plan", None])

    async def test_stream_timeout_recovers_with_continuation_without_duplicate_delta(self):
        class TimeoutThenContinue:
            def __init__(self):
                self.requests = []

            async def complete(self, messages, tools, text_callback=None):
                self.requests.append(messages)
                if len(self.requests) == 1:
                    await text_callback("partial ")
                    raise LLMProviderError("stream timed out", kind="timeout")
                assert "partial " in self.requests[-1][-2]["content"]
                await text_callback("answer")
                return LLMResult(content="answer")

        client = TimeoutThenContinue()
        emitted = []

        async def event(event):
            emitted.append(event)

        with patch("eido_agent.engine.asyncio.sleep", new=AsyncMock()):
            result = await run_agent(
                client=client, system_prompt="system", history=[ChatMessage(role="user", content="run")],
                tools=ToolRegistry(), max_iterations=1, event_callback=event,
            )
        self.assertEqual(result.content, "partial answer")
        self.assertEqual("".join(item["content"] for item in emitted if item["type"] == "delta"), "partial answer")
        self.assertEqual([item["type"] for item in emitted if item["type"] != "delta"], ["stream.recover", "llm.retry"])

    async def test_streams_provider_thinking_separately_from_answer_text(self):
        class ThinkingClient:
            async def complete(self, messages, tools, text_callback=None, thinking_callback=None):
                await thinking_callback("先检查输入。")
                await thinking_callback("再组织答案。")
                await text_callback("最终回答")
                return LLMResult(content="最终回答")

        emitted = []

        async def event(item):
            emitted.append(item)

        result = await run_agent(
            client=ThinkingClient(), system_prompt="s", history=[ChatMessage(role="user", content="run")],
            tools=ToolRegistry(), max_iterations=1, event_callback=event,
        )

        self.assertEqual(result.content, "最终回答")
        self.assertEqual(
            [item for item in emitted if item["type"] == "thinking.delta"],
            [
                {"type": "thinking.delta", "content": "先检查输入。"},
                {"type": "thinking.delta", "content": "再组织答案。"},
            ],
        )
        self.assertEqual(
            [item for item in emitted if item["type"] == "delta"],
            [{"type": "delta", "content": "最终回答"}],
        )

    async def test_splits_tagged_thinking_across_provider_text_chunks(self):
        class TaggedThinkingClient:
            async def complete(self, messages, tools, text_callback=None, thinking_callback=None):
                for chunk in ("<thi", "nk>先检查", "输入。</th", "ink>\n最终", "回答"):
                    await text_callback(chunk)
                return LLMResult(content="<think>先检查输入。</think>\n最终回答")

        emitted = []

        async def event(item):
            emitted.append(item)

        result = await run_agent(
            client=TaggedThinkingClient(), system_prompt="s",
            history=[ChatMessage(role="user", content="run")],
            tools=ToolRegistry(), max_iterations=1, event_callback=event,
        )

        self.assertEqual(result.content, "\n最终回答")
        self.assertEqual(
            "".join(item["content"] for item in emitted if item["type"] == "thinking.delta"),
            "先检查输入。",
        )
        self.assertEqual(
            "".join(item["content"] for item in emitted if item["type"] == "delta"),
            "\n最终回答",
        )

    async def test_removes_tagged_thinking_from_non_streamed_result(self):
        class TaggedThinkingClient:
            async def complete(self, messages, tools, text_callback=None, thinking_callback=None):
                return LLMResult(content="<think>内部推理</think>用户答案")

        result = await run_agent(
            client=TaggedThinkingClient(), system_prompt="s",
            history=[ChatMessage(role="user", content="run")],
            tools=ToolRegistry(), max_iterations=1,
        )

        self.assertEqual(result.content, "用户答案")

    async def test_emits_recoverable_checkpoints_for_tool_turn(self):
        client = FakeClient()
        registry = ToolRegistry()
        registry.register(EchoTool())
        checkpoints = []

        async def checkpoint(payload):
            checkpoints.append(payload)

        await run_agent(
            client=client, system_prompt="system", history=[ChatMessage(role="user", content="run")],
            tools=registry, max_iterations=3, checkpoint_callback=checkpoint,
        )
        self.assertEqual([item["phase"] for item in checkpoints], ["awaiting_tools", "tools_completed", "final_response"])
        self.assertEqual(checkpoints[1]["completed_tool_results"][0]["tool_call_id"], "call-1")

    async def test_runs_parallel_tools_but_persists_results_in_call_order(self):
        class TwoCallClient:
            def __init__(self): self.calls = 0
            async def complete(self, messages, tools, text_callback=None):
                self.calls += 1
                if self.calls == 1:
                    return LLMResult(tool_calls=[ToolCall("a", "slow", {}), ToolCall("b", "slow", {})])
                return LLMResult(content="done")

        class SlowTool(Tool):
            name, description, parameters = "slow", "slow", {"type": "object"}
            def __init__(self): self.active = self.maximum = 0
            async def execute(self, **kwargs):
                self.active += 1
                self.maximum = max(self.maximum, self.active)
                await asyncio.sleep(0.01)
                self.active -= 1
                return "ok"

        tool = SlowTool()
        registry = ToolRegistry(); registry.register(tool)
        persisted = []
        async def persist(item): persisted.append(item)
        await run_agent(client=TwoCallClient(), system_prompt="s", history=[ChatMessage(role="user", content="go")],
                        tools=registry, max_iterations=2, message_callback=persist)
        self.assertEqual(tool.maximum, 2)
        self.assertEqual([item.tool_call_id for item in persisted if item.role == "tool"], ["a", "b"])

    async def test_emits_failed_event_when_a_tool_raises(self):
        class OneCallClient:
            def __init__(self): self.calls = 0
            async def complete(self, messages, tools, text_callback=None):
                self.calls += 1
                if self.calls == 1:
                    return LLMResult(tool_calls=[ToolCall("bad-call", "broken", {})])
                return LLMResult(content="done")

        class BrokenTool(Tool):
            name, description, parameters = "broken", "broken", {"type": "object"}
            async def execute(self, **kwargs):
                raise RuntimeError("network unavailable")

        registry = ToolRegistry(); registry.register(BrokenTool())
        emitted = []
        async def event(item): emitted.append(item)
        result = await run_agent(
            client=OneCallClient(), system_prompt="s", history=[ChatMessage(role="user", content="go")],
            tools=registry, max_iterations=2, event_callback=event,
        )
        self.assertEqual(result.content, "done")
        failed = [item for item in emitted if item["type"] == "tool.failed"]
        self.assertEqual(failed, [{"type": "tool.failed", "tool": "broken", "error": "network unavailable", "result": "Tool broken failed: network unavailable"}])

    async def test_injected_followup_continues_same_turn(self):
        class TextClient:
            def __init__(self): self.requests = []
            async def complete(self, messages, tools, text_callback=None):
                self.requests.append(messages)
                return LLMResult(content=f"answer-{len(self.requests)}")

        injected = [["also check the tests"], []]
        async def drain(): return injected.pop(0)
        persisted = []
        async def persist(item): persisted.append(item)
        client = TextClient()
        result = await run_agent(client=client, system_prompt="s", history=[ChatMessage(role="user", content="start")],
                                 tools=ToolRegistry(), max_iterations=4, injection_callback=drain,
                                 message_callback=persist)
        self.assertEqual(result.content, "answer-2")
        self.assertEqual([item.content for item in persisted], ["answer-1", "also check the tests"])
        self.assertEqual(client.requests[1][-1]["content"], "also check the tests")

    async def test_stream_chat_emits_done_without_waiting_for_heartbeat(self):
        """Task completion must wake the event stream after the last delta."""
        from eido_agent.config import AgentConfig
        from eido_agent.models import AgentProfile
        from eido_agent.runtime import AgentRuntime

        with tempfile.TemporaryDirectory() as directory:
            runtime = AgentRuntime(AgentConfig(data_dir=Path(directory) / "database"))
            profile = AgentProfile(id="agent-1", name="Test Agent")
            runtime._require_agent = lambda _agent_id: profile  # type: ignore[method-assign]
            runtime._effective_config = lambda *_args: AgentConfig()  # type: ignore[method-assign]
            runtime._should_mock = lambda _config: False  # type: ignore[method-assign]

            async def fake_chat(**kwargs):
                await kwargs["event_callback"]({"type": "delta", "content": "final"})
                return {"message": {"content": "final"}, "tool_events": []}

            runtime.chat = fake_chat  # type: ignore[method-assign]
            received: list[tuple[dict, float]] = []
            started = asyncio.get_running_loop().time()
            async for event in runtime.stream_chat(agent_id="agent-1", message="hello"):
                received.append((event, asyncio.get_running_loop().time()))

            delta_at = next(timestamp for event, timestamp in received if event["type"] == "delta")
            done_at = next(timestamp for event, timestamp in received if event["type"] == "done")
            self.assertLess(done_at - delta_at, 1.0)
            self.assertLess(done_at - started, 1.0)

    def test_restores_partial_turn_without_replaying_pending_tool(self):
        from eido_agent.models import SessionRecord
        assistant = {
            "role": "assistant", "content": "", "tool_calls": [
                {"id": "done", "type": "function", "function": {"name": "echo", "arguments": "{}"}},
                {"id": "pending", "type": "function", "function": {"name": "echo", "arguments": "{}"}},
            ],
        }
        session = SessionRecord(id="s", agent_id="a", messages=[ChatMessage.model_validate(assistant)])
        session.metadata[RUNTIME_CHECKPOINT_KEY] = {
            "phase": "awaiting_tools", "assistant_message": assistant,
            "completed_tool_results": [{"role": "tool", "tool_call_id": "done", "content": "ok"}],
            "pending_tool_calls": assistant["tool_calls"][1:],
        }
        self.assertTrue(restore_runtime_checkpoint(session))
        self.assertNotIn(RUNTIME_CHECKPOINT_KEY, session.metadata)
        self.assertEqual([item.tool_call_id for item in session.messages[1:]], ["done", "pending"])
        self.assertIn("interrupted", session.messages[-1].content)


if __name__ == "__main__":
    unittest.main()
