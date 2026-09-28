# Eido Agent Protocol v1

Every registered Agent Server exposes the existing Eido chat contract:

- `POST /chat` accepts `agent_id`, `session_id`, `visitor_id`, `message`, optional images/attachments and `stream`.
- With `stream: true`, it returns `application/x-ndjson`; each line is a complete JSON event.
- Required event order is `meta`, zero or more `delta`, optional `thinking.delta`, or activity events, then `done` or `error`.
- `DELETE /chat/{session_id}` is idempotent cancellation.
- `POST /sessions/{session_id}/interactions/{interaction_id}/respond` resolves a pending clarification or approval.

The normative field-level contract is maintained in `docs/AGENT_SERVER_API.md`.  A remote server must accept the platform session ID as an opaque value and must return that same value in the `meta` event.  Optional events include `tool.*`, `agent.*`, `interaction.*`, and `heartbeat`.

Servers should expose `GET /health` and may expose `GET /capabilities` with:

```json
{"protocol_version":"eido-agent/v1","streaming":true,"cancel":true,"interactions":true,"attachments":false}
```
