#!/usr/bin/env python3
"""Runtime-distributed CLI adapter for Eido's Agent management API."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="agent")
    root.add_argument("--base-url", default=os.getenv("EIDO_PLATFORM_URL", "http://127.0.0.1:3000"))
    root.add_argument("--user", default=os.getenv("EIDO_USER_ID"))
    resources = root.add_subparsers(dest="resource", required=True)
    resources.add_parser("provider").add_subparsers(dest="command", required=True).add_parser("list")
    create = resources.add_parser("create")
    source = create.add_mutually_exclusive_group(required=True)
    source.add_argument("--json")
    source.add_argument("--file", type=Path)
    return root


class Client:
    def __init__(self, base_url: str, user_id: str | None):
        if not user_id:
            raise ValueError("缺少用户身份；请设置 EIDO_USER_ID 或使用 --user。")
        self.base_url = base_url.rstrip("/")
        self.user_id = user_id

    def request(self, path: str, method: str = "GET", body: Any = None) -> Any:
        payload = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        request = Request(
            f"{self.base_url}{path}", data=payload, method=method,
            headers={"accept": "application/json", "content-type": "application/json", "x-eido-user-id": self.user_id},
        )
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            try:
                detail = json.loads(error.read().decode()).get("error")
            except Exception:
                detail = None
            raise RuntimeError(detail or f"Agent API 请求失败（{error.code}）。") from error
        except URLError as error:
            raise RuntimeError(f"无法连接 Eido 平台：{error.reason}") from error


def load_input(args: argparse.Namespace) -> dict[str, Any]:
    source = args.file.read_text(encoding="utf-8") if args.file else args.json
    try:
        value = json.loads(source)
    except (json.JSONDecodeError, TypeError) as error:
        raise ValueError(f"输入不是有效 JSON：{error}") from error
    if not isinstance(value, dict):
        raise ValueError("创建参数必须是 JSON 对象。")
    missing = [field for field in ("name", "identity", "capabilities") if not str(value.get(field) or "").strip()]
    if missing:
        raise ValueError(f"缺少必填字段：{', '.join(missing)}。")
    return value


def execute(args: argparse.Namespace, client: Client) -> Any:
    if args.resource == "provider":
        return client.request("/api/provider-configs").get("providerConfigs", [])
    return client.request("/api/agents", "POST", load_input(args))


def main() -> int:
    args = parser().parse_args()
    try:
        print(json.dumps(execute(args, Client(args.base_url, args.user)), ensure_ascii=False, indent=2))
        return 0
    except (OSError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
