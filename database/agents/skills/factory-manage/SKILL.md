---
name: factory-manage
description: Create, inspect, test, debug, modify, or delete executable Factory business lines stored as Graph packages. Use when the user asks to create or manage a Factory, production line, business line, workflow, pipeline or misspelled pipline, 流水线, 业务线, 生产线, 执行图, Graph, nodes, contracts, runtime failures, or line-specific Python logic—for example “帮我创建一条生产线，目标是…” or “work node 报错了”. Use deterministic Python scripts for discovery, execution testing, validation, atomic updates, and recoverable deletion; require flow confirmation before creation and explicit confirmation before destructive changes.
---

# Factory Manage

Treat “Factory 中的业务线”, “生产线”, “流水线”, “pipeline”, “pipline”, “工作流”, and “Graph” as equivalent user-facing names for the same executable Graph package. Use `python3.11 skills/factory-manage/scripts/manage_factory.py` for every Factory-line operation. Do not use `grep`, `find_files`, `list_dir`, shell `find`, or manual filesystem exploration to locate lines. The bundled script knows that packages live outside the Agent workspace and resolves the repository location itself.

## Discover graphs

For a natural-language reference such as “专利idea那个graph”, “删掉文件转MD流程”, or “修改刚才那个图”, pass the user's original phrase directly to `locate`. Do not simplify it yourself:

```bash
python3.11 skills/factory-manage/scripts/manage_factory.py locate --query "专利idea那条业务线"
```

The script removes conversational noise, scores Graph ID, name, description, and business goal, and returns `status: resolved` with the exact `id`, `name`, and package `path` when there is one confident match. If it returns `status: ambiguous`, show its candidates and ask the user to choose. If it returns `status: not_found`, report that result; do not fall back to filesystem search.

Use `list` only when the user asks what Graphs exist or gives no identifying phrase:

```bash
python3.11 skills/factory-manage/scripts/manage_factory.py list
```

## Create a business line

Analyze the business goal, runtime input, final output, side effects, deterministic rules, branches, interactions, and explicitly AI-dependent steps. Design a concise flow whose first node is `input` and last node is `output`. Use `work` for Python processing, `condition` for labeled routing, and `interaction` for pauses.

Define compatible contracts before creation: input uses `output_schema`, output uses `input_schema`, and other nodes use both. Supported field types are `string`, `number`, `integer`, `boolean`, `object`, `array`, and `any`.

The runtime maintains one shared context for the run. A node's `input_schema` selects the fields it receives, and its `output_schema` declares only the new fields it owns. Never repeat input or historical fields in a work node's `output_schema`, and never return them from `execute_work`; return only the node's incremental result. Extra returned fields are discarded by the runtime.

Show the proposed nodes, contracts, edges, and overall flow. Revise until the user confirms. Then write `graph-spec.json` and `graph-logic.py` in the Agent workspace and run:

```bash
python3.11 skills/factory-manage/scripts/manage_factory.py create --spec graph-spec.json --logic graph-logic.py
```

Implement deterministic work in Python. Use `services.ai_process` or `services.ai_decide` only for a confirmed step that genuinely requires AI. Return Python dictionaries for object contracts, never JSON strings.

Creation is not complete until the line has been executed with at least one representative example. Immediately take the ID returned by `create` and run:

```bash
python3.11 skills/factory-manage/scripts/manage_factory.py test --id <graph-id> --input '<valid example input>'
```

The example must cover the normal path and conform to the input node's `output_schema`; pass structured examples as JSON. The test executes the real `logic.py` through the same Graph executor used by Factory, validates every reached node contract, and never silently invokes AI. If it returns `status: failed`, inspect `failed_nodes`, fix the spec or Python logic with `update`, and rerun `test` until it passes. For branches, test one input per important branch. A result that waits at an `interaction` node proves only the pre-interaction path; also test continuation manually in the Factory UI.

## Modify a business line

Run `locate --query <original user phrase>`, identify the package from its result, then diagnose persisted failures before editing:

```bash
python3.11 skills/factory-manage/scripts/manage_factory.py diagnose --id <graph-id>
```

Inspect the failed node's actual input and error together with the current `graph.json` and `logic.py`. Fix the earliest failed node first; do not rewrite unrelated downstream nodes. Explain the intended behavior or contract changes and ask for confirmation when they materially alter execution. Write the complete replacement spec and, when needed, complete replacement logic. Preserve the Graph ID.

Choose an explicit merge contract whenever multiple branches converge:

- Use the downstream node config `"merge_strategy": "any"` for mutually exclusive alternatives (normally branches selected by one condition). Every branch must independently satisfy the downstream `input_schema`; the same field names may appear in each alternative.
- Use `"merge_strategy": "all"` for true parallel work. The runtime waits for every direct source, then projects the downstream `input_schema` from the accumulated shared context. Parallel branches should declare only the new fields they own. `all` is the default.

Never use empty-string placeholders to satisfy contracts. Prefer one stable downstream schema and make the merge semantics explicit.

```bash
python3.11 skills/factory-manage/scripts/manage_factory.py update --id <graph-id> --spec graph-spec.json --logic graph-logic.py
```

The script validates and atomically replaces the package. Omit `--logic` only when existing Python logic remains valid.

After any executable logic, contract, node, or edge change, rerun `test` with the exact input from the most recent failed run when available, followed by a representative input. Do not report the modification as successful until the test passes. If deterministic testing stops at an explicitly AI-backed node, report that limitation and run the same input from the Factory UI; inspect the persisted run with `diagnose` afterward. Never treat a successful `update` command alone as proof that the repair worked.

## Delete a business line

Run `locate --query <original user phrase>` first. When it returns `resolved`, state the returned ID, name, and path and obtain explicit user confirmation. Then use that exact ID:

```bash
python3.11 skills/factory-manage/scripts/manage_factory.py delete --id <graph-id>
```

Deletion is recoverable: the script moves the entire package into `runtime/graphs/.trash/` and reports its new path. Never use `rm` for Graph deletion.

## Report results

Only claim creation or modification success after both the write command and the subsequent `test` succeed. Report the tested input and actual output. For creation or modification, also give a valid usage example and expected output or side effect. Mention every AI-backed node, or state that execution is entirely Python-based. For AI-backed or interactive paths that the deterministic test cannot finish, explicitly state which part still requires a live Factory UI test.
