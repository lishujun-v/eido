#!/usr/bin/env node
import { createHash } from "node:crypto";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import QRCode from "qrcode";
import {
  acquireRunner, assertAgentOwnership, channelFile, defaultAgent, getQrCode, getQrStatus,
  inboundKey, loadState, record, releaseRunner, runnerFile, saveState, sendText, sessionId,
  str, validInbound, weixinPost, type ChannelState, type Json,
} from "./core.ts";
import { downloadImage, inboundContent } from "./media.ts";

const root = path.resolve(process.env.EIDO_ROOT_DIR || process.cwd());
const stateFile = channelFile(root);
const command = process.argv[2];

async function main() {
  if (command === "login") await login();
  else if (command === "start") await start();
  else if (command === "status") await status();
  else {
    console.log("用法：npm run channel:weixin -- login --user <Eido 用户 ID> [--agent <Agent ID>]\n       npm run channel:weixin -- start\n       npm run channel:weixin -- status");
    if (command && command !== "--help") process.exitCode = 2;
  }
}

void main().catch((error) => { console.error(safeError(error)); process.exitCode = 1; });

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function login() {
  const ownerUserId = option("--user") || process.env.EIDO_USER_ID;
  if (!ownerUserId) throw new Error("请用 --user 指定 Eido 用户 ID。");
  const agentId = option("--agent") || await defaultAgent(root, ownerUserId);
  await assertAgentOwnership(root, ownerUserId, agentId);
  const qr = await getQrCode();
  const qrValue = str(qr.qrcode);
  if (!qrValue) throw new Error("微信未返回二维码。");
  const qrLink = str(qr.qrcode_img_content) || qrValue;
  console.log("请用手机微信扫描下面的二维码：");
  console.log(await QRCode.toString(qrLink, { type: "terminal", small: true }));
  console.log("终端无法显示时，二维码对应链接：", qrLink);
  let baseUrl = "https://ilinkai.weixin.qq.com";
  let verifyCode = "";
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const deadline = Date.now() + 8 * 60_000;
    while (Date.now() < deadline) {
      const result = await getQrStatus(qrValue, verifyCode, baseUrl);
      const state = str(result.status);
      if (state === "binded_redirect") {
        const existing = await loadState(stateFile);
        if (existing?.ownerUserId === ownerUserId && existing.agentId === agentId) {
          console.log("该微信 Bot 已绑定当前 Eido 通道，保留现有凭证。");
          return;
        }
        throw new Error("微信显示已绑定，但本机没有对应凭证。请检查原绑定设备。");
      }
      if (state === "confirmed") {
        const token = str(result.bot_token);
        const botId = str(result.ilink_bot_id);
        const senderId = str(result.ilink_user_id);
        if (!token || !botId || !senderId) throw new Error("扫码完成但缺少 Bot token、Bot ID 或扫码者 ID，未保存绑定。");
        const endpoint = str(result.baseurl) || baseUrl;
        if (!/^https:\/\//.test(endpoint)) throw new Error("微信返回了非 HTTPS API 地址。");
        await saveState(stateFile, { ownerUserId, agentId, botId, botToken: token, senderId, baseUrl: endpoint, cursor: "", handled: [] });
        console.log(`绑定成功。Eido 用户：${ownerUserId}，Agent：${agentId}。运行 npm run channel:weixin -- start`);
        return;
      }
      if (state === "expired" || state === "verify_code_blocked") throw new Error("二维码已过期或验证失败，请重新运行 login。");
      if (state === "need_verifycode") verifyCode = (await input.question("请输入手机上的验证码：")).trim();
      if (state === "scaned_but_redirect" && str(result.redirect_host)) {
        const redirected = new URL(str(result.redirect_host));
        if (redirected.protocol !== "https:") throw new Error("微信返回了非 HTTPS 重定向地址。");
        baseUrl = redirected.origin;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    throw new Error("等待扫码超时，请重新运行 login。");
  } finally { input.close(); }
}

async function status() {
  const state = await loadState(stateFile);
  if (!state) { console.log("微信尚未绑定。"); return; }
  console.log(`已绑定：Eido 用户 ${state.ownerUserId}，Agent ${state.agentId}，微信发送者 ${state.senderId}。`);
}

async function start() {
  const state = await loadState(stateFile);
  if (!state) throw new Error("请先运行 login 绑定微信。");
  await assertAgentOwnership(root, state.ownerUserId, state.agentId);
  const runtimeUrl = process.env.EIDO_AGENT_API_URL || "http://127.0.0.1:8000";
  const runtime = new URL(runtimeUrl);
  if (!(["127.0.0.1", "localhost", "::1"].includes(runtime.hostname))) throw new Error("微信通道只允许连接本机 Eido Agent 服务。");
  const health = await fetch(new URL("/health", runtime), { signal: AbortSignal.timeout(5000) });
  if (!health.ok) throw new Error(`Eido Agent 服务不可用：HTTP ${health.status}`);
  const lockFile = runnerFile(root);
  await acquireRunner(lockFile);
  try {
    await runChannel(state, runtime);
  } finally {
    await releaseRunner(lockFile);
  }
}

async function runChannel(state: ChannelState, runtime: URL) {
  const active = new Set<Promise<void>>();
  let stopped = false;
  process.on("SIGINT", () => { stopped = true; });
  process.on("SIGTERM", () => { stopped = true; });
  console.log("微信通道已启动。处理扫码者的一对一文字、图片及带转写的语音消息，按 Ctrl+C 停止。");
  await weixinPost(state.baseUrl, "/ilink/bot/msg/notifystart", {}, state.botToken).catch(() => undefined);
  let failures = 0;
  while (!stopped) {
    try {
      const result = await weixinPost(state.baseUrl, "/ilink/bot/getupdates", { get_updates_buf: state.cursor }, state.botToken, 55_000);
      const messages = Array.isArray(result.msgs) ? result.msgs.map(record) : [];
      for (const message of messages) {
        if (!validInbound(message, state)) continue;
        const key = inboundKey(message);
        if (state.handled.includes(key)) continue;
        const content = inboundContent(message);
        if (!content.text && !content.images.length && !content.hasVoiceWithoutText) continue;
        state.handled.push(key);
        state.handled = state.handled.slice(-500);
        await saveState(stateFile, state);
        const task = processMessage(state, message, content, runtime).catch(async (error) => {
          console.error("处理消息失败：", safeError(error));
          const token = str(message.context_token);
          if (token) await sendText(state, state.senderId, "Eido 处理这条消息时出错，请在电脑端查看日志后重试。", token, stableClientId(message, "failure")).catch(() => undefined);
        });
        active.add(task);
        void task.finally(() => active.delete(task));
      }
      if (str(result.get_updates_buf)) {
        state.cursor = str(result.get_updates_buf);
        await saveState(stateFile, state);
      }
      failures = 0;
    } catch (error) {
      console.error("微信轮询失败：", safeError(error));
      if (safeError(error).includes("微信 API 错误 -14")) {
        console.error("微信会话已被服务端暂停，等待一小时后重试。");
        for (let minute = 0; minute < 60 && !stopped; minute += 1) {
          await new Promise((resolve) => setTimeout(resolve, 60_000));
        }
        continue;
      }
      failures += 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, 1000 * 2 ** Math.min(failures, 6))));
    }
  }
  await Promise.allSettled([...active]);
  await weixinPost(state.baseUrl, "/ilink/bot/msg/notifystop", {}, state.botToken).catch(() => undefined);
}

async function processMessage(state: ChannelState, message: Json, content: ReturnType<typeof inboundContent>, runtime: URL) {
  const sender = str(message.from_user_id);
  const token = str(message.context_token);
  if (!token) return;
  if (content.hasVoiceWithoutText && !content.text && !content.images.length) {
    await sendText(state, sender, "收到语音，但微信没有提供转写文字。请开启微信语音转文字后重发，或直接发送文字。", token, stableClientId(message, "voice-untranscribed"));
    return;
  }
  const images = await Promise.all(content.images.map(downloadImage));
  const text = content.text || "请查看并描述这张图片。";
  const sid = sessionId(state.botId, sender);
  const response = await fetch(new URL("/chat", runtime), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent_id: state.agentId, session_id: sid, visitor_id: state.ownerUserId, message: text, images, permission_mode: "smart", stream: true }),
  });
  if (!response.ok || !response.body) {
    await sendText(state, sender, `Eido 请求失败（HTTP ${response.status}）。`, token, stableClientId(message, "error"));
    return;
  }
  let answer = "";
  let pending = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value || new Uint8Array(), { stream: !done });
    let next = pending.indexOf("\n");
    while (next >= 0) {
      const line = pending.slice(0, next).trim();
      pending = pending.slice(next + 1);
      if (line) {
        const event = record(JSON.parse(line));
        if (event.type === "delta") answer += str(event.content);
        if (event.type === "interaction.required") {
          const interaction = record(event.interaction);
          await sendText(state, sender, `Eido 需要在电脑端确认：${str(interaction.prompt)}\n请在 WebUI 中处理后，我会继续回复。`, token, stableClientId(message, `interaction-${str(interaction.id)}`));
        }
        if (event.type === "error") throw new Error(str(event.error) || "Agent 执行失败");
      }
      next = pending.indexOf("\n");
    }
    if (done) break;
  }
  if (answer.trim()) await sendText(state, sender, answer.trim(), token, stableClientId(message, "answer"));
}

function stableClientId(message: Json, suffix: string) {
  return createHash("sha256").update(`${inboundKey(message)}:${suffix}`).digest("hex").slice(0, 32);
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.replace(/Bearer\s+\S+/g, "Bearer [redacted]") : String(error);
}
