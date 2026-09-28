from __future__ import annotations

import json
import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from eido_agent.graphlines import GraphStore, build_graph
from eido_agent.graph_runtime import GraphExecutor, load_graph_logic


async def _async_value(value: str) -> str:
    return value


class GraphLinesTests(unittest.TestCase):
    def test_factory_validator_accepts_disjoint_fan_in_contracts(self) -> None:
        import importlib.util

        script = Path(__file__).parents[3] / "database/agents/skills/factory-manage/scripts/manage_factory.py"
        spec = importlib.util.spec_from_file_location("manage_factory_test", script)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        with patch.dict("os.environ", {"EIDO_GRAPHS_DIR": tempfile.gettempdir()}):
            spec.loader.exec_module(module)
        graph = module.normalize({
            "name": "Parallel", "business_goal": "Merge distinct results",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input", "config": {
                    "output_schema": {"topic": "string"},
                }},
                {"id": "left", "type": "work", "title": "Left", "config": {
                    "input_schema": {"topic": "string"},
                    "output_schema": {"topic": "string", "left": "string"},
                }},
                {"id": "right", "type": "work", "title": "Right", "config": {
                    "input_schema": {"topic": "string"},
                    "output_schema": {"right": "string"},
                }},
                {"id": "merge", "type": "output", "title": "Merge", "config": {
                    "input_schema": {"topic": "string", "left": "string", "right": "string"},
                }},
            ],
            "edges": [
                {"source": "input", "target": "left"},
                {"source": "input", "target": "right"},
                {"source": "left", "target": "merge"},
                {"source": "right", "target": "merge"},
            ],
        })
        self.assertEqual(graph["id"].split("-")[0], "graph")

    def test_factory_validator_accepts_shared_context_across_fan_in(self) -> None:
        import importlib.util

        script = Path(__file__).parents[3] / "database/agents/skills/factory-manage/scripts/manage_factory.py"
        spec = importlib.util.spec_from_file_location("manage_factory_duplicate_test", script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        graph = module.normalize({
                "name": "Invalid parallel", "business_goal": "Reject ambiguous merge",
                "nodes": [
                    {"id": "input", "type": "input", "title": "Input", "config": {
                        "output_schema": {"topic": "string"},
                    }},
                    {"id": "left", "type": "work", "title": "Left", "config": {
                        "input_schema": {"topic": "string"},
                        "output_schema": {"topic": "string", "left": "string"},
                    }},
                    {"id": "right", "type": "work", "title": "Right", "config": {
                        "input_schema": {"topic": "string"},
                        "output_schema": {"topic": "string", "right": "string"},
                    }},
                    {"id": "merge", "type": "output", "title": "Merge", "config": {
                        "input_schema": {"topic": "string", "left": "string", "right": "string"},
                    }},
                ],
                "edges": [
                    {"source": "input", "target": "left"},
                    {"source": "input", "target": "right"},
                    {"source": "left", "target": "merge"},
                    {"source": "right", "target": "merge"},
                ],
            })
        self.assertEqual(graph["nodes"][-1]["id"], "merge")

    def test_factory_validator_accepts_alternative_fan_in_fields(self) -> None:
        import importlib.util

        script = Path(__file__).parents[3] / "database/agents/skills/factory-manage/scripts/manage_factory.py"
        spec = importlib.util.spec_from_file_location("manage_factory_any_test", script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        graph = module.normalize({
            "name": "Alternatives", "business_goal": "Merge one selected result",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input",
                 "config": {"output_schema": {"text": "string"}}},
                {"id": "left", "type": "work", "title": "Left",
                 "config": {"input_schema": {"text": "string"},
                            "output_schema": {"greeting": "string"}}},
                {"id": "right", "type": "work", "title": "Right",
                 "config": {"input_schema": {"text": "string"},
                            "output_schema": {"greeting": "string"}}},
                {"id": "output", "type": "output", "title": "Output",
                 "config": {"merge_strategy": "any",
                            "input_schema": {"greeting": "string"}}},
            ],
            "edges": [
                {"source": "input", "target": "left"},
                {"source": "input", "target": "right"},
                {"source": "left", "target": "output"},
                {"source": "right", "target": "output"},
            ],
        })
        self.assertEqual(graph["nodes"][-1]["config"]["merge_strategy"], "any")

    def test_build_and_store_branching_graph(self) -> None:
        graph = build_graph({
            "name": "Lead qualification",
            "business_goal": "Qualify an incoming lead and choose the next action",
            "nodes": [
                {"id": "input", "type": "input", "title": "Lead data"},
                {"id": "score", "type": "work", "title": "Score lead", "config": {"instruction": "Calculate lead score"}},
                {"id": "qualified", "type": "condition", "title": "Qualified?", "config": {"expression": "score >= 80"}},
                {"id": "confirm", "type": "interaction", "title": "Confirm outreach", "config": {"prompt": "Approve outreach?"}},
                {"id": "output", "type": "output", "title": "Next action"},
            ],
            "edges": [
                {"source": "input", "target": "score"},
                {"source": "score", "target": "qualified"},
                {"source": "qualified", "target": "confirm", "label": "yes"},
                {"source": "qualified", "target": "output", "label": "no"},
                {"source": "confirm", "target": "output"},
            ],
        })
        with tempfile.TemporaryDirectory() as directory:
            target = GraphStore(Path(directory)).save(graph)
            self.assertTrue(target.exists())
            self.assertEqual(target.name, "graph.json")
            self.assertTrue((target.parent / "logic.py").exists())
            self.assertEqual(json.loads(target.read_text())["nodes"][3]["type"], "interaction")
            self.assertEqual(GraphStore(Path(directory)).list()[0].name, "Lead qualification")

    def test_graph_package_logic_is_loaded_from_its_own_directory(self) -> None:
        graph = build_graph({
            "name": "Echo", "business_goal": "Echo input",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input"},
                {"id": "echo", "type": "work", "title": "Echo"},
                {"id": "output", "type": "output", "title": "Output"},
            ],
            "edges": [{"source": "input", "target": "echo"}, {"source": "echo", "target": "output"}],
        })
        with tempfile.TemporaryDirectory() as directory:
            target = GraphStore(Path(directory)).save(graph)
            logic = load_graph_logic(target.parent / "logic.py")

            async def scenario():
                executor = GraphExecutor(
                    lambda instruction, context, goal, on_event=None: _async_value(f"unexpected-ai:{context}"),
                    lambda expression, context, labels, goal: _async_value(labels[0]),
                    logic,
                )
                run = await executor.start(graph, "agent", "hello")
                self.assertEqual(run.status, "failed")
                self.assertIn("Python logic is required", run.error)

            asyncio.run(scenario())

    def test_rejects_cycles(self) -> None:
        with self.assertRaisesRegex(ValueError, "acyclic"):
            build_graph({
                "name": "Invalid",
                "business_goal": "Demonstrate cycle validation",
                "nodes": [
                    {"id": "a", "type": "work", "title": "A"},
                    {"id": "b", "type": "work", "title": "B"},
                ],
                "edges": [{"source": "a", "target": "b"}, {"source": "b", "target": "a"}],
            })

    def test_rejects_incompatible_edge_contract(self) -> None:
        with self.assertRaisesRegex(ValueError, "missing fields.*count"):
            build_graph({
                "name": "Invalid contract",
                "business_goal": "Reject incompatible node parameters",
                "nodes": [
                    {"id": "input", "type": "input", "title": "Input", "config": {
                        "output_schema": {"text": "string"},
                    }},
                    {"id": "work", "type": "work", "title": "Work", "config": {
                        "input_schema": {"text": "string", "count": "integer"},
                        "output_schema": {"result": "string"},
                    }},
                ],
                "edges": [{"source": "input", "target": "work"}],
            })

    def test_structured_output_flows_to_direct_node(self) -> None:
        graph = build_graph({
            "name": "Structured", "business_goal": "Pass multiple parameters",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input", "config": {
                    "output_schema": {"text": "string"},
                }},
                {"id": "work", "type": "work", "title": "Measure", "config": {
                    "input_schema": {"text": "string"},
                    "output_schema": {"original": "string", "length": "integer"},
                }},
                {"id": "output", "type": "output", "title": "Output", "config": {
                    "input_schema": {"original": "string", "length": "integer"},
                }},
            ],
            "edges": [{"source": "input", "target": "work"}, {"source": "work", "target": "output"}],
        })

        class Logic:
            @staticmethod
            async def execute_work(node_id, value, services):
                return {"original": value["text"], "length": len(value["text"])}

        async def scenario():
            executor = GraphExecutor(
                lambda instruction, context, goal, on_event=None: _async_value("unexpected-ai"),
                lambda expression, context, labels, goal: _async_value("unexpected-ai"),
                Logic(),
            )
            run = await executor.start(graph, "agent", '{"text":"hello"}')
            self.assertEqual(run.status, "completed")
            self.assertEqual(run.output, {"original": "hello", "length": 5})

        asyncio.run(scenario())

    def test_runtime_graph_accepts_disjoint_parallel_fan_in(self) -> None:
        graph = build_graph({
            "name": "Parallel merge", "business_goal": "Merge distinct branch results",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input", "config": {
                    "output_schema": {"topic": "string"},
                }},
                {"id": "left", "type": "work", "title": "Left", "config": {
                    "input_schema": {"topic": "string"},
                    "output_schema": {"topic": "string", "left": "string"},
                }},
                {"id": "right", "type": "work", "title": "Right", "config": {
                    "input_schema": {"topic": "string"},
                    "output_schema": {"right": "string"},
                }},
                {"id": "output", "type": "output", "title": "Output", "config": {
                    "input_schema": {"topic": "string", "left": "string", "right": "string"},
                }},
            ],
            "edges": [
                {"source": "input", "target": "left"},
                {"source": "input", "target": "right"},
                {"source": "left", "target": "output"},
                {"source": "right", "target": "output"},
            ],
        })

        class Logic:
            @staticmethod
            async def execute_work(node_id, value, services):
                if node_id == "left":
                    return {"topic": value["topic"], "left": "L"}
                return {"right": "R"}

        async def scenario():
            executor = GraphExecutor(
                lambda instruction, context, goal, on_event=None: _async_value("unexpected-ai"),
                lambda expression, context, labels, goal: _async_value("unexpected-ai"),
                Logic(),
            )
            run = await executor.start(graph, "agent", '{"topic":"test"}')
            self.assertEqual(run.status, "completed")
            self.assertEqual(run.output, {"topic": "test", "left": "L", "right": "R"})

        asyncio.run(scenario())

    def test_runtime_projects_shared_context_and_crops_legacy_passthrough(self) -> None:
        graph = build_graph({
            "name": "Shared context", "business_goal": "Keep node outputs incremental",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input",
                 "config": {"output_schema": {"topic": "string"}}},
                {"id": "left", "type": "work", "title": "Left",
                 "config": {"input_schema": {"topic": "string"},
                            "output_schema": {"left": "string"}}},
                {"id": "right", "type": "work", "title": "Right",
                 "config": {"input_schema": {"topic": "string"},
                            "output_schema": {"right": "string"}}},
                {"id": "merge", "type": "work", "title": "Merge",
                 "config": {"input_schema": {"topic": "string", "left": "string", "right": "string"},
                            "output_schema": {"summary": "string"}}},
                {"id": "output", "type": "output", "title": "Output",
                 "config": {"input_schema": {"summary": "string"}}},
            ],
            "edges": [
                {"source": "input", "target": "left"},
                {"source": "input", "target": "right"},
                {"source": "left", "target": "merge"},
                {"source": "right", "target": "merge"},
                {"source": "merge", "target": "output"},
            ],
        })

        class Logic:
            @staticmethod
            async def execute_work(node_id, value, services):
                if node_id == "left":
                    return {"topic": value["topic"], "left": "L", "unwanted": "drop me"}
                if node_id == "right":
                    return {"topic": value["topic"], "right": "R"}
                assert value == {"topic": "test", "left": "L", "right": "R"}
                return {"summary": "LR", "topic": value["topic"]}

        async def scenario():
            executor = GraphExecutor(
                lambda instruction, context, goal, on_event=None: _async_value("unexpected-ai"),
                lambda expression, context, labels, goal: _async_value("unexpected-ai"),
                Logic(),
            )
            run = await executor.start(graph, "agent", '{"topic":"test"}')
            self.assertEqual(run.status, "completed")
            self.assertEqual(run.node_states["left"]["output"], {"left": "L"})
            self.assertNotIn("unwanted", run.context)
            self.assertEqual(run.output, {"summary": "LR"})

        asyncio.run(scenario())

    def test_runtime_any_merge_accepts_duplicate_fields_from_selected_branch(self) -> None:
        graph = build_graph({
            "name": "Conditional merge", "business_goal": "Return selected greeting",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input",
                 "config": {"output_schema": {"language": "string"}}},
                {"id": "choose", "type": "condition", "title": "Choose",
                 "config": {"input_schema": {"language": "string"},
                            "output_schema": {"language": "string"}}},
                {"id": "english", "type": "work", "title": "English",
                 "config": {"input_schema": {"language": "string"},
                            "output_schema": {"greeting": "string"}}},
                {"id": "chinese", "type": "work", "title": "Chinese",
                 "config": {"input_schema": {"language": "string"},
                            "output_schema": {"greeting": "string"}}},
                {"id": "output", "type": "output", "title": "Output",
                 "config": {"merge_strategy": "any",
                            "input_schema": {"greeting": "string"}}},
            ],
            "edges": [
                {"source": "input", "target": "choose"},
                {"source": "choose", "target": "english", "label": "en"},
                {"source": "choose", "target": "chinese", "label": "zh"},
                {"source": "english", "target": "output"},
                {"source": "chinese", "target": "output"},
            ],
        })

        class Logic:
            @staticmethod
            async def evaluate_condition(node_id, value, labels, services):
                return value["language"]

            @staticmethod
            async def execute_work(node_id, value, services):
                return {"greeting": "hello" if node_id == "english" else "你好"}

        async def scenario():
            executor = GraphExecutor(
                lambda instruction, context, goal, on_event=None: _async_value("unexpected-ai"),
                lambda expression, context, labels, goal: _async_value("unexpected-ai"),
                Logic(),
            )
            run = await executor.start(graph, "agent", '{"language":"zh"}')
            self.assertEqual(run.status, "completed")
            self.assertEqual(run.output, {"greeting": "你好"})
            self.assertEqual(run.node_states["english"]["status"], "idle")

        asyncio.run(scenario())

    def test_plain_text_uses_structured_input_defaults(self) -> None:
        graph = build_graph({
            "name": "Plain text", "business_goal": "Accept convenient text input",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input", "config": {
                    "output_schema": {"filename": "string", "content": "string"},
                    "defaults": {"filename": "graph-output.md"},
                }},
                {"id": "output", "type": "output", "title": "Output", "config": {
                    "input_schema": {"filename": "string", "content": "string"},
                }},
            ],
            "edges": [{"source": "input", "target": "output"}],
        })

        async def scenario():
            executor = GraphExecutor(
                lambda instruction, context, goal, on_event=None: _async_value("unexpected-ai"),
                lambda expression, context, labels, goal: _async_value("unexpected-ai"),
            )
            run = await executor.start(graph, "agent", "测试文本")
            self.assertEqual(run.status, "completed")
            self.assertEqual(run.output, {"filename": "graph-output.md", "content": "测试文本"})

        asyncio.run(scenario())

    def test_missing_work_logic_does_not_fall_back_to_ai(self) -> None:
        graph = build_graph({
            "name": "Review", "business_goal": "Draft and approve text",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input"},
                {"id": "work", "type": "work", "title": "Draft", "config": {"instruction": "draft"}},
                {"id": "approve", "type": "interaction", "title": "Approve"},
                {"id": "output", "type": "output", "title": "Output"},
            ],
            "edges": [
                {"source": "input", "target": "work"}, {"source": "work", "target": "approve"},
                {"source": "approve", "target": "output"},
            ],
        })

        async def scenario():
            executor = GraphExecutor(
                lambda instruction, context, goal, on_event=None: _async_value(f"processed:{context}"),
                lambda expression, context, labels, goal: _async_value(labels[0]),
            )
            run = await executor.start(graph, "agent", "hello")
            self.assertEqual(run.status, "failed")
            self.assertIn("no Python execute_work implementation", run.error)

        asyncio.run(scenario())

    def test_condition_activates_only_selected_branch(self) -> None:
        graph = build_graph({
            "name": "Route", "business_goal": "Route text",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input"},
                {"id": "condition", "type": "condition", "title": "Choose"},
                {"id": "yes", "type": "output", "title": "Yes"},
                {"id": "no", "type": "output", "title": "No"},
            ],
            "edges": [
                {"source": "input", "target": "condition"},
                {"source": "condition", "target": "yes", "label": "yes"},
                {"source": "condition", "target": "no", "label": "no"},
            ],
        })

        async def scenario():
            class Logic:
                @staticmethod
                async def evaluate_condition(node_id, value, labels, services):
                    return "no"

            executor = GraphExecutor(
                lambda instruction, context, goal, on_event=None: _async_value(context),
                lambda expression, context, labels, goal: _async_value("unexpected-ai"),
                Logic(),
            )
            run = await executor.start(graph, "agent", "hello")
            self.assertEqual(run.node_states["yes"]["status"], "idle")
            self.assertEqual(run.node_states["no"]["status"], "completed")

        asyncio.run(scenario())

    def test_executor_forwards_node_and_tool_events_to_sink(self) -> None:
        graph = build_graph({
            "name": "Events", "business_goal": "Emit real-time events",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input"},
                {"id": "work", "type": "work", "title": "Work", "config": {"instruction": "do it"}},
                {"id": "output", "type": "output", "title": "Output"},
            ],
            "edges": [{"source": "input", "target": "work"}, {"source": "work", "target": "output"}],
        })
        received: list[tuple[str, dict]] = []

        async def sink(node_id: str, event: dict) -> None:
            received.append((node_id, event))

        async def process(instruction, context, goal, on_event=None):
            self.assertIsNotNone(on_event)
            await on_event({"type": "tool.started", "tool": "search", "arguments": {"q": "paper"}})
            await on_event({"type": "delta", "content": "正在检索"})
            await on_event({"type": "tool.completed", "tool": "search", "result": "论文列表"})
            return "完成"

        async def scenario():
            class Logic:
                @staticmethod
                async def execute_work(node_id, value, services):
                    return await services.ai_process("do it", value)

            executor = GraphExecutor(
                process,
                lambda expression, context, labels, goal: _async_value("unexpected-ai"),
                Logic(), None, sink,
            )
            run = await executor.start(graph, "agent", "hello")
            self.assertEqual(run.status, "completed")
            self.assertEqual({node_id for node_id, _ in received}, {"input", "work", "output"})
            types = [event["type"] for _, event in received]
            self.assertIn("node.started", types)
            self.assertIn("node.completed", types)
            self.assertIn("tool.started", types)
            completed = next(event for _, event in received if event["type"] == "tool.completed")
            self.assertEqual(completed["result"], "论文列表")

        asyncio.run(scenario())

    def test_executor_runs_independent_work_nodes_in_parallel(self) -> None:
        graph = build_graph({
            "name": "Parallel work", "business_goal": "Run independent work together",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input", "config": {"output_schema": {"topic": "string"}}},
                {"id": "left", "type": "work", "title": "Left", "config": {"input_schema": {"topic": "string"}, "output_schema": {"left": "string"}}},
                {"id": "right", "type": "work", "title": "Right", "config": {"input_schema": {"topic": "string"}, "output_schema": {"right": "string"}}},
                {"id": "output", "type": "output", "title": "Output", "config": {"input_schema": {"left": "string", "right": "string"}}},
            ],
            "edges": [
                {"source": "input", "target": "left"}, {"source": "input", "target": "right"},
                {"source": "left", "target": "output"}, {"source": "right", "target": "output"},
            ],
        })
        active = 0
        peak_active = 0

        class Logic:
            @staticmethod
            async def execute_work(node_id, value, services):
                nonlocal active, peak_active
                active += 1
                peak_active = max(peak_active, active)
                await asyncio.sleep(0.01)
                active -= 1
                return {node_id: value["topic"]}

        async def scenario():
            executor = GraphExecutor(
                lambda instruction, context, goal, on_event=None: _async_value("unexpected-ai"),
                lambda expression, context, labels, goal: _async_value("unexpected-ai"),
                Logic(),
            )
            run = await executor.start(graph, "agent", "patent")
            self.assertEqual(run.status, "completed")
            self.assertEqual(peak_active, 2)

        asyncio.run(scenario())

    def test_runtime_node_event_sink_persists_and_broadcasts(self) -> None:
        from eido_agent.config import AgentConfig
        from eido_agent.graph_runtime import GraphRun, GraphRunStore
        from eido_agent.runtime import AgentRuntime

        with tempfile.TemporaryDirectory() as directory:
            runtime = AgentRuntime(AgentConfig(data_dir=Path(directory) / "database"))
            run = GraphRun(id="run-abc123def456", graph_id="graph-1", agent_id="agent-1", input="x")
            run_store = GraphRunStore(Path(directory) / "runs")
            sink = runtime._graph_node_event(run, run_store)

            async def scenario():
                await sink("work", {"type": "tool.started", "tool": "search", "arguments": {"q": "x"}})
                await sink("work", {"type": "delta", "content": "思考中"})
                await sink("work", {"type": "tool.completed", "tool": "search", "result": "r" * 5000})
                self.assertEqual(
                    [event["type"] for event in run.node_events["work"]],
                    ["tool.started", "tool.completed"],
                )
                self.assertLessEqual(len(run.node_events["work"][1]["result"]), 4001)
                persisted = run_store.load("run-abc123def456")
                self.assertIsNotNone(persisted)
                self.assertIn("work", persisted.node_events)
                self.assertIn("ts", persisted.node_events["work"][0])

            asyncio.run(scenario())

    def test_interaction_node_emits_waiting_event(self) -> None:
        graph = build_graph({
            "name": "Wait", "business_goal": "Ask the user",
            "nodes": [
                {"id": "input", "type": "input", "title": "Input"},
                {"id": "ask", "type": "interaction", "title": "Ask", "config": {"prompt": "确认？"}},
                {"id": "output", "type": "output", "title": "Output"},
            ],
            "edges": [{"source": "input", "target": "ask"}, {"source": "ask", "target": "output"}],
        })
        received: list[tuple[str, dict]] = []

        async def sink(node_id: str, event: dict) -> None:
            received.append((node_id, event))

        async def scenario():
            executor = GraphExecutor(
                lambda instruction, context, goal, on_event=None: _async_value("unexpected-ai"),
                lambda expression, context, labels, goal: _async_value("unexpected-ai"),
                None, None, sink,
            )
            run = await executor.start(graph, "agent", "hello")
            self.assertEqual(run.status, "waiting")
            self.assertEqual(run.waiting_node_id, "ask")
            self.assertIn(
                ("ask", {"type": "node.waiting"}),
                [(node_id, event) for node_id, event in received],
            )

        asyncio.run(scenario())


    def test_startup_recovers_interrupted_running_runs(self) -> None:
        from eido_agent.config import AgentConfig
        from eido_agent.graph_runtime import GraphRunStore
        from eido_agent.runtime import AgentRuntime

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = AgentConfig(data_dir=root / "database")
            package = root / "runtime" / "graphs" / "graph-test1234"
            (package / "runs").mkdir(parents=True)
            (package / "graph.json").write_text(
                json.dumps({"id": "graph-test1234", "name": "T", "nodes": [], "edges": []}),
                encoding="utf-8",
            )
            store = GraphRunStore(package / "runs")
            running = store.load("run-abc123def456") or __import__(
                "eido_agent.graph_runtime", fromlist=["GraphRun"]
            ).GraphRun(id="run-abc123def456", graph_id="graph-test1234", agent_id="agent-1", input="x")
            running.status = "running"
            store.save(running)
            waiting = store.load("run-bcd234ef5678") or __import__(
                "eido_agent.graph_runtime", fromlist=["GraphRun"]
            ).GraphRun(id="run-bcd234ef5678", graph_id="graph-test1234", agent_id="agent-1", input="x")
            waiting.status = "waiting"
            store.save(waiting)

            AgentRuntime(config)

            recovered = store.load("run-abc123def456")
            self.assertIsNotNone(recovered)
            self.assertEqual(recovered.status, "failed")
            self.assertIn("中断", recovered.error)
            still_waiting = store.load("run-bcd234ef5678")
            self.assertIsNotNone(still_waiting)
            self.assertEqual(still_waiting.status, "waiting")



if __name__ == "__main__":
    unittest.main()
