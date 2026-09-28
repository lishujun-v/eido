#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
state_store.py — JSON / SQLite 持久化(用户已学论文 + 复习记录)。

D5/D7 阶段用,目前实现基础 JSON 存储。
后续可换成 SQLite。
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


class StateStore:
    """简单 JSON 文件存储。"""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._data: dict[str, Any] = {}
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            try:
                self._data = json.loads(self.path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                log.warning("state_store: %s 损坏,初始化为空", self.path)
                self._data = {}

    def save(self) -> None:
        self.path.write_text(
            json.dumps(self._data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def set(self, key: str, value: Any) -> None:
        self._data[key] = value
        self.save()

    def append(self, key: str, value: Any) -> None:
        self._data.setdefault(key, []).append(value)
        self.save()

    def all(self) -> dict[str, Any]:
        return dict(self._data)