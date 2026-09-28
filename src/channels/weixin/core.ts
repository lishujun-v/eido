import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type Json = Record<string, unknown>;
export type ChannelState = {
  ownerUserId: string;
  agentId: string;
  botId: string;
  botToken: string;
  senderId: string;
  baseUrl: string;
  cursor: string;
  handled: string[];
  enabled?: boolean;
};

const WEIXIN_API = "https://ilinkai.weixin.qq.com";
const CHANNEL_VERSION = "2.4.8";

export function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function channelFile(root: string) {
  return path.join(root, "database", "channels", "weixin", "state.json");
}

export function runnerFile(root: string) {
  return path.join(root, "database", "channels", "weixin", "runner.json");
}

export async function runningPid(file: string): Promise<number | null> {
  try {
    const value = record(JSON.parse(await readFile(file, "utf8")));
    const pid = value.pid;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return null;
    try { process.kill(pid, 0); return pid; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return pid;
      return null;
    }
  } catch { return null; }
}

export async function acquireRunner(file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(file, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); }
      finally { await handle.close(); }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await runningPid(file)) throw new Error("微信通道已经在运行，请先停止已有实例。");
      await unlink(file).catch(() => undefined);
    }
  }
  throw new Error("无法取得微信通道运行锁。");
}

export async function releaseRunner(file: string): Promise<void> {
  try {
    const value = record(JSON.parse(await readFile(file, "utf8")));
    if (value.pid === process.pid) await unlink(file);
  } catch { /* Another process already removed the lock. */ }
}

export async function loadState(file: string): Promise<ChannelState | null> {
  try {
    const value = record(JSON.parse(await readFile(file, "utf8")));
    if (!["ownerUserId", "agentId", "botId", "botToken", "senderId", "baseUrl", "cursor"].every((key) => typeof value[key] === "string")) return null;
    return { ...value, handled: Array.isArray(value.handled) ? value.handled.filter((item): item is string => typeof item === "string").slice(-500) : [] } as ChannelState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveState(file: string, state: ChannelState) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  await rename(temp, file);
}

export function weixinHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "AuthorizationType": "ilink_bot_token",
    "X-WECHAT-UIN": Buffer.from(String(Math.floor(Math.random() * 0x1_0000_0000))).toString("base64"),
    "iLink-App-Id": "bot",
    "iLink-App-ClientVersion": String(0x0002_0408),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function weixinPost(baseUrl: string, endpoint: string, body: Json, token?: string, timeout = 45_000): Promise<Json> {
  const url = new URL(endpoint, baseUrl);
  if (url.protocol !== "https:") throw new Error("微信 API 地址必须使用 HTTPS。");
  const response = await fetch(url, {
    method: "POST", headers: weixinHeaders(token),
    body: JSON.stringify(token ? { ...body, base_info: { channel_version: CHANNEL_VERSION, bot_agent: "Eido/0.1" } } : body),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`微信 API HTTP ${response.status}`);
  const data = record(await response.json());
  if (typeof data.ret === "number" && data.ret !== 0) throw new Error(`微信 API 错误 ${data.ret}: ${str(data.errmsg)}`);
  if (typeof data.errcode === "number" && data.errcode !== 0) throw new Error(`微信 API 错误 ${data.errcode}: ${str(data.errmsg)}`);
  return data;
}

export async function getQrCode(): Promise<Json> {
  return weixinPost(WEIXIN_API, "/ilink/bot/get_bot_qrcode?bot_type=3", { local_token_list: [] });
}

export async function getQrStatus(qrcode: string, verifyCode = "", baseUrl = WEIXIN_API): Promise<Json> {
  const url = new URL("/ilink/bot/get_qrcode_status", baseUrl);
  url.searchParams.set("qrcode", qrcode);
  if (verifyCode) url.searchParams.set("verify_code", verifyCode);
  if (url.protocol !== "https:") throw new Error("二维码轮询地址必须使用 HTTPS。");
  const response = await fetch(url, {
    headers: {
      "iLink-App-Id": "bot",
      "iLink-App-ClientVersion": String(0x0002_0408),
    },
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`二维码状态 HTTP ${response.status}`);
  return record(await response.json());
}

export function inboundText(message: Json): string {
  const items = Array.isArray(message.item_list) ? message.item_list : [];
  return items.map((value) => {
    const item = record(value);
    return item.type === 1 ? str(record(item.text_item).text) : "";
  }).filter(Boolean).join("\n").trim();
}

export function inboundKey(message: Json): string {
  const serverId = message.message_id;
  if (typeof serverId === "number" || typeof serverId === "string") return String(serverId);
  if (typeof message.client_id === "string") return message.client_id;
  return createHash("sha256").update(JSON.stringify(message)).digest("hex");
}

export function sessionId(botId: string, senderId: string): string {
  return `wx_${createHash("sha256").update(`${botId}\0${senderId}`).digest("hex").slice(0, 24)}`;
}

export function validInbound(message: Json, state: ChannelState): boolean {
  const recipient = str(message.to_user_id);
  return message.message_type === 1 && !str(message.group_id)
    && (!recipient || recipient === state.botId)
    && str(message.from_user_id) === state.senderId;
}

export async function sendText(state: ChannelState, recipient: string, text: string, contextToken: string, clientId: string = randomUUID()): Promise<void> {
  await weixinPost(state.baseUrl, "/ilink/bot/sendmessage", {
    msg: {
      from_user_id: "", to_user_id: recipient, client_id: clientId,
      message_type: 2, message_state: 2, context_token: contextToken,
      item_list: [{ type: 1, text_item: { text: text.slice(0, 3000) } }],
    },
  }, state.botToken);
}

export async function defaultAgent(root: string, ownerUserId: string): Promise<string> {
  const rows = record(JSON.parse(await readFile(path.join(root, "database", "agents.json"), "utf8")));
  const found = Object.values(rows).map(record).find((row) => row.owner_user_id === ownerUserId && row.agent_type === "siinx" && row.is_default === true);
  if (!found || !str(found.id)) throw new Error("该 Eido 用户没有默认 SiinX Agent。");
  return str(found.id);
}

export async function assertAgentOwnership(root: string, ownerUserId: string, agentId: string): Promise<void> {
  const rows = record(JSON.parse(await readFile(path.join(root, "database", "agents.json"), "utf8")));
  if (record(rows[agentId]).owner_user_id !== ownerUserId) throw new Error("Agent 不属于指定的 Eido 用户。");
}
