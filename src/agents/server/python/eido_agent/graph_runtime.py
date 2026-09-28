"""Executable runtime for GraphLines DAGs."""

from __future__ import annotations

import asyncio
import json
import importlib.util
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from .graphlines import Graph

RunStatus = Literal["running", "waiting", "completed", "failed"]
NodeEvent = dict[str, Any]
NodeEventSink = Callable[[str, NodeEvent], Awaitable[None]]
EventForwarder = Callable[[NodeEvent], Awaitable[None]]
Processor = Callable[[str, str, str, EventForwarder | None], Awaitable[str]]
Decider = Callable[[str, str, list[str], str], Awaitable[str]]
Checkpoint = Callable[["GraphRun"], None]


@dataclass(slots=True)
class GraphRun:
    id: str
    graph_id: str
    agent_id: str
    input: Any
    status: RunStatus = "running"
    active_nodes: list[str] = field(default_factory=list)
    node_states: dict[str, dict[str, Any]] = field(default_factory=dict)
    interaction_responses: dict[str, str] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)
    context_producers: dict[str, str] = field(default_factory=dict)
    node_events: dict[str, list[NodeEvent]] = field(default_factory=dict)
    # A bounded, resumable preview of streamed model output. Raw token events
    # are not all stored in node_events, but reconnecting users still need a
    # useful in-flight preview.
    node_live_outputs: dict[str, str] = field(default_factory=dict)
    waiting_node_id: str | None = None
    output: Any = ""
    error: str = ""
    created_at: str = field(default_factory=lambda: _now())
    updated_at: str = field(default_factory=lambda: _now())

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "graph_id": self.graph_id, "agent_id": self.agent_id,
            "input": self.input, "status": self.status, "active_nodes": self.active_nodes,
            "node_states": self.node_states, "interaction_responses": self.interaction_responses,
            "context": self.context, "context_producers": self.context_producers,
            "node_events": self.node_events, "node_live_outputs": self.node_live_outputs,
            "waiting_node_id": self.waiting_node_id,
            "output": self.output, "error": self.error,
            "created_at": self.created_at, "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "GraphRun":
        return cls(**{key: value[key] for key in cls.__dataclass_fields__ if key in value})


class GraphRunStore:
    def __init__(self, directory: Path):
        self.directory = directory.resolve()

    def save(self, run: GraphRun) -> Path:
        run.updated_at = _now()
        self.directory.mkdir(parents=True, exist_ok=True)
        target = self.directory / f"{run.id}.json"
        temporary = target.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(run.to_dict(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(target)
        return target

    def load(self, run_id: str) -> GraphRun | None:
        if not re.fullmatch(r"run-[a-f0-9]{12}", run_id):
            return None
        path = self.directory / f"{run_id}.json"
        return GraphRun.from_dict(json.loads(path.read_text(encoding="utf-8"))) if path.is_file() else None


class GraphExecutor:
    def __init__(
        self,
        process: Processor,
        decide: Decider,
        logic: Any = None,
        checkpoint: Checkpoint | None = None,
        on_node_event: NodeEventSink | None = None,
    ):
        self.process = process
        self.decide = decide
        self.logic = logic
        self.checkpoint = checkpoint
        self.on_node_event = on_node_event

    def _checkpoint(self, run: GraphRun) -> None:
        if self.checkpoint:
            self.checkpoint(run)

    async def _emit_node_event(self, node_id: str, event: NodeEvent) -> None:
        if self.on_node_event:
            await self.on_node_event(node_id, event)

    async def start(self, graph: Graph, agent_id: str, input_text: str) -> GraphRun:
        run = self.create_run(graph, agent_id, input_text)
        return await self.advance(graph, run)

    def create_run(self, graph: Graph, agent_id: str, input_text: str) -> GraphRun:
        """Create a persisted, pollable run before potentially long work begins."""
        incoming = {node.id: 0 for node in graph.nodes}
        for edge in graph.edges:
            incoming[edge.target] += 1
        roots = [node.id for node in graph.nodes if incoming[node.id] == 0]
        root_schema, root_defaults = _root_input_contract(graph)
        root_input = _parse_external_value(input_text, root_schema, root_defaults)
        return GraphRun(
            id=f"run-{uuid4().hex[:12]}", graph_id=graph.id, agent_id=agent_id,
            input=root_input, active_nodes=roots,
            context=dict(root_input) if isinstance(root_input, dict) else {},
            context_producers={key: "__input__" for key in root_input} if isinstance(root_input, dict) else {},
            node_states={node.id: {"status": "idle", "output": ""} for node in graph.nodes},
        )

    async def resume(self, graph: Graph, run: GraphRun, response: str) -> GraphRun:
        if run.status != "waiting" or not run.waiting_node_id:
            raise ValueError("This Graph run is not waiting for interaction")
        run.interaction_responses[run.waiting_node_id] = response
        run.status, run.waiting_node_id = "running", None
        return await self.advance(graph, run)

    async def advance(self, graph: Graph, run: GraphRun) -> GraphRun:
        nodes = {node.id: node for node in graph.nodes}
        try:
            self._rehydrate_context(graph, run)
            while run.active_nodes:
                node_id = run.active_nodes.pop(0)
                node, state = nodes[node_id], run.node_states[node_id]
                if state["status"] == "completed":
                    continue
                state["status"] = "running"
                context = self._context(graph, run, node_id)
                state["input"] = context
                await self._emit_node_event(node_id, {"type": "node.started"})
                self._checkpoint(run)
                if node.type == "input":
                    output = run.input
                elif node.type == "work":
                    # Start independent Work nodes together.  A DAG commonly
                    # fans out into research/analysis tasks which need not wait
                    # for each other; serialising them makes an otherwise live
                    # UI feel stalled for twice as long.
                    parallel_node_ids = [node_id] + [
                        candidate_id for candidate_id in list(run.active_nodes)
                        if nodes[candidate_id].type == "work"
                        and all(
                            run.node_states[edge.source]["status"] == "completed"
                            for edge in graph.edges if edge.target == candidate_id
                        )
                    ]
                    if len(parallel_node_ids) > 1:
                        for candidate_id in parallel_node_ids[1:]:
                            run.active_nodes.remove(candidate_id)
                            candidate_state = run.node_states[candidate_id]
                            candidate_state["status"] = "running"
                            candidate_state["input"] = self._context(graph, run, candidate_id)
                            await self._emit_node_event(candidate_id, {"type": "node.started"})
                        self._checkpoint(run)

                        async def execute_parallel_work(candidate_id: str) -> None:
                            candidate = nodes[candidate_id]
                            candidate_state = run.node_states[candidate_id]
                            candidate_context = candidate_state["input"]
                            candidate_output = await self.logic.execute_work(
                                candidate_id, candidate_context,
                                _GraphServices(self.process, self.decide, graph.business_goal, candidate_id, self.on_node_event),
                            )
                            candidate_output = _normalize_output(
                                candidate_output, candidate.config.get("output_schema"),
                                f"node '{candidate_id}' output",
                            )
                            self._merge_context(run, candidate_id, candidate_output)
                            candidate_state.update(status="completed", output=candidate_output)
                            await self._emit_node_event(candidate_id, {"type": "node.completed", "output": candidate_output})
                            self._checkpoint(run)
                            for candidate_edge in graph.edges:
                                if candidate_edge.source == candidate_id:
                                    self._activate_if_ready(graph, run, candidate_edge.target)

                        await asyncio.gather(*(execute_parallel_work(candidate_id) for candidate_id in parallel_node_ids))
                        continue
                    instruction = str(node.config.get("instruction") or node.description or node.title)
                    if self.logic and hasattr(self.logic, "execute_work"):
                        output = await self.logic.execute_work(
                            node_id, context,
                            _GraphServices(self.process, self.decide, graph.business_goal, node_id, self.on_node_event),
                        )
                    else:
                        raise RuntimeError(
                            f"Work node '{node_id}' has no Python execute_work implementation; "
                            "AI execution must be explicitly requested in the Graph logic"
                        )
                elif node.type == "condition":
                    edges = [edge for edge in graph.edges if edge.source == node_id]
                    labels = [edge.label or edge.target for edge in edges]
                    expression = str(node.config.get("expression") or node.description or node.title)
                    if self.logic and hasattr(self.logic, "evaluate_condition"):
                        choice = await self.logic.evaluate_condition(
                            node_id, context, labels,
                            _GraphServices(self.process, self.decide, graph.business_goal, node_id, self.on_node_event),
                        )
                    else:
                        raise RuntimeError(
                            f"Condition node '{node_id}' has no Python evaluate_condition implementation; "
                            "AI execution must be explicitly requested in the Graph logic"
                        )
                    choice = str(choice)
                    selected = next((edge for edge in edges if choice.casefold() in {(edge.label or edge.target).casefold(), edge.target.casefold()}), None)
                    if selected is None:
                        selected = edges[0] if edges else None
                    output = _normalize_output(
                        context,
                        node.config.get("output_schema"),
                        f"condition node '{node_id}' output",
                    )
                    self._merge_context(run, node_id, output)
                    state.update(status="completed", output=output)
                    await self._emit_node_event(node_id, {"type": "node.completed", "output": output})
                    self._checkpoint(run)
                    if selected:
                        self._activate_if_ready(graph, run, selected.target)
                    continue
                elif node.type == "interaction":
                    if node_id not in run.interaction_responses:
                        state["status"] = "waiting"
                        run.active_nodes.insert(0, node_id)
                        run.status, run.waiting_node_id = "waiting", node_id
                        await self._emit_node_event(node_id, {"type": "node.waiting"})
                        self._checkpoint(run)
                        return run
                    output = _parse_external_value(
                        run.interaction_responses[node_id],
                        node.config.get("output_schema"),
                        node.config.get("defaults"),
                    )
                else:  # output
                    output = context
                    run.output = output
                output = _normalize_output(output, node.config.get("output_schema"), f"node '{node_id}' output")
                self._merge_context(run, node_id, output)
                state.update(status="completed", output=output)
                await self._emit_node_event(node_id, {"type": "node.completed", "output": output})
                self._checkpoint(run)
                for edge in graph.edges:
                    if edge.source == node_id:
                        self._activate_if_ready(graph, run, edge.target)
            outputs = [node for node in graph.nodes if node.type == "output"]
            if outputs and not any(
                run.node_states[node.id]["status"] == "completed" for node in outputs
            ):
                blocked = [
                    node.id for node in graph.nodes
                    if str(node.config.get("merge_strategy") or "all").lower() == "all"
                    and len([edge for edge in graph.edges if edge.target == node.id]) > 1
                    and run.node_states[node.id]["status"] == "idle"
                ]
                raise ValueError(
                    "Graph finished without reaching an output"
                    + (f"; blocked all-merge nodes: {blocked}" if blocked else "")
                )
            if not run.output and outputs:
                completed = [run.node_states[node.id]["output"] for node in outputs if run.node_states[node.id]["status"] == "completed"]
                run.output = completed[0] if len(completed) == 1 else completed
            run.status = "completed"
            self._checkpoint(run)
        except Exception as error:
            run.status, run.error = "failed", str(error)
            for node_id, state in run.node_states.items():
                if state["status"] == "running":
                    state["status"] = "failed"
                    state["error"] = str(error)
                    await self._emit_node_event(node_id, {"type": "node.failed", "error": str(error)})
            self._checkpoint(run)
        return run

    @staticmethod
    def _activate(run: GraphRun, node_id: str) -> None:
        if run.node_states[node_id]["status"] == "idle" and node_id not in run.active_nodes:
            run.active_nodes.append(node_id)

    @classmethod
    def _activate_if_ready(cls, graph: Graph, run: GraphRun, node_id: str) -> None:
        node = next(node for node in graph.nodes if node.id == node_id)
        sources = [edge.source for edge in graph.edges if edge.target == node_id]
        strategy = str(node.config.get("merge_strategy") or "all").lower()
        if strategy == "any" or all(
            run.node_states[source]["status"] == "completed" for source in sources
        ):
            cls._activate(run, node_id)

    @staticmethod
    def _merge_context(run: GraphRun, node_id: str, output: Any) -> None:
        if not isinstance(output, dict):
            return
        for field, value in output.items():
            if field not in run.context:
                run.context[field] = value
                run.context_producers[field] = node_id
            elif run.context[field] != value:
                previous = run.context_producers.get(field, "unknown")
                raise ValueError(
                    f"Node '{node_id}' attempted to overwrite context field '{field}' "
                    f"produced by '{previous}' with a different value"
                )

    @classmethod
    def _rehydrate_context(cls, graph: Graph, run: GraphRun) -> None:
        """Upgrade persisted runs created before shared contexts were stored."""
        if run.context:
            return
        if isinstance(run.input, dict):
            run.context.update(run.input)
            run.context_producers.update({field: "__input__" for field in run.input})
        for node in graph.nodes:
            state = run.node_states.get(node.id, {})
            if state.get("status") != "completed" or not isinstance(state.get("output"), dict):
                continue
            output = _normalize_output(
                state["output"], node.config.get("output_schema"), f"persisted node '{node.id}' output"
            )
            state["output"] = output
            cls._merge_context(run, node.id, output)

    @staticmethod
    def _context(graph: Graph, run: GraphRun, node_id: str) -> Any:
        node = next(node for node in graph.nodes if node.id == node_id)
        schema = node.config.get("input_schema")
        if schema:
            context = {field: run.context[field] for field in schema if field in run.context}
        elif run.context:
            context = dict(run.context)
        else:
            context = run.input
        _validate_value(context, node.config.get("input_schema"), f"node '{node_id}' input")
        return context


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class _GraphServices:
    def __init__(
        self,
        process: Processor,
        decide: Decider,
        goal: str,
        node_id: str = "",
        on_node_event: NodeEventSink | None = None,
    ):
        self._process, self._decide, self.goal = process, decide, goal
        self._node_id = node_id
        self._on_node_event = on_node_event

    async def _emit(self, event: NodeEvent) -> None:
        if self._on_node_event:
            await self._on_node_event(self._node_id, event)

    async def ai_process(self, instruction: str, value: Any) -> str:
        context = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)

        async def forward(event: NodeEvent) -> None:
            await self._emit(event)

        await self._emit({"type": "agent.started", "message": "正在请求 Agent 分析…"})
        try:
            result = await self._process(
                instruction, context, self.goal,
                forward if self._on_node_event else None,
            )
        except Exception as error:
            await self._emit({"type": "agent.failed", "error": str(error)})
            raise
        await self._emit({"type": "agent.completed", "message": "Agent 已生成节点结果"})
        return result

    async def ai_decide(self, expression: str, value: Any, labels: list[str]) -> str:
        context = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        return await self._decide(expression, context, labels, self.goal)

    # Backward-compatible aliases for Graphs created before AI calls became explicit.
    process = ai_process
    decide = ai_decide


def _root_input_contract(graph: Graph) -> tuple[dict[str, str] | None, dict[str, Any] | None]:
    roots = {node.id for node in graph.nodes} - {edge.target for edge in graph.edges}
    inputs = [node for node in graph.nodes if node.id in roots and node.type == "input"]
    if len(inputs) != 1:
        return None, None
    return inputs[0].config.get("output_schema"), inputs[0].config.get("defaults")


def _parse_external_value(value: str, schema: Any, defaults: Any = None) -> Any:
    if not schema:
        return value
    defaults = dict(defaults) if isinstance(defaults, dict) else {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        text_fields = [field for field in ("content", "text", "value", "input") if field in schema]
        if len(schema) == 1 or text_fields:
            field = text_fields[0] if text_fields else next(iter(schema))
            parsed = {**defaults, field: value}
        else:
            raise ValueError("Structured node input must be valid JSON") from error
    if isinstance(parsed, dict):
        parsed = {**defaults, **parsed}
    _validate_value(parsed, schema, "external input")
    return parsed


def _validate_value(value: Any, schema: Any, location: str) -> None:
    if not schema:
        return
    if not isinstance(value, dict):
        raise ValueError(f"{location} must be an object with fields {sorted(schema)}")
    missing = sorted(set(schema) - set(value))
    if missing:
        raise ValueError(f"{location} is missing required fields: {missing}")
    python_types = {
        "string": str, "number": (int, float), "integer": int, "boolean": bool,
        "object": dict, "array": list,
    }
    invalid = [
        field for field, expected in schema.items()
        if expected != "any" and (
            not isinstance(value[field], python_types[expected])
            or expected in {"number", "integer"} and isinstance(value[field], bool)
        )
    ]
    if invalid:
        raise ValueError(f"{location} has invalid field types: {invalid}")


def _normalize_output(value: Any, schema: Any, location: str) -> Any:
    """Validate a node result and expose only fields owned by its output contract."""
    _validate_value(value, schema, location)
    if not schema or not isinstance(value, dict):
        return value
    return {field: value[field] for field in schema}


def load_graph_logic(path: Path) -> Any:
    """Load business handlers from one Graph package, isolated by run."""
    if not path.is_file():
        return None
    module_name = f"eido_graph_{path.parent.name.replace('-', '_')}_{uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ValueError(f"Cannot load Graph logic: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
