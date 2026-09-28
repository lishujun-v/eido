# Agents domain

The Agents domain owns both the Web application's TypeScript adapters and the
local Python runtime:

```text
src/agents/
├── cli/
│   ├── main.ts             # Agent-management CLI (`npm run agent -- …`)
│   └── smoke_test.py       # Local Agent runtime smoke test
├── server/
│   ├── handlers.ts          # Agent management HTTP handlers
│   ├── chat-handlers.ts     # Chat proxy HTTP handlers
│   ├── AGENT_PROTOCOL.md    # Versioned external server contract
│   ├── registry/            # Development-time registry examples
│   └── python/
│       ├── eido_agent/      # Canonical Python service package
│       ├── config.json      # Default local service configuration
│       └── requirements.txt # Canonical Python dependencies
├── sdk/                     # Public Agent-management SDK boundary
└── ...
```

The Python service continues to expose the `eido_agent` package and the same
HTTP API. Start it with `npm run agent:server`; run its smoke test with
`npm run agent:smoke`. The implementation, default configuration, protocol,
and CLI entry points now all live inside this domain.

The built-in `browser` tool uses a session-isolated Playwright Chromium tab.
After installing `src/agents/server/python/requirements.txt`, run
`.venv/bin/python -m playwright install chromium` once on the machine that runs
the Agent service. Each navigation, click, fill, scroll and key press streams a
fresh screenshot to the WebUI chat's browser panel. Browser access is limited
to public HTTP(S) destinations; local and private network targets are blocked.

Persistent JSON tables and Agent Skill packages remain in the top-level
`database/` directory (`database/agents/skills/`). Mutable workspace, project,
and Graph files remain in the top-level `runtime/` directory. Downloaded local
models are stored separately under `data/models/`.

## Public Agent creation

`src/agents/sdk/` exposes `AgentClient`, whose `create()` method uses the
same `/api/agents` contract as the WebUI. The CLI deliberately accepts a JSON
object rather than inventing a second profile schema:

```sh
npm run agent -- provider list
npm run agent -- create --file agent.json
```

For local Agents, `agent.json` requires `name`, `identity`, `capabilities`,
`providerConfigId`, and `model`. The configured platform API still owns
authentication, provider ownership, quotas, and persistence.
