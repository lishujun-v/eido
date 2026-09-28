"""Risk-based authorization policy for local Agent tools."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from ipaddress import IPv4Address, IPv6Address

from ..interactions import require_approved_action
from .context import ToolContext, is_within_workspace, resolve_workspace_path


_SENSITIVE_PATH_PARTS = frozenset({".aws", ".git", ".gnupg", ".ssh"})
_SENSITIVE_FILE_NAMES = frozenset({
    "authorized_keys", "credentials.json", "id_dsa", "id_ecdsa", "id_ed25519",
    "id_rsa", "known_hosts", ".netrc",
})
_SENSITIVE_SUFFIXES = frozenset({".key", ".kdbx", ".p12", ".pem", ".pfx"})
_SENSITIVE_COMMANDS = re.compile(
    r"(?:\b(?:curl|wget|ssh|scp|sftp|ftp|nc|ncat|telnet|sudo|docker|kubectl|terraform|aws|gcloud|az|"
    r"launchctl|osascript|kill|pkill|chmod|chown|mkfs|diskutil|dd)\b|"
    r"\bgit\s+(?:push|commit|reset|clean)\b|\b(?:npm|pnpm|yarn)\s+(?:publish|login)\b|"
    r"\b(?:pip|pip3)\s+install\b|\b(?:env|printenv)\b|(?:^|[;&|])\s*rm\b|"
    r"(?:^|\s)(?:>|>>|<)\s*(?:/|~|\.\./))",
    re.IGNORECASE,
)
_DANGEROUS_COMMANDS = (
    re.compile(r"\brm\s+(?:(?:--)?[a-z-]*[rf][a-z-]*\s+|--\s+)*['\"]?(?:/|~/?|\$HOME|\*)['\"]?(?:\s|$)", re.IGNORECASE),
    re.compile(r"\b(?:mkfs(?:\.\w+)?|shutdown|reboot|poweroff|halt)\b", re.IGNORECASE),
    re.compile(r"\bdiskutil\s+(?:eraseDisk|partitionDisk)\b", re.IGNORECASE),
    re.compile(r"\bdd\b.*\bof=/dev/(?:[a-z]+|disk\d+)\b", re.IGNORECASE),
    re.compile(r":\(\)\s*\{.*\};\s*:\s*&", re.IGNORECASE),
    re.compile(r"\b(?:chmod|chown)\s+-R\b.*\s/(?:\s|$)", re.IGNORECASE),
)


def permission_mode(context: ToolContext) -> str:
    """Return the session policy, keeping old sessions on the smart default."""
    mode = (context.session.metadata.get("permission_mode") if context.session else None)
    return mode if mode in {"auto", "smart", "manual"} else "smart"


def resolve_action_path(context: ToolContext, value: str) -> Path:
    """Resolve a path before checking its risk; callers still decide whether to write."""
    return resolve_workspace_path(context, value, allow_outside=True)


def approval_reason_for_paths(
    context: ToolContext, paths: list[Path], *, operation: str,
) -> str | None:
    mode = permission_mode(context)
    if mode == "auto":
        return None
    for path in paths:
        if not is_within_workspace(context, path):
            if mode == "manual" or operation != "read":
                return f"目标路径超出当前工作目录：{path}"
        if mode != "auto" and _is_sensitive_path(path):
            return f"目标属于敏感文件或配置：{path.relative_to(context.workspace.resolve())}"
    return None


def display_path(context: ToolContext, path: Path) -> Path:
    """Keep workspace results concise without hiding an approved external target."""
    return path.relative_to(context.workspace.resolve()) if is_within_workspace(context, path) else path


def require_approval_for_paths(
    context: ToolContext, tool_name: str, arguments: dict[str, Any], paths: list[Path],
    *, operation: str,
) -> None:
    """Apply the session policy to a filesystem operation."""
    if reason := approval_reason_for_paths(context, paths, operation=operation):
        require_approved_action(context, tool_name, arguments, reason=reason)


def require_approval_for_command(
    context: ToolContext, tool_name: str, arguments: dict[str, Any], command: str,
) -> None:
    """Commands run in the workspace by default; external/sensitive commands need approval."""
    if danger := dangerous_command_reason(command):
        raise ValueError(f"Command blocked by the Eido safety policy: {danger}")
    if permission_mode(context) == "auto":
        return
    normalized = command.strip()
    external_reference = bool(re.search(r"(?:^|[\s;|&])(?:\.\./|/|~\/)", normalized))
    if external_reference or _SENSITIVE_COMMANDS.search(normalized):
        reason = "命令引用了工作目录外的路径" if external_reference else "命令属于敏感或高风险操作"
        require_approved_action(context, tool_name, arguments, reason=reason)


def dangerous_command_reason(command: str) -> str | None:
    """Hard blocks that no permission mode may override."""
    for pattern in _DANGEROUS_COMMANDS:
        if pattern.search(command):
            return "命令可能删除系统数据、破坏磁盘或使系统不可用"
    return None


def require_approval_for_network(
    context: ToolContext,
    tool_name: str,
    arguments: dict[str, Any],
    *,
    url: str,
    addresses: list[IPv4Address | IPv6Address],
) -> None:
    """Require owner consent before fetching a target with non-public DNS answers."""
    if permission_mode(context) == "auto":
        return
    targets = ", ".join(str(address) for address in addresses if not address.is_global)
    require_approval_for_network_action(
        context,
        tool_name,
        arguments,
        reason=(
            f"该 URL 解析到了私有或保留网络地址（{targets}）；"
            f"访问可能触及内网服务：{url}"
        ),
    )


def require_approval_for_network_action(
    context: ToolContext, tool_name: str, arguments: dict[str, Any], *, reason: str,
) -> None:
    """Use the selected mode for a network request requiring attention."""
    if permission_mode(context) == "auto":
        return
    require_approved_action(context, tool_name, arguments, reason=reason)


def requires_network_approval(context: ToolContext, host: str) -> str | None:
    """Manual mode gates every request; smart mode gates suspect destinations."""
    mode = permission_mode(context)
    if mode == "manual":
        return "人工审批模式要求确认所有联网操作"
    if mode != "smart":
        return None
    normalized = host.lower().strip(".")
    suspicious_terms = (
        "adult", "bet", "casino", "crack", "darknet", "drug", "gambl", "malware",
        "onion", "porn", "sex", "torrent", "warez", "xxx",
    )
    if any(term in normalized for term in suspicious_terms):
        return f"域名可能包含高风险或违法内容标识：{host}"
    return None


def _is_sensitive_path(path: Path) -> bool:
    lowered_parts = {part.lower() for part in path.parts}
    name = path.name.lower()
    return (
        bool(lowered_parts & _SENSITIVE_PATH_PARTS)
        or name == ".env"
        or name.startswith(".env.")
        or name in _SENSITIVE_FILE_NAMES
        or name.endswith(".secret")
        or path.suffix.lower() in _SENSITIVE_SUFFIXES
    )
