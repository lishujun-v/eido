#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
preflight.py — action 级 preflight 校验框架。

每个 action 执行前,按 interface.yaml 声明的 preflight.policy 调用 check_action():
    - policy=off:     纯只读 action,直接放行(返回 decision=proceed, risk=low)
    - policy=optional: 默认跑,可用 skip_preflight=True 跳过
    - policy=required: 必须跑,且 decision 必须是 proceed/modify 才放行

校验输出遵循 action_preflight.schema.json(用 jsonschema 离线校验)。

D1 阶段实现基础版:
    - 读 interface.yaml 找到 action 声明
    - 校验 inputs 必填字段
    - 校验 inputs 字段类型
    - 构造 preflight 决策(确定性规则 + LLM forecast 占位)

D7 阶段会扩展:
    - LLM 真实 forecast(基于 xingchen_client)
    - 异常输入识别(空 PDF/坏 URL/超长文本)
    - 重试 + 退避
"""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

log = logging.getLogger(__name__)


# ============== 自定义异常 ==============

class PreflightAbort(Exception):
    """preflight 拒绝执行时抛出。"""


# ============== interface.yaml 加载 ==============

def load_interface(interface_path: str | Path) -> dict[str, Any]:
    """解析 interface.yaml,返回 dict。失败抛 FileNotFoundError/YAMLError。"""
    interface_path = Path(interface_path)
    if not interface_path.exists():
        raise FileNotFoundError(f"interface.yaml 不存在: {interface_path}")
    with interface_path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_action_decl(interface: dict[str, Any], action_name: str) -> dict[str, Any]:
    """根据 action_name 找声明;找不到抛 KeyError。"""
    for action in interface.get("actions", []):
        if action["name"] == action_name:
            return action
    raise KeyError(f"action '{action_name}' 不在 interface.yaml 声明中")


# ============== 基础校验 ==============

def _validate_required(inputs: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    """校验必填字段。返回错误列表(空 = 通过)。"""
    errors = []
    required = schema.get("required", [])
    for field in required:
        if field not in inputs or inputs[field] is None:
            errors.append(f"必填字段缺失: {field}")
    return errors


def _validate_types(inputs: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    """校验字段类型(JSON Schema 子集:string/integer/number/boolean/array/object)。

    None 值视为"未传",跳过类型校验(由 required 校验决定)。
    """
    errors = []
    properties = schema.get("properties", {})
    for field, value in inputs.items():
        if field not in properties:
            continue
        if value is None:
            continue  # 未传,跳过
        expected = properties[field].get("type")
        if expected is None:
            continue
        if not _matches_type(value, expected):
            errors.append(
                f"字段 {field} 类型不符: 期望 {expected}, 实际 {type(value).__name__}"
            )
    return errors


def _matches_type(value: Any, expected: str) -> bool:
    """JSON Schema 类型匹配的简化版。"""
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    return True


# ============== preflight 主入口 ==============

def check_action(
    action_name: str,
    inputs: dict[str, Any],
    *,
    interface_path: str | Path | None = None,
    context_override: dict[str, Any] | None = None,
    skip: bool = False,
) -> dict[str, Any]:
    """
    对 action 做 preflight 校验,返回符合 action_preflight.schema.json 的 dict。

    skip=True 时,如果 action 的 policy=off,直接放行;
                   如果 policy=required 或 optional,仍然跑校验(只跳过 LLM forecast)。
    """
    interface_path = interface_path or (Path(__file__).parent.parent / "interface.yaml")
    interface = load_interface(interface_path)
    action_decl = get_action_decl(interface, action_name)

    policy = action_decl.get("preflight", {}).get("policy", "required")
    default_ctx = action_decl.get("preflight", {}).get("default_context", {})

    # 构造 context,允许运行时覆盖
    context = {
        "contains_sensitive_data": False,
        "external_visibility": "none",
        "reversibility": action_decl.get("reversibility", "high"),
    }
    context.update(default_ctx)
    if context_override:
        context.update(context_override)

    # 构造 preflight 输入
    preflight_id = f"pf-{uuid.uuid4().hex[:12]}"
    pf_input = {
        "preflight_id": preflight_id,
        "candidate_action": {
            "type": action_name,
            "target": inputs.get("pdf_path") or inputs.get("url") or inputs.get("out_path"),
            "content": json.dumps(inputs, ensure_ascii=False),
        },
        "intended_goal": f"执行 {action_name}",
        "context": context,
        "known_constraints": [],
        "available_evidence": [],
        "risk_tolerance": "medium",
    }

    # 决策
    decision = _decide(policy, inputs, action_decl, context, skip)

    result = {
        **pf_input,
        "continuation_decision": decision,
    }

    log.info(
        "preflight[%s] action=%s policy=%s decision=%s risk=%s",
        preflight_id, action_name, policy,
        decision["decision"], decision.get("risk_level", "?"),
    )

    return result


def _decide(
    policy: str,
    inputs: dict[str, Any],
    action_decl: dict[str, Any],
    context: dict[str, Any],
    skip: bool,
) -> dict[str, Any]:
    """
    决定放行/拒绝/升级/修改。
    D1 阶段是确定性规则版;D7 阶段会叠加 LLM forecast。
    """
    inputs_schema = action_decl.get("inputs", {})

    # 1. 必填字段校验
    errors = _validate_required(inputs, inputs_schema)
    # 2. 类型校验
    errors += _validate_types(inputs, inputs_schema)

    # 3. 反互斥校验(pdf_path 和 url 不能同时给)
    if action_decl["name"] == "read_paper":
        if inputs.get("pdf_path") and inputs.get("url"):
            errors.append("read_paper 不允许同时传 --pdf 和 --url")

    # 4. 路径存在性预检(read_paper 的 pdf_path 必须存在)
    if action_decl["name"] == "read_paper" and inputs.get("pdf_path"):
        from pathlib import Path
        if not Path(inputs["pdf_path"]).exists():
            errors.append(f"PDF 文件不存在: {inputs['pdf_path']}")

    # 5. 决策
    if errors:
        return {
            "decision": "abort",
            "rationale": "校验失败: " + "; ".join(errors),
            "confidence_score": 0.95,
            "risk_level": "high",
            "risk_score": 0.9,
        }

    # policy=off 且 skip=True → 直接放行
    if policy == "off" and skip:
        return {
            "decision": "proceed",
            "rationale": f"policy=off 且 skip=True,直接放行",
            "confidence_score": 1.0,
            "risk_level": "low",
            "risk_score": 0.05,
        }

    # 默认放行(D7 阶段会叠 LLM forecast)
    rationale = "D1 阶段基础校验通过"
    if policy == "required":
        rationale += "(required,默认放行,D7 阶段会叠 LLM forecast)"
    elif policy == "optional":
        rationale += "(optional,默认放行)"

    risk_score = 0.1 if context["reversibility"] == "high" else 0.3

    return {
        "decision": "proceed",
        "rationale": rationale,
        "confidence_score": 0.85,
        "risk_level": "low" if context["reversibility"] == "high" else "medium",
        "risk_score": risk_score,
    }


# ============== 便捷函数 ==============

def make_paper_id(source: str) -> str:
    """根据 PDF 路径或 URL 生成稳定 paper_id(SHA1 前 12 位)。"""
    return "p-" + hashlib.sha1(source.encode("utf-8")).hexdigest()[:12]


def now_iso() -> str:
    """返回当前时间的 ISO 字符串(供 run log 用)。"""
    return datetime.utcnow().isoformat() + "Z"