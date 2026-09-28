---
name: agent-manage
description: "Create a new Eido expert Agent through the platform Agent CLI. Use when the owner asks to add an intelligent agent, not to edit an existing Agent or configure a provider."
---

# Agent Manage

Create only an **expert Agent**. Do not create, replace, or modify SiinX, and
do not create an Agent merely because the user described a role hypothetically.

First collect or infer a concise name, identity, and capability description.
Then discover the owner's available provider configuration and models:

```sh
AGENT_CLI="$(find .eido/agent-skills -path '*/agent-manage/scripts/agent.py' -print -quit)"
python "$AGENT_CLI" provider list
```

For a local Agent, select one returned `id` as `providerConfigId` and one of
its `models` as `model`. If there is no suitable provider configuration, tell
the owner that a provider/model must be configured in the platform first.

Before creation, show the proposed name, role, capabilities, selected model,
and the fact that a new configurable expert Agent will be added. Ask for an
explicit confirmation. Once confirmed, write the exact JSON to a workspace
file and run:

```sh
python "$AGENT_CLI" create --file .eido/new-agent.json
```

The JSON must include `name`, `identity`, `capabilities`, `providerConfigId`,
and `model`. Optional fields include `speakingStyle`, `values`, `boundaries`,
and `temperature`. Do not include API keys: the selected provider configuration
is referenced by ID. Read the returned JSON and report the created `agent.id`.
If the command fails, present the platform error and do not claim creation
succeeded.
