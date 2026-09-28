# Nanobot Agent Loop 执行策略源码分析

> 分析对象：nanobot（Python 实现）
> 分析目标：拆解 ReAct loop 循环执行中的"小技巧/策略"——怎么做的、起到什么作用
> 源码版本日期：2026-08-04

---

## 0. 总览：loop 不是扁平的 while，而是三层嵌套

nanobot 的"loop"其实是**分层**的，不是一个扁平的 while 循环。真正的 ReAct 迭代循环在 `runner.py` 的 `_run_core`，但它外面还套着 turn 编排层（`loop.py`）和最外层的事件调度层。

```

AgentLoop.run()                          # 最外层：bus 消费 + per-session 任务调度
└─ _process_message()                  # turn 编排：restore->compact->build->run->save->respond
└─ _run_agent_loop() -> runner.run() -> _run_core()   # 真正的 ReAct 迭代循环
└─ _request_model() -> chat_with_retry()        # 单次模型请求 + 重试

```

涉及的核心源码文件（相对工作区根目录）：


| 文件                                          | 作用                                            |
| --------------------------------------------- | ----------------------------------------------- |
| `nanobot/nanobot/agent/loop.py`               | 最外层调度 + turn 编排 + checkpoint 恢复        |
| `nanobot/nanobot/agent/runner.py`             | 真正的 ReAct 迭代循环 + 工具执行 + 各种恢复策略 |
| `nanobot/nanobot/agent/context_governance.py` | 每轮迭代前的"历史修复管线"                      |
| `nanobot/nanobot/agent/autocompact.py`        | 跨轮的空闲会话压缩                              |
| `nanobot/nanobot/providers/base.py`           | provider 级重试（退避、Retry-After、流式恢复）  |

---

## 1. 最外层：事件调度层

### 1.1 `AgentLoop.run()` —— bus 消费 + 任务分发

源码：`nanobot/nanobot/agent/loop.py:1133`

```python
async def run(self) -> None:
    """Run the agent loop, dispatching messages as tasks to stay responsive to /stop."""
    self._running = True
    try:
        await self._connect_mcp()
        while self._running:
            try:
                msg = await asyncio.wait_for(self.bus.consume_inbound(), timeout=1.0)
            except asyncio.TimeoutError:
                self._check_expired_sessions_if_due()
                continue
            ...
            task = asyncio.create_task(self._dispatch(msg))
```

关键点：

- 用 `asyncio.wait_for(..., timeout=1.0)` 轮询 bus，**1 秒超时**就去做一次空闲会话扫描（`_check_expired_sessions_if_due`），让 autocompact 有机会在空闲时跑。
- 每条消息 dispatch 成一个独立 task，这样 `/stop` 能及时响应（task 可被取消）。

### 1.2 `_dispatch()` —— per-session 串行、cross-session 并发

源码：`nanobot/nanobot/agent/loop.py:1226`

```python
async def _dispatch(self, msg: InboundMessage) -> None:
    """Process a message: per-session serial, cross-session concurrent."""
    session_key = self._effective_session_key(msg)
    ...
    lock = self._get_session_lock(session_key)
    gate = self._concurrency_gate or nullcontext()
    ...
    async with lock, gate:
        pending = asyncio.Queue(maxsize=20)
        self._pending_queues[session_key] = pending
        ...
        response = await self._process_message(msg, ..., pending_queue=pending, ...)
```

策略：

- **per-session 串行**：`_get_session_lock` 保证同一会话的 turn 串行执行，避免同一会话并发改历史。
- **cross-session 并发**：不同 session 拿不同的锁，可并发。
- 每个dispatch 创建一个 `asyncio.Queue(maxsize=20)` 作为该 session 本轮的**中途注入队列**，注册到 `self._pending_queues`。

### 1.3 中途注入路由 —— 边跑边收消息

源码：`nanobot/nanobot/agent/loop.py:1188`

```python
# If this session already has an active pending queue (i.e. a task
# is processing this session), route the message there for mid-turn
# injection instead of creating a competing task.
if effective_key in self._pending_queues:
    ...
    try:
        self._pending_queues[effective_key].put_nowait(pending_msg)
    except asyncio.QueueFull:
        ...
```

如果某 session 已有 active pending queue（即有 task 正在跑），新来的消息**直接 put 进那个 queue 做中途注入**，而不是起一个竞争 task。命令类消息除外，直接 inline dispatch。

### 1.4 queue 残留重发 —— 绝不静默丢消息

源码：`nanobot/nanobot/agent/loop.py:1318`

```python
finally:
    # Drain any messages still in the pending queue and re-publish
    # them to the bus so they are processed as fresh inbound messages
    # rather than silently lost.
    queue = None
    if self._pending_queues.get(session_key) is pending:
        queue = self._pending_queues.pop(session_key, None)
    ...
    if queue is not None:
        while True:
            try:
                item = queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            await self.bus.publish_inbound(item)
```

turn 结束后 queue 里还没消费的消息，重新 publish 回 bus，绝不静默丢弃。

---

## 2. Turn 编排层

### 2.1 `_process_message()` —— 六阶段流水线

源码：`nanobot/nanobot/agent/loop.py:1372`，核心在末尾：

```python
await self._run_turn_stage(ctx, "restore", self._restore_turn)
await self._run_turn_stage(ctx, "compact", self._compact_session)
if await self._run_turn_stage(ctx, "command", self._dispatch_command):
    return ctx.outbound
await self._run_turn_stage(ctx, "build", self._build_turn)
await self._run_turn_stage(ctx, "run", self._run_turn)
await self._run_turn_stage(ctx, "save", self._persist_turn)
await self._run_turn_stage(ctx, "respond", self._prepare_outbound)
return ctx.outbound
```

一个 turn 被拆成 6 个 stage，每个 stage 用 `_run_turn_stage` 包装计时和异常日志。顺序：

1. **restore**：恢复上次中断的 checkpoint / pending user turn；处理非图片附件引用
2. **compact**：跨轮压缩（autocompact）
3. **command**：如果是命令（如 `/stop`、`/model`）直接处理并返回
4. **build**：构建本轮初始 messages
5. **run**：调用 `_run_agent_loop` 进入真正的 ReAct 迭代
6. **save / respond**：持久化 turn、组装出站消息

### 2.2 `_run_agent_loop()` —— 进入迭代循环前的装配

源码：`nanobot/nanobot/agent/loop.py:840`

这个方法本身**不是迭代循环**，它做的是装配工作，然后委托给 `self.runner.run(...)`：

```python
result = await self.runner.run(AgentRunSpec(
    initial_messages=initial_messages,
    tools=effective_tools,
    runtime=runtime,
    max_iterations=self.max_iterations,
    ...
    checkpoint_callback=_checkpoint,
    injection_callback=_drain_pending,
    llm_timeout_s=runner_wall_llm_timeout_s(...),
    goal_active_predicate=lambda: sustained_goal_active(session.metadata) ...,
    goal_continue_message=_goal_continue,
    finalize_on_max_iterations=turn_continuation.should_finalize_on_max_iterations(...),
    provider_state=provider_state,
))
```

它在装配阶段定义了两个关键闭包：

#### 2.2.1 `_drain_pending()` —— 中途注入的数据源

源码：`nanobot/nanobot/agent/loop.py:893`

```python
async def _drain_pending(*, limit: int = _MAX_INJECTIONS_PER_TURN) -> list[dict[str, Any]]:
    """Drain follow-up messages from the pending queue.

    When no messages are immediately available but sub-agents
    spawned in this dispatch are still running, blocks until at
    least one result arrives (or timeout). This keeps the runner
    loop alive so subsequent sub-agent completions are consumed
    in-order rather than dispatched separately.
    """
    ...
    items: list[dict[str, Any]] = []
    while len(items) < limit:
        try:
            items.append(await _to_user_message(pending_queue.get_nowait()))
        except asyncio.QueueEmpty:
            break

    # Block if nothing drained but sub-agents spawned in this dispatch
    # are still running.
    if (not items
            and session is not None
            and self.subagents.get_running_count_by_session(session.key) > 0):
        try:
            msg = await asyncio.wait_for(pending_queue.get(), timeout=300)
        except asyncio.TimeoutError:
            ...
            return items
        items.append(await _to_user_message(msg))
        ...
    return items
```

**精妙之处**：如果 queue 是空的，但本 dispatch 起的 subagent 还在跑，会**最多阻塞 300 秒**等一个结果。目的是让 subagent 完成按顺序注入到当前 loop，而不是被当成独立消息重新 dispatch。

#### 2.2.2 `_goal_continue()` —— 持续目标自驱

源码：`nanobot/nanobot/agent/loop.py:1021`

```python
def _goal_continue() -> str | None:
    _goal_lines = goal_state_runtime_lines(session.metadata if session is not None else None)
    if not _goal_lines:
        return None
    return (
        "You have an active sustained goal:\n\n"
        + "\n".join(_goal_lines)
        + "\n\nPlease continue working toward the objective using your tools, "
        "or call update_goal with action='complete' if the work is truly finished."
    )
```

当会话设了 sustained goal，而模型给出"最终回复"（没调工具、本该结束）时，不结束 turn，而是注入这条消息让模型继续干。详见第 5 节。

---

## 3. 真正的 ReAct 迭代循环：`_run_core()`

源码：`nanobot/nanobot/agent/runner.py:419`，循环体在 `:461`

### 3.1 主骨架

```python
for iteration in range(spec.max_iterations):
    # 1. context governance 预处理 -> 产出 messages_for_model（只改副本）
    messages_for_model = self.context_governor.prepare_for_model(
        governance_config, messages, compacted_tool_call_ids,
    )
    ...
    # 2. 请求模型
    response = await self._request_model(
        spec, messages_for_model, hook, context,
        conversation_state=conversation_state,
        provider_context=provider_context,
    )
    ...
    # 3. 如果模型要调工具
    if response.should_execute_tools:
        ...
        results, new_events, fatal_error = await self._execute_tools(...)
        ...
        # append tool results to messages
        ...
        # Checkpoint 1: drain injections after tools, before next LLM call
        _drained, injection_cycles = await self._try_drain_injections(
            spec, messages, None, injection_cycles, phase="after tool execution",
        )
        ...
        continue

    # 4. 否则（给最终回复）-> 处理 length/empty/error，或 break
    ...
    break
else:
    # for...else: max_iterations 用尽
    stop_reason = "max_iterations"
    ...
```

这就是经典 ReAct：think → act → observe → repeat。但每一处都塞了恢复策略。

### 3.2 每轮迭代的状态变量（在循环外初始化）

源码：`nanobot/nanobot/agent/runner.py:425-459`

```python
final_content: str | None = None
tools_used: list[str] = []
usage: dict[str, int] = {"prompt_tokens": 0, "completion_tokens": 0}
empty_content_retries = 0
length_recovery_parts: list[str] = []          # length 恢复链的累积段
had_injections = False
injection_cycles = 0
compacted_tool_call_ids: set[str] = set()      # 已压缩过的 tool_call_id，避免重复压缩
pending_stream_content: str | None = None
conversation_state = ProviderConversationStateController(...)
governance_config = ContextGovernanceConfig(...)
```

注意 `compacted_tool_call_ids`：跨迭代记忆"哪些 tool 结果已经被压缩过"，避免重复压缩同一个。

---

## 4. Context Governance：每轮迭代前的"历史修复管线"

这是 nanobot 最有特色的部分。源码：`nanobot/nanobot/agent/context_governance.py:76`

### 4.1 修复流水线

```python
def prepare_for_model(self, config, messages, compacted_tool_call_ids):
    updated = self.strip_placeholder_assistant_messages(messages)
    updated = self.strip_malformed_tool_calls(updated)
    updated = self.drop_orphan_tool_results(updated)
    updated = self.backfill_missing_tool_results(updated)
    updated = self.apply_tool_result_budget(config, updated)
    updated = self.compact_inflight_overflow(config, updated, compacted_tool_call_ids)
    updated = self.snip_history(config, updated)
    updated = self.drop_orphan_tool_results(updated)
    return self.backfill_missing_tool_results(updated)
```

**核心设计原则**（代码注释反复强调）：持久化的 transcript 永远不动，只修给模型看的那份副本。这样即使某轮 governance 出错，也不会污染会话历史。

### 4.2 各步骤详解

#### `strip_placeholder_assistant_messages` (`:140`)

删除 `[Previous assistant message omitted.]` 这类压缩占位符。注释说明：这类占位符对模型无有用上下文，反而会让它反复尝试之前失败的 tool call，产生畸形响应循环。

#### `strip_malformed_tool_calls` (`:178`)

删除 name 缺失/非字符串的 tool_call。注释说明：一个退化的 tool_call（name=None 或 ""）一旦写进历史，会每轮重放，让上游 API 拒绝整个请求（`tool_use.name: Input should be a valid string`），**永久卡死会话**。这里清理后让 orphan-result 清理再删掉它的悬空结果，实现"污染会话自愈"。

#### `drop_orphan_tool_results` (`:233`)

删除没有对应 assistant tool_call 声明的 tool 结果，以及重复 fulfilled 的结果。维护 `declared` / `fulfilled` 两个集合。

#### `backfill_missing_tool_results` (`:264`)

反向操作：如果 assistant 发了 tool_call 但没有对应的 tool 结果（比如上次崩了），插入一条合成 error 结果。因为很多 provider 要求 tool_call 和 tool_result 一一配对，否则整个请求被拒。

#### `apply_tool_result_budget` / `normalize_tool_result` (`:111`)

大 tool 结果通过 `maybe_persist_tool_result` **落盘到文件**，消息里只留引用；仍超过 `max_tool_result_chars` 则 `truncate_text` 截断。既省 token 又不丢信息。`TOOL_RESULT_OFFLOAD_EXEMPT_TOOLS` 里的工具结果不落盘。

#### `compact_inflight_overflow` (`:329`)

只在"估算 prompt 超预算"时才压缩。把老的 tool 结果替换成一条提示语：

```python
@staticmethod
def _tool_result_compaction_message(message):
    name = message.get("name", "tool")
    return (
        f"Error: The previous {name} result was compacted to fit context because it was too "
        "large. Do not repeat the same call unchanged. Retry with a narrower path, query, "
        "range, or result limit, use another tool, or tell the user the task cannot fit in "
        "the available context."
    )
```

**这条提示语本身就是策略**——引导模型在压缩后改用更省 token 的方式重试，而不是傻乎乎再调一次大的。压缩目标用 `INFLIGHT_COMPACT_TARGET_RATIO` 比例，从最老的 candidate 开始压缩，直到估算值降到 target。

#### `snip_history` (`:390`)

从尾部往前保留消息，直到预算用尽。关键细节：用 `_legal_history_tail` + `_user_tail` 保证结尾落在一条 user 消息上——因为很多 provider 要求历史以 user 结尾。

```python
def _legal_history_tail(self, kept, non_system):
    fallback = kept if kept else (non_system[-1:] if non_system else [])
    kept = self._user_tail(kept) or self._user_tail(non_system, last=True) or fallback
    start = find_legal_message_start(kept)
    return kept[start:] if start else kept
```

### 4.3 预算计算

`input_budget` (`:92`)：

```python
budget = config.context_block_limit or (
    config.context_window_tokens - max_output - SNIP_SAFETY_BUFFER
)
```

即：上下文窗口 - 预留输出 - 安全缓冲。`_replay_token_budget`（`loop.py:828`）也是类似逻辑：`context_window - max(1, reserved_output) - 1024`。

---

## 5. 中途注入（injection draining）：让 loop 能"边跑边收消息"

这是 nanobot 区别于简单 ReAct 的关键。源码：`nanobot/nanobot/agent/runner.py:240`

### 5.1 调用检查点

`_try_drain_injections` 在**多个检查点**被调用：


| 检查点                            | phase 标签               | 源码位置        |
| --------------------------------- | ------------------------ | --------------- |
| 工具执行后、下一次调模型前        | `"after tool execution"` | `runner.py:616` |
| 模型给出最终回复后、stream 结束前 | `"after final response"` | `runner.py:734` |
| 工具错误后                        | `"after tool error"`     | `runner.py:580` |
| LLM 错误后                        | `"after LLM error"`      | `runner.py:766` |
| 空回复后                          | `"after empty response"` | `runner.py:784` |
| max_iterations 用尽后             | `"after max_iterations"` | `runner.py:835` |

### 5.2 `_try_drain_injections` 逻辑

源码：`nanobot/nanobot/agent/runner.py:240`

```python
async def _try_drain_injections(self, spec, messages, assistant_message,
                                 injection_cycles, *, conversation_state=None,
                                 phase="after error", iteration=None,
                                 allow_goal_continue=False):
    """Drain pending injections. Returns (should_continue, updated_cycles).

    If injections are found and we haven't exceeded _MAX_INJECTION_CYCLES,
    append them to *messages* ... and return (True, cycles+1) so the
    caller continues the iteration loop. Otherwise return (False, cycles).
    """
    injections: list[dict[str, Any]] = []
    real_injection = False
    if injection_cycles < _MAX_INJECTION_CYCLES:
        injections = await self._drain_injections(spec)
        real_injection = bool(injections)
    if not injections and allow_goal_continue and assistant_message is not None:
        predicate = spec.goal_active_predicate
        if predicate is not None and predicate():
            injections = [self._build_goal_continue_message(spec)]
    if not injections:
        return False, injection_cycles
    if real_injection:
        injection_cycles += 1
    if assistant_message is not None:
        messages.append(assistant_message)
        ...
    self._append_injected_messages(messages, injections)
    ...
    return True, injection_cycles
```

注意：**真实注入和 goal_continue 是互斥的**——有真实用户消息就不注入 goal continue。`allow_goal_continue` 在 refusal/content_filter 时为 False（`runner.py:739`）——模型拒绝时不会硬塞 goal。

### 5.3 角色交替合并

源码：`nanobot/nanobot/agent/runner.py:163` `_append_injected_messages`

连续两条 user 消息会被合并成一条（provider 要求角色交替）：

```python
if (messages
        and injection.get("role") == "user"
        and messages[-1].get("role") == "user"
        and not is_hidden_history_message(injection)
        ...):
    merged = dict(messages[-1])
    ...
    # 合并时要把 runtime context block detach 再 reattach
    detached_left = detach_runtime_context(merged.get("content"), left_marker_dict)
    detached_right = detach_runtime_context(injection.get("content"), right_marker_dict)
    ...
    merged_content = cls._merge_message_content(left_content, right_content)
    ...
    messages[-1] = merged
    continue
messages.append(injection)
```

合并时还要把 runtime context block detach 再 reattach，非常细致。

### 5.4 边界保护

源码：`nanobot/nanobot/agent/runner.py:73-76`

```python
_MAX_EMPTY_RETRIES = 2
_MAX_LENGTH_RECOVERIES = 3
_MAX_INJECTIONS_PER_TURN = 3
_MAX_INJECTION_CYCLES = 5
```

每轮最多注入 3 条，整个 turn 最多 5 轮注入循环，防止无限注入。超出的会 log warning（`runner.py:352`），不静默丢弃。

---

## 6. 持续目标（sustained goal）：让模型"自己继续干"

源码：`nanobot/nanobot/agent/loop.py:1021`（消息构造）+ `nanobot/nanobot/agent/runner.py:301`（注入）

当 sustained goal active 且模型给出最终回复时，`_try_drain_injections` 在 `"after final response"` 检查点会注入 goal continue 消息：

```python
def _build_goal_continue_message(self, spec):
    custom = spec.goal_continue_message
    if callable(custom):
        try:
            custom = custom()
        except Exception:
            ...
            custom = None
    return build_goal_continue_message(custom)
```

作用：让长任务能跨多轮"自驱"，不需要用户每次催。同时 sustained goal 会让 LLM 超时阈值放宽（`loop.py:1074`）：

```python
# Sustained goals may legitimately exceed NANOBOT_LLM_TIMEOUT_S; idle stall
# is still capped by NANOBOT_STREAM_IDLE_TIMEOUT_S in streaming providers.
llm_timeout_s=runner_wall_llm_timeout_s(...),
```

---

## 7. 流式 + 长度恢复（length recovery）

当 `finish_reason == "length"`（输出被截断）时，源码：`nanobot/nanobot/agent/runner.py:675`

```python
if response.finish_reason == "length":
    if len(length_recovery_parts) < _MAX_LENGTH_RECOVERIES:
        length_recovery_parts.append(
            _restore_outer_whitespace(clean or "", original_content)
        )
        ...
        if hook.wants_streaming():
            context.stream_continues_current_message = True
            await hook.on_stream_end(context, resuming=True)
        messages.append(conversation_state.project_response_message(
            build_assistant_message(clean, ...), response,
        ))
        messages.append(build_length_recovery_message(clean or ""))
        await hook.after_iteration(context)
        continue
```

策略：

- 把这段部分输出存进 `length_recovery_parts`，append 一条 `build_length_recovery_message` 让模型"接着说"
- `stream_continues_current_message=True`，让流式 UI 把后续段拼到同一条消息上
- 最多恢复 `_MAX_LENGTH_RECOVERIES=3` 段，最后把所有段拼起来作为 final content（`runner.py:817`）

配套细节（`runner.py:706`）：如果前面有可见的 length 段，但本次是"完整恢复无 delta"的流，会把终段手动 emit 进 stream，避免重复显示前缀：

```python
if (length_recovery_parts
        and hook.wants_streaming()
        and not context.streamed_content
        and response.finish_reason != "error"
        and not is_blank_text(clean)):
    await hook.on_stream(context, _restore_outer_whitespace(clean or "", original_content))
    context.streamed_content = True
```

---

## 8. 空回复 & 畸形 tool_call 的恢复

### 8.1 空回复恢复

源码：`nanobot/nanobot/agent/runner.py:633`

```python
if (response.finish_reason not in {"error", "length", "refusal", "content_filter"}
        and is_blank_text(clean)):
    empty_content_retries += 1
    if empty_content_retries < _MAX_EMPTY_RETRIES:
        logger.warning("Empty response on turn {} ... retrying", ...)
        if hook.wants_streaming():
            await hook.on_stream_end(context, resuming=False)
        await hook.after_iteration(context)
        continue
    ...
    # 仍空则做一次 finalization retry
    retry_messages = self._finalization_retry_messages(messages_for_model)
    response = await self._request_finalization_retry(
        spec, messages_for_model, transcript=messages,
        conversation_state=conversation_state,
    )
```

策略：模型返回空白（非 error/length/refusal）→ 先空转重试 `_MAX_EMPTY_RETRIES=2` 次 → 仍空则做一次 `_request_finalization_retry`（no-tools 请求，带"请给出最终答复"提示）。

### 8.2 畸形 tool_call 恢复

源码：`nanobot/nanobot/agent/runner.py:1061` + `:1105`

`_drop_malformed_tool_calls` 剥离 name 缺失的 tool_call。如果**全部**被 drop：

```python
if (all_dropped
        and original_finish_reason in ("tool_calls", "function_call")
        and not malformed_retry):
    logger.warning("Retrying LLM request after all {} malformed tool call(s) were dropped", dropped)
    retry_messages = self._malformed_tool_call_retry_messages(messages, response.content)
    return await self._request_model(
        spec, retry_messages, hook, context, malformed_retry=True, ...
    )
if (all_dropped
        and original_finish_reason in ("tool_calls", "function_call")
        and malformed_retry):
    logger.warning("Malformed tool calls persisted after retry; falling back to no-tools request")
    fallback_messages = self._malformed_tool_call_retry_messages(messages, response.content)
    return await self._request_no_tools(spec, fallback_messages, ...)
```

**降级链**：有工具 → 重试一次 → 仍畸形 → 退化为 `_request_no_tools`（彻底不给工具，逼模型用文字回答）。这种退化一旦写进历史会每轮重放、永久卡死，所以必须清理。

---

## 9. Provider 级重试：`_run_with_retry`

源码：`nanobot/nanobot/providers/base.py:1055`

### 9.1 两种重试模式

```python
_CHAT_RETRY_DELAYS = (1, 2, 4)              # standard 模式：固定退避，3 次
_PERSISTENT_MAX_DELAY = 60                  # persistent 模式：单次延迟上限
_PERSISTENT_IDENTICAL_ERROR_LIMIT = 10      # persistent 模式：相同错误上限
```

- **standard**：固定退避 (1, 2, 4)s，最多 3 次
- **persistent**：持续重试，最多 10 次**相同**错误后停

### 9.2 只对 transient 错误重试

源码：`nanobot/nanobot/providers/base.py:311`

```python
_TRANSIENT_ERROR_MARKERS = (
    "429", "rate limit", "500", "502", "503", "504",
    "overloaded", "timeout", "timed out", "connection",
    "server error", "temporarily unavailable",
    "速率限制", "访问量过大",
)
_TRANSIENT_ERROR_KINDS = frozenset({"timeout", "connection"})
```

并且区分"可重试 429" vs "不可重试 429"（`base.py:329`）：

```python
_NON_RETRYABLE_429_ERROR_TOKENS = frozenset({
    "insufficient_quota", "quota_exceeded", "quota_exhausted",
    "billing_hard_limit_reached", "insufficient_balance",
    "credit_balance_too_low", "billing_not_active", "payment_required",
})
_RETRYABLE_429_ERROR_TOKENS = frozenset({
    "rate_limit_exceeded", "rate_limit_error", "too_many_requests",
    "request_limit_exceeded", "requests_limit_exceeded",
})
```

即 rate limit 可重试，但 quota/billing 余额不足不重试。

### 9.3 Retry-After 解析

源码：`nanobot/nanobot/providers/base.py:960`

从响应体、header 多渠道解析服务器要求的等待时间：

```python
@classmethod
def _extract_retry_after(cls, content):  # 从响应体文本
    patterns = (
        r"retry after\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|sec|secs|seconds|m|min|minutes)?",
        r"try again in\s+(\d+(?:\.\d+)?)\s*(...)?",
        ...
    )

@classmethod
def _extract_retry_after_from_headers(cls, headers):  # 从 header
    retry_ms = _header_value("retry-after-ms")
    retry_after = _header_value("retry-after")  # 支持 HTTP-date 格式
```

支持 ms / s / min / HTTP-date 多种格式，解析后 +1s buffer（`RETRY_AFTER_BUFFER = 1`）遵守。

### 9.4 流式 stall 恢复

源码：`nanobot/nanobot/providers/base.py:1078`

```python
if should_retry_guard is not None and not should_retry_guard():
    is_timeout = (response.error_kind or "").lower() == "timeout"
    if is_timeout:
        if on_stream_recover:
            logger.warning("LLM stream stalled after content was emitted; "
                           "starting a new stream segment and retrying")
            await on_stream_recover()
        else:
            logger.warning("LLM stream stalled after content was emitted; "
                           "suppressing delta callbacks and retrying")
            kw["on_content_delta"] = None
            kw["on_thinking_delta"] = None
            kw["on_tool_call_delta"] = None
            should_retry_guard = None
```

如果 stream 已经吐过内容然后卡住（timeout），**不丢弃已吐内容**，而是开一个新 stream 段继续（`on_stream_recover`）。这对长输出很关键。

### 9.5 图片剥离

源码：`nanobot/nanobot/providers/base.py:1109`

```python
if not self.is_transient_response(response):
    stripped = self._strip_image_content(kw["messages"])
    ...
    if stripped is not None or stripped_context is not None:
        logger.warning("Non-transient LLM error with image content, retrying without images")
        retry_kw = dict(kw)
        if stripped is not None:
            retry_kw["messages"] = stripped
        ...
        result = await call(**retry_kw)
        # Permanently strip images from the original messages so
        # subsequent iterations do not repeat the error-retry cycle.
        if result.finish_reason != "error":
            self._strip_image_content_inplace(original_messages)
        return result
```

非 transient 错误且消息含图片时，去掉图片重试一次，成功后**永久**从原消息剥离图片，避免下轮重复同样的错误循环。

### 9.6 identical error 去重

源码：`nanobot/nanobot/providers/base.py:1144`

```python
if persistent and identical_error_count >= self._PERSISTENT_IDENTICAL_ERROR_LIMIT:
    logger.warning("Stopping persistent retry after {} identical transient errors: {}",
                   identical_error_count, ...)
    return response
```

persistent 模式下，连续 10 次相同错误就停止，避免无限重试同一个错误。

---

## 10. Checkpoint 与崩溃/中断恢复

### 10.1 三阶段 checkpoint

`_emit_checkpoint` 在三个 phase 写 checkpoint（`runner.py:526 / 598 / 805`）：


| phase             | 时机                         | 存储内容                                   |
| ----------------- | ---------------------------- | ------------------------------------------ |
| `awaiting_tools`  | assistant 决定调工具、执行前 | assistant_message + pending_tool_calls     |
| `tools_completed` | 工具执行完                   | assistant_message + completed_tool_results |
| `final_response`  | 终态                         | assistant_message                          |

checkpoint payload 示例（`runner.py:598`）：

```python
await self._emit_checkpoint(spec, {
    "phase": "tools_completed",
    "iteration": iteration,
    "model": spec.runtime.model,
    "assistant_message": assistant_message,
    "completed_tool_results": completed_tool_results,
    "pending_tool_calls": [],
    "provider_state": conversation_state.checkpoint(messages, ...),
})
```

### 10.2 `_restore_runtime_checkpoint` —— 恢复未完成 turn

源码：`nanobot/nanobot/agent/loop.py:2074`

新 turn 开始（或 `/stop` 取消）时，把未完成的 turn 物化进历史。对那些**没跑完的 pending tool_call**，插入一条合成 error 结果——又是为了保证 tool_call/tool_result 配对合法：

```python
for tool_call in pending_tool_calls:
    ...
    restored_messages.append({
        "role": "tool",
        "tool_call_id": tool_id,
        "name": name,
        "content": "Error: Task interrupted before this tool finished.",
        "timestamp": datetime.now().isoformat(),
    })
```

还做了 overlap 检测（`loop.py:2126`）避免重复 append 已持久化的消息：

```python
overlap = 0
max_overlap = min(len(session.messages), len(restored_messages))
for size in range(max_overlap, 0, -1):
    existing = session.messages[-size:]
    restored = restored_messages[:size]
    if all(self._checkpoint_message_key(left) == self._checkpoint_message_key(right)
           for left, right in zip(existing, restored)):
        overlap = size
        break
appended_messages = restored_messages[overlap:]
session.messages.extend(appended_messages)
```

### 10.3 `/stop` 取消时保留部分上下文

源码：`nanobot/nanobot/agent/loop.py:1281`

```python
except asyncio.CancelledError:
    ...
    # Preserve partial context from the interrupted turn so
    # the user does not lose tool results and assistant
    # messages accumulated before /stop.
    try:
        key = self._effective_session_key(msg)
        session = self.sessions.get_or_create(key)
        if self._restore_runtime_checkpoint(session):
            self._clear_pending_user_turn(session)
            self.sessions.save(session)
            logger.info("Restored partial context for cancelled session {}", key)
    ...
    raise
```

`/stop` 取消时恢复 checkpoint，让用户不丢失中断前积累的工具结果。

---

## 11. 工具执行策略

源码：`nanobot/nanobot/agent/runner.py:1359`

### 11.1 按并发安全分批

`_partition_tool_batches`（`runner.py:1647`）：

```python
def _partition_tool_batches(self, spec, tool_calls):
    if not spec.concurrent_tools:
        return [[tool_call] for tool_call in tool_calls]

    batches = []
    current = []
    for tool_call in tool_calls:
        tool = get_tool(tool_call.name)
        can_batch = bool(tool and tool.concurrency_safe)
        if can_batch:
            current.append(tool_call)
            continue
        if current:
            batches.append(current)
            current = []
        batches.append([tool_call])
    if current:
        batches.append(current)
    return batches
```

标了 `concurrency_safe` 的工具用 `asyncio.gather` 并发；不安全的单独成批串行。批与批之间保序。

### 11.2 外部查询限流

`repeated_external_lookup_error`（`runner.py:1422`）：per-turn 计数，阻止模型重复发起相同的外部查询。

```python
lookup_error = repeated_external_lookup_error(
    tool_call.name, tool_call.arguments, external_lookup_counts,
)
if lookup_error:
    event = {"name": tool_call.name, "status": "error", "detail": "repeated external lookup blocked"}
    if spec.fail_on_tool_error:
        return lookup_error + hint, event, RuntimeError(lookup_error)
    return lookup_error + hint, event, None
```

### 11.3 SSRF 软失败 —— 对话式恢复而非崩溃

源码：`nanobot/nanobot/agent/runner.py:1525`

```python
_SSRF_BOUNDARY_NOTE = (
    "This is a non-bypassable security boundary. Stop trying to access "
    "private/internal URLs. Do not retry with curl, wget, encoded IPs, "
    "alternate DNS, redirects, proxies, or another tool. Ask the user for "
    "local files, logs, screenshots, or an explicit safe public URL instead. "
    "If the user explicitly trusts this private URL, ask them to whitelist "
    "the exact IP/CIDR via tools.ssrfWhitelist."
)
```

SSRF 命中**不崩 runtime**，而是返回一条**不可重试**的 tool error，并附明确说明"这是不可绕过的安全边界，别再用 curl/编码 IP/代理 重试"。让模型**对话式恢复**而不是中止。

### 11.4 workspace 违规升级

源码：`nanobot/nanobot/agent/runner.py:1587`

```python
if self._is_workspace_violation(raw_text):
    escalation = repeated_workspace_violation_error(
        tool_call.name, tool_call.arguments, workspace_violation_counts,
    )
    event["detail"] = self._event_detail("workspace_violation: ", raw_text)
    if escalation is not None:
        logger.warning("Tool {} hit workspace boundary repeatedly; escalating hint", ...)
        event["detail"] = self._event_detail("workspace_violation_escalated: ", raw_text)
        return escalation, event, None
    return soft_payload, event, None
```

重复的 workspace 越界会升级提示语强度。

### 11.5 错误提示后缀

```python
hint = "\n\n[Analyze the error above and try a different approach.]"
```

tool error 后面统一拼这条，引导模型换思路。`fail_on_tool_error` 标志控制工具错误是 fatal（break 循环）还是可恢复。

---

## 12. Max iterations 兜底

源码：`nanobot/nanobot/agent/runner.py:828`（`for...else` 的 else 分支）

```python
else:
    stop_reason = "max_iterations"
    # Drain any remaining injections so they are appended to the
    # conversation history instead of being re-published as
    # independent inbound messages by _dispatch's finally block.
    drained_after_max_iterations, injection_cycles = await self._try_drain_injections(
        spec, messages, None, injection_cycles, phase="after max_iterations",
    )
    ...
    terminal_content = None
    if spec.finalize_on_max_iterations:
        terminal_content = await self._try_finalize_after_max_iterations(
            spec, hook, messages, usage, conversation_state,
        )
    if terminal_content is None:
        terminal_content = self._max_iterations_fallback(spec)
    ...
    self._append_final_message(messages, terminal_content)
```

策略：

- 先 drain 剩余 injection（避免它们被当独立消息重新发布）
- 若 `finalize_on_max_iterations` → 做一次 no-tools 请求让模型**总结当前进度**（`_try_finalize_after_max_iterations`，`runner.py:1195`）
- 否则用 fallback 模板"已达最大迭代次数"（`_max_iterations_fallback`，`runner.py:1268`）

流式 channel 上会把兜底内容 push 进 stream，避免卡片留空（`loop.py:1099`）：

```python
if result.stop_reason == "max_iterations":
    ...
    should_stream = turn_continuation.should_stream_budget_response(...)
    if on_stream and on_stream_end and should_stream:
        stream_content = (result.pending_stream_content
                          if result.pending_stream_content is not None
                          else result.final_content or "")
        await on_stream(stream_content)
        await on_stream_end(resuming=False)
```

---

## 13. 跨轮 Auto-compact（与轮内 governance 区分）

源码：`nanobot/nanobot/agent/autocompact.py`

针对**空闲** session 的主动压缩，和轮内被动 governance 是两套机制。

```python
class AutoCompact:
    _RECENT_SUFFIX_MESSAGES = 8
    _INTERNAL_SESSION_PREFIXES = ("dream:",)

    def check_expired(self, schedule_background, resolve_runtime, active_session_keys=()):
        """Schedule archival for idle sessions, skipping those with in-flight agent tasks."""
        now = datetime.now()
        for info in self.sessions.list_sessions():
            key = info.get("key", "")
            if not key or self._is_internal_session(key) or key in self._archiving:
                continue
            if key in active_session_keys:
                continue
            ...
            if self._is_expired(updated_at, now) and self._has_compactable_idle_tail(key):
                ...
                self._archiving.add(key)
                schedule_background(self._archive(key, runtime=runtime))
```

策略：

- 周期性扫描空闲 session（TTL-based，`_is_expired`）
- 跳过有 in-flight agent task 的 session（`active_session_keys`）
- 后台用 LLM 总结老消息、保留最近 8 条尾巴（`_RECENT_SUFFIX_MESSAGES`）
- 摘要存进 session metadata（`_last_summary`），下次该 session 活跃时把摘要拼到 context 前面（`prepare_session`，`autocompact.py:124`）

冷热路径分离（`autocompact.py:132-142`）：

```python
# Hot path: summary from in-memory dict (process hasn't restarted).
entry = self._summaries.pop(key, None)
if entry:
    return session, self._format_summary(entry[0], entry[1])
# Cold path: summary persisted in session metadata (process restarted).
meta = session.metadata.get("_last_summary")
if isinstance(meta, dict):
    return session, self._format_summary(...)
```

---

## 14. 设计哲学小结

把上面这些归纳成几个设计思想：


| 思想                     | 体现                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| **渐进降级**             | 畸形 tool_call：有工具→重试→无工具；空回复：重试→finalization 请求            |
| **永不卡死**             | governance 每轮修复历史；backfill 合成结果；malformed 清理；checkpoint 恢复      |
| **持久化与模型副本分离** | governance 只改副本，transcript 不动，出错可恢复                                 |
| **对话式恢复优于崩溃**   | SSRF/工具错误返回提示语让模型自己换路，而不是 abort runtime                      |
| **边跑边收**             | injection draining + subagent 阻塞等待，长任务中也能响应新输入                   |
| **引导而非惩罚**         | 压缩提示语教模型"别原样重试"；错误后缀引导换思路                                 |
| **多层重试各司其职**     | provider 级（transient/退避）→ 轮内（空/畸形/length）→ turn 级（finalization） |
| **跨轮与轮内分离**       | 轮内 governance 被动修历史；跨轮 autocompact 主动压缩空闲 session                |

---

## 附录：关键常量速查


| 常量                                | 值        | 位置                | 作用                              |
| ----------------------------------- | --------- | ------------------- | --------------------------------- |
| `_MAX_EMPTY_RETRIES`                | 2         | `runner.py:73`      | 空回复重试上限                    |
| `_MAX_LENGTH_RECOVERIES`            | 3         | `runner.py:74`      | length 截断恢复段上限             |
| `_MAX_INJECTIONS_PER_TURN`          | 3         | `runner.py:75`      | 每轮注入消息上限                  |
| `_MAX_INJECTION_CYCLES`             | 5         | `runner.py:76`      | 整 turn 注入循环上限              |
| `_CHAT_RETRY_DELAYS`                | (1, 2, 4) | `base.py:307`       | standard 模式退避序列             |
| `_PERSISTENT_MAX_DELAY`             | 60        | `base.py:308`       | persistent 模式单次延迟上限（秒） |
| `_PERSISTENT_IDENTICAL_ERROR_LIMIT` | 10        | `base.py:309`       | persistent 模式相同错误上限       |
| `RETRY_AFTER_BUFFER`                | 1         | `base.py:26`        | Retry-After 额外缓冲（秒）        |
| `_RECENT_SUFFIX_MESSAGES`           | 8         | `autocompact.py:19` | autocompact 保留的尾部消息数      |
| pending queue 阻塞超时              | 300       | `loop.py:983`       | 等 subagent 结果的阻塞上限（秒）  |
| pending queue maxsize               | 20        | `loop.py:1240`      | 每 session 中途注入队列容量       |
| bus 轮询超时                        | 1.0       | `loop.py:1142`      | 外层 bus 消费超时（秒）           |

---

*文档结束。后续可对比 openclaw / openworker / hermes-agent 的 loop 策略。*

```

```
