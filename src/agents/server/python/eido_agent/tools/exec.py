from __future__ import annotations
import asyncio
import os
import re
from typing import Any
from .base import Tool
from .context import ToolContext
from .authorization import require_approval_for_command


class ExecTool(Tool):
    def __init__(self, context: ToolContext):
        self.context = context

    @property
    def name(self):
        return "exec"

    @property
    def description(self):
        return "Run a shell command in the Agent workspace with a hard timeout. Sensitive or external commands require approval."

    @property
    def parameters(self):
        return {
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "timeout": {"type": "integer", "minimum": 1, "maximum": 60},
            },
            "required": ["command"],
            "additionalProperties": False,
        }

    async def execute(self, **kwargs: Any):
        command = str(kwargs["command"])
        require_approval_for_command(self.context, self.name, kwargs, command)
        denied = (
            r"\brm\s+-[rf]{1,2}\b",
            r"\b(mkfs|diskpart|shutdown|reboot|poweroff)\b",
            r"\bdd\s+if=",
            r":\(\)\s*\{.*\};\s*:",
        )
        if any(re.search(pattern, command, re.IGNORECASE) for pattern in denied):
            return "Command blocked by the Eido safety policy"
        timeout = min(int(kwargs.get("timeout", 30)), 60)
        environment = os.environ.copy()
        if self.context.profile.owner_user_id:
            environment["EIDO_USER_ID"] = self.context.profile.owner_user_id
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=self.context.workspace,
            env=environment,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            output, _ = await asyncio.wait_for(proc.communicate(), timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return f"Command timed out after {timeout}s"
        text = output.decode(errors="replace")
        return f"exit_code={proc.returncode}\n{text[-20000:]}"

    async def preflight(self, **kwargs: Any) -> None:
        command = str(kwargs["command"])
        require_approval_for_command(self.context, self.name, kwargs, command)
