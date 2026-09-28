"""Core GraphLines domain model and JSON file storage."""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, ClassVar, Literal
from uuid import uuid4

NodeStatus = Literal["idle", "running", "completed", "failed"]
GraphStatus = Literal["draft", "active", "completed", "failed"]


@dataclass(slots=True)
class Node(ABC):
    """Abstract executable unit in a GraphLine."""

    id: str
    title: str
    description: str = ""
    config: dict[str, Any] = field(default_factory=dict)
    status: NodeStatus = "idle"
    type: ClassVar[str]

    def __post_init__(self) -> None:
        self.id = _identifier(self.id, "node")
        self.title = self.title.strip()
        if not self.title:
            raise ValueError("Node title cannot be empty")

    @abstractmethod
    def validate_config(self) -> None:
        """Validate configuration owned by this node type."""

    def to_dict(self) -> dict[str, Any]:
        self.validate_config()
        return {"id": self.id, "type": self.type, **asdict(self)}


@dataclass(slots=True)
class InputNode(Node):
    type: ClassVar[str] = "input"

    def validate_config(self) -> None:
        _optional_string_list(self.config, "fields")
        _optional_schema(self.config, "output_schema")
        _optional_defaults(self.config, "output_schema")


@dataclass(slots=True)
class OutputNode(Node):
    type: ClassVar[str] = "output"

    def validate_config(self) -> None:
        _optional_string_list(self.config, "fields")
        _optional_schema(self.config, "input_schema")


@dataclass(slots=True)
class WorkNode(Node):
    type: ClassVar[str] = "work"

    def validate_config(self) -> None:
        instruction = self.config.get("instruction")
        if instruction is not None and not isinstance(instruction, str):
            raise ValueError(f"Work node {self.id} config.instruction must be a string")
        _optional_schema(self.config, "input_schema")
        _optional_schema(self.config, "output_schema")


@dataclass(slots=True)
class ConditionNode(Node):
    type: ClassVar[str] = "condition"

    def validate_config(self) -> None:
        expression = self.config.get("expression")
        if expression is not None and not isinstance(expression, str):
            raise ValueError(f"Condition node {self.id} config.expression must be a string")
        _optional_schema(self.config, "input_schema")
        _optional_schema(self.config, "output_schema")


@dataclass(slots=True)
class InteractionNode(Node):
    type: ClassVar[str] = "interaction"

    def validate_config(self) -> None:
        prompt = self.config.get("prompt")
        if prompt is not None and not isinstance(prompt, str):
            raise ValueError(f"Interaction node {self.id} config.prompt must be a string")
        _optional_schema(self.config, "input_schema")
        _optional_schema(self.config, "output_schema")
        _optional_defaults(self.config, "output_schema")


NODE_TYPES: dict[str, type[Node]] = {
    node_type.type: node_type
    for node_type in (InputNode, OutputNode, WorkNode, ConditionNode, InteractionNode)
}


@dataclass(slots=True)
class Edge:
    source: str
    target: str
    label: str = ""
    id: str = ""

    def __post_init__(self) -> None:
        self.source = _identifier(self.source, "source")
        self.target = _identifier(self.target, "target")
        self.id = _identifier(self.id or f"{self.source}-{self.target}", "edge")


@dataclass(slots=True)
class Graph:
    id: str
    name: str
    business_goal: str
    nodes: list[Node]
    edges: list[Edge]
    description: str = ""
    status: GraphStatus = "draft"
    created_at: str = field(default_factory=lambda: _now())
    updated_at: str = field(default_factory=lambda: _now())

    def validate(self) -> None:
        self.id = _identifier(self.id, "graph")
        if not self.name.strip():
            raise ValueError("Graph name cannot be empty")
        if not self.business_goal.strip():
            raise ValueError("Graph business_goal cannot be empty")
        if not self.nodes:
            raise ValueError("Graph must contain at least one node")

        node_ids = [node.id for node in self.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("Graph node ids must be unique")
        known = set(node_ids)
        nodes_by_id = {node.id: node for node in self.nodes}
        for node in self.nodes:
            node.validate_config()
            _merge_strategy(node)
        for edge in self.edges:
            if edge.source not in known or edge.target not in known:
                raise ValueError(f"Edge {edge.id} references an unknown node")
            if edge.source == edge.target:
                raise ValueError(f"Edge {edge.id} cannot connect a node to itself")
        _validate_acyclic(known, self.edges)
        available_cache: dict[str, dict[str, str]] = {}

        def available_after(node_id: str) -> dict[str, str]:
            if node_id in available_cache:
                return available_cache[node_id]
            node = nodes_by_id[node_id]
            parents = [edge.source for edge in self.edges if edge.target == node_id]
            parent_schemas = [available_after(parent) for parent in parents]
            before = _combine_available_schemas(parent_schemas, _merge_strategy(node))
            _validate_available_contract(before, node)
            result = {**before, **_node_output_schema(node)}
            available_cache[node_id] = result
            return result

        for node_id in node_ids:
            available_after(node_id)

    def to_dict(self) -> dict[str, Any]:
        self.validate()
        return {
            "id": self.id,
            "name": self.name,
            "business_goal": self.business_goal,
            "description": self.description,
            "status": self.status,
            "nodes": [node.to_dict() for node in self.nodes],
            "edges": [asdict(edge) for edge in self.edges],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "Graph":
        nodes = []
        for raw in value.get("nodes", []):
            node_type = NODE_TYPES.get(str(raw.get("type", "")).lower())
            if node_type is None:
                raise ValueError(f"Unsupported node type: {raw.get('type')}")
            nodes.append(node_type(**{key: raw[key] for key in ("id", "title", "description", "config", "status") if key in raw}))
        graph = cls(
            id=str(value.get("id") or f"graph-{uuid4().hex[:10]}"),
            name=str(value.get("name") or "Untitled Graph"),
            business_goal=str(value.get("business_goal") or ""),
            description=str(value.get("description") or ""),
            status=value.get("status", "draft"),
            nodes=nodes,
            edges=[Edge(**edge) for edge in value.get("edges", [])],
            created_at=str(value.get("created_at") or _now()),
            updated_at=str(value.get("updated_at") or _now()),
        )
        graph.validate()
        return graph


class GraphStore:
    """Persist every Graph as an independent, disposable package."""

    def __init__(self, directory: Path):
        self.directory = directory.resolve()

    def save(self, graph: Graph, logic_code: str | None = None) -> Path:
        graph.updated_at = _now()
        payload = graph.to_dict()
        self.directory.mkdir(parents=True, exist_ok=True)
        package = self.package_dir(graph.id)
        package.mkdir(parents=True, exist_ok=True)
        target = package / "graph.json"
        temporary = target.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(target)
        logic = package / "logic.py"
        if logic_code is not None:
            logic.write_text(logic_code.rstrip() + "\n", encoding="utf-8")
        elif not logic.exists():
            logic.write_text(_logic_template(graph), encoding="utf-8")
        return target

    def package_dir(self, graph_id: str) -> Path:
        return self.directory / _identifier(graph_id, "graph")

    def list(self) -> list[Graph]:
        if not self.directory.exists():
            return []
        paths = list(self.directory.glob("*/graph.json")) + list(self.directory.glob("*.json"))
        graphs = [Graph.from_dict(json.loads(path.read_text(encoding="utf-8"))) for path in paths]
        return sorted(graphs, key=lambda graph: graph.updated_at, reverse=True)


def build_graph(value: dict[str, Any]) -> Graph:
    """Build and validate a Graph from tool/JSON input."""

    payload = dict(value)
    payload["id"] = payload.get("id") or f"graph-{uuid4().hex[:10]}"
    return Graph.from_dict(payload)


def _validate_acyclic(node_ids: set[str], edges: list[Edge]) -> None:
    incoming = {node_id: 0 for node_id in node_ids}
    outgoing = {node_id: [] for node_id in node_ids}
    for edge in edges:
        incoming[edge.target] += 1
        outgoing[edge.source].append(edge.target)
    queue = [node_id for node_id, count in incoming.items() if count == 0]
    visited = 0
    while queue:
        current = queue.pop()
        visited += 1
        for target in outgoing[current]:
            incoming[target] -= 1
            if incoming[target] == 0:
                queue.append(target)
    if visited != len(node_ids):
        raise ValueError("Graph must be acyclic")


def _identifier(value: str, kind: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(value).strip()).strip("-")
    if not normalized:
        raise ValueError(f"Invalid {kind} id")
    return normalized[:80]


def _optional_string_list(config: dict[str, Any], key: str) -> None:
    value = config.get(key)
    if value is not None and (not isinstance(value, list) or any(not isinstance(item, str) for item in value)):
        raise ValueError(f"config.{key} must be a string array")


SCHEMA_TYPES = {"string", "number", "integer", "boolean", "object", "array", "any"}
MERGE_STRATEGIES = {"all", "any"}


def _optional_schema(config: dict[str, Any], key: str) -> None:
    schema = config.get(key)
    if schema is None:
        return
    if not isinstance(schema, dict) or any(
        not isinstance(field, str) or not field.strip() or field_type not in SCHEMA_TYPES
        for field, field_type in schema.items()
    ):
        raise ValueError(f"config.{key} must map field names to one of {sorted(SCHEMA_TYPES)}")


def _merge_strategy(node: Node) -> str:
    strategy = str(node.config.get("merge_strategy") or "all").lower()
    if strategy not in MERGE_STRATEGIES:
        raise ValueError(
            f"Node '{node.id}' config.merge_strategy must be one of {sorted(MERGE_STRATEGIES)}"
        )
    return strategy


def _optional_defaults(config: dict[str, Any], schema_key: str) -> None:
    defaults = config.get("defaults")
    if defaults is None:
        return
    if not isinstance(defaults, dict):
        raise ValueError("config.defaults must be an object")
    schema = config.get(schema_key) or {}
    unknown = sorted(set(defaults) - set(schema))
    if unknown:
        raise ValueError(f"config.defaults contains fields not in {schema_key}: {unknown}")


def _node_input_schema(node: Node) -> dict[str, str]:
    return dict(node.config.get("input_schema") or {})


def _node_output_schema(node: Node) -> dict[str, str]:
    return dict(node.config.get("output_schema") or {})


def _combine_available_schemas(schemas: list[dict[str, str]], strategy: str) -> dict[str, str]:
    if not schemas:
        return {}
    if strategy == "any":
        common = set.intersection(*(set(schema) for schema in schemas))
        return {
            field: schemas[0][field]
            for field in common
            if all(schema[field] in {schemas[0][field], "any"} or schemas[0][field] == "any" for schema in schemas[1:])
        }
    combined: dict[str, str] = {}
    for schema in schemas:
        for field, kind in schema.items():
            previous = combined.get(field)
            if previous is not None and previous not in {kind, "any"} and kind != "any":
                raise ValueError(f"Context field '{field}' has incompatible producer types")
            combined[field] = kind if previous in {None, "any"} else previous
    return combined


def _validate_available_contract(produced: dict[str, str], target: Node) -> None:
    required = _node_input_schema(target)
    if not required or not produced:
        return  # Legacy/untyped roots remain loadable.
    missing = sorted(set(required) - set(produced))
    mismatched = sorted(
        field for field in set(required) & set(produced)
        if required[field] != "any" and produced[field] != "any" and required[field] != produced[field]
    )
    if missing or mismatched:
        details = []
        if missing:
            details.append(f"missing fields {missing}")
        if mismatched:
            details.append(f"type mismatch for {mismatched}")
        raise ValueError(f"Incoming contract for node '{target.id}' is incompatible: {', '.join(details)}")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _logic_template(graph: Graph) -> str:
    work = {node.id: str(node.config.get("instruction") or node.description or node.title) for node in graph.nodes if node.type == "work"}
    conditions = {node.id: str(node.config.get("expression") or node.description or node.title) for node in graph.nodes if node.type == "condition"}
    prompts = {node.id: str(node.config.get("prompt") or node.description or node.title) for node in graph.nodes if node.type == "interaction"}
    return (
        '"""Business logic for this Graph. Delete this directory to remove it.\n\n'
        "You can edit these handlers without changing the Eido Agent runtime.\n"
        '"""\n\n'
        f"WORK_INSTRUCTIONS = {work!r}\n"
        f"CONDITION_EXPRESSIONS = {conditions!r}\n"
        f"INTERACTION_PROMPTS = {prompts!r}\n\n"
        "async def execute_work(node_id, value, services):\n"
        "    # Implement deterministic business logic here with Python.\n"
        "    # Only call services.ai_process(...) when this Graph explicitly requires AI.\n"
        "    raise NotImplementedError(f'Python logic is required for work node: {node_id}')\n\n"
        "async def evaluate_condition(node_id, value, labels, services):\n"
        "    # Evaluate the condition deterministically and return one value from labels.\n"
        "    # Only call services.ai_decide(...) when this Graph explicitly requires AI.\n"
        "    raise NotImplementedError(f'Python logic is required for condition node: {node_id}')\n"
    )
