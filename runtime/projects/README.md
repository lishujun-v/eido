# Eido Projects

每个可运行项目占用一个独立目录，并至少包含：

- `project.json`：项目清单。
- `index.html`：默认入口（也可在清单的 `entry` 中指定其他相对路径）。

清单字段：`name` 必填；`description`、`version`、`entry`、`icon`、`accent`、`tags`、`permissions` 可选。项目应构建为可由静态文件运行的前端应用，资源使用相对路径。Eido 会自动发现有效项目，并在 sandbox 内嵌视图中打开它。

## 可用能力

- `agent.chat`：调用当前用户的默认 Eido Agent。
- `project.files`：将文件保存到当前 Agent 工作区中按项目隔离的目录。
- `project.storage`：使用由宿主管理、按 Project 隔离的持久化键值存储。

能力必须先写入 `project.json` 的 `permissions` 数组。Project 不能直接访问 Eido 页面、Cookie 或内部 API，而是向父窗口发送请求：

```js
window.parent.postMessage({
  type: "eido:project-request",
  requestId: "项目生成的唯一 ID",
  capability: "agent.chat",
  payload: {
    message: "需要 Agent 完成的任务",
    context: {
      kind: "document",
      title: "文档标题",
      filePath: "通过 project.files 获得的路径",
      content: "可选的文本上下文",
      metadata: {}
    }
  }
}, "*");
```

宿主完成后会向 Project 返回：

```js
{
  type: "eido:project-response",
  requestId: "原请求 ID",
  ok: true,
  result: {}
}
```

失败响应的 `ok` 为 `false`，错误信息位于 `error`。完整调用示例可参考 `paper-reader/index.html`。

## 向右侧 Eido Agent 提供当前上下文

Project 在当前文档、选择或编辑内容变化后，应向宿主发布最新的有效上下文。宿主会在 iframe
载入后发送一次 `eido:project-context-request`，Project 也应响应该消息重新发布：

```js
window.parent.postMessage({
  type: "eido:project-context",
  context: {
    kind: "document",
    title: "当前文档标题",
    content: "当前用户可见、可提问的文本内容",
    metadata: {}
  }
}, "*");
```

宿主只接受来自当前 Project iframe 的消息，并把 `content` 限制在 120,000 字符内。用户从右侧
对话发送消息时，此上下文会自动附加；退出当前 Project 后会自动清除。
