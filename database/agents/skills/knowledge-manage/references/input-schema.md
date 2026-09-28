# Knowledge CLI input

All commands print JSON and return a non-zero exit code on validation or API errors.

## Spaces

```sh
python "$KNOWLEDGE_CLI" space create --json '{"name":"产品知识","description":"产品与功能说明","domain":"产品"}'
python "$KNOWLEDGE_CLI" space update SPACE_ID --json '{"description":"新的说明"}'
python "$KNOWLEDGE_CLI" space delete SPACE_ID --yes
```

Space fields: `name`, `description`, `domain`, `color` (`#RRGGBB`), and `agentIds`.

## Atomic batch add

Write a JSON file such as `knowledge-batch.json`:

```json
{
  "nodes": [
    {"ref": "overview", "title": "产品概览", "type": "概念", "summary": "...", "content": "...", "tags": ["产品"]},
    {"ref": "setup", "title": "安装流程", "type": "流程", "content": "...", "aliases": ["部署"]}
  ],
  "edges": [
    {"source": "overview", "target": "setup", "relation": "包含"}
  ]
}
```

Then run:

```sh
python "$KNOWLEDGE_CLI" node add-batch SPACE_ID --file knowledge-batch.json
```

Each new node needs a unique non-empty `ref`. An edge's `source` and `target` can be a new node `ref` or an existing node ID from the same space. Self-links, missing endpoints, duplicate refs, and duplicate `(source, target, relation)` links are rejected before anything is written. Limits per request: 500 nodes and 2000 edges.

## Update knowledge

```sh
python "$KNOWLEDGE_CLI" node update SPACE_ID NODE_ID --json '{"summary":"更新后的摘要","tags":["产品","新版"]}'
python "$KNOWLEDGE_CLI" node update-batch SPACE_ID --file knowledge-updates.json
python "$KNOWLEDGE_CLI" node delete SPACE_ID NODE_ID --yes
```

Batch update input is an array (or an object containing `updates`):

```json
[
  {"nodeId": "NODE_ID_1", "node": {"title": "新标题"}},
  {"nodeId": "NODE_ID_2", "node": {"content": "新正文"}}
]
```

Editable node fields: `title`, `type`, `summary`, `content`, `tags`, `aliases`, `x`, and `y`. Batch update is atomic and rejects duplicate or missing node IDs.
