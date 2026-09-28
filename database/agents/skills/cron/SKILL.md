---
name: cron
description: Design reminders and recurring tasks while using only an available scheduler or automation tool.
---

# Scheduled Tasks

Use this skill for reminders, one-time future tasks, and recurring tasks. Do not pretend a schedule was created unless a scheduler tool is available and returned success.

Determine:

- reminder versus task execution;
- one-time timestamp versus interval or cron expression;
- IANA timezone;
- what should be delivered and where;
- whether quiet runs should suppress empty results.

Use the runtime's automation/scheduler tool when present. If none is installed, provide the normalized schedule specification and clearly state that it was not activated. Avoid raw operating-system crontab changes unless the user explicitly requests system-level scheduling.
