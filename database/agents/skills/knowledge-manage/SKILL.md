---
name: knowledge-manage
description: "Manage Eido knowledge spaces and their knowledge graph: create, edit, or delete spaces; atomically add related nodes in batches; and edit or remove knowledge nodes. Use for platform knowledge-base maintenance, not for general file notes."
---

# Knowledge Manage

Use the bundled CLI script against the Eido platform API. Resolve it once from the Agent workspace:

```sh
KNOWLEDGE_CLI="$(find .eido/agent-skills -path '*/knowledge-manage/scripts/knowledge.py' -print -quit)"
python "$KNOWLEDGE_CLI" space list
```

Before changing data, list spaces and nodes to resolve stable IDs. Use `space create|update|delete`, `node list|add-batch|update|update-batch|delete`, and `search`. Put substantial JSON in a workspace file and pass `--file`; do not construct large JSON in shell quoting.

For batch input and exact examples, read [references/input-schema.md](references/input-schema.md). Batch add is atomic: reference new nodes by request-local `ref` values and submit nodes plus edges together. If validation fails, correct the complete input rather than retrying individual nodes.

Deleting a space removes all of its nodes and relations; deleting a node removes its attached relations. Confirm the exact target with the user when it is not already explicit, then pass `--yes`. After every mutation, inspect the returned JSON; after a batch add, verify `refMap`, created nodes, and edge endpoints.

The runtime supplies the current owner's identity through `EIDO_USER_ID`. The CLI defaults to `http://127.0.0.1:3000`; use `--base-url` only when the platform is running elsewhere.
