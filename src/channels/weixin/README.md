# Eido 微信 Channel

独立运行的微信 iLink 适配器。参考腾讯 [openclaw-weixin](https://github.com/Tencent/openclaw-weixin) 的公开协议和实现思路，不依赖 OpenClaw、不修改 Eido WebUI 的登录入口。Eido Agent 服务须运行在本机 `127.0.0.1:8000`（或设置 `EIDO_AGENT_API_URL` 为其他本机地址）。

## WebUI 配置（推荐）

在 Eido 左侧选择“渠道” → “添加微信”，用手机微信扫描弹窗中的二维码并确认。确认后通道自动运行；已绑定的账号可在同一页面暂停、启动、重新绑定或移除。无需运行本节下面的 CLI 命令。WebUI 与 CLI 共用同一绑定记录，原有命令行绑定会自动显示在页面中。

Eido Agent 服务仍需运行；WebUI 后台会管理微信轮询进程。页面首次打开会恢复已启用、但尚未运行的通道。

## CLI（可选，供排障）

先启动 Agent 服务：

```bash
npm run agent:server
```

在另一个终端绑定微信（将 `<user-id>` 替换为 Eido 用户 ID）：

```bash
npm run channel:weixin -- login --user <user-id>
npm run channel:weixin -- start
```

`login` 会在终端显示二维码。拿手机微信扫码确认；终端不支持二维码显示时会给出对应链接。`status` 命令只展示绑定信息，不打印 token：

```bash
npm run channel:weixin -- status
```

默认选择该 Eido 用户的 SiinX；可在登录时传 `--agent <agent-id>` 选择自己名下其他 Agent。绑定记录保存在 `database/channels/weixin/state.json`，文件权限为 `0600`，已列入 `.gitignore`。请勿分享该文件。

## 当前边界

- 只接收扫码者的一对一消息；支持文字、图片，以及微信提供转写文字的语音。群聊和其他发送者均忽略。
- 图片会从微信 CDN 下载、解密，再作为图像输入交给 Agent。未附带转写文字的语音目前不会进入 Agent，微信会收到明确提示；Eido 尚未配置独立语音识别服务。
- 接入进程只连接本机 Eido Agent API，不伪造 WebUI 登录 Cookie；Agent 权限模式为 `smart`。
- Agent 需要澄清或审批时，微信会收到提示；请在电脑 WebUI 完成确认。通道不会自动批准高风险操作。
- 当前进程采用单实例运行；不要同时运行两个 `start`。重复消息按最近 500 条 ID 去重。异常退出时，正在执行中的消息可能需要用户重发。
- 当前仅以文字回复，不发送图片或语音；文件和视频输入暂不支持。模型费用由已配置的 Provider 承担。

若账号报 `-14` 或绑定失效，停止通道并重新绑定；不要高频重试。协议可能随微信服务端调整，见[上游协议说明](https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol_zh_CN.md)。
