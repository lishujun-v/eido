#!/usr/bin/env python3
"""Small dependency-free CLI for Eido's Knowledge HTTP API."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="knowledge")
    root.add_argument("--base-url", default=os.getenv("EIDO_PLATFORM_URL", "http://127.0.0.1:3000"))
    root.add_argument("--user", default=os.getenv("EIDO_USER_ID"))
    resources = root.add_subparsers(dest="resource", required=True)

    spaces = resources.add_parser("space").add_subparsers(dest="command", required=True)
    spaces.add_parser("list")
    get_space = spaces.add_parser("get")
    get_space.add_argument("space_id")
    for name in ("create", "update"):
        command = spaces.add_parser(name)
        if name == "update":
            command.add_argument("space_id")
        add_input(command)
    delete_space = spaces.add_parser("delete")
    delete_space.add_argument("space_id")
    delete_space.add_argument("--yes", action="store_true")

    nodes = resources.add_parser("node").add_subparsers(dest="command", required=True)
    list_nodes = nodes.add_parser("list")
    list_nodes.add_argument("space_id")
    add_batch = nodes.add_parser("add-batch")
    add_batch.add_argument("space_id")
    add_input(add_batch)
    update = nodes.add_parser("update")
    update.add_argument("space_id")
    update.add_argument("node_id")
    add_input(update)
    update_batch = nodes.add_parser("update-batch")
    update_batch.add_argument("space_id")
    add_input(update_batch)
    delete_node = nodes.add_parser("delete")
    delete_node.add_argument("space_id")
    delete_node.add_argument("node_id")
    delete_node.add_argument("--yes", action="store_true")

    search = resources.add_parser("search")
    search.add_argument("query")
    search.add_argument("--space")
    return root


def add_input(command: argparse.ArgumentParser) -> None:
    inputs = command.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--json")
    inputs.add_argument("--file", type=Path)


def load_input(args: argparse.Namespace) -> Any:
    source = args.file.read_text(encoding="utf-8") if args.file else args.json
    try:
        value = json.loads(source)
    except (json.JSONDecodeError, TypeError) as error:
        raise ValueError(f"输入不是有效 JSON：{error}") from error
    if not isinstance(value, (dict, list)):
        raise ValueError("JSON 输入必须是对象或数组。")
    return value


class Client:
    def __init__(self, base_url: str, user_id: str | None):
        if not user_id:
            raise ValueError("缺少用户身份；请设置 EIDO_USER_ID 或使用 --user。")
        self.base_url = base_url.rstrip("/")
        self.user_id = user_id

    def request(self, method: str = "GET", query: dict[str, str] | None = None, body: Any = None) -> Any:
        suffix = f"?{urlencode(query)}" if query else ""
        payload = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        request = Request(
            f"{self.base_url}/api/knowledge{suffix}", data=payload, method=method,
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
            raise RuntimeError(detail or f"Knowledge API 请求失败（{error.code}）。") from error
        except URLError as error:
            raise RuntimeError(f"无法连接 Eido 平台：{error.reason}") from error


def execute(args: argparse.Namespace, client: Client) -> Any:
    if args.resource == "space":
        if args.command == "list":
            return client.request()["spaces"]
        if args.command == "get":
            spaces = client.request()["spaces"]
            space = next((item for item in spaces if item["id"] == args.space_id), None)
            if not space:
                raise ValueError("没有找到这个知识空间。")
            return space
        if args.command == "create":
            return client.request("POST", body={"action": "createSpace", "space": load_input(args)})
        if args.command == "update":
            return client.request("PATCH", body={"action": "updateSpace", "spaceId": args.space_id, "space": load_input(args)})
        require_yes(args)
        return client.request("DELETE", query={"spaceId": args.space_id})

    if args.resource == "node":
        if args.command == "list":
            spaces = client.request()["spaces"]
            space = next((item for item in spaces if item["id"] == args.space_id), None)
            if not space:
                raise ValueError("没有找到这个知识空间。")
            return {"nodes": space["nodes"], "edges": space["edges"]}
        if args.command == "add-batch":
            return client.request("POST", body={"action": "addBatch", "spaceId": args.space_id, "batch": load_input(args)})
        if args.command == "update":
            return client.request("PATCH", body={"action": "updateNode", "spaceId": args.space_id, "nodeId": args.node_id, "node": load_input(args)})
        if args.command == "update-batch":
            data = load_input(args)
            updates = data if isinstance(data, list) else data.get("updates")
            if not isinstance(updates, list):
                raise ValueError("批量修改输入必须是数组，或包含 updates 数组。")
            return client.request("PATCH", body={"action": "updateNodes", "spaceId": args.space_id, "updates": updates})
        require_yes(args)
        return client.request("DELETE", query={"spaceId": args.space_id, "nodeId": args.node_id})

    query = {"q": args.query}
    if args.space:
        query["spaceId"] = args.space
    return client.request(query=query)["results"]


def require_yes(args: argparse.Namespace) -> None:
    if not args.yes:
        raise ValueError("删除操作需要显式添加 --yes。")


def main() -> int:
    args = parser().parse_args()
    try:
        result = execute(args, Client(args.base_url, args.user))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
